/**
 * list_stakeholder_keys — list keys in the workspace (admin / OAuth-gated).
 *
 * Returns metadata only; never exposes key_hash. Includes revoked keys by
 * default for audit visibility — pass include_revoked:false to hide them.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type ListKeysArgs = {
	include_revoked?: boolean;
};

function validate(args: unknown): ListKeysArgs {
	if (args === null || args === undefined) return {};
	if (typeof args !== 'object') throw new Error('arguments must be an object');
	const a = args as Record<string, unknown>;
	if (a.include_revoked !== undefined && typeof a.include_revoked !== 'boolean') {
		throw new Error('`include_revoked` must be a boolean');
	}
	return { include_revoked: a.include_revoked as boolean | undefined };
}

export const listStakeholderKeys: ToolDef<ListKeysArgs, unknown, Db> = {
	name: 'list_stakeholder_keys',
	description:
		'List stakeholder keys in this workspace. Returns metadata only — the raw key value is never retrievable after creation. Includes revoked keys by default for audit visibility.',
	annotations: {
		title: 'List stakeholder keys',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			include_revoked: {
				type: 'boolean',
				description: 'Include revoked keys (default true).',
			},
		},
	},
	validate,
	async handler(args, ctx) {
		const includeRevoked = args.include_revoked ?? true;
		const conditions = [eq(schema.stakeholder_access_keys.workspace_id, ctx.workspace_id)];
		if (!includeRevoked) {
			conditions.push(isNull(schema.stakeholder_access_keys.revoked_at));
		}
		const rows = await ctx.db
			.select({
				id: schema.stakeholder_access_keys.id,
				prefix: schema.stakeholder_access_keys.prefix,
				label: schema.stakeholder_access_keys.label,
				scope_json: schema.stakeholder_access_keys.scope_json,
				permissions_json: schema.stakeholder_access_keys.permissions_json,
				expires_at: schema.stakeholder_access_keys.expires_at,
				revoked_at: schema.stakeholder_access_keys.revoked_at,
				last_used_at: schema.stakeholder_access_keys.last_used_at,
				use_count: schema.stakeholder_access_keys.use_count,
				created_at: schema.stakeholder_access_keys.created_at,
			})
			.from(schema.stakeholder_access_keys)
			.where(and(...conditions))
			.orderBy(desc(schema.stakeholder_access_keys.created_at));

		return { keys: rows, total: rows.length };
	},
};
