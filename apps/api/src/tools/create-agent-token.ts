/**
 * create_agent_token — mint a static bearer token for a HEADLESS agent
 * (e.g. Hermes) that needs create/edit/share access without OAuth (BL-023).
 *
 * OAuth-gated / owner-only (lives in the full toolRegistry; an agent token
 * cannot mint another). The raw token is returned ONCE — surface it
 * immediately, then it's unrecoverable (only the SHA-256 hash is stored).
 *
 * The agent connects at https://mcp.blitzlist.ai/a/mcp with the token as the
 * Bearer header. It gets a create/edit/share tool subset — NO admin tools.
 * Actions are attributed to the minting owner in the activity log.
 */

import { schema } from '@blitzlist/db';
import { generateAgentToken } from '@blitzlist/core';
import type { ToolDef, ToolCallResult } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { generateQrSvg } from '../roadmap/qr.js';

type CreateAgentTokenArgs = {
	label: string;
	expires_in_days?: number;
};

function validate(args: unknown): CreateAgentTokenArgs {
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
	return { label: a.label.trim(), expires_in_days };
}

export const createAgentToken: ToolDef<CreateAgentTokenArgs, ToolCallResult, Db> = {
	name: 'create_agent_token',
	description:
		'Mint an AGENT TOKEN — a static bearer credential for a headless agent (e.g. Hermes) to connect WITHOUT the interactive OAuth flow. The agent gets create/edit/share access (build, edit, batch, and share lists) but NO admin tools (cannot mint/revoke keys or revoke share codes). The raw token is returned ONCE — surface it immediately. The agent pastes it as the Bearer token at https://mcp.blitzlist.ai/a/mcp. Actions are attributed to you (the minting owner). Workspace-owner gated; revoke any time with revoke_agent_token.',
	annotations: {
		title: 'Create agent token',
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
				description: 'Human label, e.g. "Hermes agent" or "ci-bot".',
			},
			expires_in_days: {
				type: 'number',
				description: 'Days until the token expires. Omit for no expiry.',
			},
		},
		required: ['label'],
	},
	validate,
	async handler(args, ctx) {
		const generated = await generateAgentToken();
		const id = uuid();
		const now = new Date();
		const expires_at =
			args.expires_in_days !== undefined
				? new Date(now.getTime() + args.expires_in_days * 86400_000)
				: null;

		await ctx.db.insert(schema.agent_tokens).values({
			id,
			workspace_id: ctx.workspace_id,
			token_hash: generated.hash,
			prefix: generated.prefix,
			label: args.label,
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
			action: 'agent_token.created',
			details_json: {
				token_id: id,
				prefix: generated.prefix,
				label: args.label,
				...(expires_at && { expires_at: expires_at.toISOString() }),
			},
			created_at: now,
		});

		const install_url = 'https://mcp.blitzlist.ai/a/mcp';
		const handoff_payload = `${install_url}?token=${encodeURIComponent(generated.raw)}`;
		const qr = await generateQrSvg(handoff_payload);

		const summary = [
			`✅ Agent token minted: \`${generated.prefix}…\``,
			'',
			`**${args.label}**`,
			'Capability: create / edit / share (no admin tools)',
			expires_at
				? `Expires: ${expires_at.toISOString().slice(0, 10)}`
				: 'Expires: never',
			'',
			'**Raw token (shown ONCE — copy it into the agent now, then forget):**',
			'',
			'```',
			generated.raw,
			'```',
			'',
			`**MCP server URL:** ${install_url}`,
			'',
			'Agent setup: point the agent\'s MCP client at the URL above and send the raw token as the `Authorization: Bearer <token>` header. The agent can build, edit, batch, and share lists; it cannot mint/revoke credentials. Revoke any time with `revoke_agent_token`.',
		].join('\n');

		return {
			content: [
				{ type: 'text' as const, text: summary },
				{ type: 'image' as const, data: qr.base64, mimeType: qr.mimeType },
				{
					type: 'resource_link' as const,
					uri: install_url,
					name: `${args.label} — agent MCP URL`,
					description: 'Agent pastes this as its MCP server URL + the raw token as Bearer.',
					mimeType: 'application/json',
				},
			],
		};
	},
};
