/**
 * list_share_codes — list share codes in the workspace (admin / OAuth).
 *
 * Returns code + metadata. Unlike stakeholder keys (where the raw key is
 * forgotten after creation), share codes ARE retrievable later — that's the
 * point; the code is the URL.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type ListArgs = {
	include_revoked?: boolean;
};

function validate(args: unknown): ListArgs {
	if (args === null || args === undefined) return {};
	if (typeof args !== 'object') throw new Error('arguments must be an object');
	const a = args as Record<string, unknown>;
	if (a.include_revoked !== undefined && typeof a.include_revoked !== 'boolean') {
		throw new Error('`include_revoked` must be a boolean');
	}
	return { include_revoked: a.include_revoked as boolean | undefined };
}

export const listShareCodes: ToolDef<ListArgs, unknown, Db> = {
	name: 'list_share_codes',
	description:
		'List share codes for this workspace, with metadata and the code itself (the code is the URL; retrievable any time). Includes revoked codes by default for audit visibility.',
	annotations: {
		title: 'List share codes',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			include_revoked: { type: 'boolean', description: 'Include revoked codes (default true).' },
		},
	},
	validate,
	async handler(args, ctx) {
		const includeRevoked = args.include_revoked ?? true;
		const conditions = [eq(schema.share_codes.workspace_id, ctx.workspace_id)];
		if (!includeRevoked) {
			conditions.push(isNull(schema.share_codes.revoked_at));
		}
		const rows = await ctx.db
			.select()
			.from(schema.share_codes)
			.where(and(...conditions))
			.orderBy(desc(schema.share_codes.created_at));

		return {
			codes: rows.map((r) => ({
				code: r.code,
				label: r.label,
				scope: r.scope_json,
				permissions: r.permissions_json,
				expires_at: r.expires_at,
				revoked_at: r.revoked_at,
				last_used_at: r.last_used_at,
				use_count: r.use_count,
				created_at: r.created_at,
				install_url: `https://mcp.blitzlist.ai/c/${r.code}/mcp`,
			})),
			total: rows.length,
		};
	},
};
