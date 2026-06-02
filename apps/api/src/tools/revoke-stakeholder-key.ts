/**
 * revoke_stakeholder_key — soft-delete a stakeholder key. Immediate effect.
 *
 * Soft delete (set revoked_at) preserves the audit trail. Subsequent attempts
 * to authenticate with the key get 401.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type RevokeArgs = {
	id?: string;
	prefix?: string;
	note?: string;
};

function validate(args: unknown): RevokeArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if ((a.id === undefined || a.id === null) && (a.prefix === undefined || a.prefix === null)) {
		throw new Error('Either `id` or `prefix` is required');
	}
	if (a.id !== undefined && typeof a.id !== 'string') throw new Error('`id` must be a string');
	if (a.prefix !== undefined && typeof a.prefix !== 'string') {
		throw new Error('`prefix` must be a string');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		id: (a.id as string | undefined)?.trim(),
		prefix: (a.prefix as string | undefined)?.trim(),
		note: (a.note as string | undefined)?.trim(),
	};
}

export const revokeStakeholderKey: ToolDef<RevokeArgs, unknown, Db> = {
	name: 'revoke_stakeholder_key',
	description:
		'Revoke a stakeholder key (soft-delete). Subsequent attempts to use it return 401. Identify the key by `id` (preferred) or by `prefix` (the "blz_sk_xxxx" display string from list_stakeholder_keys).',
	annotations: {
		title: 'Revoke stakeholder key',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Stakeholder key id (uuid).' },
			prefix: { type: 'string', description: 'Display prefix (blz_sk_xxxx). Used if id is omitted.' },
			note: { type: 'string', description: 'Optional reason recorded in activity log.' },
		},
	},
	validate,
	async handler(args, ctx) {
		// Find the key (workspace-scoped, not yet revoked).
		const conditions = [
			eq(schema.stakeholder_access_keys.workspace_id, ctx.workspace_id),
			isNull(schema.stakeholder_access_keys.revoked_at),
		];
		if (args.id) {
			conditions.push(eq(schema.stakeholder_access_keys.id, args.id));
		} else if (args.prefix) {
			conditions.push(eq(schema.stakeholder_access_keys.prefix, args.prefix));
		}
		const rows = await ctx.db
			.select()
			.from(schema.stakeholder_access_keys)
			.where(and(...conditions))
			.limit(1);
		const key = rows[0];
		if (!key) {
			return { revoked: false, reason: 'not_found_or_already_revoked' };
		}

		const now = new Date();
		await ctx.db
			.update(schema.stakeholder_access_keys)
			.set({ revoked_at: now })
			.where(eq(schema.stakeholder_access_keys.id, key.id));

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'stakeholder_key.revoked',
			details_json: {
				key_id: key.id,
				prefix: key.prefix,
				label: key.label,
				use_count_at_revoke: key.use_count,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		return {
			revoked: true,
			key_id: key.id,
			prefix: key.prefix,
			label: key.label,
			revoked_at: now.toISOString(),
		};
	},
};
