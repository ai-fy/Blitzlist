/**
 * upload_file — accept base64 content from an MCP client, stash in R2,
 * write the files + file_versions rows.
 *
 * v0.5 scope: small files only (base64 caps the practical payload at
 * ~7 MB given Claude's tool-arg size). Presigned URLs for large uploads
 * land in a follow-up item.
 */

import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import type { WorkspaceToolCtx } from '../workspace-context.js';
import { uuid } from '../db.js';
import { base64ToBytes, putObject, r2Key, sha256Hex } from '../r2.js';

type Args = {
	name: string;
	content_base64: string;
	mime_type: string;
	folder_path?: string;
	note?: string;
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB ceiling for base64 payload path
const FOLDER_RX = /^\/([a-z0-9._-]+\/)*$/i;

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	for (const k of ['name', 'content_base64', 'mime_type']) {
		if (typeof a[k] !== 'string' || (a[k] as string).length === 0) {
			throw new Error(`\`${k}\` is required (non-empty string)`);
		}
	}
	const name = (a.name as string).trim();
	if (name.length > 200) throw new Error('`name` is capped at 200 chars');
	let folder = (a.folder_path as string | undefined)?.trim() ?? '/';
	if (!folder.startsWith('/')) folder = '/' + folder;
	if (!folder.endsWith('/')) folder = folder + '/';
	if (!FOLDER_RX.test(folder)) {
		throw new Error('`folder_path` must look like "/", "/designs/", "/v1/specs/"');
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		name,
		content_base64: a.content_base64 as string,
		mime_type: (a.mime_type as string).trim(),
		folder_path: folder,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const uploadFile: ToolDef<Args, unknown, Db, WorkspaceToolCtx> = {
	name: 'upload_file',
	description:
		'Upload a binary file (image, PDF, doc, etc.) to the workspace. Content is base64-encoded in the request — practical ceiling ~7 MB given client tool-arg size limits. Returns the file metadata and version id. The same bytes uploaded twice deduplicate at the storage layer (sha256-keyed R2 objects), but each upload appends its own file_versions row.',
	annotations: {
		title: 'Upload file',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Display filename (e.g. "deck.pptx").' },
			content_base64: {
				type: 'string',
				description: 'File content base64-encoded (no data: prefix).',
			},
			mime_type: { type: 'string', description: 'IANA MIME type, e.g. "image/png".' },
			folder_path: {
				type: 'string',
				description: 'Virtual folder, e.g. "/designs/". Default "/".',
			},
			note: { type: 'string', description: 'Optional version note.' },
		},
		required: ['name', 'content_base64', 'mime_type'],
	},
	validate,
	async handler(args, ctx) {
		const bytes = base64ToBytes(args.content_base64);
		if (bytes.byteLength === 0) throw new Error('File is empty');
		if (bytes.byteLength > MAX_BYTES) {
			throw new Error(
				`File is too large (${bytes.byteLength} bytes > ${MAX_BYTES}). Presigned-URL upload path lands in a follow-up.`,
			);
		}
		const sha = await sha256Hex(bytes);
		const key = r2Key(ctx.workspace_id, sha);
		await putObject(ctx.env, key, bytes, args.mime_type);

		const now = new Date();
		const file_id = uuid();
		const version_id = uuid();

		await ctx.db.insert(schema.files).values({
			id: file_id,
			workspace_id: ctx.workspace_id,
			name: args.name,
			folder_path: args.folder_path ?? '/',
			mime_type: args.mime_type,
			size_bytes: bytes.byteLength,
			current_version_id: version_id,
			uploaded_by: ctx.user_id,
			revoked_at: null,
			created_at: now,
			updated_at: now,
		});

		await ctx.db.insert(schema.file_versions).values({
			id: version_id,
			file_id,
			version: 1,
			r2_key: key,
			sha256_hex: sha,
			mime_type: args.mime_type,
			size_bytes: bytes.byteLength,
			uploaded_by: ctx.user_id,
			note: args.note ?? null,
			created_at: now,
		});

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'file.uploaded',
			details_json: {
				file_id,
				version_id,
				name: args.name,
				folder_path: args.folder_path,
				mime_type: args.mime_type,
				size_bytes: bytes.byteLength,
				sha256_hex: sha,
			},
			created_at: now,
		});

		return {
			file: {
				id: file_id,
				name: args.name,
				folder_path: args.folder_path ?? '/',
				mime_type: args.mime_type,
				size_bytes: bytes.byteLength,
				current_version_id: version_id,
				created_at: now.toISOString(),
			},
			version: {
				id: version_id,
				version: 1,
				sha256_hex: sha,
			},
		};
	},
};
