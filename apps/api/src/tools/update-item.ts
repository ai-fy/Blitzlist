/**
 * update_item — patch an item's typed fields (and optionally title/body).
 *
 * BL-035: the canonical "edit this item" tool. Validates each provided field
 * against the item's template schema. Unknown keys rejected; partial updates
 * allowed (required fields only enforced on creation, not on update). Emits
 * one item.field_changed activity row per changed field for the audit trail.
 *
 * To change state specifically, you can use this tool OR the convenience
 * set_state wrapper.
 */

import { and, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import { validateItemFields, findStateFieldDef } from '@blitzlist/core';
import { recordNovelStateForItem } from './_state-extras-helper.js';
import { autoExtendListFieldsForItem } from './_field-extras-helper.js';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { itemToResponse } from './_response-helper.js';

type UpdateItemArgs = {
	id: string;
	title?: string;
	body?: string;
	fields?: Record<string, unknown>;
	note?: string;
};

function validate(args: unknown): UpdateItemArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	if (a.title !== undefined && typeof a.title !== 'string') throw new Error('`title` must be a string');
	if (a.body !== undefined && typeof a.body !== 'string') throw new Error('`body` must be a string');
	if (
		a.fields !== undefined &&
		(typeof a.fields !== 'object' || a.fields === null || Array.isArray(a.fields))
	) {
		throw new Error('`fields` must be an object');
	}
	if (a.note !== undefined && typeof a.note !== 'string') throw new Error('`note` must be a string');
	if (a.title === undefined && a.body === undefined && a.fields === undefined) {
		throw new Error('update_item requires at least one of: title, body, fields');
	}
	return {
		id: a.id.trim(),
		title: (a.title as string | undefined)?.trim(),
		body: a.body as string | undefined,
		fields: a.fields as Record<string, unknown> | undefined,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const updateItem: ToolDef<UpdateItemArgs, unknown, Db> = {
	name: 'update_item',
	description:
		'Patch a SINGLE item\'s typed fields, title, or body. Fields are validated against the item\'s template schema; unknown fields rejected. Per-field changes are recorded in the activity log so you can see exactly what changed. ⚠️ For changing MORE THAN ONE item, use update_items (the batch / bulk version) instead — it\'s atomic and one round-trip.',
	annotations: {
		title: 'Update item',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			title: { type: 'string', description: 'New title (omit to leave unchanged).' },
			body: { type: 'string', description: 'New body (omit to leave unchanged).' },
			fields: {
				type: 'object',
				description:
					'Partial fields_json patch. Validates each value against the item\'s template schema. Pass null to clear a field.',
			},
			note: { type: 'string', description: 'Optional note recorded in the activity log.' },
		},
		required: ['id'],
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

		// Resolve template schema for field validation (and slug for response).
		let fields_schema = [] as Parameters<typeof validateItemFields>[0]['schema'];
		let template_slug: string | null = null;
		if (item.template_id) {
			const trows = await ctx.db
				.select({
					slug: schema.templates.slug,
					fields_schema_json: schema.templates.fields_schema_json,
				})
				.from(schema.templates)
				.where(eq(schema.templates.id, item.template_id))
				.limit(1);
			if (trows[0]) {
				fields_schema = trows[0].fields_schema_json;
				template_slug = trows[0].slug;
			}
		}

		const current = item.fields_json as Record<string, unknown>;
		const patch = args.fields ?? {};

		// BL-022: auto-extend the item's primary list's extra_fields for any
		// unknown keys in the patch — with type guessed from the value.
		// Returns the merged effective schema (template + existing extras +
		// newly auto-added).
		let effectiveSchema = fields_schema;
		if (Object.keys(patch).length > 0 && fields_schema.length > 0) {
			const ext = await autoExtendListFieldsForItem({
				db: ctx.db,
				workspace_id: ctx.workspace_id,
				item_id: args.id,
				template_schema: fields_schema,
				patch,
			});
			effectiveSchema = ext.mergedSchema;
		}

		const merged =
			effectiveSchema.length > 0
				? validateItemFields({ schema: effectiveSchema, current, patch, isCreate: false })
				: { ...current, ...patch };

		// Compute which fields actually changed (for activity log).
		const changedFields: Record<string, { from: unknown; to: unknown }> = {};
		for (const key of Object.keys(patch)) {
			const before = current[key];
			const after = merged[key];
			if (JSON.stringify(before) !== JSON.stringify(after)) {
				changedFields[key] = { from: before ?? null, to: after ?? null };
			}
		}

		const titleChanged = args.title !== undefined && args.title !== item.title;
		const bodyChanged = args.body !== undefined && args.body !== item.body;
		const fieldsChanged = Object.keys(changedFields).length > 0;
		const now = new Date();

		if (!titleChanged && !bodyChanged && !fieldsChanged) {
			// No-op; still log for audit clarity.
			await ctx.db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id: ctx.workspace_id,
				item_id: args.id,
				actor_id: ctx.user_id,
				action: 'item.updated',
				details_json: { no_op: true, ...(args.note && { note: args.note }) },
				created_at: now,
			});
			return itemToResponse(item, template_slug);
		}

		const updates: Record<string, unknown> = { updated_at: now };
		if (titleChanged) updates.title = args.title;
		if (bodyChanged) updates.body = args.body;
		if (fieldsChanged) updates.fields_json = merged;

		await ctx.db
			.update(schema.items)
			.set(updates)
			.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)));

		// BL-022: if the patch changed the canonical state field to a novel
		// value, register it as a per-list extra so future writes + the
		// renderer know about it.
		const stateField = findStateFieldDef(effectiveSchema);
		if (stateField && fieldsChanged && stateField.key in changedFields) {
			const newState = merged[stateField.key];
			if (typeof newState === 'string') {
				await recordNovelStateForItem(
					ctx.db,
					ctx.workspace_id,
					args.id,
					newState,
					stateField,
				);
			}
		}

		// Activity rows: one item.updated header + one item.field_changed per field
		// so timeline rendering is clean.
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.id,
			actor_id: ctx.user_id,
			action: 'item.updated',
			details_json: {
				...(titleChanged && { title: { from: item.title, to: args.title } }),
				...(bodyChanged && { body_changed: true }),
				field_count: Object.keys(changedFields).length,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		for (const [key, change] of Object.entries(changedFields)) {
			await ctx.db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id: ctx.workspace_id,
				item_id: args.id,
				actor_id: ctx.user_id,
				action: 'item.field_changed',
				details_json: { field_key: key, from: change.from, to: change.to },
				created_at: now,
			});
		}

		const updated = await ctx.db
			.select()
			.from(schema.items)
			.where(eq(schema.items.id, args.id))
			.limit(1);
		return updated[0] ? itemToResponse(updated[0], template_slug) : null;
	},
};
