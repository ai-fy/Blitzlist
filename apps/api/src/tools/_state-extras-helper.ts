/**
 * Helper: when a write path sets an item's state to a value that isn't in the
 * template's declared options NOR in the list-level extras, append it to the
 * relevant list's extra_state_options.
 *
 * Which list? Items can be in many lists. We attribute the novel state to the
 * item's PRIMARY list (item_lists.role='primary'). If the item has no primary,
 * we attribute to all lists the item is in. Rationale: lists with a primary
 * relationship "own" the item's lifecycle; secondary lists are tagging-only
 * and shouldn't get state-shape changes.
 *
 * BL-022: open state enum — lets users introduce arbitrary new states without
 * editing the template.
 */

import { and, eq } from 'drizzle-orm';
import { schema, type ListMeta, type FieldDef } from '@blitzlist/db';
import { uuid, type Db } from '../db.js';

/**
 * Record a (possibly novel) state value for one item. If the value is already
 * known via template options or any list-level extras for the relevant list(s),
 * this is a no-op. Returns the list ids whose extras were extended.
 */
export async function recordNovelStateForItem(
	db: Db,
	workspaceId: string,
	itemId: string,
	newState: string,
	stateField: FieldDef,
): Promise<string[]> {
	if (!stateField.open) return [];
	const declared = new Set(stateField.options ?? []);
	if (declared.has(newState)) return [];

	// Find the lists this item belongs to. Prefer the primary list; fall back
	// to all if no primary exists.
	const memberships = await db
		.select({ list_id: schema.item_lists.list_id, role: schema.item_lists.role })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.item_id, itemId));
	if (memberships.length === 0) return [];
	const primary = memberships.filter((m) => m.role === 'primary');
	const targetListIds = (primary.length > 0 ? primary : memberships).map((m) => m.list_id);

	const extended: string[] = [];
	const now = new Date();

	for (const listId of targetListIds) {
		const listRow = (
			await db
				.select({ meta_json: schema.lists.meta_json, slug: schema.lists.slug })
				.from(schema.lists)
				.where(and(eq(schema.lists.id, listId), eq(schema.lists.workspace_id, workspaceId)))
				.limit(1)
		)[0];
		if (!listRow) continue;

		const meta = (listRow.meta_json ?? {}) as ListMeta;
		const extras = meta.extra_state_options ?? [];
		if (extras.includes(newState)) continue;

		const newMeta: ListMeta = { ...meta, extra_state_options: [...extras, newState] };
		await db
			.update(schema.lists)
			.set({ meta_json: newMeta, updated_at: now })
			.where(eq(schema.lists.id, listId));

		await db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: workspaceId,
			item_id: itemId,
			actor_id: null,
			action: 'list.state_options_extended',
			details_json: {
				list_id: listId,
				list_slug: listRow.slug,
				added: newState,
				via_item: itemId,
			},
			created_at: now,
		});
		extended.push(listId);
	}

	return extended;
}

/**
 * Like recordNovelStateForItem but attributes the novel state directly to a
 * named list (used by the web POST /r/:code/state-option endpoint and by the
 * kanban "+ new lane" affordance — neither has an item to anchor to).
 */
export async function recordNovelStateForList(
	db: Db,
	workspaceId: string,
	listId: string,
	newState: string,
	stateField: FieldDef,
): Promise<boolean> {
	if (!stateField.open) return false;
	const declared = new Set(stateField.options ?? []);
	if (declared.has(newState)) return false;

	const listRow = (
		await db
			.select({ meta_json: schema.lists.meta_json, slug: schema.lists.slug })
			.from(schema.lists)
			.where(and(eq(schema.lists.id, listId), eq(schema.lists.workspace_id, workspaceId)))
			.limit(1)
	)[0];
	if (!listRow) return false;

	const meta = (listRow.meta_json ?? {}) as ListMeta;
	const extras = meta.extra_state_options ?? [];
	if (extras.includes(newState)) return false;

	const newMeta: ListMeta = { ...meta, extra_state_options: [...extras, newState] };
	const now = new Date();
	await db
		.update(schema.lists)
		.set({ meta_json: newMeta, updated_at: now })
		.where(eq(schema.lists.id, listId));

	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: workspaceId,
		item_id: null,
		actor_id: null,
		action: 'list.state_options_extended',
		details_json: {
			list_id: listId,
			list_slug: listRow.slug,
			added: newState,
			via_list: true,
		},
		created_at: now,
	});
	return true;
}
