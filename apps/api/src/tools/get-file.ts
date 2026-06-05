/**
 * get_file — fetch file metadata, current version, and (for small files)
 * the inline content as base64.
 *
 * Behavior:
 *   - Files ≤ 1 MB return content_base64 inline so the caller can render
 *     immediately (typical for images, small PDFs).
 *   - Files > 1 MB return metadata + a "use the web URL" hint. Presigned-URL
 *     download lands in a follow-up.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import type { WorkspaceToolCtx } from '../workspace-context.js';
import { getObject } from '../r2.js';

type Args = { id: string };

const INLINE_LIMIT = 1024 * 1024; // 1 MB

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.id !== 'string' || a.id.trim().length === 0) {
		throw new Error('`id` is required (non-empty string)');
	}
	return { id: a.id.trim() };
}

export const getFile: ToolDef<Args, unknown, Db, WorkspaceToolCtx> = {
	name: 'get_file',
	description:
		'Fetch a file by id. Returns metadata and current version. For files ≤ 1 MB, also returns content_base64 inline so the caller can render or process the bytes immediately. Larger files return only metadata for v0.5; download via signed URL lands later.',
	annotations: {
		title: 'Get file',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: { id: { type: 'string', description: 'File id (uuid).' } },
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
		if (!file) throw new Error(`File not found: ${args.id}`);

		let version = null as typeof schema.file_versions.$inferSelect | null;
		if (file.current_version_id) {
			const vrows = await ctx.db
				.select()
				.from(schema.file_versions)
				.where(eq(schema.file_versions.id, file.current_version_id))
				.limit(1);
			version = vrows[0] ?? null;
		}

		const baseResp = {
			file: {
				id: file.id,
				name: file.name,
				folder_path: file.folder_path,
				mime_type: file.mime_type,
				size_bytes: file.size_bytes,
				created_at: file.created_at,
				updated_at: file.updated_at,
			},
			version: version
				? {
						id: version.id,
						version: version.version,
						sha256_hex: version.sha256_hex,
						created_at: version.created_at,
					}
				: null,
		};

		if (!version) return baseResp;
		if (file.size_bytes > INLINE_LIMIT) {
			return {
				...baseResp,
				note: `File is ${file.size_bytes} bytes (> ${INLINE_LIMIT}). Inline base64 omitted. Signed-URL download lands in a follow-up.`,
			};
		}

		const obj = await getObject(ctx.env, version.r2_key);
		return {
			...baseResp,
			content_base64: obj.base64,
		};
	},
};
