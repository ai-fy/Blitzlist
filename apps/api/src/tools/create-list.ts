/**
 * create_list — create a new list in the workspace.
 *
 * BL-035: lists are the universal container. Optional template gives items
 * added to this list a default schema (state vocab, custom fields).
 * `meta_json` carries list-level metadata: release ship_target, sprint
 * start/end, invite event_date, etc.
 *
 * Replaces BL-010's `create_release` — to create a release, pass
 * template: "release" and meta: {ship_target: "2026-09-01"}.
 */

import { and, eq } from 'drizzle-orm';
import { schema, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import {
	validateItemInput,
	insertItemIntoList,
	loadTemplate,
	type ItemInput,
} from './_items-helper.js';

type CreateListArgs = {
	slug: string;
	name: string;
	description?: string;
	template?: string; // slug, not id — friendlier for callers
	meta?: ListMeta;
	tags?: string[];
	color?: string;
	icon?: string;
	items?: ItemInput[]; // BL-035 convenience: populate the list in one call
};

const SLUG_RX = /^[a-z0-9][a-z0-9._-]*$/;

function validate(args: unknown): CreateListArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.slug !== 'string' || a.slug.trim().length === 0) {
		throw new Error('`slug` is required (non-empty string)');
	}
	const slug = a.slug.trim();
	if (!SLUG_RX.test(slug)) {
		throw new Error(`Invalid slug "${slug}". Must match /^[a-z0-9][a-z0-9._-]*$/`);
	}
	if (typeof a.name !== 'string' || a.name.trim().length === 0) {
		throw new Error('`name` is required (non-empty string)');
	}
	if (a.description !== undefined && typeof a.description !== 'string') {
		throw new Error('`description` must be a string');
	}
	if (a.template !== undefined && typeof a.template !== 'string') {
		throw new Error('`template` must be a string (template slug)');
	}
	if (a.meta !== undefined && (typeof a.meta !== 'object' || a.meta === null || Array.isArray(a.meta))) {
		throw new Error('`meta` must be an object');
	}
	if (a.tags !== undefined) {
		if (!Array.isArray(a.tags) || !a.tags.every((t) => typeof t === 'string')) {
			throw new Error('`tags` must be an array of strings');
		}
	}
	let items: ItemInput[] | undefined;
	if (a.items !== undefined) {
		if (!Array.isArray(a.items)) {
			throw new Error('`items` must be an array');
		}
		items = a.items.map((it, i) => validateItemInput(it, i));
	}
	return {
		slug,
		name: (a.name as string).trim(),
		description: (a.description as string | undefined)?.trim(),
		template: (a.template as string | undefined)?.trim(),
		meta: (a.meta as ListMeta | undefined) ?? {},
		tags: a.tags as string[] | undefined,
		color: (a.color as string | undefined)?.trim(),
		icon: (a.icon as string | undefined)?.trim(),
		items,
	};
}

export const createList: ToolDef<CreateListArgs, unknown, Db> = {
	name: 'create_list',
	description:
		'Create a new list in the workspace, optionally with items in one call (preferred — fewer round-trips for the user). Pass a template slug (e.g. "backlog", "release", "shopping") to inherit a field schema; pass meta for list-level data (release ship_target, sprint dates, invite event_date). Items are validated against the template schema and inserted in order with role="primary".',
	annotations: {
		title: 'Create list',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			slug: { type: 'string', description: 'Workspace-unique slug, e.g. "v0.5" or "groceries".' },
			name: { type: 'string', description: 'Human-readable list name.' },
			description: { type: 'string', description: 'Optional description / purpose.' },
			template: {
				type: 'string',
				description:
					'Template slug to use (e.g. "backlog", "release", "shopping"). Omit for a list with no schema (free-form items).',
			},
			meta: {
				type: 'object',
				description:
					'List-level metadata. Examples: {ship_target:"2026-09-01"} for a release, {start_date,end_date} for a sprint.',
			},
			tags: { type: 'array', items: { type: 'string' }, description: 'Free-form tags.' },
			color: { type: 'string', description: 'Hex color for UI.' },
			icon: { type: 'string', description: 'Emoji / icon for UI.' },
			items: {
				type: 'array',
				description:
					'Optional items to insert into the new list in one call. Each item: { title, body?, fields?, executor? }. Fields are validated against the resolved template. Use this whenever you have a list of things to capture — it is one tool call instead of N+1.',
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
			},
		},
		required: ['slug', 'name'],
	},
	validate,
	async handler(args, ctx) {
		// Uniqueness pre-check.
		const existing = await ctx.db
			.select({ id: schema.lists.id })
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.slug)))
			.limit(1);
		if (existing[0]) {
			throw new Error(`A list with slug "${args.slug}" already exists in this workspace.`);
		}

		// Resolve template by slug if provided.
		let template_id: string | null = null;
		let template_slug: string | null = null;
		if (args.template) {
			const trows = await ctx.db
				.select({ id: schema.templates.id, slug: schema.templates.slug })
				.from(schema.templates)
				.where(
					and(
						eq(schema.templates.workspace_id, ctx.workspace_id),
						eq(schema.templates.slug, args.template),
					),
				)
				.limit(1);
			if (!trows[0]) {
				throw new Error(`No template with slug "${args.template}". Use list_templates to see what's available.`);
			}
			template_id = trows[0].id;
			template_slug = trows[0].slug;
		}

		const id = uuid();
		const now = new Date();

		await ctx.db.insert(schema.lists).values({
			id,
			workspace_id: ctx.workspace_id,
			slug: args.slug,
			name: args.name,
			description: args.description ?? null,
			template_id,
			meta_json: args.meta ?? {},
			tags_json: args.tags ?? [],
			archived: false,
			color: args.color ?? null,
			icon: args.icon ?? null,
			created_by: ctx.user_id,
			created_at: now,
			updated_at: now,
		});

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'list.created',
			details_json: {
				list_id: id,
				slug: args.slug,
				template: template_slug,
				...(args.meta && Object.keys(args.meta).length > 0 && { meta: args.meta }),
			},
			created_at: now,
		});

		const created = await ctx.db
			.select()
			.from(schema.lists)
			.where(eq(schema.lists.id, id))
			.limit(1);
		const listRow = created[0]!;

		// Optionally insert items in the same call.
		if (args.items && args.items.length > 0) {
			const template = await loadTemplate(ctx.db, template_id);
			const itemSummaries: Array<{ id: string; title: string; executor: string | null }> = [];
			for (let i = 0; i < args.items.length; i++) {
				const input = args.items[i]!;
				const result = await insertItemIntoList({
					db: ctx.db,
					workspace_id: ctx.workspace_id,
					user_id: ctx.user_id,
					list: { id: listRow.id, slug: listRow.slug, template_id: listRow.template_id },
					template,
					input,
					position: i,
				});
				itemSummaries.push({
					id: result.item_id,
					title: input.title,
					executor: result.executor,
				});
			}
			return { list: listRow, items: itemSummaries, items_added: itemSummaries.length };
		}

		return { list: listRow, items: [], items_added: 0 };
	},
};
