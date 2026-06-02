/**
 * set_state — convenience wrapper that updates the item's state field.
 *
 * BL-035 shape: state is just a field in fields_json (typically a single_select
 * with `terminal` flagged options). This tool finds the item's template's
 * canonical state field, validates the new value, writes fields_json, and
 * emits BOTH item.state_changed AND item.field_changed activity rows.
 */

import { and, eq } from 'drizzle-orm';
import { schema, type FieldDef } from '@blitzlist/db';
import { findStateFieldDef, validateFieldValue } from '@blitzlist/core';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { itemToResponse } from './_response-helper.js';

type SetStateArgs = {
	id: string;
	state: string;
	note?: string;
};

function validate(args: unknown): SetStateArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	if (typeof a.state !== 'string' || a.state.trim().length === 0) {
		throw new Error('`state` is required (non-empty string)');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		id: a.id.trim(),
		state: a.state.trim(),
		note: (a.note as string | undefined)?.trim(),
	};
}

export const setState: ToolDef<SetStateArgs, unknown, Db> = {
	name: 'set_state',
	description:
		'Convenience: change an item\'s state field (the canonical single_select with terminal markers in its template). The new value must be one of the allowed options. Emits item.state_changed activity.',
	annotations: {
		title: 'Update item state',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			state: { type: 'string', description: 'New state value; must be in the template\'s state field options.' },
			note: { type: 'string', description: 'Optional note recorded in the activity log.' },
		},
		required: ['id', 'state'],
	},
	validate,
	async handler(args, ctx) {
		const itemRows = await ctx.db
			.select()
			.from(schema.items)
			.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)))
			.limit(1);
		const item = itemRows[0];
		if (!item) {
			throw new Error(`Item not found in this workspace: ${args.id}`);
		}
		if (!item.template_id) {
			throw new Error(
				`Item ${args.id} has no template; set_state requires a template with a state field. Use update_item with fields:{state:"..."} instead, or attach a template first.`,
			);
		}
		const templateRows = await ctx.db
			.select({
				slug: schema.templates.slug,
				fields_schema_json: schema.templates.fields_schema_json,
			})
			.from(schema.templates)
			.where(eq(schema.templates.id, item.template_id))
			.limit(1);
		const template = templateRows[0];
		if (!template) {
			throw new Error(`Item ${args.id} references missing template ${item.template_id}.`);
		}
		const stateField: FieldDef | null = findStateFieldDef(template.fields_schema_json);
		if (!stateField) {
			throw new Error(
				`Template for ${args.id} has no single_select state field. Add one (e.g. {key:"state", type:"single_select", options:[...], terminal:[...]}) or use update_item with a different field name.`,
			);
		}
		// Validate
		validateFieldValue(stateField, args.state);

		const current = item.fields_json as Record<string, unknown>;
		const previousState = (current[stateField.key] as string | undefined) ?? null;
		const isNoOp = previousState === args.state;
		const now = new Date();

		if (!isNoOp) {
			const newFields = { ...current, [stateField.key]: args.state };
			await ctx.db
				.update(schema.items)
				.set({ fields_json: newFields, updated_at: now })
				.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)));
		}

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.id,
			actor_id: ctx.user_id,
			action: 'item.state_changed',
			details_json: {
				field_key: stateField.key,
				from: previousState,
				to: args.state,
				no_op: isNoOp,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		const updated = await ctx.db
			.select()
			.from(schema.items)
			.where(eq(schema.items.id, args.id))
			.limit(1);
		return updated[0] ? itemToResponse(updated[0], template.slug) : null;
	},
};
