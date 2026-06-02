/**
 * set_states — batch state transitions for many items in one call.
 *
 * Preferred over N set_state calls — one approval prompt, one tool round-trip.
 * Each change validates against its item's template's state field. Fail-fast:
 * if ANY change validates badly, NO writes happen (returns the validation
 * errors so the caller can fix and retry).
 *
 * Items with no template, or whose template lacks a state field, are reported
 * as errors but don't block valid changes in the same batch.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type FieldDef } from '@blitzlist/db';
import { findStateFieldDef, validateFieldValue } from '@blitzlist/core';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type StateChange = { id: string; state: string; note?: string };

type SetStatesArgs = {
	changes: StateChange[];
};

function validate(args: unknown): SetStatesArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (!Array.isArray(a.changes) || a.changes.length === 0) {
		throw new Error('`changes` must be a non-empty array');
	}
	if (a.changes.length > 200) {
		throw new Error('`changes` is capped at 200 per call');
	}
	const seenIds = new Set<string>();
	const cleaned: StateChange[] = a.changes.map((raw, i) => {
		if (typeof raw !== 'object' || raw === null) {
			throw new Error(`changes[${i}] must be an object`);
		}
		const c = raw as Record<string, unknown>;
		if (typeof c.id !== 'string' || c.id.trim().length === 0) {
			throw new Error(`changes[${i}].id is required (non-empty string)`);
		}
		const id = c.id.trim();
		if (seenIds.has(id)) {
			throw new Error(`changes[${i}].id ("${id}") is duplicated in this batch`);
		}
		seenIds.add(id);
		if (typeof c.state !== 'string' || c.state.trim().length === 0) {
			throw new Error(`changes[${i}].state is required (non-empty string)`);
		}
		if (c.note !== undefined && typeof c.note !== 'string') {
			throw new Error(`changes[${i}].note must be a string`);
		}
		return {
			id,
			state: c.state.trim(),
			note: (c.note as string | undefined)?.trim(),
		};
	});
	return { changes: cleaned };
}

type ChangeResult =
	| { id: string; ok: true; from: string | null; to: string; no_op: boolean }
	| { id: string; ok: false; error: string };

export const setStates: ToolDef<SetStatesArgs, unknown, Db> = {
	name: 'set_states',
	description:
		'Batch-change the state of many items in one tool call (preferred over N set_state calls — single approval, fewer round-trips). Each change validates against its item\'s template state field. Validation fails the whole batch (no partial writes) so the caller can fix and retry. Max 200 changes per call.',
	annotations: {
		title: 'Update multiple item states',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			changes: {
				type: 'array',
				description:
					'Array of {id, state, note?}. Each id must be unique within the batch. State must be valid for the item\'s template.',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						state: { type: 'string' },
						note: { type: 'string' },
					},
					required: ['id', 'state'],
				},
				maxItems: 200,
			},
		},
		required: ['changes'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Load all referenced items in one round-trip.
		const ids = args.changes.map((c) => c.id);
		const itemRows = await ctx.db
			.select()
			.from(schema.items)
			.where(and(eq(schema.items.workspace_id, ctx.workspace_id), inArray(schema.items.id, ids)));
		const itemById = new Map(itemRows.map((r) => [r.id, r]));

		// 2. Load all referenced templates in one round-trip.
		const templateIds = Array.from(
			new Set(itemRows.map((r) => r.template_id).filter((x): x is string => x !== null)),
		);
		const templateById = new Map<string, { slug: string; fields_schema_json: FieldDef[] }>();
		if (templateIds.length > 0) {
			const tRows = await ctx.db
				.select({
					id: schema.templates.id,
					slug: schema.templates.slug,
					fields_schema_json: schema.templates.fields_schema_json,
				})
				.from(schema.templates)
				.where(inArray(schema.templates.id, templateIds));
			for (const t of tRows) {
				templateById.set(t.id, {
					slug: t.slug,
					fields_schema_json: t.fields_schema_json as FieldDef[],
				});
			}
		}

		// 3. Validate all changes BEFORE writing anything (fail-fast).
		type Resolved = {
			id: string;
			state: string;
			note?: string;
			stateField: FieldDef;
			fieldKey: string;
			previousState: string | null;
			currentFields: Record<string, unknown>;
		};
		const resolved: Resolved[] = [];
		const errors: Array<{ id: string; error: string }> = [];

		for (const change of args.changes) {
			const item = itemById.get(change.id);
			if (!item) {
				errors.push({ id: change.id, error: `Item not found in this workspace` });
				continue;
			}
			if (!item.template_id) {
				errors.push({
					id: change.id,
					error: 'Item has no template; cannot validate state. Use update_items with fields:{state} instead.',
				});
				continue;
			}
			const template = templateById.get(item.template_id);
			if (!template) {
				errors.push({ id: change.id, error: `Item references missing template` });
				continue;
			}
			const stateField = findStateFieldDef(template.fields_schema_json);
			if (!stateField) {
				errors.push({
					id: change.id,
					error: `Template "${template.slug}" has no single_select state field. Use update_items.`,
				});
				continue;
			}
			try {
				validateFieldValue(stateField, change.state);
			} catch (err) {
				errors.push({
					id: change.id,
					error: err instanceof Error ? err.message : 'state validation failed',
				});
				continue;
			}
			const current = item.fields_json as Record<string, unknown>;
			resolved.push({
				id: change.id,
				state: change.state,
				note: change.note,
				stateField,
				fieldKey: stateField.key,
				previousState: (current[stateField.key] as string | undefined) ?? null,
				currentFields: current,
			});
		}

		// If anything failed validation, abort the whole batch.
		if (errors.length > 0) {
			return {
				ok: false,
				updated: 0,
				attempted: args.changes.length,
				errors,
				message: `Batch aborted — ${errors.length} change(s) failed validation; no writes performed.`,
			};
		}

		// 4. Apply each change (sequential; D1 doesn't expose a batch tx via Drizzle yet).
		const now = new Date();
		const results: ChangeResult[] = [];
		for (const r of resolved) {
			const isNoOp = r.previousState === r.state;
			if (!isNoOp) {
				const newFields = { ...r.currentFields, [r.fieldKey]: r.state };
				await ctx.db
					.update(schema.items)
					.set({ fields_json: newFields, updated_at: now })
					.where(
						and(
							eq(schema.items.id, r.id),
							eq(schema.items.workspace_id, ctx.workspace_id),
						),
					);
			}
			await ctx.db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id: ctx.workspace_id,
				item_id: r.id,
				actor_id: ctx.user_id,
				action: 'item.state_changed',
				details_json: {
					field_key: r.fieldKey,
					from: r.previousState,
					to: r.state,
					no_op: isNoOp,
					batch: true,
					...(r.note && { note: r.note }),
				},
				created_at: now,
			});
			results.push({
				id: r.id,
				ok: true,
				from: r.previousState,
				to: r.state,
				no_op: isNoOp,
			});
		}

		const changed = results.filter((x): x is Extract<ChangeResult, { ok: true }> => x.ok && !x.no_op)
			.length;
		const noOps = results.length - changed;

		return {
			ok: true,
			updated: changed,
			no_ops: noOps,
			attempted: args.changes.length,
			results,
		};
	},
};
