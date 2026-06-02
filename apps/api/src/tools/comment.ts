/**
 * comment — append a comment to an item.
 *
 * Author is taken from ctx (the authenticated user). Emits a comment.created
 * activity entry. The comment body is stored as markdown; renderers in the
 * web UI / MCP responses are responsible for formatting.
 */

import { and, eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type CommentArgs = {
	id: string;
	body: string;
};

function validate(args: unknown): CommentArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	if (typeof a.body !== 'string' || a.body.trim().length === 0) {
		throw new Error('`body` is required (non-empty string)');
	}
	return {
		id: a.id.trim(),
		body: a.body.trim(),
	};
}

export const comment: ToolDef<CommentArgs, unknown, Db> = {
	name: 'comment',
	description:
		'Add a comment to an item. Body is markdown. Author is the authenticated user. Returns the new comment row plus a confirmation that it was logged.',
	annotations: {
		title: 'Add comment',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'Item ID, e.g. "BL-042".' },
			body: { type: 'string', description: 'Comment body in markdown.' },
		},
		required: ['id', 'body'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Verify item exists in this workspace.
		const itemRows = await ctx.db
			.select({ id: schema.items.id })
			.from(schema.items)
			.where(and(eq(schema.items.id, args.id), eq(schema.items.workspace_id, ctx.workspace_id)))
			.limit(1);
		if (!itemRows[0]) {
			throw new Error(`Item not found in this workspace: ${args.id}`);
		}

		const commentId = uuid();
		const now = new Date();

		// 2. Insert comment.
		await ctx.db.insert(schema.comments).values({
			id: commentId,
			item_id: args.id,
			author_id: ctx.user_id,
			body: args.body,
			created_at: now,
		});

		// 3. Activity log.
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.id,
			actor_id: ctx.user_id,
			action: 'comment.created',
			details_json: {
				comment_id: commentId,
				body_preview: args.body.slice(0, 140),
			},
			created_at: now,
		});

		// 4. Return the newly-inserted comment.
		const created = await ctx.db
			.select()
			.from(schema.comments)
			.where(eq(schema.comments.id, commentId))
			.limit(1);

		return {
			comment: created[0],
			item_id: args.id,
		};
	},
};
