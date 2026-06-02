/**
 * remove_item_from_list — remove an item from a list.
 *
 * Refuses to remove primary memberships unless `force: true` is passed
 * (removing an item's primary list orphans its workflow). Also refuses to
 * remove from a closed list — closed list membership is preserved as the
 * historical record.
 */

import { and, eq } from 'drizzle-orm';
import { schema, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type RemoveItemFromListArgs = {
	item_id: string;
	list: string;
	force?: boolean;
	note?: string;
};

function validate(args: unknown): RemoveItemFromListArgs {
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
	if (a.force !== undefined && typeof a.force !== 'boolean') {
		throw new Error('`force` must be a boolean');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		item_id: a.item_id.trim(),
		list: a.list.trim(),
		force: (a.force as boolean | undefined) ?? false,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const removeItemFromList: ToolDef<RemoveItemFromListArgs, unknown, Db> = {
	name: 'remove_item_from_list',
	description:
		'Remove an item\'s membership in a list. Refuses to remove primary memberships without force:true (that would orphan the item\'s workflow). Refuses to remove from closed lists (membership is the historical record). Pass note for the audit trail.',
	annotations: {
		title: 'Remove item from list',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			item_id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			list: { type: 'string', description: 'List slug.' },
			force: {
				type: 'boolean',
				description: 'Set true to allow removing a primary membership. Default false.',
			},
			note: { type: 'string', description: 'Optional reason recorded in activity log.' },
		},
		required: ['item_id', 'list'],
	},
	validate,
	async handler(args, ctx) {
		// Resolve list.
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

		// Look up the membership.
		const mrows = await ctx.db
			.select()
			.from(schema.item_lists)
			.where(
				and(eq(schema.item_lists.item_id, args.item_id), eq(schema.item_lists.list_id, list.id)),
			)
			.limit(1);
		const membership = mrows[0];
		if (!membership) {
			// Idempotent — not an error.
			return { removed: false, reason: 'not_a_member', list: { slug: args.list } };
		}
		if (membership.role === 'primary' && !args.force) {
			throw new Error(
				`Cannot remove primary membership of ${args.item_id} from "${args.list}" without force:true. This is the item\'s main workflow location.`,
			);
		}

		const now = new Date();
		await ctx.db
			.delete(schema.item_lists)
			.where(
				and(eq(schema.item_lists.item_id, args.item_id), eq(schema.item_lists.list_id, list.id)),
			);

		await ctx.db
			.update(schema.items)
			.set({ updated_at: now })
			.where(eq(schema.items.id, args.item_id));

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.item_id,
			actor_id: ctx.user_id,
			action: 'item.removed_from_list',
			details_json: {
				list_id: list.id,
				list_slug: list.slug,
				prior_role: membership.role,
				prior_position: membership.position,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		return { removed: true, list: { id: list.id, slug: list.slug } };
	},
};
