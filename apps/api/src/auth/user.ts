/**
 * User identity resolution for magic-link login (BL-024 phase 2).
 *
 * On verified login we upsert the user by email and make sure they have at
 * least one workspace (a brand-new user gets a personal workspace auto-
 * provisioned so the consent picker isn't empty).
 */

import { eq, sql } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { Env } from '../env.js';
import { uuid, type Db } from '../db.js';
import { provisionWorkspace } from '../workspace-provision.js';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function localPart(email: string): string {
	return email.split('@')[0] ?? email;
}

/**
 * Find a user by email, or create one. Returns the user id + whether it was
 * just created.
 */
export async function upsertUserByEmail(db: Db, emailRaw: string): Promise<{ id: string; isNew: boolean }> {
	const email = normalizeEmail(emailRaw);
	const existing = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, email))
		.limit(1);
	if (existing[0]) return { id: existing[0].id, isNew: false };

	const id = 'usr-' + uuid().replace(/-/g, '').slice(0, 16);
	const now = new Date();
	await db.insert(schema.users).values({
		id,
		email,
		display_name: localPart(email),
		avatar_url: null,
		created_at: now,
		updated_at: now,
	});
	return { id, isNew: true };
}

/**
 * Ensure the user belongs to at least one workspace. If they have none,
 * provision a personal workspace and make them owner. Returns the number of
 * workspaces provisioned (0 or 1).
 */
export async function ensureUserHasWorkspace(
	db: Db,
	env: Env,
	userId: string,
	emailRaw: string,
): Promise<number> {
	const count = (
		await db
			.select({ n: sql<number>`count(*)` })
			.from(schema.workspace_members)
			.where(eq(schema.workspace_members.user_id, userId))
	)[0]?.n ?? 0;
	if (Number(count) > 0) return 0;

	const name = `${localPart(emailRaw)}'s Workspace`;
	await provisionWorkspace(db, env, { name, ownerUserId: userId });
	return 1;
}
