/**
 * create_share_code — mint a "anyone with the link" share code (admin / OAuth).
 *
 * Generates 4 EFF-style diceware words, ~36 bits of entropy. Default 30-day
 * expiry, default read-only. URL: https://mcp.blitzlist.ai/c/<code>/mcp
 *
 * Different from stakeholder keys:
 *   - The code itself goes in the URL path, not a Bearer header
 *   - Anonymous by design — anyone with the link gets the scoped access
 *   - The code IS retrievable later (it's just `code`, not a hash) so it's
 *     safe to share / re-paste / put in docs.
 */

import { eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import {
	generateShareCode,
	parseStakeholderScope,
	parseStakeholderPermissions,
	type StakeholderPermission,
	type StakeholderScope,
} from '@blitzlist/core';
import type { ToolDef, ToolCallResult } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { generateQrSvg } from '../roadmap/qr.js';

type CreateShareCodeArgs = {
	label: string;
	scope: StakeholderScope;
	permissions: StakeholderPermission[];
	expires_in_days?: number;
};

const DEFAULT_EXPIRY_DAYS = 30;

function validate(args: unknown): CreateShareCodeArgs {
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
	// Default to read-only for share codes (anonymous broadcast).
	const permissions =
		a.permissions === undefined
			? (['read'] as StakeholderPermission[])
			: parseStakeholderPermissions(a.permissions);
	let expires_in_days: number | undefined;
	if (a.expires_in_days === undefined) {
		expires_in_days = DEFAULT_EXPIRY_DAYS;
	} else if (a.expires_in_days === null) {
		expires_in_days = undefined; // explicit "no expiry"
	} else {
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

export const createShareCode: ToolDef<CreateShareCodeArgs, ToolCallResult, Db> = {
	name: 'create_share_code',
	description:
		'Mint a "share code" — a 4-word URL slug that grants scoped read access to anyone with the link (Google-Drive style). Default 30-day expiry. Anonymous by design — no per-person attribution. For per-person tracked access use create_stakeholder_key instead. The code IS retrievable later via list_share_codes.',
	annotations: {
		title: 'Create share code',
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
				description: 'Human label, e.g. "v0.5 public roadmap" or "Customer beta preview".',
			},
			scope: {
				type: 'object',
				description:
					'What this code can see. Shapes: { type:"workspace" } | { type:"list", list_slug:"v0.5" } | { type:"lists", list_slugs:["v0.5","prd"] }.',
			},
			permissions: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Subset of ["read","comment","edit","create"]. Default ["read"] (anonymous broadcast). "comment" lets visitors leave anonymous comments on the public roadmap page. "edit" lets visitors update item state/title/body. "create" lets visitors add new items. The web page at /r/<code> exposes these as forms.',
			},
			expires_in_days: {
				type: ['number', 'null'],
				description:
					'Days until expiry. Default 30. Pass null for no expiry (not recommended).',
			},
		},
		required: ['label', 'scope'],
	},
	validate,
	async handler(args, ctx) {
		// Generate a code; retry on (rare) collision.
		let code = '';
		for (let attempt = 0; attempt < 8; attempt++) {
			const candidate = generateShareCode();
			const existing = await ctx.db
				.select({ code: schema.share_codes.code })
				.from(schema.share_codes)
				.where(eq(schema.share_codes.code, candidate))
				.limit(1);
			if (!existing[0]) {
				code = candidate;
				break;
			}
		}
		if (!code) {
			throw new Error('Failed to generate a unique share code after 8 attempts.');
		}

		const now = new Date();
		const expires_at =
			args.expires_in_days !== undefined
				? new Date(now.getTime() + args.expires_in_days * 86400_000)
				: null;

		await ctx.db.insert(schema.share_codes).values({
			code,
			workspace_id: ctx.workspace_id,
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
			action: 'share_code.created',
			details_json: {
				code,
				label: args.label,
				scope: args.scope,
				permissions: args.permissions,
				...(expires_at && { expires_at: expires_at.toISOString() }),
			},
			created_at: now,
		});

		const mcp_url = `https://mcp.blitzlist.ai/c/${code}/mcp`;
		const web_url = `https://mcp.blitzlist.ai/r/${code}`;

		// Generate a QR for the WEB url — that's what humans scan from a phone.
		const qr = await generateQrSvg(web_url);

		const summary = [
			`✅ Share code minted: \`${code}\``,
			'',
			`**${args.label}**`,
			`Permissions: ${args.permissions.join(', ')}`,
			`Expires: ${expires_at ? expires_at.toISOString().slice(0, 10) : 'never'}`,
			'',
			`**Web view (humans):** ${web_url}`,
			`**MCP install (agents):** ${mcp_url}`,
			'',
			'Scan the QR to open the web view on a phone. Revoke any time with `revoke_share_code`.',
		].join('\n');

		return {
			content: [
				{ type: 'text' as const, text: summary },
				{
					type: 'image' as const,
					data: qr.base64,
					mimeType: qr.mimeType,
				},
				{
					type: 'resource_link' as const,
					uri: web_url,
					name: `${args.label} — public view`,
					description: `Roadmap rendered at ${web_url}`,
					mimeType: 'text/html',
				},
				{
					type: 'resource_link' as const,
					uri: mcp_url,
					name: `${args.label} — MCP install URL`,
					description: 'Paste this URL into an MCP client to connect.',
					mimeType: 'application/json',
				},
			],
		};
	},
};
