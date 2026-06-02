/**
 * stakeholder.list_items — scope-filtered list_items for stakeholder keys.
 *
 * Same shape as the workspace-side list_items, but auto-filtered to items
 * reachable through the key's allowed lists. If the caller passes a `list`
 * filter outside their scope, returns an empty result (not an error).
 */

import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../../db.js';
import type { ScopedToolContext } from '../../stakeholder-context.js';
import { resolveVisibleItemIds } from './_scope-helper.js';

type ListItemsArgs = {
	list?: string;
	state?: string;
	search?: string;
	limit?: number;
	include_comments?: boolean;
	comments_limit?: number;
};

function validate(args: unknown): ListItemsArgs {
	if (args === null || args === undefined) return {};
	if (typeof args !== 'object') throw new Error('arguments must be an object');
	const a = args as Record<string, unknown>;
	const out: ListItemsArgs = {};
	const str = (k: keyof ListItemsArgs) => {
		if (a[k as string] === undefined) return;
		if (typeof a[k as string] !== 'string') throw new Error(`\`${k as string}\` must be a string`);
		(out as Record<string, unknown>)[k as string] = (a[k as string] as string).trim();
	};
	str('list');
	str('state');
	str('search');
	if (a.limit !== undefined) {
		if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 200) {
			throw new Error('`limit` must be an integer between 1 and 200');
		}
		out.limit = a.limit;
	}
	if (a.include_comments !== undefined) {
		if (typeof a.include_comments !== 'boolean') throw new Error('`include_comments` must be a boolean');
		out.include_comments = a.include_comments;
	}
	if (a.comments_limit !== undefined) {
		if (
			typeof a.comments_limit !== 'number' ||
			!Number.isInteger(a.comments_limit) ||
			a.comments_limit < 0 ||
			a.comments_limit > 50
		) {
			throw new Error('`comments_limit` must be an integer between 0 and 50');
		}
		out.comments_limit = a.comments_limit;
	}
	return out;
}

export const stakeholderListItems: ToolDef<ListItemsArgs, unknown, Db, ScopedToolContext> = {
	name: 'list_items',
	description:
		'List items visible to this stakeholder key or share code. Filtered by scope automatically. Returns each item with the latest 5 comments + comment_count by default (pass include_comments:false to skip). Optional filters: list slug, state, text search.',
	annotations: {
		title: 'List items',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list: { type: 'string', description: 'Filter to a specific list slug (must be in your scope).' },
			state: { type: 'string', description: 'Filter by item state (e.g. "in_progress").' },
			search: { type: 'string', description: 'Substring match on title + body.' },
			limit: { type: 'number', description: 'Max results (1-200). Default 50.' },
			include_comments: {
				type: 'boolean',
				description: 'Include latest N comments + comment_count per item. Default true.',
			},
			comments_limit: {
				type: 'number',
				description: 'How many comments to include per item (0-50). Default 5.',
			},
		},
	},
	validate,
	async handler(args, ctx) {
		const limit = args.limit ?? 50;
		const visibleIds = await resolveVisibleItemIds(ctx);

		const conditions = [eq(schema.items.workspace_id, ctx.workspace_id)];

		if (visibleIds !== null) {
			if (visibleIds.length === 0) return { items: [], total: 0 };
			conditions.push(inArray(schema.items.id, visibleIds));
		}

		// Optional list filter — must be in scope.
		if (args.list) {
			const allowedListIds = ctx.allowed_list_ids;
			const lists = await ctx.db
				.select({ id: schema.lists.id, slug: schema.lists.slug })
				.from(schema.lists)
				.where(
					and(
						eq(schema.lists.workspace_id, ctx.workspace_id),
						eq(schema.lists.slug, args.list),
					),
				)
				.limit(1);
			const list = lists[0];
			if (!list) return { items: [], total: 0, note: `No list with slug "${args.list}"` };
			if (allowedListIds !== null && !allowedListIds.includes(list.id)) {
				return { items: [], total: 0, note: `List "${args.list}" is not in your scope.` };
			}
			const membershipIds = await ctx.db
				.select({ item_id: schema.item_lists.item_id })
				.from(schema.item_lists)
				.where(eq(schema.item_lists.list_id, list.id));
			const ids = membershipIds.map((m) => m.item_id);
			if (ids.length === 0) return { items: [], total: 0 };
			conditions.push(inArray(schema.items.id, ids));
		}

		if (args.state) {
			conditions.push(sql`json_extract(${schema.items.fields_json}, '$.state') = ${args.state}`);
		}
		if (args.search && args.search.length > 0) {
			const pattern = `%${args.search}%`;
			conditions.push(or(like(schema.items.title, pattern), like(schema.items.body, pattern))!);
		}

		const where = conditions.length === 1 ? conditions[0] : and(...conditions);

		const items = await ctx.db
			.select({
				id: schema.items.id,
				title: schema.items.title,
				body: schema.items.body,
				template_id: schema.items.template_id,
				fields_json: schema.items.fields_json,
				executor: schema.items.executor,
				created_at: schema.items.created_at,
				updated_at: schema.items.updated_at,
			})
			.from(schema.items)
			.where(where)
			.orderBy(desc(schema.items.updated_at))
			.limit(limit);

		const totalRows = await ctx.db
			.select({ count: sql<number>`count(*)` })
			.from(schema.items)
			.where(where);
		const total = totalRows[0]?.count ?? 0;

		// Batch-load comments + counts when requested (default on).
		const includeComments = args.include_comments ?? true;
		const commentsLimit = args.comments_limit ?? 5;
		const commentsByItem = new Map<string, ReturnType<typeof normalizeComment>[]>();
		const countByItem = new Map<string, number>();
		if (includeComments && items.length > 0) {
			const itemIds = items.map((i) => i.id);
			const rows = await ctx.db
				.select()
				.from(schema.comments)
				.where(inArray(schema.comments.item_id, itemIds))
				.orderBy(desc(schema.comments.created_at));
			for (const r of rows) {
				countByItem.set(r.item_id, (countByItem.get(r.item_id) ?? 0) + 1);
				if (commentsLimit > 0) {
					const arr = commentsByItem.get(r.item_id) ?? [];
					if (arr.length < commentsLimit) arr.push(normalizeComment(r));
					commentsByItem.set(r.item_id, arr);
				}
			}
		}

		// Flatten field values for agent legibility (BL-013 fix).
		const flattenedItems = items.map((i) => {
			const fields = (i.fields_json ?? {}) as Record<string, unknown>;
			const { fields_json: _omit, ...rest } = i;
			void _omit;
			return {
				...rest,
				fields,
				state: typeof fields.state === 'string' ? fields.state : null,
				...(includeComments && {
					comments: commentsByItem.get(i.id) ?? [],
					comment_count: countByItem.get(i.id) ?? 0,
				}),
			};
		});

		return {
			items: flattenedItems,
			total,
			limit,
			scope: ctx.scope,
			permissions: ctx.permissions,
		};
	},
};

function normalizeComment(c: typeof schema.comments.$inferSelect) {
	return {
		id: c.id,
		author: c.author_label ?? c.author_id ?? 'Anonymous',
		body: c.body,
		created_at: c.created_at,
	};
}
