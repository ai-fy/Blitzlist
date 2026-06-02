/**
 * list_templates — return all templates in the workspace.
 *
 * Useful before create_list (which template should this list use?) and before
 * add_item (what fields does this template accept?).
 */

import { eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

export const listTemplates: ToolDef<Record<string, never>, unknown, Db> = {
	name: 'list_templates',
	description:
		'List all templates in the workspace, including system-shipped ones (backlog, bugs, todos, ideas, release, sprint, shopping, wishlist, invite, picnic) and any user-defined customizations.',
	annotations: {
		title: 'List templates',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: { type: 'object', properties: {} },
	validate: () => ({}),
	async handler(_args, ctx) {
		const templates = await ctx.db
			.select()
			.from(schema.templates)
			.where(eq(schema.templates.workspace_id, ctx.workspace_id));
		return { templates, total: templates.length };
	},
};
