/**
 * Auto-extend a list's extra_fields when a write tool encounters a field
 * key not in the template + not yet in the list's extras.
 *
 * Behavior:
 *   - For each unknown key in the patch, guess a sensible type from the
 *     value (boolean → checkbox, number → number, array of strings →
 *     multi_select(open=true), else text) and append to the item's
 *     PRIMARY list's extra_fields.
 *   - Returns the list of newly-added FieldDef + the merged effective
 *     schema for re-validation by the caller.
 *
 * Symmetric with _state-extras-helper: primary-list attribution, single
 * activity log entry per added field.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema, type ListMeta, type FieldDef } from '@blitzlist/db';
import { uuid, type Db } from '../db.js';
import { guessFieldDef } from '../list-effective.js';

/**
 * Resolve which lists an item belongs to (primary preferred). Returns
 * empty array if the item isn't in any list (orphan).
 */
async function targetListsForItem(
	db: Db,
	itemId: string,
): Promise<string[]> {
	const memberships = await db
		.select({ list_id: schema.item_lists.list_id, role: schema.item_lists.role })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.item_id, itemId));
	if (memberships.length === 0) return [];
	const primary = memberships.filter((m) => m.role === 'primary');
	return (primary.length > 0 ? primary : memberships).map((m) => m.list_id);
}

/**
 * For each unknown key in `patch`, append a guessed-type field def to
 * the item's primary list's extra_fields. Returns:
 *   - added: the newly created field defs
 *   - mergedSchema: the schema to use for re-validating the patch
 *
 * If the patch has no unknown keys, returns empty added + the original
 * templateSchema.
 *
 * Workspace-scoped: only modifies lists in the given workspace.
 */
export async function autoExtendListFieldsForItem(opts: {
	db: Db;
	workspace_id: string;
	item_id: string;
	template_schema: FieldDef[];
	patch: Record<string, unknown>;
}): Promise<{ added: FieldDef[]; mergedSchema: FieldDef[] }> {
	const { db, workspace_id, item_id, template_schema, patch } = opts;
	const knownKeys = new Set(template_schema.map((f) => f.key));

	// Find unknown keys in the patch (only consider keys with non-null values
	// since validateItemFields rejects unknowns before considering null).
	const unknownEntries: Array<[string, unknown]> = [];
	for (const [k, v] of Object.entries(patch)) {
		if (!knownKeys.has(k) && v !== null && v !== undefined) {
			unknownEntries.push([k, v]);
		}
	}

	if (unknownEntries.length === 0) {
		return { added: [], mergedSchema: template_schema };
	}

	const listIds = await targetListsForItem(db, item_id);

	// Build effective schema from template + extras from all relevant lists
	// (BEFORE deciding what to auto-add — existing extras might cover the
	// unknown keys already).
	const mergedByKey = new Map<string, FieldDef>();
	for (const f of template_schema) mergedByKey.set(f.key, f);

	const listMetas = new Map<string, { meta: ListMeta; slug: string }>();
	for (const listId of listIds) {
		const listRow = (
			await db
				.select({ meta_json: schema.lists.meta_json, slug: schema.lists.slug })
				.from(schema.lists)
				.where(and(eq(schema.lists.id, listId), eq(schema.lists.workspace_id, workspace_id)))
				.limit(1)
		)[0];
		if (!listRow) continue;
		const meta = (listRow.meta_json ?? {}) as ListMeta;
		listMetas.set(listId, { meta, slug: listRow.slug });
		for (const f of meta.extra_fields ?? []) {
			if (!mergedByKey.has(f.key)) mergedByKey.set(f.key, f);
		}
	}

	// Recompute unknown entries against the full effective schema.
	const stillUnknown = unknownEntries.filter(([k]) => !mergedByKey.has(k));
	if (stillUnknown.length === 0) {
		return { added: [], mergedSchema: Array.from(mergedByKey.values()) };
	}

	if (listIds.length === 0) {
		throw new Error(
			`Unknown field(s) [${stillUnknown.map((e) => e[0]).join(', ')}] and item ${item_id} isn't in any list — can't auto-extend.`,
		);
	}

	// Auto-extend the primary list (first in listIds) with the guessed defs.
	const targetListId = listIds[0]!;
	const targetEntry = listMetas.get(targetListId);
	if (!targetEntry) {
		throw new Error(`Primary list ${targetListId} for item ${item_id} not found.`);
	}
	const now = new Date();
	const toAdd: FieldDef[] = stillUnknown.map(([k, v]) => guessFieldDef(k, v));
	const newExtras = [...(targetEntry.meta.extra_fields ?? []), ...toAdd];
	const newMeta: ListMeta = { ...targetEntry.meta, extra_fields: newExtras };
	await db
		.update(schema.lists)
		.set({ meta_json: newMeta, updated_at: now })
		.where(eq(schema.lists.id, targetListId));
	for (const fd of toAdd) {
		await db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id,
			item_id,
			actor_id: null,
			action: 'list.field_added',
			details_json: {
				list_id: targetListId,
				list_slug: targetEntry.slug,
				field_key: fd.key,
				field_type: fd.type,
				action: 'auto_extended',
				via_item: item_id,
			},
			created_at: now,
		});
		mergedByKey.set(fd.key, fd);
	}

	return { added: toAdd, mergedSchema: Array.from(mergedByKey.values()) };
}

/**
 * Variant for add_item: caller knows the target list explicitly. Used
 * when the item doesn't exist yet so item_lists lookup wouldn't work.
 */
export async function autoExtendListFieldsForList(opts: {
	db: Db;
	workspace_id: string;
	list_id: string;
	template_schema: FieldDef[];
	patch: Record<string, unknown>;
}): Promise<{ added: FieldDef[]; mergedSchema: FieldDef[] }> {
	const { db, workspace_id, list_id, template_schema, patch } = opts;
	const knownKeys = new Set(template_schema.map((f) => f.key));
	const unknownEntries: Array<[string, unknown]> = [];
	for (const [k, v] of Object.entries(patch)) {
		if (!knownKeys.has(k) && v !== null && v !== undefined) {
			unknownEntries.push([k, v]);
		}
	}
	if (unknownEntries.length === 0) {
		return { added: [], mergedSchema: template_schema };
	}
	const listRow = (
		await db
			.select({ meta_json: schema.lists.meta_json, slug: schema.lists.slug })
			.from(schema.lists)
			.where(and(eq(schema.lists.id, list_id), eq(schema.lists.workspace_id, workspace_id), isNull(schema.lists.archived)))
			.limit(1)
	)[0]
		?? (
			await db
				.select({ meta_json: schema.lists.meta_json, slug: schema.lists.slug })
				.from(schema.lists)
				.where(and(eq(schema.lists.id, list_id), eq(schema.lists.workspace_id, workspace_id)))
				.limit(1)
		)[0];
	if (!listRow) {
		throw new Error(`List ${list_id} not found in workspace.`);
	}
	const meta = (listRow.meta_json ?? {}) as ListMeta;
	const existing = meta.extra_fields ?? [];
	const existingKeys = new Set(existing.map((f) => f.key));
	const toAdd: FieldDef[] = [];
	for (const [key, value] of unknownEntries) {
		if (existingKeys.has(key)) continue;
		toAdd.push(guessFieldDef(key, value));
	}
	const now = new Date();
	if (toAdd.length > 0) {
		const newExtras = [...existing, ...toAdd];
		const newMeta: ListMeta = { ...meta, extra_fields: newExtras };
		await db
			.update(schema.lists)
			.set({ meta_json: newMeta, updated_at: now })
			.where(eq(schema.lists.id, list_id));
		for (const fd of toAdd) {
			await db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id,
				item_id: null,
				actor_id: null,
				action: 'list.field_added',
				details_json: {
					list_id,
					list_slug: listRow.slug,
					field_key: fd.key,
					field_type: fd.type,
					action: 'auto_extended',
					via_list: true,
				},
				created_at: now,
			});
		}
	}
	const mergedByKey = new Map<string, FieldDef>();
	for (const f of template_schema) mergedByKey.set(f.key, f);
	for (const f of existing) if (!mergedByKey.has(f.key)) mergedByKey.set(f.key, f);
	for (const f of toAdd) if (!mergedByKey.has(f.key)) mergedByKey.set(f.key, f);
	return { added: toAdd, mergedSchema: Array.from(mergedByKey.values()) };
}
