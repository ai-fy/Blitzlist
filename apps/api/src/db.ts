/**
 * Drizzle D1 client + workspace-scoped query helpers.
 *
 * Every tool handler in apps/api/src/tools/* takes a `Db` from `getDb(env)`
 * and scopes its queries to `ctx.workspace_id`. We never expose un-scoped
 * Drizzle access — that's the discipline that makes multi-tenancy safe.
 */

import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@blitzlist/db';
import { sql } from 'drizzle-orm';
import type { Env } from './env.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function getDb(env: Env): Db {
	return drizzle(env.DB, { schema });
}

/**
 * Atomic monotonic item-ID generator for a workspace.
 *
 * Single UPDATE with RETURNING — no race condition between read-and-write.
 * D1's SQLite executes this as one statement per connection.
 */
export async function nextItemId(db: Db, workspaceId: string): Promise<string> {
	const result = await db
		.update(schema.workspaces)
		.set({ item_counter: sql`item_counter + 1`, updated_at: new Date() })
		.where(sql`id = ${workspaceId}`)
		.returning({
			counter: schema.workspaces.item_counter,
			prefix: schema.workspaces.id_prefix,
		});

	const row = result[0];
	if (!row) {
		throw new Error(`Workspace not found: ${workspaceId}`);
	}

	// Zero-pad to 3 digits minimum (BL-001, BL-042); grows naturally beyond 999.
	const padded = String(row.counter).padStart(3, '0');
	return `${row.prefix}-${padded}`;
}

/**
 * Generate a UUID-style id for non-item records (comments, activity, etc.).
 * Workers runtime has crypto.randomUUID().
 */
export function uuid(): string {
	return crypto.randomUUID();
}
