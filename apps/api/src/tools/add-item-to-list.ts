/**
 * add_item_to_list — bind an item to a list with a role + position.
 *
 * BL-035 generalization of BL-010's promise_in_release. An item can be in
 * many lists; role discriminates "primary workflow location" vs "tag" vs
 * "release" vs "sprint", etc. position is per-list.
 *
 * Idempotent in the sense that adding the same (item, list) pair twice
 * updates the role/position (no error). Removing is a separate tool
 * (remove_item_from_list).
 *
 * Refuses to add to a list whose meta_json.closed_at is set (closed lists
 * are immutable — preserves the at-close-time breakdown).
 */

import { and, eq, sql } from 'drizzle-orm';
import { schema, type ItemListRole, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type AddItemToListArgs = {
	item_id: string;
	list: string; // slug
	role?: ItemListRole;
	position?: number;
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

function validate(args: unknown): AddItemToListArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.item_id !== 'string' || a.item_id.trim().length === 0) {
		throw new Error('`item_id` is required (non-empty string)');
	}
	if (typeof a.list !== 'string' || a.list.trim().length === 0) {
		throw new Error('`list` is required (list slug)');
	}
	let role: ItemListRole = 'tag';
	if (a.role !== undefined) {
		if (typeof a.role !== 'string' || !VALID_ROLES.includes(a.role as ItemListRole)) {
			throw new Error(`\`role\` must be one of: ${VALID_ROLES.join(', ')}`);
		}
		role = a.role as ItemListRole;
	}
	let position = 0;
	if (a.position !== undefined) {
		if (typeof a.position !== 'number' || !Number.isInteger(a.position) || a.position < 0) {
			throw new Error('`position` must be a non-negative integer');
		}
		position = a.position;
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		item_id: a.item_id.trim(),
		list: a.list.trim(),
		role,
		position,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const addItemToList: ToolDef<AddItemToListArgs, unknown, Db> = {
	name: 'add_item_to_list',
	description:
		'Add an item to a list (or update its role/position if already a member). role distinguishes "primary" (the item\'s main workflow location — items have exactly one primary) from "tag" / "release" / "sprint" / "epic" / etc. Refuses to add to closed lists.',
	annotations: {
		title: 'Add item to list',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			item_id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			list: { type: 'string', description: 'Target list slug.' },
			role: {
				type: 'string',
				description: `Role of this membership: ${VALID_ROLES.join(', ')}. Default "tag".`,
			},
			position: { type: 'number', description: 'Position within the list (0-based). Default 0.' },
			note: { type: 'string', description: 'Optional note recorded in the activity log.' },
		},
		required: ['item_id', 'list'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Verify item exists in workspace.
		const itemRows = await ctx.db
			.select()
			.from(schema.items)
			.where(
				and(eq(schema.items.id, args.item_id), eq(schema.items.workspace_id, ctx.workspace_id)),
			)
			.limit(1);
		const item = itemRows[0];
		if (!item) {
			throw new Error(`Item not found in this workspace: ${args.item_id}`);
		}

		// 2. Resolve list.
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

		// 3. If role='primary', enforce uniqueness — demote any other primary membership for this item.
		const now = new Date();
		if (args.role === 'primary') {
			await ctx.db
				.update(schema.item_lists)
				.set({ role: 'tag' })
				.where(
					and(
						eq(schema.item_lists.item_id, args.item_id),
						eq(schema.item_lists.role, 'primary'),
					),
				);
		}

		// 4. Upsert membership (INSERT OR REPLACE).
		await ctx.db
			.insert(schema.item_lists)
			.values({
				item_id: args.item_id,
				list_id: list.id,
				role: args.role ?? 'tag',
				position: args.position ?? 0,
				added_by: ctx.user_id,
				added_at: now,
			})
			.onConflictDoUpdate({
				target: [schema.item_lists.item_id, schema.item_lists.list_id],
				set: {
					role: args.role ?? 'tag',
					position: args.position ?? 0,
				},
			});

		// 5. Bump item updated_at so list_items sorting reflects the change.
		await ctx.db
			.update(schema.items)
			.set({ updated_at: now })
			.where(eq(schema.items.id, args.item_id));

		// 6. Activity row.
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.item_id,
			actor_id: ctx.user_id,
			action: 'item.added_to_list',
			details_json: {
				list_id: list.id,
				list_slug: list.slug,
				role: args.role ?? 'tag',
				position: args.position ?? 0,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		const membership = await ctx.db
			.select()
			.from(schema.item_lists)
			.where(
				and(
					eq(schema.item_lists.item_id, args.item_id),
					eq(schema.item_lists.list_id, list.id),
				),
			)
			.limit(1);

		// Touch sql var to satisfy linter (we don't use it directly here but it's
		// imported for parity with siblings).
		void sql;

		return { membership: membership[0], list: { id: list.id, slug: list.slug, name: list.name } };
	},
};
