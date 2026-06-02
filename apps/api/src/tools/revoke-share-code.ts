/**
 * revoke_share_code — soft-delete a share code. Immediate effect.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type RevokeArgs = {
	code: string;
	note?: string;
};

function validate(args: unknown): RevokeArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.code !== 'string' || a.code.trim().length === 0) {
		throw new Error('`code` is required (non-empty string)');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return { code: a.code.trim(), note: (a.note as string | undefined)?.trim() };
}

export const revokeShareCode: ToolDef<RevokeArgs, unknown, Db> = {
	name: 'revoke_share_code',
	description:
		'Revoke a share code (soft-delete). Any subsequent attempt to use the URL returns 401. Identify the code by the 4-word string.',
	annotations: {
		title: 'Revoke share code',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			code: { type: 'string', description: 'The 4-word share code (e.g. "cherry-mountain-pencil-tango").' },
			note: { type: 'string', description: 'Optional reason recorded in activity log.' },
		},
		required: ['code'],
	},
	validate,
	async handler(args, ctx) {
		const rows = await ctx.db
			.select()
			.from(schema.share_codes)
			.where(
				and(
					eq(schema.share_codes.workspace_id, ctx.workspace_id),
					eq(schema.share_codes.code, args.code),
					isNull(schema.share_codes.revoked_at),
				),
			)
			.limit(1);
		const sc = rows[0];
		if (!sc) {
			return { revoked: false, reason: 'not_found_or_already_revoked' };
		}

		const now = new Date();
		await ctx.db
			.update(schema.share_codes)
			.set({ revoked_at: now })
			.where(eq(schema.share_codes.code, sc.code));

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'share_code.revoked',
			details_json: {
				code: sc.code,
				label: sc.label,
				use_count_at_revoke: sc.use_count,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		return { revoked: true, code: sc.code, label: sc.label, revoked_at: now.toISOString() };
	},
};
