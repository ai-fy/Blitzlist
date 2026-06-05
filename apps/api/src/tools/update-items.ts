/**
 * update_items — batch update_item for general field/title/body patches.
 *
 * Preferred over N update_item calls. Fail-fast validation against each item's
 * template; no writes happen if anything fails. Per-item activity rows.
 *
 * Use set_states when you only need to flip state values — it's narrower and
 * therefore clearer to agents picking a tool.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type FieldDef } from '@blitzlist/db';
import { validateItemFields, findStateFieldDef } from '@blitzlist/core';
import { recordNovelStateForItem } from './_state-extras-helper.js';
import { autoExtendListFieldsForItem } from './_field-extras-helper.js';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type ItemUpdate = {
	id: string;
	title?: string;
	body?: string;
	fields?: Record<string, unknown>;
	note?: string;
};

type UpdateItemsArgs = {
	updates: ItemUpdate[];
};

function validate(args: unknown): UpdateItemsArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (!Array.isArray(a.updates) || a.updates.length === 0) {
		throw new Error('`updates` must be a non-empty array');
	}
	if (a.updates.length > 200) {
		throw new Error('`updates` is capped at 200 per call');
	}
	const seenIds = new Set<string>();
	const cleaned: ItemUpdate[] = a.updates.map((raw, i) => {
		if (typeof raw !== 'object' || raw === null) {
			throw new Error(`updates[${i}] must be an object`);
		}
		const u = raw as Record<string, unknown>;
		if (typeof u.id !== 'string' || u.id.trim().length === 0) {
			throw new Error(`updates[${i}].id is required (non-empty string)`);
		}
		const id = u.id.trim();
		if (seenIds.has(id)) {
			throw new Error(`updates[${i}].id ("${id}") is duplicated in this batch`);
		}
		seenIds.add(id);
		if (u.title !== undefined && typeof u.title !== 'string') {
			throw new Error(`updates[${i}].title must be a string`);
		}
		if (u.body !== undefined && typeof u.body !== 'string') {
			throw new Error(`updates[${i}].body must be a string`);
		}
		if (
			u.fields !== undefined &&
			(typeof u.fields !== 'object' || u.fields === null || Array.isArray(u.fields))
		) {
			throw new Error(`updates[${i}].fields must be an object`);
		}
		if (u.note !== undefined && typeof u.note !== 'string') {
			throw new Error(`updates[${i}].note must be a string`);
		}
		if (u.title === undefined && u.body === undefined && u.fields === undefined) {
			throw new Error(
				`updates[${i}] needs at least one of: title, body, fields`,
			);
		}
		return {
			id,
			title: (u.title as string | undefined)?.trim(),
			body: u.body as string | undefined,
			fields: u.fields as Record<string, unknown> | undefined,
			note: (u.note as string | undefined)?.trim(),
		};
	});
	return { updates: cleaned };
}

export const updateItems: ToolDef<UpdateItemsArgs, unknown, Db> = {
	name: 'update_items',
	description:
		'BATCH / BULK update many items in one tool call (also known as: multi-update, mass update, batch edit). Use this whenever you need to change more than one item — strongly preferred over multiple update_item calls. For each update: optionally patch title, body, and/or fields. Fields are validated against each item\'s template; unknown fields rejected. Fail-fast — if any single update validates badly, NO writes happen and the error explains which item failed. Per-item activity log entries are written. Up to 200 updates per call. If you only need to change the state field, use set_states (a narrower, even clearer batch tool for pure state transitions).',
	annotations: {
		title: 'Update items (batch / bulk / multi-item)',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			updates: {
				type: 'array',
				description:
					'Array of {id, title?, body?, fields?, note?}. Each id must be unique within the batch and present in this workspace. Each update needs at least one of title/body/fields.',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						title: { type: 'string' },
						body: { type: 'string' },
						fields: { type: 'object' },
						note: { type: 'string' },
					},
					required: ['id'],
				},
				maxItems: 200,
			},
		},
		required: ['updates'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Load items in one round-trip.
		const ids = args.updates.map((u) => u.id);
		const itemRows = await ctx.db
			.select()
			.from(schema.items)
			.where(and(eq(schema.items.workspace_id, ctx.workspace_id), inArray(schema.items.id, ids)));
		const itemById = new Map(itemRows.map((r) => [r.id, r]));

		// 2. Load all templates touched in one round-trip.
		const templateIds = Array.from(
			new Set(itemRows.map((r) => r.template_id).filter((x): x is string => x !== null)),
		);
		const schemaByTemplate = new Map<string, FieldDef[]>();
		if (templateIds.length > 0) {
			const tRows = await ctx.db
				.select({
					id: schema.templates.id,
					fields_schema_json: schema.templates.fields_schema_json,
				})
				.from(schema.templates)
				.where(inArray(schema.templates.id, templateIds));
			for (const t of tRows) {
				schemaByTemplate.set(t.id, t.fields_schema_json as FieldDef[]);
			}
		}

		// 3. Validate everything FIRST (fail-fast).
		type Resolved = {
			id: string;
			update: ItemUpdate;
			current: Record<string, unknown>;
			merged: Record<string, unknown>;
			changedFields: Record<string, { from: unknown; to: unknown }>;
			effectiveSchema: FieldDef[];
			titleChanged: boolean;
			bodyChanged: boolean;
		};
		const resolved: Resolved[] = [];
		const errors: Array<{ id: string; error: string }> = [];

		for (const u of args.updates) {
			const item = itemById.get(u.id);
			if (!item) {
				errors.push({ id: u.id, error: 'Item not found in this workspace' });
				continue;
			}
			const fieldsSchema = item.template_id
				? (schemaByTemplate.get(item.template_id) ?? [])
				: [];
			const current = item.fields_json as Record<string, unknown>;
			const patch = u.fields ?? {};
			// BL-022: auto-extend per-list extras for unknown keys (type-guessed).
			let effectiveSchema = fieldsSchema;
			if (Object.keys(patch).length > 0 && fieldsSchema.length > 0) {
				try {
					const ext = await autoExtendListFieldsForItem({
						db: ctx.db,
						workspace_id: ctx.workspace_id,
						item_id: u.id,
						template_schema: fieldsSchema,
						patch,
					});
					effectiveSchema = ext.mergedSchema;
				} catch (err) {
					errors.push({
						id: u.id,
						error: err instanceof Error ? err.message : 'auto-extend failed',
					});
					continue;
				}
			}
			let merged: Record<string, unknown>;
			try {
				merged =
					effectiveSchema.length > 0
						? validateItemFields({
								schema: effectiveSchema,
								current,
								patch,
								isCreate: false,
							})
						: { ...current, ...patch };
			} catch (err) {
				errors.push({
					id: u.id,
					error: err instanceof Error ? err.message : 'field validation failed',
				});
				continue;
			}
			const changedFields: Record<string, { from: unknown; to: unknown }> = {};
			for (const key of Object.keys(patch)) {
				const before = current[key];
				const after = merged[key];
				if (JSON.stringify(before) !== JSON.stringify(after)) {
					changedFields[key] = { from: before ?? null, to: after ?? null };
				}
			}
			resolved.push({
				id: u.id,
				update: u,
				current,
				merged,
				changedFields,
				effectiveSchema,
				titleChanged: u.title !== undefined && u.title !== item.title,
				bodyChanged: u.body !== undefined && u.body !== item.body,
			});
		}

		if (errors.length > 0) {
			return {
				ok: false,
				updated: 0,
				attempted: args.updates.length,
				errors,
				message: `Batch aborted — ${errors.length} update(s) failed validation; no writes performed.`,
			};
		}

		// 4. Apply each update sequentially with audit rows.
		const now = new Date();
		let writtenCount = 0;
		const results: Array<{
			id: string;
			title_changed: boolean;
			body_changed: boolean;
			fields_changed: number;
		}> = [];

		for (const r of resolved) {
			const fieldsChanged = Object.keys(r.changedFields).length > 0;
			const anyChange = r.titleChanged || r.bodyChanged || fieldsChanged;

			if (anyChange) {
				const updates: Record<string, unknown> = { updated_at: now };
				if (r.titleChanged) updates.title = r.update.title;
				if (r.bodyChanged) updates.body = r.update.body;
				if (fieldsChanged) updates.fields_json = r.merged;
				await ctx.db
					.update(schema.items)
					.set(updates)
					.where(
						and(
							eq(schema.items.id, r.id),
							eq(schema.items.workspace_id, ctx.workspace_id),
						),
					);
				writtenCount++;

				// BL-022: if the state field landed a novel value, register it
				// as a per-list extra. Look up the stateField from the cached
				// per-item template schema.
				const item = itemById.get(r.id)!;
				void item;
				const stateField = findStateFieldDef(r.effectiveSchema);
				if (stateField && fieldsChanged && stateField.key in r.changedFields) {
					const newState = r.merged[stateField.key];
					if (typeof newState === 'string') {
						await recordNovelStateForItem(
							ctx.db,
							ctx.workspace_id,
							r.id,
							newState,
							stateField,
						);
					}
				}
			}

			await ctx.db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id: ctx.workspace_id,
				item_id: r.id,
				actor_id: ctx.user_id,
				action: 'item.updated',
				details_json: {
					batch: true,
					field_count: Object.keys(r.changedFields).length,
					...(r.titleChanged && { title_changed: true }),
					...(r.bodyChanged && { body_changed: true }),
					...(!anyChange && { no_op: true }),
					...(r.update.note && { note: r.update.note }),
				},
				created_at: now,
			});

			for (const [key, change] of Object.entries(r.changedFields)) {
				await ctx.db.insert(schema.activity_log).values({
					id: uuid(),
					workspace_id: ctx.workspace_id,
					item_id: r.id,
					actor_id: ctx.user_id,
					action: 'item.field_changed',
					details_json: { field_key: key, from: change.from, to: change.to, batch: true },
					created_at: now,
				});
			}

			results.push({
				id: r.id,
				title_changed: r.titleChanged,
				body_changed: r.bodyChanged,
				fields_changed: Object.keys(r.changedFields).length,
			});
		}

		return {
			ok: true,
			updated: writtenCount,
			no_ops: resolved.length - writtenCount,
			attempted: args.updates.length,
			results,
		};
	},
};
