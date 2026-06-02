/**
 * add_item — create a single item and drop it into a list.
 *
 * Thin wrapper over the shared insert helper. Use add_items for multiple,
 * or create_list({items:[...]}) when you're also making the list.
 */

import { eq, and, asc } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import {
	validateItemInput,
	insertItemIntoList,
	loadTemplate,
	type ItemInput,
} from './_items-helper.js';
import { itemToResponse } from './_response-helper.js';

type AddItemArgs = ItemInput & { list?: string };

function validate(args: unknown): AddItemArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (a.list !== undefined && typeof a.list !== 'string') {
		throw new Error('`list` must be a string');
	}
	const input = validateItemInput(args);
	return {
		list: a.list as string | undefined,
		...input,
	};
}

export const addItem: ToolDef<AddItemArgs, unknown, Db> = {
	name: 'add_item',
	description:
		'Create one item in a workspace list (defaults to the workspace\'s primary list — usually "backlog"). The item inherits the list\'s template — its fields (state, priority, due_date, custom) are validated against that template\'s schema. To add many items, use add_items. To create a new list and populate it in one call, use create_list with items:[...].',
	annotations: {
		title: 'Add item',
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
					'List slug to add the item to (e.g. "backlog", "shopping"). Defaults to the workspace\'s first list.',
			},
			title: { type: 'string', description: 'Short human-readable title.' },
			body: { type: 'string', description: 'Markdown description / context.' },
			executor: {
				type: ['string', 'null'],
				description:
					'Who/what is doing the work. Format: human:<uid> | agent:claude | agent:<name> | self | contractor:<label> | null. Omit to let the template pick a default.',
			},
			fields: {
				type: 'object',
				description:
					'Typed field values keyed by the template\'s field keys, e.g. { state: "draft", priority: "p1", due_date: "2026-09-01" }. Unknown keys rejected; required fields enforced.',
			},
		},
		required: ['title'],
	},
	validate,
	async handler(args, ctx) {
		const targetList = await resolveList(ctx.db, ctx.workspace_id, args.list);
		const template = await loadTemplate(ctx.db, targetList.template_id);
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
			input: {
				title: args.title,
				body: args.body,
				fields: args.fields,
				executor: args.executor,
			},
			position: 0,
		});

		const created = await ctx.db
			.select()
			.from(schema.items)
			.where(eq(schema.items.id, result.item_id))
			.limit(1);
		return {
			item: created[0] ? itemToResponse(created[0], template?.slug ?? null) : null,
			list: { id: targetList.id, slug: targetList.slug, role: 'primary' },
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
