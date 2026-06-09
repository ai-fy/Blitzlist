/**
 * remove_items_from_list — batch / bulk version of remove_item_from_list.
 *
 * BATCH / BULK / MULTI-ITEM membership remove: pull MANY items off ONE list
 * in a single call. Symmetric with add_items_to_list / set_states /
 * update_items — strongly preferred over N parallel remove_item_from_list
 * calls.
 *
 * Fail-fast: if the list is closed, OR if any item has role='primary' in
 * this list and `force` is not set, the whole batch aborts and NO writes
 * happen.
 *
 * Up to 200 item_ids per call. Each removed row gets an activity entry.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type Args = {
	list: string;
	item_ids: string[];
	force?: boolean;
	note?: string;
};

const MAX = 200;

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.list !== 'string' || a.list.trim().length === 0) {
		throw new Error('`list` is required (list slug)');
	}
	if (!Array.isArray(a.item_ids)) {
		throw new Error('`item_ids` is required (array of strings)');
	}
	if (a.item_ids.length === 0) {
		throw new Error('`item_ids` cannot be empty');
	}
	if (a.item_ids.length > MAX) {
		throw new Error(`Up to ${MAX} item_ids per call (got ${a.item_ids.length}).`);
	}
	const ids: string[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < a.item_ids.length; i++) {
		const v = a.item_ids[i];
		if (typeof v !== 'string' || v.trim().length === 0) {
			throw new Error(`item_ids[${i}] must be a non-empty string`);
		}
		const t = v.trim();
		if (!seen.has(t)) {
			seen.add(t);
			ids.push(t);
		}
	}
	if (a.force !== undefined && typeof a.force !== 'boolean') {
		throw new Error('`force` must be a boolean');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		list: a.list.trim(),
		item_ids: ids,
		force: (a.force as boolean | undefined) ?? false,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const removeItemsFromList: ToolDef<Args, unknown, Db> = {
	name: 'remove_items_from_list',
	description:
		'BATCH / BULK / MULTI-ITEM membership remove: pull MANY items off ONE list in a single tool call (also: mass remove from list, bulk unbind). Strongly preferred over N remove_item_from_list calls — single approval, atomic validation, fewer round-trips. Fail-fast: if the list is closed (immutable), or if any item is a primary-role member of the list and `force:true` isn\'t set (which would orphan the item\'s workflow), the whole batch aborts and NO writes happen. Items that aren\'t members of the list are skipped silently (idempotent). Up to 200 item_ids per call.',
	annotations: {
		title: 'Remove items from list (batch / bulk / multi-item)',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list: { type: 'string', description: 'List slug.' },
			item_ids: {
				type: 'array',
				items: { type: 'string' },
				description: 'Item IDs to remove. Up to 200. Items not actually in the list are skipped.',
			},
			force: {
				type: 'boolean',
				description: 'Set true to allow removing items whose role in this list is "primary".',
			},
			note: { type: 'string', description: 'Optional reason recorded in each activity row.' },
		},
		required: ['list', 'item_ids'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Resolve list.
		const listRows = await ctx.db
			.select()
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.list)))
			.limit(1);
		const list = listRows[0];
		if (!list) {
			throw new Error(`No list with slug "${args.list}" in this workspace.`);
		}
		const meta = list.meta_json as ListMeta;
		if (meta.closed_at) {
			throw new Error(
				`List "${args.list}" was closed on ${meta.closed_at} and its memberships are immutable.`,
			);
		}

		// 2. Load existing memberships for the requested item_ids in this list.
		const memberships = await ctx.db
			.select()
			.from(schema.item_lists)
			.where(
				and(
					eq(schema.item_lists.list_id, list.id),
					inArray(schema.item_lists.item_id, args.item_ids),
				),
			);
		const byItem = new Map(memberships.map((m) => [m.item_id, m] as const));

		// 3. Primary-protection check across the whole batch.
		const primaryHits = memberships.filter((m) => m.role === 'primary').map((m) => m.item_id);
		if (primaryHits.length > 0 && !args.force) {
			throw new Error(
				`Batch aborted — ${primaryHits.length} item(s) are primary members of "${args.list}" and require force:true: ${primaryHits.join(', ')}. No writes performed.`,
			);
		}

		// 4. Delete the memberships we have rows for.
		const presentIds = Array.from(byItem.keys());
		const now = new Date();
		if (presentIds.length === 0) {
			return {
				ok: true,
				list: { id: list.id, slug: list.slug },
				removed: 0,
				skipped: args.item_ids.length,
				not_members: args.item_ids,
			};
		}
		await ctx.db
			.delete(schema.item_lists)
			.where(
				and(
					eq(schema.item_lists.list_id, list.id),
					inArray(schema.item_lists.item_id, presentIds),
				),
			);
		await ctx.db
			.update(schema.items)
			.set({ updated_at: now })
			.where(inArray(schema.items.id, presentIds));

		// 5. Activity rows — one per removal.
		for (const id of presentIds) {
			const m = byItem.get(id)!;
			await ctx.db.insert(schema.activity_log).values({
				id: uuid(),
				workspace_id: ctx.workspace_id,
				item_id: id,
				actor_id: ctx.user_id,
				action: 'item.removed_from_list',
				details_json: {
					list_id: list.id,
					list_slug: list.slug,
					prior_role: m.role,
					prior_position: m.position,
					batch: true,
					...(args.note && { note: args.note }),
				},
				created_at: now,
			});
		}

		const notMembers = args.item_ids.filter((id) => !byItem.has(id));
		return {
			ok: true,
			list: { id: list.id, slug: list.slug },
			removed: presentIds.length,
			skipped: notMembers.length,
			not_members: notMembers,
		};
	},
};
