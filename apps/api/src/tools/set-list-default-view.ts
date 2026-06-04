/**
 * set_list_default_view — set the per-list default view-type override.
 *
 * Writes `lists.meta_json.default_view`. Precedence on the public roadmap
 * page at /r/<code>:
 *   1. URL ?view=... (visitor override)
 *   2. list.meta_json.default_view  ← this tool writes this
 *   3. template.default_view
 *   4. 'list' fallback
 *
 * View values: list | kanban | table | todo | calendar | compass
 * (calendar/compass are accepted but currently fall back to 'list' on render
 *  until those views ship.)
 */

import { and, eq } from 'drizzle-orm';
import { schema, type DefaultView } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type SetListDefaultViewArgs = {
	slug: string;
	view: DefaultView;
};

const VALID_VIEWS: DefaultView[] = ['list', 'kanban', 'table', 'todo', 'calendar', 'compass'];

function validate(args: unknown): SetListDefaultViewArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.slug !== 'string' || a.slug.trim().length === 0) {
		throw new Error('`slug` is required (non-empty string)');
	}
	if (typeof a.view !== 'string' || !VALID_VIEWS.includes(a.view as DefaultView)) {
		throw new Error(`\`view\` must be one of: ${VALID_VIEWS.join(', ')}`);
	}
	return { slug: a.slug.trim(), view: a.view as DefaultView };
}

export const setListDefaultView: ToolDef<SetListDefaultViewArgs, unknown, Db> = {
	name: 'set_list_default_view',
	description:
		"Set the default view-type for a list. Visitors at /r/<code> see this view unless they override with ?view=... in the URL. Values: list (grouped sections — default), kanban (columns per state), table (spreadsheet shape), todo (checkbox list). calendar and compass accepted but not yet implemented (fall back to 'list' on render).",
	annotations: {
		title: 'Set list default view',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			slug: { type: 'string', description: 'List slug, e.g. "v0.5".' },
			view: {
				type: 'string',
				description: 'list | kanban | table | todo (or calendar/compass, accepted but unimplemented).',
			},
		},
		required: ['slug', 'view'],
	},
	validate,
	async handler(args, ctx) {
		const rows = await ctx.db
			.select()
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.slug)))
			.limit(1);
		const list = rows[0];
		if (!list) {
			throw new Error(`No list with slug "${args.slug}" in this workspace.`);
		}
		const meta = (list.meta_json as Record<string, unknown>) ?? {};
		const prev = (meta.default_view as DefaultView | undefined) ?? null;
		if (prev === args.view) {
			return { list_id: list.id, slug: list.slug, default_view: args.view, no_op: true };
		}
		const now = new Date();
		await ctx.db
			.update(schema.lists)
			.set({ meta_json: { ...meta, default_view: args.view }, updated_at: now })
			.where(eq(schema.lists.id, list.id));
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'list.created', // closest existing action; future schema bump for 'list.view_changed'
			details_json: {
				list_id: list.id,
				slug: list.slug,
				default_view: args.view,
				previous: prev,
				note: 'default view changed',
			},
			created_at: now,
		});
		return {
			list_id: list.id,
			slug: list.slug,
			default_view: args.view,
			previous: prev,
			no_op: false,
		};
	},
};
