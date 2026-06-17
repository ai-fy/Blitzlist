/**
 * create_workspace — provision a new, isolated workspace (BL-024, multi-tenant
 * phase 1). The caller becomes its `owner` member.
 *
 * System templates are cloned from the BOOTSTRAP workspace
 * (env.BLITZLIST_SPIKE_WORKSPACE_ID) so a fresh workspace ships with the same
 * canonical, maintained template set (backlog / bugs / todos / ideas /
 * release / sprint / …) — same shape the bootstrap workspace seeds via
 * migration 0004 plus any later improvements.
 *
 * Owner-gated: lives in the full OAuth /mcp registry only. Agent tokens
 * (bound to a single workspace) cannot spawn workspaces.
 */

import type { ToolDef } from '@blitzlist/mcp';
import type { WorkspaceToolCtx } from '../workspace-context.js';
import type { Db } from '../db.js';
import { provisionWorkspace, isSlugFree, slugifyWorkspace } from '../workspace-provision.js';

type Args = {
	name: string;
	slug?: string;
	id_prefix?: string;
};

const SLUG_RX = /^[a-z0-9][a-z0-9-]*$/;
const PREFIX_RX = /^[A-Z][A-Z0-9]{0,5}$/;

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.name !== 'string' || a.name.trim().length === 0) {
		throw new Error('`name` is required (non-empty string)');
	}
	if (a.name.length > 80) throw new Error('`name` is capped at 80 chars');
	const out: Args = { name: a.name.trim() };
	if (a.slug !== undefined) {
		if (typeof a.slug !== 'string') throw new Error('`slug` must be a string');
		const s = a.slug.trim().toLowerCase();
		if (!SLUG_RX.test(s)) throw new Error(`Invalid slug "${s}". Must match /^[a-z0-9][a-z0-9-]*$/`);
		out.slug = s;
	}
	if (a.id_prefix !== undefined) {
		if (typeof a.id_prefix !== 'string') throw new Error('`id_prefix` must be a string');
		const p = a.id_prefix.trim().toUpperCase();
		if (!PREFIX_RX.test(p)) {
			throw new Error('`id_prefix` must be 1–6 chars, start with a letter, A–Z/0–9 only (e.g. "HS").');
		}
		out.id_prefix = p;
	}
	return out;
}

export const createWorkspace: ToolDef<Args, unknown, Db, WorkspaceToolCtx> = {
	name: 'create_workspace',
	description:
		'Provision a new, ISOLATED workspace. You become its owner. It ships with the standard system templates (backlog / bugs / todos / ideas / release / sprint / …) cloned from the canonical set. Use this to separate concerns — e.g. a sandbox for an agent, a personal space, a separate team. Items in different workspaces never mix. Returns the new workspace (id, slug, id_prefix). Owner-gated; not available to agent tokens.',
	annotations: {
		title: 'Create workspace',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Display name, e.g. "Hermes Sandbox".' },
			slug: {
				type: 'string',
				description: 'URL-safe slug (workspace-unique). Default: derived from name.',
			},
			id_prefix: {
				type: 'string',
				description: 'Item-ID prefix, e.g. "HS" → items HS-001. 1–6 chars, starts with a letter. Default: derived from name.',
			},
		},
		required: ['name'],
	},
	validate,
	async handler(args, ctx) {
		// Explicit slug must be free (the helper auto-suffixes, but a caller
		// passing an explicit slug expects an error on collision, not a rename).
		if (args.slug) {
			const free = await isSlugFree(ctx.db, args.slug);
			if (!free) {
				throw new Error(`A workspace with slug "${args.slug}" already exists. Pass a different slug.`);
			}
		}
		const ws = await provisionWorkspace(ctx.db, ctx.env, {
			name: args.name,
			slug: args.slug ?? slugifyWorkspace(args.name),
			id_prefix: args.id_prefix,
			ownerUserId: ctx.user_id,
		});
		return {
			workspace: { id: ws.id, slug: ws.slug, name: ws.name, id_prefix: ws.id_prefix },
			templates_seeded: ws.templates_seeded,
			your_role: 'owner',
			note: 'Switch to this workspace by re-authorizing your MCP client and picking it on the consent screen, or mint an agent token while connected to it.',
		};
	},
};
