/**
 * create_stakeholder_key — mint a new stakeholder access key (OAuth-gated, admin).
 *
 * Returns the raw key ONCE. The caller MUST surface it to the user immediately;
 * it is not retrievable later. Only the SHA-256 hash is stored server-side.
 *
 * Scope shapes:
 *   { type: "workspace" }                          — entire workspace, read-only
 *   { type: "list", list_slug: "v0.5" }            — items in one list
 *   { type: "lists", list_slugs: ["v0.5","prd"] }  — items in any of these lists
 *
 * Permissions: ["read", "comment"] is the v0.5 default. "approve"/"vote" land later.
 */

import { eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import {
	generateStakeholderKey,
	parseStakeholderScope,
	parseStakeholderPermissions,
	type StakeholderPermission,
	type StakeholderScope,
} from '@blitzlist/core';
import type { ToolDef, ToolCallResult } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { generateQrSvg } from '../roadmap/qr.js';

type CreateStakeholderKeyArgs = {
	label: string;
	scope: StakeholderScope;
	permissions: StakeholderPermission[];
	expires_in_days?: number;
};

function validate(args: unknown): CreateStakeholderKeyArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.label !== 'string' || a.label.trim().length === 0) {
		throw new Error('`label` is required (non-empty string)');
	}
	if (a.label.length > 80) {
		throw new Error('`label` is capped at 80 chars');
	}
	if (a.scope === undefined || a.scope === null) {
		throw new Error('`scope` is required');
	}
	const scope = parseStakeholderScope(a.scope);
	const permissions = parseStakeholderPermissions(a.permissions);
	let expires_in_days: number | undefined;
	if (a.expires_in_days !== undefined) {
		if (
			typeof a.expires_in_days !== 'number' ||
			!Number.isInteger(a.expires_in_days) ||
			a.expires_in_days < 1 ||
			a.expires_in_days > 3650
		) {
			throw new Error('`expires_in_days` must be an integer between 1 and 3650 (10 years)');
		}
		expires_in_days = a.expires_in_days;
	}
	return { label: a.label.trim(), scope, permissions, expires_in_days };
}

export const createStakeholderKey: ToolDef<CreateStakeholderKeyArgs, ToolCallResult, Db> = {
	name: 'create_stakeholder_key',
	description:
		'Mint a stakeholder access key — a bearer token that lets an external person (or their AI assistant) connect to a scoped slice of this workspace. The raw key is returned ONCE; show it to the user immediately. Recipient pastes it into their MCP config at https://mcp.blitzlist.ai/s/mcp. Workspace-owner gated.',
	annotations: {
		title: 'Create stakeholder key',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			label: {
				type: 'string',
				description: 'Human label, e.g. "ACME Q2 review" or "alex@customer.com".',
			},
			scope: {
				type: 'object',
				description:
					'What this key can see. Shapes: { type:"workspace" } | { type:"list", list_slug:"v0.5" } | { type:"lists", list_slugs:["v0.5","prd"] }.',
			},
			permissions: {
				type: 'array',
				items: { type: 'string' },
				description: 'Subset of ["read","comment","approve","vote"]. Default ["read","comment"].',
			},
			expires_in_days: {
				type: 'number',
				description: 'Days until the key expires. Omit for no expiry.',
			},
		},
		required: ['label', 'scope'],
	},
	validate,
	async handler(args, ctx) {
		// Generate key + hash.
		const generated = await generateStakeholderKey();
		const id = uuid();
		const now = new Date();
		const expires_at =
			args.expires_in_days !== undefined
				? new Date(now.getTime() + args.expires_in_days * 86400_000)
				: null;

		await ctx.db.insert(schema.stakeholder_access_keys).values({
			id,
			workspace_id: ctx.workspace_id,
			key_hash: generated.hash,
			prefix: generated.prefix,
			label: args.label,
			scope_json: args.scope,
			permissions_json: args.permissions,
			created_by: ctx.user_id,
			expires_at,
			revoked_at: null,
			last_used_at: null,
			use_count: 0,
			created_at: now,
		});

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'stakeholder_key.created',
			details_json: {
				key_id: id,
				prefix: generated.prefix,
				label: args.label,
				scope: args.scope,
				permissions: args.permissions,
				...(expires_at && { expires_at: expires_at.toISOString() }),
			},
			created_at: now,
		});

		// Re-load the row to return canonical shape (minus key_hash for safety).
		const row = (
			await ctx.db
				.select({
					id: schema.stakeholder_access_keys.id,
					prefix: schema.stakeholder_access_keys.prefix,
					label: schema.stakeholder_access_keys.label,
					scope_json: schema.stakeholder_access_keys.scope_json,
					permissions_json: schema.stakeholder_access_keys.permissions_json,
					expires_at: schema.stakeholder_access_keys.expires_at,
					created_at: schema.stakeholder_access_keys.created_at,
				})
				.from(schema.stakeholder_access_keys)
				.where(eq(schema.stakeholder_access_keys.id, id))
				.limit(1)
		)[0];

		const install_url = 'https://mcp.blitzlist.ai/s/mcp';
		// QR encodes a key handoff payload — the install_url + the raw key as a
		// query param. Scanning + tapping opens the URL with the bearer
		// pre-filled in some clients. For now this is just convenient for the
		// recipient: scan → see the URL → copy → paste into MCP config.
		const handoff_payload = `${install_url}?key=${encodeURIComponent(generated.raw)}`;
		const qr = await generateQrSvg(handoff_payload);

		const summary = [
			`✅ Stakeholder key minted: \`${generated.prefix}…\``,
			'',
			`**${args.label}**`,
			`Permissions: ${args.permissions.join(', ')}`,
			row?.expires_at
				? `Expires: ${new Date(row.expires_at).toISOString().slice(0, 10)}`
				: 'Expires: never',
			'',
			'**Raw key (shown ONCE — share now, then forget):**',
			'',
			'```',
			generated.raw,
			'```',
			'',
			`**Install URL (paste as Bearer token):** ${install_url}`,
			'',
			'Recipient flow: scan the QR (opens the URL with the key pre-filled in compatible MCP clients), OR copy the raw key above and paste it as the Authorization header in their MCP config. Revoke any time with `revoke_stakeholder_key`.',
		].join('\n');

		return {
			content: [
				{ type: 'text' as const, text: summary },
				{ type: 'image' as const, data: qr.base64, mimeType: qr.mimeType },
				{
					type: 'resource_link' as const,
					uri: install_url,
					name: `${args.label} — MCP install URL`,
					description: 'Recipient pastes this as their MCP server URL + the raw_key as bearer.',
					mimeType: 'application/json',
				},
			],
		};
	},
};
