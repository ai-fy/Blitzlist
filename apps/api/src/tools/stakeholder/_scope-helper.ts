/**
 * Shared scope-enforcement helpers for stakeholder tools.
 *
 * Stakeholder tools see only items reachable through item_lists rows pointing
 * at one of the keys' `allowed_list_ids`. workspace-scope keys see everything
 * in the workspace.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { Db } from '../../db.js';
import type { ScopedToolContext } from '../../stakeholder-context.js';

/**
 * Build the SQL condition that restricts a query to items the actor can see.
 * Returns the set of item_ids (or null if workspace-scoped, meaning no extra
 * filter beyond workspace_id is needed).
 */
export async function resolveVisibleItemIds(
	ctx: ScopedToolContext,
): Promise<string[] | null> {
	const allowed = ctx.allowed_list_ids;
	if (allowed === null) {
		// Workspace-scoped key — every item in the workspace is visible.
		return null;
	}
	if (allowed.length === 0) {
		// Empty scope — nothing visible.
		return [];
	}
	const memberships = await ctx.db
		.select({ item_id: schema.item_lists.item_id })
		.from(schema.item_lists)
		.where(inArray(schema.item_lists.list_id, allowed));
	const ids = Array.from(new Set(memberships.map((m) => m.item_id)));
	return ids;
}

/**
 * Check that an item is visible to this actor. Throws "not found" if not
 * (don't reveal existence of out-of-scope items).
 */
export async function assertItemVisible(
	ctx: ScopedToolContext,
	itemId: string,
): Promise<void> {
	const allowed = ctx.allowed_list_ids;
	if (allowed === null) {
		// Workspace-scope — just confirm item exists in the workspace.
		const row = await ctx.db
			.select({ id: schema.items.id })
			.from(schema.items)
			.where(
				and(eq(schema.items.id, itemId), eq(schema.items.workspace_id, ctx.workspace_id)),
			)
			.limit(1);
		if (!row[0]) {
			throw new Error(`Item not found: ${itemId}`);
		}
		return;
	}
	if (allowed.length === 0) {
		throw new Error(`Item not found: ${itemId}`);
	}
	const rows = await ctx.db
		.select({ item_id: schema.item_lists.item_id })
		.from(schema.item_lists)
		.where(
			and(eq(schema.item_lists.item_id, itemId), inArray(schema.item_lists.list_id, allowed)),
		)
		.limit(1);
	if (!rows[0]) {
		throw new Error(`Item not found: ${itemId}`);
	}
}

/**
 * Resolve allowed_list_ids from scope + workspace at the time of key
 * authentication. Done once per request, not per tool.
 */
export async function resolveAllowedListIds(
	db: Db,
	workspace_id: string,
	scope: import('@blitzlist/core').StakeholderScope,
): Promise<string[] | null> {
	if (scope.type === 'workspace') return null;
	const slugs = scope.type === 'list' ? [scope.list_slug] : scope.list_slugs;
	if (slugs.length === 0) return [];
	const rows = await db
		.select({ id: schema.lists.id })
		.from(schema.lists)
		.where(
			and(eq(schema.lists.workspace_id, workspace_id), inArray(schema.lists.slug, slugs)),
		);
	return rows.map((r) => r.id);
}
