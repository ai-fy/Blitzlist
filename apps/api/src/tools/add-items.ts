/**
 * add_items — batch-add many items to an existing list in one call.
 *
 * Preferred over N add_item calls — single tool invocation = single approval
 * prompt in clients that gate per-call. Each item is validated against the
 * list's template and inserted with role='primary'. Position is the items'
 * index in the array (0-based) by default; pass `position_start` to offset.
 */

import { and, asc, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import {
	validateItemInput,
	insertItemIntoList,
	loadTemplate,
	type ItemInput,
} from './_items-helper.js';

type AddItemsArgs = {
	list?: string;
	items: ItemInput[];
	position_start?: number;
};

function validate(args: unknown): AddItemsArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (a.list !== undefined && typeof a.list !== 'string') {
		throw new Error('`list` must be a string');
	}
	if (!Array.isArray(a.items) || a.items.length === 0) {
		throw new Error('`items` must be a non-empty array');
	}
	if (a.items.length > 200) {
		throw new Error('`items` is capped at 200 per call');
	}
	if (a.position_start !== undefined) {
		if (
			typeof a.position_start !== 'number' ||
			!Number.isInteger(a.position_start) ||
			a.position_start < 0
		) {
			throw new Error('`position_start` must be a non-negative integer');
		}
	}
	return {
		list: a.list as string | undefined,
		items: a.items.map((it, i) => validateItemInput(it, i)),
		position_start: (a.position_start as number | undefined) ?? 0,
	};
}

export const addItems: ToolDef<AddItemsArgs, unknown, Db> = {
	name: 'add_items',
	description:
		'Batch-add many items to an existing list in one tool call (preferred over N add_item calls — single approval, fewer round-trips). Each item is validated against the list\'s template. Returns the created item IDs in order. Max 200 items per call.',
	annotations: {
		title: 'Add multiple items',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list: {
				type: 'string',
				description:
					'List slug. Defaults to the workspace\'s first non-archived list (usually "backlog").',
			},
			items: {
				type: 'array',
				description:
					'Items to insert. Each: { title (required), body?, fields?, executor? }. Validated against the list\'s template.',
				items: {
					type: 'object',
					properties: {
						title: { type: 'string' },
						body: { type: 'string' },
						fields: { type: 'object' },
						executor: { type: ['string', 'null'] },
					},
					required: ['title'],
				},
				maxItems: 200,
			},
			position_start: {
				type: 'number',
				description: 'Starting position for the first inserted item. Default 0.',
			},
		},
		required: ['items'],
	},
	validate,
	async handler(args, ctx) {
		const targetList = await resolveList(ctx.db, ctx.workspace_id, args.list);
		const template = await loadTemplate(ctx.db, targetList.template_id);

		const inserted: Array<{ id: string; title: string; executor: string | null }> = [];
		const startPos = args.position_start ?? 0;
		for (let i = 0; i < args.items.length; i++) {
			const input = args.items[i]!;
			const result = await insertItemIntoList({
				db: ctx.db,
				workspace_id: ctx.workspace_id,
				user_id: ctx.user_id,
				list: {
					id: targetList.id,
					slug: targetList.slug,
					template_id: targetList.template_id,
				},
				template,
				input,
				position: startPos + i,
			});
			inserted.push({ id: result.item_id, title: input.title, executor: result.executor });
		}

		return {
			list: { id: targetList.id, slug: targetList.slug, name: targetList.name },
			items_added: inserted.length,
			items: inserted,
		};
	},
};

async function resolveList(db: Db, workspaceId: string, slug?: string) {
	if (slug) {
		const rows = await db
			.select()
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, workspaceId), eq(schema.lists.slug, slug)))
			.limit(1);
		const list = rows[0];
		if (!list) {
			throw new Error(`No list with slug "${slug}" in this workspace.`);
		}
		return list;
	}
	const rows = await db
		.select()
		.from(schema.lists)
		.where(and(eq(schema.lists.workspace_id, workspaceId), eq(schema.lists.archived, false)))
		.orderBy(asc(schema.lists.created_at))
		.limit(1);
	const list = rows[0];
	if (!list) {
		throw new Error('No lists in this workspace. Create one with create_list first.');
	}
	return list;
}
