/**
 * reorder_state_options — set the canonical column order for a list's
 * state field. Persists to lists.meta_json.state_options_order.
 *
 * When this is set, it OVERRIDES the default order (template.options +
 * extra_state_options in append order). The kanban view + state-edit
 * dropdown both use this order verbatim.
 *
 * Defensive: if `options` is missing a value that exists in template
 * options ∪ extra_state_options, the renderer will append it at the
 * end (so the page never hides valid columns).
 */

import { and, eq } from 'drizzle-orm';
import { schema, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type Args = {
	list_id?: string;
	list_slug?: string;
	options: string[];
};

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	const list_id = typeof a.list_id === 'string' && a.list_id.trim().length > 0 ? a.list_id.trim() : undefined;
	const list_slug = typeof a.list_slug === 'string' && a.list_slug.trim().length > 0 ? a.list_slug.trim() : undefined;
	if (!list_id && !list_slug) {
		throw new Error('At least one of `list_id` or `list_slug` is required.');
	}
	if (!Array.isArray(a.options) || !a.options.every((v) => typeof v === 'string')) {
		throw new Error('`options` must be an array of strings.');
	}
	const options = (a.options as string[]).map((s) => s.trim()).filter((s) => s.length > 0);
	if (options.length === 0) {
		throw new Error('`options` cannot be empty.');
	}
	return { list_id, list_slug, options };
}

export const reorderStateOptions: ToolDef<Args, unknown, Db> = {
	name: 'reorder_state_options',
	description:
		'Set the canonical column order for a list\'s kanban + state-edit dropdown. Persists to lists.meta_json.state_options_order. When set, this is the authoritative order (overrides template.options + extras append order). Defensive: any value in (template ∪ extras) missing from `options` is appended at the end by the renderer. Use this to move "estimating" between "planned" and "shipping" instead of always-at-the-end.',
	annotations: {
		title: 'Reorder state options (kanban column order)',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list_id: { type: 'string', description: 'List id (uuid). One of list_id / list_slug required.' },
			list_slug: { type: 'string', description: 'List slug (workspace-unique). One of list_id / list_slug required.' },
			options: {
				type: 'array',
				items: { type: 'string' },
				description: 'Full ordered list of state values, e.g. ["planned","estimating","shipping","shipped"].',
			},
		},
		required: ['options'],
	},
	validate,
	async handler(args, ctx) {
		const conds = [eq(schema.lists.workspace_id, ctx.workspace_id)];
		if (args.list_id) conds.push(eq(schema.lists.id, args.list_id));
		else if (args.list_slug) conds.push(eq(schema.lists.slug, args.list_slug));
		const rows = await ctx.db.select().from(schema.lists).where(and(...conds)).limit(1);
		const list = rows[0];
		if (!list) {
			throw new Error(
				args.list_id
					? `No list with id "${args.list_id}" in this workspace.`
					: `No list with slug "${args.list_slug}" in this workspace.`,
			);
		}
		const meta = (list.meta_json ?? {}) as ListMeta;
		const previous = meta.state_options_order ?? null;
		const newMeta: ListMeta = { ...meta, state_options_order: args.options };
		const now = new Date();
		await ctx.db
			.update(schema.lists)
			.set({ meta_json: newMeta, updated_at: now })
			.where(eq(schema.lists.id, list.id));
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'list.state_options_reordered',
			details_json: {
				list_id: list.id,
				list_slug: list.slug,
				new_order: args.options,
				previous_order: previous,
				via: 'tool',
			},
			created_at: now,
		});
		return {
			ok: true,
			list_id: list.id,
			list_slug: list.slug,
			previous_order: previous,
			new_order: args.options,
		};
	},
};
