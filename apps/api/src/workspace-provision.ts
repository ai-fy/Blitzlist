/**
 * Shared workspace provisioning (BL-024).
 *
 * One code path for "create a workspace, make someone its owner, and seed it
 * with the canonical system templates" — used by both the create_workspace
 * tool and first-login auto-provisioning (auth/user.ts).
 *
 * System templates are cloned from the bootstrap workspace
 * (env.BLITZLIST_SPIKE_WORKSPACE_ID) so every new workspace ships with the
 * same maintained set.
 */

import { and, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { Env } from './env.js';
import { uuid, type Db } from './db.js';

export type ProvisionedWorkspace = {
	id: string;
	slug: string;
	name: string;
	id_prefix: string;
	templates_seeded: number;
};

export function slugifyWorkspace(s: string): string {
	return (
		s
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'workspace'
	);
}

export function deriveIdPrefix(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	let p = words.length >= 2 ? words.slice(0, 4).map((w) => w[0]!).join('') : (words[0] ?? 'WS').slice(0, 3);
	p = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (p.length === 0) p = 'WS';
	if (!/^[A-Z]/.test(p)) p = 'W' + p;
	return p.slice(0, 6);
}

/**
 * Returns true if the given slug is free (workspaces.slug is globally unique).
 */
export async function isSlugFree(db: Db, slug: string): Promise<boolean> {
	const clash = await db
		.select({ id: schema.workspaces.id })
		.from(schema.workspaces)
		.where(eq(schema.workspaces.slug, slug))
		.limit(1);
	return !clash[0];
}

/**
 * Create a workspace, add `ownerUserId` as its owner, and clone the bootstrap
 * workspace's system templates into it. Caller is responsible for slug
 * uniqueness (use isSlugFree / pass a known-unique slug) — this auto-suffixes
 * on collision as a safety net.
 */
export async function provisionWorkspace(
	db: Db,
	env: Env,
	opts: { name: string; slug?: string; id_prefix?: string; ownerUserId: string },
): Promise<ProvisionedWorkspace> {
	let slug = opts.slug ?? slugifyWorkspace(opts.name);
	// Safety net: auto-suffix if the slug is taken.
	if (!(await isSlugFree(db, slug))) {
		const base = slug;
		for (let i = 2; i < 1000; i++) {
			const candidate = `${base}-${i}`;
			if (await isSlugFree(db, candidate)) {
				slug = candidate;
				break;
			}
		}
	}
	const id_prefix = opts.id_prefix ?? deriveIdPrefix(opts.name);
	const id = uuid();
	const now = new Date();

	await db.insert(schema.workspaces).values({
		id,
		slug,
		name: opts.name,
		id_prefix,
		item_counter: 0,
		created_at: now,
		updated_at: now,
	});

	await db.insert(schema.workspace_members).values({
		workspace_id: id,
		user_id: opts.ownerUserId,
		role: 'owner',
		joined_at: now,
	});

	const bootstrapId = env.BLITZLIST_SPIKE_WORKSPACE_ID;
	const sysTemplates = await db
		.select()
		.from(schema.templates)
		.where(and(eq(schema.templates.workspace_id, bootstrapId), eq(schema.templates.is_system, true)));
	let seeded = 0;
	for (const t of sysTemplates) {
		await db.insert(schema.templates).values({
			id: uuid(),
			workspace_id: id,
			slug: t.slug,
			name: t.name,
			description: t.description,
			fields_schema_json: t.fields_schema_json,
			default_view: t.default_view,
			is_system: true,
			created_by: opts.ownerUserId,
			created_at: now,
			updated_at: now,
		});
		seeded++;
	}

	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: id,
		item_id: null,
		actor_id: opts.ownerUserId,
		action: 'workspace.created',
		details_json: { workspace_id: id, slug, name: opts.name, id_prefix, templates_seeded: seeded },
		created_at: now,
	});

	return { id, slug, name: opts.name, id_prefix, templates_seeded: seeded };
}
