/**
 * add_items_to_list — batch / bulk version of add_item_to_list.
 *
 * BATCH / BULK / MULTI-MEMBER membership add: bind MANY items to ONE list
 * in a single call. Symmetric with add_items / update_items / set_states —
 * strongly preferred over N parallel add_item_to_list calls (single
 * approval, atomic validation, fewer round-trips).
 *
 * Fail-fast: if ANY member fails validation (missing item, closed list,
 * invalid role), the whole batch aborts and NO writes happen.
 *
 * Up to 200 members per call. Each row gets its own activity_log entry.
 *
 * Use case: splitting one list into two — collect 14 item_ids,
 * add_items_to_list once to the new list, remove_items_from_list once
 * from the old. 2 approvals instead of 28.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type ItemListRole, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type Member = {
	item_id: string;
	role?: ItemListRole;
	position?: number;
};

type Args = {
	list: string; // slug
	members: Member[];
	note?: string;
};

const VALID_ROLES: ItemListRole[] = [
	'primary',
	'tag',
	'sprint',
	'release',
	'epic',
	'label',
	'prd',
	'custom',
];

const MAX = 200;

function validateMember(raw: unknown, idx: number): Member {
	if (typeof raw !== 'object' || raw === null) {
		throw new Error(`members[${idx}] must be an object`);
	}
	const m = raw as Record<string, unknown>;
	if (typeof m.item_id !== 'string' || m.item_id.trim().length === 0) {
		throw new Error(`members[${idx}].item_id is required (non-empty string)`);
	}
	const out: Member = { item_id: m.item_id.trim() };
	if (m.role !== undefined) {
		if (typeof m.role !== 'string' || !VALID_ROLES.includes(m.role as ItemListRole)) {
			throw new Error(`members[${idx}].role must be one of: ${VALID_ROLES.join(', ')}`);
		}
		out.role = m.role as ItemListRole;
	}
	if (m.position !== undefined) {
		if (typeof m.position !== 'number' || !Number.isInteger(m.position) || m.position < 0) {
			throw new Error(`members[${idx}].position must be a non-negative integer`);
		}
		out.position = m.position;
	}
	return out;
}

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.list !== 'string' || a.list.trim().length === 0) {
		throw new Error('`list` is required (list slug)');
	}
	if (!Array.isArray(a.members)) {
		throw new Error('`members` is required (array of {item_id, role?, position?})');
	}
	if (a.members.length === 0) {
		throw new Error('`members` cannot be empty');
	}
	if (a.members.length > MAX) {
		throw new Error(`Up to ${MAX} members per call (got ${a.members.length}). Split into multiple calls.`);
	}
	const members = a.members.map((m, i) => validateMember(m, i));
	// dedupe by item_id within the call — last one wins
	const seen = new Map<string, Member>();
	for (const m of members) seen.set(m.item_id, m);
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		list: a.list.trim(),
		members: Array.from(seen.values()),
		note: (a.note as string | undefined)?.trim(),
	};
}

export const addItemsToList: ToolDef<Args, unknown, Db> = {
	name: 'add_items_to_list',
	description:
		'BATCH / BULK / MULTI-ITEM membership add: bind MANY items to ONE list in a single tool call (also: mass add to list, bulk membership). Each member: {item_id, role?, position?}. Strongly preferred over N add_item_to_list calls — single approval, atomic validation, fewer round-trips. Fail-fast: if any member is invalid (missing item, closed list, bad role) the whole batch aborts and NO writes happen. Up to 200 members per call. role="primary" replaces any existing primary membership for that item (each item has at most one primary). Refuses to add to a closed list.',
	annotations: {
		title: 'Add items to list (batch / bulk / multi-item)',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list: { type: 'string', description: 'Target list slug (workspace-unique).' },
			members: {
				type: 'array',
				description: 'Up to 200 memberships to create or update.',
				items: {
					type: 'object',
					properties: {
						item_id: { type: 'string' },
						role: { type: 'string', description: `One of: ${VALID_ROLES.join(', ')}. Default "tag".` },
						position: { type: 'number', description: 'Position within the list (0-based).' },
					},
					required: ['item_id'],
				},
			},
			note: { type: 'string', description: 'Optional note attached to every member\'s activity log entry.' },
		},
		required: ['list', 'members'],
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
				`List "${args.list}" was closed on ${meta.closed_at} and cannot accept new members.`,
			);
		}

		// 2. Validate all items exist in workspace (fail-fast).
		const itemIds = args.members.map((m) => m.item_id);
		const existing = await ctx.db
			.select({ id: schema.items.id })
			.from(schema.items)
			.where(
				and(
					inArray(schema.items.id, itemIds),
					eq(schema.items.workspace_id, ctx.workspace_id),
				),
			);
		const foundIds = new Set(existing.map((r) => r.id));
		const missing = itemIds.filter((id) => !foundIds.has(id));
		if (missing.length > 0) {
			throw new Error(
				`Batch aborted — ${missing.length} item(s) not found in this workspace: ${missing.join(', ')}. No writes performed.`,
			);
		}

		// 3. Apply each membership. For role='primary' we first demote ANY
		// existing primary memberships for the affected items (in one query).
		const now = new Date();
		const primaryItemIds = args.members.filter((m) => m.role === 'primary').map((m) => m.item_id);
		if (primaryItemIds.length > 0) {
			await ctx.db
				.update(schema.item_lists)
				.set({ role: 'tag' })
				.where(
					and(
						inArray(schema.item_lists.item_id, primaryItemIds),
						eq(schema.item_lists.role, 'primary'),
					),
				);
		}

		const results: Array<{ item_id: string; role: ItemListRole; position: number; action: 'added' | 'updated' }> = [];
		// Pre-fetch existing memberships to distinguish add vs update.
		const existingMemberships = await ctx.db
			.select({ item_id: schema.item_lists.item_id })
			.from(schema.item_lists)
			.where(
				and(
					eq(schema.item_lists.list_id, list.id),
					inArray(schema.item_lists.item_id, itemIds),
				),
			);
		const wasMember = new Set(existingMemberships.map((r) => r.item_id));

		for (const m of args.members) {
			const role = m.role ?? 'tag';
			const position = m.position ?? 0;
			await ctx.db
				.insert(schema.item_lists)
				.values({
					item_id: m.item_id,
					list_id: list.id,
					role,
					position,
					added_by: ctx.user_id,
					added_at: now,
				})
				.onConflictDoUpdate({
					target: [schema.item_lists.item_id, schema.item_lists.list_id],
					set: { role, position },
				});
			results.push({
				item_id: m.item_id,
				role,
				position,
				action: wasMember.has(m.item_id) ? 'updated' : 'added',
			});
		}

		// 4. Bump item updated_at in one batch.
		await ctx.db
			.update(schema.items)
			.set({ updated_at: now })
			.where(inArray(schema.items.id, itemIds));

		// 5. Activity rows — one per member.
		const activityRows = results.map((r) => ({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: r.item_id,
			actor_id: ctx.user_id,
			action: 'item.added_to_list' as const,
			details_json: {
				list_id: list.id,
				list_slug: list.slug,
				role: r.role,
				position: r.position,
				batch: true,
				action: r.action,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		}));
		for (const row of activityRows) {
			await ctx.db.insert(schema.activity_log).values(row);
		}

		const added = results.filter((r) => r.action === 'added').length;
		const updated = results.filter((r) => r.action === 'updated').length;
		return {
			ok: true,
			list: { id: list.id, slug: list.slug, name: list.name },
			total: results.length,
			added,
			updated,
			results,
		};
	},
};
