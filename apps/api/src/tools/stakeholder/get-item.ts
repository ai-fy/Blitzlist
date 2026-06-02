/**
 * stakeholder.get_item — get a single item with full context, scope-checked.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../../db.js';
import type { ScopedToolContext } from '../../stakeholder-context.js';
import { assertItemVisible } from './_scope-helper.js';
import { itemToResponse } from '../_response-helper.js';

type GetItemArgs = { id: string };

function validate(args: unknown): GetItemArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	return { id: a.id.trim() };
}

export const stakeholderGetItem: ToolDef<GetItemArgs, unknown, Db, ScopedToolContext> = {
	name: 'get_item',
	description:
		'Get a single item with its fields, template, lists membership, comments, and activity log. Refuses items outside this stakeholder key\'s scope (returns "Item not found").',
	annotations: {
		title: 'Get item',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: { id: { type: 'string', description: 'Item ID, e.g. "BL-042".' } },
		required: ['id'],
	},
	validate,
	async handler(args, ctx) {
		await assertItemVisible(ctx, args.id);

		const item = (
			await ctx.db
				.select()
				.from(schema.items)
				.where(eq(schema.items.id, args.id))
				.limit(1)
		)[0];
		if (!item) throw new Error(`Item not found: ${args.id}`);

		const template = item.template_id
			? (
					await ctx.db
						.select()
						.from(schema.templates)
						.where(eq(schema.templates.id, item.template_id))
						.limit(1)
				)[0] ?? null
			: null;

		const allowedListIds = ctx.allowed_list_ids;
		const membershipQueryConditions = [eq(schema.item_lists.item_id, args.id)];
		if (allowedListIds !== null) {
			membershipQueryConditions.push(inArray(schema.item_lists.list_id, allowedListIds));
		}
		const memberships = await ctx.db
			.select({
				list_slug: schema.lists.slug,
				list_name: schema.lists.name,
				role: schema.item_lists.role,
				position: schema.item_lists.position,
			})
			.from(schema.item_lists)
			.innerJoin(schema.lists, eq(schema.lists.id, schema.item_lists.list_id))
			.where(and(...membershipQueryConditions));

		const recentComments = await ctx.db
			.select()
			.from(schema.comments)
			.where(eq(schema.comments.item_id, args.id))
			.orderBy(desc(schema.comments.created_at))
			.limit(20);

		const recentActivity = await ctx.db
			.select()
			.from(schema.activity_log)
			.where(eq(schema.activity_log.item_id, args.id))
			.orderBy(desc(schema.activity_log.created_at))
			.limit(20);

		return {
			item: itemToResponse(item, template?.slug ?? null),
			template,
			lists: memberships,
			comments: recentComments,
			activity: recentActivity,
		};
	},
};
