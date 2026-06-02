/**
 * stakeholder.comment — append a comment, scope + permission checked.
 *
 * Requires 'comment' permission on the key. Comment author_id is NULL;
 * author_label = the stakeholder key's label. Activity log actor_id NULL,
 * with stakeholder identity in details_json.
 */

import { eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import { hasPermission } from '@blitzlist/core';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../../db.js';
import type { ScopedToolContext } from '../../stakeholder-context.js';
import { assertItemVisible } from './_scope-helper.js';

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
	if (a.body.length > 10_000) {
		throw new Error('`body` is capped at 10,000 chars');
	}
	return { id: a.id.trim(), body: a.body.trim() };
}

export const stakeholderComment: ToolDef<CommentArgs, unknown, Db, ScopedToolContext> = {
	name: 'comment',
	description:
		'Append a comment to an item. The comment is attributed to your stakeholder identity (label shown on the comment). Requires `comment` permission on the key.',
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
			body: { type: 'string', description: 'Comment body (Markdown).' },
		},
		required: ['id', 'body'],
	},
	validate,
	async handler(args, ctx) {
		if (!hasPermission(ctx.permissions, 'comment')) {
			throw new Error('Your access does not have comment permission.');
		}
		await assertItemVisible(ctx, args.id);

		// Attribute by actor type — stakeholders show their key label;
		// share-code commenters show "Anonymous via <first-word>…".
		const author_label =
			ctx.actor.type === 'stakeholder'
				? `Stakeholder: ${ctx.actor.label}`
				: `Anonymous via ${ctx.actor.code.split('-')[0]}…`;

		const id = uuid();
		const now = new Date();
		await ctx.db.insert(schema.comments).values({
			id,
			item_id: args.id,
			author_id: null,
			author_label,
			body: args.body,
			created_at: now,
		});

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: args.id,
			actor_id: null,
			action: 'comment.created',
			details_json: {
				comment_id: id,
				actor: ctx.actor,
			},
			created_at: now,
		});

		const created = await ctx.db
			.select()
			.from(schema.comments)
			.where(eq(schema.comments.id, id))
			.limit(1);
		return created[0];
	},
};
