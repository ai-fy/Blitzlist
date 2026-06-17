/**
 * list_agent_tokens — list agent tokens in the workspace (OAuth-gated, owner).
 *
 * Metadata only; never exposes token_hash. Includes revoked tokens by default
 * for audit visibility.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type Args = { include_revoked?: boolean };

function validate(args: unknown): Args {
	if (args === null || args === undefined) return {};
	if (typeof args !== 'object') throw new Error('arguments must be an object');
	const a = args as Record<string, unknown>;
	if (a.include_revoked !== undefined && typeof a.include_revoked !== 'boolean') {
		throw new Error('`include_revoked` must be a boolean');
	}
	return { include_revoked: a.include_revoked as boolean | undefined };
}

export const listAgentTokens: ToolDef<Args, unknown, Db> = {
	name: 'list_agent_tokens',
	description:
		'List agent tokens in this workspace. Returns metadata only — the raw token is never retrievable after creation. Includes revoked tokens by default for audit visibility.',
	annotations: {
		title: 'List agent tokens',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			include_revoked: { type: 'boolean', description: 'Include revoked tokens (default true).' },
		},
	},
	validate,
	async handler(args, ctx) {
		const includeRevoked = args.include_revoked ?? true;
		const conditions = [eq(schema.agent_tokens.workspace_id, ctx.workspace_id)];
		if (!includeRevoked) conditions.push(isNull(schema.agent_tokens.revoked_at));
		const rows = await ctx.db
			.select({
				id: schema.agent_tokens.id,
				prefix: schema.agent_tokens.prefix,
				label: schema.agent_tokens.label,
				expires_at: schema.agent_tokens.expires_at,
				revoked_at: schema.agent_tokens.revoked_at,
				last_used_at: schema.agent_tokens.last_used_at,
				use_count: schema.agent_tokens.use_count,
				created_at: schema.agent_tokens.created_at,
			})
			.from(schema.agent_tokens)
			.where(and(...conditions))
			.orderBy(desc(schema.agent_tokens.created_at));
		return { tokens: rows, total: rows.length };
	},
};
