/**
 * delete_file — soft-delete a file (sets revoked_at).
 *
 * Soft delete preserves the version history and gives a 30-day restore
 * window. Hard purge happens out-of-band (a future Queue consumer).
 *
 * R2 bytes are NOT removed yet — content might still be referenced by a
 * future version on a different file, and dedup means deleting the R2
 * object could break unrelated files. R2 cleanup is a sweep job.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import { uuid } from '../db.js';

type Args = { id: string; note?: string };

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return { id: a.id.trim(), note: (a.note as string | undefined)?.trim() };
}

export const deleteFile: ToolDef<Args, unknown, Db> = {
	name: 'delete_file',
	description:
		'Soft-delete a file. Sets revoked_at; the file disappears from list_files / get_file unless include_deleted is set. R2 bytes are preserved during the 30-day restore window — a future sweep prunes them. Re-uploading the same content creates a new files row (no auto-restore).',
	annotations: {
		title: 'Delete file',
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'File id (uuid).' },
			note: { type: 'string', description: 'Optional reason recorded in activity log.' },
		},
		required: ['id'],
	},
	validate,
	async handler(args, ctx) {
		const rows = await ctx.db
			.select()
			.from(schema.files)
			.where(
				and(
					eq(schema.files.id, args.id),
					eq(schema.files.workspace_id, ctx.workspace_id),
					isNull(schema.files.revoked_at),
				),
			)
			.limit(1);
		const file = rows[0];
		if (!file) return { deleted: false, reason: 'not_found_or_already_deleted' };

		const now = new Date();
		await ctx.db
			.update(schema.files)
			.set({ revoked_at: now, updated_at: now })
			.where(eq(schema.files.id, file.id));

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'file.deleted',
			details_json: {
				file_id: file.id,
				name: file.name,
				folder_path: file.folder_path,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		return { deleted: true, id: file.id, name: file.name, revoked_at: now.toISOString() };
	},
};
