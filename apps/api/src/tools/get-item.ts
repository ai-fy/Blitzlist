/**
 * get_item — fetch a single item plus its lists, recent comments, and activity.
 *
 * BL-035 shape: item.fields_json carries the typed values; item_lists carries
 * membership. We also include the resolved template (fields_schema_json) so
 * the caller can interpret fields_json without a second round-trip.
 */

import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import { itemToResponse } from './_response-helper.js';

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

export const getItem: ToolDef<GetItemArgs, unknown, Db> = {
	name: 'get_item',
	description:
		'Get a single item by ID (e.g. "BL-042") with its fields_json, template schema, lists membership, recent comments, and activity log.',
	annotations: {
		title: 'Get item',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
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

		const template = item.template_id
			? (
					await ctx.db
						.select()
						.from(schema.templates)
						.where(eq(schema.templates.id, item.template_id))
						.limit(1)
				)[0] ?? null
			: null;

		const memberships = await ctx.db
			.select({
				list_id: schema.item_lists.list_id,
				list_slug: schema.lists.slug,
				list_name: schema.lists.name,
				role: schema.item_lists.role,
				position: schema.item_lists.position,
			})
			.from(schema.item_lists)
			.innerJoin(schema.lists, eq(schema.lists.id, schema.item_lists.list_id))
			.where(eq(schema.item_lists.item_id, args.id));

		const recentComments = await ctx.db
			.select()
			.from(schema.comments)
			.where(eq(schema.comments.item_id, args.id))
			.orderBy(desc(schema.comments.created_at))
			.limit(10);

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
