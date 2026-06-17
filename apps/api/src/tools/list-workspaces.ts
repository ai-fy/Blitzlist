/**
 * list_workspaces — workspaces the current user is a member of (BL-024).
 *
 * Returns each membership with role + light counts so the caller can see
 * what they can switch into. Owner-gated (OAuth /mcp); agent tokens are
 * bound to one workspace and don't need this.
 */

import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type Args = Record<string, never>;

function validate(_args: unknown): Args {
	return {};
}

export const listWorkspaces: ToolDef<Args, unknown, Db> = {
	name: 'list_workspaces',
	description:
		'List the workspaces you are a member of, with your role and item/list counts in each. Use this to see what you can switch into (re-authorize your MCP client to pick a different one on the consent screen). The workspace your current session is bound to is marked is_current.',
	annotations: {
		title: 'List workspaces',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: { type: 'object', properties: {} },
	validate,
	async handler(_args, ctx) {
		const rows = await ctx.db
			.select({
				id: schema.workspaces.id,
				slug: schema.workspaces.slug,
				name: schema.workspaces.name,
				id_prefix: schema.workspaces.id_prefix,
				role: schema.workspace_members.role,
				joined_at: schema.workspace_members.joined_at,
			})
			.from(schema.workspace_members)
			.innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspace_members.workspace_id))
			.where(eq(schema.workspace_members.user_id, ctx.user_id));

		const workspaces = [];
		for (const w of rows) {
			const listCount = (
				await ctx.db
					.select({ n: sql<number>`count(*)` })
					.from(schema.lists)
					.where(and(eq(schema.lists.workspace_id, w.id), eq(schema.lists.archived, false)))
			)[0]?.n ?? 0;
			const itemCount = (
				await ctx.db
					.select({ n: sql<number>`count(*)` })
					.from(schema.items)
					.where(eq(schema.items.workspace_id, w.id))
			)[0]?.n ?? 0;
			workspaces.push({
				id: w.id,
				slug: w.slug,
				name: w.name,
				id_prefix: w.id_prefix,
				role: w.role,
				lists: Number(listCount),
				items: Number(itemCount),
				is_current: w.id === ctx.workspace_id,
			});
		}

		return { workspaces, total: workspaces.length, current_workspace_id: ctx.workspace_id };
	},
};
