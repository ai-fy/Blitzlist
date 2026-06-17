/**
 * revoke_agent_token — soft-delete an agent token (OAuth-gated, owner).
 * Immediate effect: subsequent /a/mcp requests with it return 401.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type Args = { id?: string; prefix?: string; note?: string };

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if ((a.id === undefined || a.id === null) && (a.prefix === undefined || a.prefix === null)) {
		throw new Error('Either `id` or `prefix` is required');
	}
	if (a.id !== undefined && typeof a.id !== 'string') throw new Error('`id` must be a string');
	if (a.prefix !== undefined && typeof a.prefix !== 'string') throw new Error('`prefix` must be a string');
	if (a.note !== undefined && typeof a.note !== 'string') throw new Error('`note` must be a string');
	return {
		id: (a.id as string | undefined)?.trim(),
		prefix: (a.prefix as string | undefined)?.trim(),
		note: (a.note as string | undefined)?.trim(),
	};
}

export const revokeAgentToken: ToolDef<Args, unknown, Db> = {
	name: 'revoke_agent_token',
	description:
		'Revoke an agent token (soft-delete). Subsequent attempts to use it return 401. Identify by `id` (preferred) or `prefix` (the "blz_at_xxxx" string from list_agent_tokens).',
	annotations: {
		title: 'Revoke agent token',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Agent token id (uuid).' },
			prefix: { type: 'string', description: 'Display prefix (blz_at_xxxx). Used if id is omitted.' },
			note: { type: 'string', description: 'Optional reason recorded in activity log.' },
		},
	},
	validate,
	async handler(args, ctx) {
		const conditions = [
			eq(schema.agent_tokens.workspace_id, ctx.workspace_id),
			isNull(schema.agent_tokens.revoked_at),
		];
		if (args.id) conditions.push(eq(schema.agent_tokens.id, args.id));
		else if (args.prefix) conditions.push(eq(schema.agent_tokens.prefix, args.prefix));
		const rows = await ctx.db.select().from(schema.agent_tokens).where(and(...conditions)).limit(1);
		const token = rows[0];
		if (!token) {
			return { revoked: false, reason: 'not_found_or_already_revoked' };
		}
		const now = new Date();
		await ctx.db
			.update(schema.agent_tokens)
			.set({ revoked_at: now })
			.where(eq(schema.agent_tokens.id, token.id));
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'agent_token.revoked',
			details_json: {
				token_id: token.id,
				prefix: token.prefix,
				label: token.label,
				use_count_at_revoke: token.use_count,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});
		return {
			revoked: true,
			token_id: token.id,
			prefix: token.prefix,
			label: token.label,
			revoked_at: now.toISOString(),
		};
	},
};
