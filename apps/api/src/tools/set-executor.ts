/**
 * set_executor — assign or clear the executor on an item.
 *
 * Executor is who/what is *currently doing* the work on this item.
 * Orthogonal to assignee_id (the accountable human).
 *
 * Format:
 *   human:<user_id> | agent:claude | agent:<name> | self | contractor:<label> | null
 *
 * Pass `null` (or omit) to clear. Emits an item.executor_changed activity row.
 */

import { and, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import { parseExecutor, resolveSelf } from '@blitzlist/core';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';
import { itemToResponse } from './_response-helper.js';

type SetExecutorArgs = {
	id: string;
	executor: string | null;
	note?: string;
};

function validate(args: unknown): SetExecutorArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	let executor: string | null;
	if (a.executor === null || a.executor === undefined) {
		executor = null;
	} else if (typeof a.executor === 'string') {
		const trimmed = a.executor.trim();
		if (trimmed.length === 0) {
			executor = null;
		} else {
			// Throws with a useful error message if malformed.
			parseExecutor(trimmed);
			executor = trimmed;
		}
	} else {
		throw new Error('`executor` must be a string or null');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		id: a.id.trim(),
		executor,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const setExecutor: ToolDef<SetExecutorArgs, unknown, Db> = {
	name: 'set_executor',
	description:
		'Assign or clear the executor on an item — who/what is currently doing the work. Orthogonal to assignee (the accountable human). Format: human:<uid> | agent:claude | agent:<name> | self | contractor:<label> | null. Pass null to clear. The literal "self" is rewritten to "human:<your_user_id>" so the audit trail stays meaningful.',
	annotations: {
		title: 'Set executor',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true, // setting the same executor twice is a no-op
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			executor: {
				type: ['string', 'null'],
				description:
					'Executor string (e.g. "agent:claude", "human:usr-malte", "self", "contractor:acme") or null to clear.',
			},
			note: {
				type: 'string',
				description: 'Optional explanation for the change; recorded in the activity log.',
			},
		},
		required: ['id'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Load the item (workspace-scoped).
		const itemRows = await ctx.db
			.select()
			.from(schema.items)
			.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)))
			.limit(1);
		const item = itemRows[0];
		if (!item) {
			throw new Error(`Item not found in this workspace: ${args.id}`);
		}

		// 2. Resolve "self" → "human:<uid>" so audit trail stays meaningful.
		const nextExecutor = args.executor === null ? null : resolveSelf(args.executor, ctx.user_id);
		const previousExecutor = item.executor ?? null;
		const now = new Date();
		const isNoOp = previousExecutor === nextExecutor;

		// 3. Update only if actually changed.
		if (!isNoOp) {
			await ctx.db
				.update(schema.items)
				.set({ executor: nextExecutor, updated_at: now })
				.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)));
		}

		// 4. Activity entry — always logged, even on no-op.
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.id,
			actor_id: ctx.user_id,
			action: 'item.executor_changed',
			details_json: {
				from: previousExecutor,
				to: nextExecutor,
				no_op: isNoOp,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		// 5. Return updated item (with template_slug resolved for the response).
		const updated = await ctx.db
			.select()
			.from(schema.items)
			.where(eq(schema.items.id, args.id))
			.limit(1);
		const row = updated[0];
		if (!row) return null;
		let template_slug: string | null = null;
		if (row.template_id) {
			const t = await ctx.db
				.select({ slug: schema.templates.slug })
				.from(schema.templates)
				.where(eq(schema.templates.id, row.template_id))
				.limit(1);
			template_slug = t[0]?.slug ?? null;
		}
		return itemToResponse(row, template_slug);
	},
};
