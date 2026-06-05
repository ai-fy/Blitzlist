/**
 * update_list — rename a list, change its slug, description, archived state,
 * tags, color, icon, or metadata (e.g. release ship_target, sprint dates).
 *
 * Does NOT move items. The list keeps its id and all item_lists rows. This is
 * the right tool for renames — DO NOT do "create new list + add_items + delete
 * old list" as a workaround, that destroys activity history and breaks share
 * codes.
 *
 * Identifier: pass either `id` (uuid) or `slug` (workspace-unique). At least
 * one identifier is required. At least one field-to-update is required.
 *
 * Returns the updated list row.
 */

import { and, eq, ne } from 'drizzle-orm';
import { schema, type ListMeta } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type UpdateListArgs = {
	id?: string;
	slug?: string;
	new_slug?: string;
	name?: string;
	description?: string | null;
	archived?: boolean;
	tags?: string[];
	color?: string | null;
	icon?: string | null;
	meta?: ListMeta; // shallow-merged into existing meta_json
	meta_replace?: boolean; // when true, REPLACE meta_json instead of merge
};

const SLUG_RX = /^[a-z0-9][a-z0-9._-]*$/;

function validate(args: unknown): UpdateListArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;

	const id = typeof a.id === 'string' && a.id.trim().length > 0 ? a.id.trim() : undefined;
	const slug = typeof a.slug === 'string' && a.slug.trim().length > 0 ? a.slug.trim() : undefined;
	if (!id && !slug) {
		throw new Error('At least one of `id` or `slug` is required to identify the list to update.');
	}

	const out: UpdateListArgs = { id, slug };

	if (a.new_slug !== undefined) {
		if (typeof a.new_slug !== 'string') throw new Error('`new_slug` must be a string');
		const ns = a.new_slug.trim();
		if (!SLUG_RX.test(ns)) {
			throw new Error(`Invalid new_slug "${ns}". Must match /^[a-z0-9][a-z0-9._-]*$/`);
		}
		out.new_slug = ns;
	}
	if (a.name !== undefined) {
		if (typeof a.name !== 'string' || a.name.trim().length === 0) {
			throw new Error('`name` must be a non-empty string');
		}
		out.name = a.name.trim();
	}
	if (a.description !== undefined) {
		if (a.description !== null && typeof a.description !== 'string') {
			throw new Error('`description` must be a string or null (to clear)');
		}
		out.description = a.description === null ? null : (a.description as string).trim();
	}
	if (a.archived !== undefined) {
		if (typeof a.archived !== 'boolean') throw new Error('`archived` must be a boolean');
		out.archived = a.archived;
	}
	if (a.tags !== undefined) {
		if (!Array.isArray(a.tags) || !a.tags.every((t) => typeof t === 'string')) {
			throw new Error('`tags` must be an array of strings');
		}
		out.tags = a.tags as string[];
	}
	if (a.color !== undefined) {
		if (a.color !== null && typeof a.color !== 'string') {
			throw new Error('`color` must be a string or null (to clear)');
		}
		out.color = a.color === null ? null : (a.color as string).trim();
	}
	if (a.icon !== undefined) {
		if (a.icon !== null && typeof a.icon !== 'string') {
			throw new Error('`icon` must be a string or null (to clear)');
		}
		out.icon = a.icon === null ? null : (a.icon as string).trim();
	}
	if (a.meta !== undefined) {
		if (typeof a.meta !== 'object' || a.meta === null || Array.isArray(a.meta)) {
			throw new Error('`meta` must be an object');
		}
		out.meta = a.meta as ListMeta;
	}
	if (a.meta_replace !== undefined) {
		if (typeof a.meta_replace !== 'boolean') throw new Error('`meta_replace` must be a boolean');
		out.meta_replace = a.meta_replace;
	}

	const updateKeys: Array<keyof UpdateListArgs> = [
		'new_slug',
		'name',
		'description',
		'archived',
		'tags',
		'color',
		'icon',
		'meta',
	];
	if (!updateKeys.some((k) => out[k] !== undefined)) {
		throw new Error(
			'At least one field to update is required: new_slug, name, description, archived, tags, color, icon, or meta.',
		);
	}

	return out;
}

export const updateList: ToolDef<UpdateListArgs, unknown, Db> = {
	name: 'update_list',
	description:
		'Rename a list, change its slug, description, archived state, tags, color, icon, or metadata. This is the RIGHT tool for renames and any list-level edit — do NOT do "create new list + move items + delete old" as a workaround, that destroys activity history and breaks share codes that target the list by id. Identifier: pass `id` (uuid) or `slug` (workspace-unique). `meta` is shallow-merged into existing meta_json unless `meta_replace: true`. Returns the updated list row.',
	annotations: {
		title: 'Update list (rename / edit metadata)',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'List id (uuid). One of `id` or `slug` is required.' },
			slug: {
				type: 'string',
				description:
					'Current list slug (workspace-unique). One of `id` or `slug` is required.',
			},
			new_slug: {
				type: 'string',
				description:
					'New slug (also workspace-unique). Use this to rename the URL-facing identifier — share codes targeting this list keep working because they bind to id, not slug.',
			},
			name: { type: 'string', description: 'New human-readable name.' },
			description: {
				type: ['string', 'null'],
				description: 'New description. Pass null to clear.',
			},
			archived: {
				type: 'boolean',
				description:
					'Archive (true) / unarchive (false). Archived lists are hidden from default queries but preserved.',
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'Replace tags array.',
			},
			color: { type: ['string', 'null'], description: 'Hex color or null to clear.' },
			icon: { type: ['string', 'null'], description: 'Emoji / icon or null to clear.' },
			meta: {
				type: 'object',
				description:
					'Metadata to merge (shallow) into existing meta_json. Use this for release ship_target, sprint dates, etc.',
			},
			meta_replace: {
				type: 'boolean',
				description:
					'When true, REPLACE meta_json entirely with `meta` instead of merging. Use rarely — most updates want the merge default.',
			},
		},
	},
	validate,
	async handler(args, ctx) {
		// Resolve the list by id or slug.
		const conds = [eq(schema.lists.workspace_id, ctx.workspace_id)];
		if (args.id) conds.push(eq(schema.lists.id, args.id));
		else if (args.slug) conds.push(eq(schema.lists.slug, args.slug));
		const rows = await ctx.db.select().from(schema.lists).where(and(...conds)).limit(1);
		const list = rows[0];
		if (!list) {
			throw new Error(
				args.id
					? `No list with id "${args.id}" in this workspace.`
					: `No list with slug "${args.slug}" in this workspace.`,
			);
		}

		// If renaming the slug, check uniqueness.
		if (args.new_slug && args.new_slug !== list.slug) {
			const clash = await ctx.db
				.select({ id: schema.lists.id })
				.from(schema.lists)
				.where(
					and(
						eq(schema.lists.workspace_id, ctx.workspace_id),
						eq(schema.lists.slug, args.new_slug),
						ne(schema.lists.id, list.id),
					),
				)
				.limit(1);
			if (clash[0]) {
				throw new Error(`Slug "${args.new_slug}" already taken by another list in this workspace.`);
			}
		}

		// Build the change set.
		const changes: Partial<typeof schema.lists.$inferInsert> = {};
		const changeLog: Record<string, { from: unknown; to: unknown }> = {};
		const noteIfChanged = (key: string, from: unknown, to: unknown) => {
			if (from !== to) changeLog[key] = { from, to };
		};

		if (args.new_slug !== undefined && args.new_slug !== list.slug) {
			changes.slug = args.new_slug;
			noteIfChanged('slug', list.slug, args.new_slug);
		}
		if (args.name !== undefined && args.name !== list.name) {
			changes.name = args.name;
			noteIfChanged('name', list.name, args.name);
		}
		if (args.description !== undefined && args.description !== list.description) {
			changes.description = args.description;
			noteIfChanged('description', list.description, args.description);
		}
		if (args.archived !== undefined && args.archived !== list.archived) {
			changes.archived = args.archived;
			noteIfChanged('archived', list.archived, args.archived);
		}
		if (args.tags !== undefined) {
			changes.tags_json = args.tags;
			noteIfChanged('tags', list.tags_json, args.tags);
		}
		if (args.color !== undefined && args.color !== list.color) {
			changes.color = args.color;
			noteIfChanged('color', list.color, args.color);
		}
		if (args.icon !== undefined && args.icon !== list.icon) {
			changes.icon = args.icon;
			noteIfChanged('icon', list.icon, args.icon);
		}
		if (args.meta !== undefined) {
			const merged = args.meta_replace
				? args.meta
				: { ...((list.meta_json as ListMeta) ?? {}), ...args.meta };
			changes.meta_json = merged;
			noteIfChanged('meta', list.meta_json, merged);
		}

		if (Object.keys(changes).length === 0) {
			return {
				list: serializeList(list),
				changed: false,
				note: 'No-op: all provided values already match the current row.',
			};
		}

		const now = new Date();
		changes.updated_at = now;
		await ctx.db.update(schema.lists).set(changes).where(eq(schema.lists.id, list.id));

		// Record the action — note the action key is `list.updated` (BL-022 added)
		// or `list.archived` when the only change is archiving (preserves the
		// pre-existing semantic for filtered activity views).
		const isOnlyArchive =
			Object.keys(changes).length === 2 && // archived + updated_at
			changes.archived !== undefined &&
			!('slug' in changes) &&
			!('name' in changes);
		const action = isOnlyArchive ? 'list.archived' : 'list.updated';

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action,
			details_json: {
				list_id: list.id,
				changes: changeLog,
			},
			created_at: now,
		});

		const updated = await ctx.db
			.select()
			.from(schema.lists)
			.where(eq(schema.lists.id, list.id))
			.limit(1);
		return {
			list: serializeList(updated[0]!),
			changed: true,
			fields_changed: Object.keys(changeLog),
		};
	},
};

function serializeList(row: typeof schema.lists.$inferSelect) {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		template_id: row.template_id,
		meta: row.meta_json,
		tags: row.tags_json,
		archived: row.archived,
		color: row.color,
		icon: row.icon,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}
