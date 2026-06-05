/**
 * list_files — workspace files, optional folder + mime + text filters.
 *
 * v0.5: no per-folder summary count; future extension can add a tree view.
 */

import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type Args = {
	folder_path?: string;
	mime_prefix?: string;
	search?: string;
	limit?: number;
	include_deleted?: boolean;
};

function validate(args: unknown): Args {
	if (args === null || args === undefined) return {};
	if (typeof args !== 'object') throw new Error('arguments must be an object');
	const a = args as Record<string, unknown>;
	const out: Args = {};
	const str = (k: keyof Args) => {
		const v = a[k as string];
		if (v === undefined) return;
		if (typeof v !== 'string') throw new Error(`\`${k as string}\` must be a string`);
		(out as Record<string, unknown>)[k as string] = (v as string).trim();
	};
	str('folder_path');
	str('mime_prefix');
	str('search');
	if (a.limit !== undefined) {
		if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 500) {
			throw new Error('`limit` must be an integer between 1 and 500');
		}
		out.limit = a.limit;
	}
	if (a.include_deleted !== undefined) {
		if (typeof a.include_deleted !== 'boolean') throw new Error('`include_deleted` must be a boolean');
		out.include_deleted = a.include_deleted;
	}
	return out;
}

export const listFiles: ToolDef<Args, unknown, Db> = {
	name: 'list_files',
	description:
		'List files in the workspace with optional filters: folder_path (exact match), mime_prefix (e.g. "image/" matches PNG/JPG/SVG), search (LIKE on name). Soft-deleted files excluded unless include_deleted=true.',
	annotations: {
		title: 'List files',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			folder_path: { type: 'string', description: 'Filter to exact folder (e.g. "/designs/").' },
			mime_prefix: { type: 'string', description: 'e.g. "image/" or "application/pdf".' },
			search: { type: 'string', description: 'Substring match on name.' },
			limit: { type: 'number', description: 'Max results (1-500). Default 100.' },
			include_deleted: {
				type: 'boolean',
				description: 'Include soft-deleted files (within their restore window). Default false.',
			},
		},
	},
	validate,
	async handler(args, ctx) {
		const limit = args.limit ?? 100;
		const conditions = [eq(schema.files.workspace_id, ctx.workspace_id)];
		if (!args.include_deleted) conditions.push(isNull(schema.files.revoked_at));
		if (args.folder_path) conditions.push(eq(schema.files.folder_path, args.folder_path));
		if (args.mime_prefix) conditions.push(like(schema.files.mime_type, args.mime_prefix + '%'));
		if (args.search && args.search.length > 0) {
			conditions.push(like(schema.files.name, '%' + args.search + '%'));
		}
		const where = conditions.length === 1 ? conditions[0] : and(...conditions);
		const files = await ctx.db
			.select()
			.from(schema.files)
			.where(where)
			.orderBy(desc(schema.files.created_at))
			.limit(limit);
		const totalRows = await ctx.db
			.select({ count: sql<number>`count(*)` })
			.from(schema.files)
			.where(where);
		const total = totalRows[0]?.count ?? 0;
		// Suppress the unused-import warning for `or`
		void or;
		return {
			files,
			total,
			limit,
			filtered_by: {
				...(args.folder_path && { folder_path: args.folder_path }),
				...(args.mime_prefix && { mime_prefix: args.mime_prefix }),
				...(args.search && { search: args.search }),
				...(args.include_deleted && { include_deleted: true }),
			},
		};
	},
};
