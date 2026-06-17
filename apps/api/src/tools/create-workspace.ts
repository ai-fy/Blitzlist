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

import { and, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { WorkspaceToolCtx } from '../workspace-context.js';
import { uuid, type Db } from '../db.js';

type Args = {
	name: string;
	slug?: string;
	id_prefix?: string;
};

const SLUG_RX = /^[a-z0-9][a-z0-9-]*$/;
const PREFIX_RX = /^[A-Z][A-Z0-9]{0,5}$/;

function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40) || 'workspace';
}

function derivePrefix(name: string): string {
	// Initials of the first words, else first letters — uppercase, 2–4 chars.
	const words = name.trim().split(/\s+/).filter(Boolean);
	let p = '';
	if (words.length >= 2) {
		p = words.slice(0, 4).map((w) => w[0]!).join('');
	} else {
		p = (words[0] ?? 'WS').slice(0, 3);
	}
	p = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (p.length === 0) p = 'WS';
	if (!/^[A-Z]/.test(p)) p = 'W' + p;
	return p.slice(0, 6);
}

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
		const slug = args.slug ?? slugify(args.name);
		const id_prefix = args.id_prefix ?? derivePrefix(args.name);

		// Slug uniqueness (global — workspaces.slug is unique).
		const clash = await ctx.db
			.select({ id: schema.workspaces.id })
			.from(schema.workspaces)
			.where(eq(schema.workspaces.slug, slug))
			.limit(1);
		if (clash[0]) {
			throw new Error(`A workspace with slug "${slug}" already exists. Pass a different slug.`);
		}

		const id = uuid();
		const now = new Date();

		await ctx.db.insert(schema.workspaces).values({
			id,
			slug,
			name: args.name,
			id_prefix,
			item_counter: 0,
			created_at: now,
			updated_at: now,
		});

		// Creator becomes owner.
		await ctx.db.insert(schema.workspace_members).values({
			workspace_id: id,
			user_id: ctx.user_id,
			role: 'owner',
			joined_at: now,
		});

		// Clone system templates from the bootstrap workspace.
		const bootstrapId = ctx.env.BLITZLIST_SPIKE_WORKSPACE_ID;
		const sysTemplates = await ctx.db
			.select()
			.from(schema.templates)
			.where(
				and(
					eq(schema.templates.workspace_id, bootstrapId),
					eq(schema.templates.is_system, true),
				),
			);
		let seeded = 0;
		for (const t of sysTemplates) {
			await ctx.db.insert(schema.templates).values({
				id: uuid(),
				workspace_id: id,
				slug: t.slug,
				name: t.name,
				description: t.description,
				fields_schema_json: t.fields_schema_json,
				default_view: t.default_view,
				is_system: true,
				created_by: ctx.user_id,
				created_at: now,
				updated_at: now,
			});
			seeded++;
		}

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'workspace.created',
			details_json: { workspace_id: id, slug, name: args.name, id_prefix, templates_seeded: seeded },
			created_at: now,
		});

		return {
			workspace: { id, slug, name: args.name, id_prefix },
			templates_seeded: seeded,
			your_role: 'owner',
			note: 'Switch to this workspace by re-authorizing your MCP client and picking it on the consent screen, or mint an agent token while connected to it.',
		};
	},
};
