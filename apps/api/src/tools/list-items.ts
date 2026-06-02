/**
 * list_items — filtered, paginated list of items in the workspace.
 *
 * BL-035 shape:
 *   - Items are workspace-scoped; "in list X" = a row in item_lists
 *   - Filtering by list joins item_lists; filtering by state reads json_extract
 *   - Returns lists membership alongside each item (so the caller knows which
 *     lists each item is in, with role + position)
 */

import { and, desc, eq, like, or, sql, inArray } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import { itemsToResponses } from './_response-helper.js';

type ListItemsArgs = {
	list?: string;
	role?: string;
	state?: string;
	executor?: string;
	template?: string;
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
	const stringField = (k: string) => {
		if (a[k] === undefined) return;
		if (typeof a[k] !== 'string') throw new Error(`\`${k}\` must be a string`);
		(out as Record<string, unknown>)[k] = (a[k] as string).trim();
	};
	stringField('list');
	stringField('role');
	stringField('state');
	stringField('executor');
	stringField('template');
	stringField('search');
	if (a.limit !== undefined) {
		if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 200) {
			throw new Error('`limit` must be an integer between 1 and 200');
		}
		out.limit = a.limit;
	}
	if (a.include_comments !== undefined) {
		if (typeof a.include_comments !== 'boolean') {
			throw new Error('`include_comments` must be a boolean');
		}
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

export const listItems: ToolDef<ListItemsArgs, unknown, Db> = {
	name: 'list_items',
	description:
		'List items in the workspace, optionally filtered by list slug, role within a list (primary/tag/release/sprint/...), state, executor, template slug, or text search. Returns items with their fields, the lists they belong to, and (by default) the latest 5 comments per item + comment_count. Pass include_comments:false to skip the comments batch query.',
	annotations: {
		title: 'List items',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list: { type: 'string', description: 'Filter to items in this list slug (e.g. "backlog").' },
			role: {
				type: 'string',
				description: 'Filter to items with this role in the listed list (primary | tag | release | sprint | epic | label | prd | custom). Combine with `list` for precise filtering.',
			},
			state: { type: 'string', description: 'Filter to items whose fields_json.state equals this value.' },
			executor: {
				type: 'string',
				description: 'Filter by executor (e.g. "agent:claude", "self", "human:usr-malte").',
			},
			template: { type: 'string', description: 'Filter to items whose template slug matches (e.g. "bugs").' },
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

		const conditions = [eq(schema.items.workspace_id, ctx.workspace_id)];

		// list / role filter goes via item_lists subquery
		let listFilterItemIds: string[] | null = null;
		if (args.list) {
			const lists = await ctx.db
				.select({ id: schema.lists.id })
				.from(schema.lists)
				.where(
					and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.list)),
				)
				.limit(1);
			const list = lists[0];
			if (!list) {
				return { items: [], total: 0, note: `No list with slug "${args.list}"` };
			}
			const membershipConditions = [eq(schema.item_lists.list_id, list.id)];
			if (args.role) {
				const validRoles = [
					'primary',
					'tag',
					'sprint',
					'release',
					'epic',
					'label',
					'prd',
					'custom',
				] as const;
				if (!validRoles.includes(args.role as (typeof validRoles)[number])) {
					throw new Error(`Invalid role "${args.role}". Allowed: ${validRoles.join(', ')}`);
				}
				membershipConditions.push(
					eq(schema.item_lists.role, args.role as (typeof validRoles)[number]),
				);
			}
			const memberships = await ctx.db
				.select({ item_id: schema.item_lists.item_id })
				.from(schema.item_lists)
				.where(and(...membershipConditions));
			listFilterItemIds = memberships.map((m) => m.item_id);
			if (listFilterItemIds.length === 0) {
				return { items: [], total: 0 };
			}
			conditions.push(inArray(schema.items.id, listFilterItemIds));
		} else if (args.role) {
			// role without list — filter across all lists in workspace
			const memberships = await ctx.db
				.select({ item_id: schema.item_lists.item_id })
				.from(schema.item_lists)
				.innerJoin(schema.lists, eq(schema.lists.id, schema.item_lists.list_id))
				.where(
					and(
						eq(schema.lists.workspace_id, ctx.workspace_id),
						eq(
							schema.item_lists.role,
							args.role as 'primary' | 'tag' | 'sprint' | 'release' | 'epic' | 'label' | 'prd' | 'custom',
						),
					),
				);
			const ids = memberships.map((m) => m.item_id);
			if (ids.length === 0) return { items: [], total: 0 };
			conditions.push(inArray(schema.items.id, ids));
		}

		if (args.state) {
			conditions.push(sql`json_extract(${schema.items.fields_json}, '$.state') = ${args.state}`);
		}

		if (args.executor) {
			const wanted = args.executor === 'self' ? `human:${ctx.user_id}` : args.executor;
			conditions.push(eq(schema.items.executor, wanted));
		}

		if (args.template) {
			const t = await ctx.db
				.select({ id: schema.templates.id })
				.from(schema.templates)
				.where(
					and(
						eq(schema.templates.workspace_id, ctx.workspace_id),
						eq(schema.templates.slug, args.template),
					),
				)
				.limit(1);
			if (!t[0]) return { items: [], total: 0, note: `No template with slug "${args.template}"` };
			conditions.push(eq(schema.items.template_id, t[0].id));
		}

		if (args.search && args.search.length > 0) {
			const pattern = `%${args.search}%`;
			conditions.push(or(like(schema.items.title, pattern), like(schema.items.body, pattern))!);
		}

		const where = conditions.length === 1 ? conditions[0] : and(...conditions);

		const items = await ctx.db
			.select()
			.from(schema.items)
			.where(where)
			.orderBy(desc(schema.items.updated_at))
			.limit(limit);

		// Total (no limit)
		const totalRows = await ctx.db
			.select({ count: sql<number>`count(*)` })
			.from(schema.items)
			.where(where);
		const total = totalRows[0]?.count ?? 0;

		// Fetch memberships for the returned items.
		const memberships =
			items.length > 0
				? await ctx.db
						.select({
							item_id: schema.item_lists.item_id,
							list_id: schema.item_lists.list_id,
							list_slug: schema.lists.slug,
							role: schema.item_lists.role,
							position: schema.item_lists.position,
						})
						.from(schema.item_lists)
						.innerJoin(schema.lists, eq(schema.lists.id, schema.item_lists.list_id))
						.where(
							inArray(
								schema.item_lists.item_id,
								items.map((i) => i.id),
							),
						)
				: [];

		const membershipByItem = new Map<string, Array<{ list_slug: string; role: string; position: number }>>();
		for (const m of memberships) {
			const arr = membershipByItem.get(m.item_id) ?? [];
			arr.push({ list_slug: m.list_slug, role: m.role, position: m.position });
			membershipByItem.set(m.item_id, arr);
		}

		// Resolve template slugs for the items in this batch (single lookup).
		const templateIds = Array.from(
			new Set(items.map((i) => i.template_id).filter((x): x is string => x !== null)),
		);
		const templateSlugById: Record<string, string> = {};
		if (templateIds.length > 0) {
			const tRows = await ctx.db
				.select({ id: schema.templates.id, slug: schema.templates.slug })
				.from(schema.templates)
				.where(inArray(schema.templates.id, templateIds));
			for (const t of tRows) templateSlugById[t.id] = t.slug;
		}

		const responses = itemsToResponses(items, templateSlugById);

		// Batch-load comments + counts when requested (default on).
		const includeComments = args.include_comments ?? true;
		const commentsLimit = args.comments_limit ?? 5;
		const commentsByItem = new Map<string, ReturnType<typeof normalizeComment>[]>();
		const countByItem = new Map<string, number>();
		if (includeComments && items.length > 0) {
			const itemIds = items.map((i) => i.id);
			// Single query — DESC so we get newest-first; trim per-item at the JS layer.
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

		return {
			items: responses.map((i) => {
				const itemComments = commentsByItem.get(i.id) ?? [];
				return {
					...i,
					lists: membershipByItem.get(i.id) ?? [],
					...(includeComments && {
						comments: itemComments,
						comment_count: countByItem.get(i.id) ?? 0,
					}),
				};
			}),
			total,
			limit,
			filtered_by: {
				...(args.list && { list: args.list }),
				...(args.role && { role: args.role }),
				...(args.state && { state: args.state }),
				...(args.executor && { executor: args.executor }),
				...(args.template && { template: args.template }),
				...(args.search && { search: args.search }),
			},
		};
	},
};

// Strip the heavy raw row down to the fields agents actually want when
// reading comments inline with items.
function normalizeComment(c: typeof schema.comments.$inferSelect) {
	return {
		id: c.id,
		author: c.author_label ?? c.author_id ?? 'Anonymous',
		body: c.body,
		created_at: c.created_at,
	};
}
