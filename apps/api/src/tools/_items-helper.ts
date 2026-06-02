/**
 * Shared "insert items into a list" helper.
 *
 * Used by add_item (single), add_items (batch), and create_list (when items[]
 * is provided). Validates each item against the list's template and inserts
 * both the item row and the primary item_lists membership in lockstep.
 *
 * NOT exported as an MCP tool — it's a building block.
 */

import { eq } from 'drizzle-orm';
import { schema, type FieldDef } from '@blitzlist/db';
import {
	defaultExecutorForTemplate,
	parseExecutor,
	resolveSelf,
	validateItemFields,
} from '@blitzlist/core';
import { nextItemId, uuid, type Db } from '../db.js';

export type ItemInput = {
	title: string;
	body?: string;
	fields?: Record<string, unknown>;
	executor?: string | null; // explicit null = clear; undefined = template default
};

export type ResolvedList = {
	id: string;
	slug: string;
	template_id: string | null;
};

export type ResolvedTemplate = {
	id: string;
	slug: string;
	fields_schema_json: FieldDef[];
} | null;

/**
 * Validate an ItemInput shape. Throws on malformed; returns the cleaned input.
 * Does NOT validate fields against template schema — that happens later when
 * the template is resolved.
 */
export function validateItemInput(raw: unknown, indexForError?: number): ItemInput {
	if (typeof raw !== 'object' || raw === null) {
		throw new Error(
			indexForError !== undefined
				? `items[${indexForError}] must be an object`
				: 'item must be an object',
		);
	}
	const a = raw as Record<string, unknown>;
	if (typeof a.title !== 'string' || a.title.trim().length === 0) {
		throw new Error(
			indexForError !== undefined
				? `items[${indexForError}].title is required (non-empty string)`
				: '`title` is required (non-empty string)',
		);
	}
	if (a.body !== undefined && typeof a.body !== 'string') {
		throw new Error(
			indexForError !== undefined
				? `items[${indexForError}].body must be a string`
				: '`body` must be a string',
		);
	}
	if (
		a.fields !== undefined &&
		(typeof a.fields !== 'object' || a.fields === null || Array.isArray(a.fields))
	) {
		throw new Error(
			indexForError !== undefined
				? `items[${indexForError}].fields must be an object`
				: '`fields` must be an object',
		);
	}
	let executor: string | null | undefined;
	if (a.executor === undefined) {
		executor = undefined;
	} else if (a.executor === null) {
		executor = null;
	} else if (typeof a.executor === 'string') {
		const trimmed = a.executor.trim();
		if (trimmed.length === 0) {
			executor = null;
		} else {
			parseExecutor(trimmed); // throws on malformed
			executor = trimmed;
		}
	} else {
		throw new Error(
			indexForError !== undefined
				? `items[${indexForError}].executor must be a string or null`
				: '`executor` must be a string or null',
		);
	}
	return {
		title: a.title.trim(),
		body: (a.body as string | undefined)?.trim() ?? '',
		fields: (a.fields as Record<string, unknown>) ?? {},
		executor,
	};
}

/**
 * Insert one item into a list. Returns the created item id. Caller is
 * responsible for any surrounding transaction.
 */
export async function insertItemIntoList(opts: {
	db: Db;
	workspace_id: string;
	user_id: string;
	list: ResolvedList;
	template: ResolvedTemplate;
	input: ItemInput;
	position: number;
}): Promise<{ item_id: string; executor: string | null }> {
	const { db, workspace_id, user_id, list, template, input, position } = opts;

	// Validate fields against template schema (or accept any if no template).
	const fields_schema = template?.fields_schema_json ?? [];
	const merged_fields =
		fields_schema.length > 0
			? validateItemFields({
					schema: fields_schema,
					current: {},
					patch: input.fields ?? {},
					isCreate: true,
				})
			: (input.fields ?? {});

	// Resolve executor: explicit arg > template default > null.
	let executor: string | null;
	if (input.executor === undefined) {
		executor = defaultExecutorForTemplate(template?.slug);
	} else {
		executor = input.executor;
	}
	if (executor !== null) executor = resolveSelf(executor, user_id);

	const itemId = await nextItemId(db, workspace_id);
	const now = new Date();

	await db.insert(schema.items).values({
		id: itemId,
		workspace_id,
		title: input.title,
		body: input.body ?? '',
		template_id: template?.id ?? null,
		fields_json: merged_fields,
		executor,
		author_id: user_id,
		created_at: now,
		updated_at: now,
	});

	await db.insert(schema.item_lists).values({
		item_id: itemId,
		list_id: list.id,
		role: 'primary',
		position,
		added_by: user_id,
		added_at: now,
	});

	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id,
		item_id: itemId,
		actor_id: user_id,
		action: 'item.created',
		details_json: {
			list: list.slug,
			template: template?.slug ?? null,
			title: input.title,
			...(executor !== null && { executor }),
		},
		created_at: now,
	});

	return { item_id: itemId, executor };
}

/**
 * Resolve a template by its DB id. Returns null if not found or id is null.
 */
export async function loadTemplate(
	db: Db,
	template_id: string | null,
): Promise<ResolvedTemplate> {
	if (!template_id) return null;
	const rows = await db
		.select({
			id: schema.templates.id,
			slug: schema.templates.slug,
			fields_schema_json: schema.templates.fields_schema_json,
		})
		.from(schema.templates)
		.where(eq(schema.templates.id, template_id))
		.limit(1);
	if (!rows[0]) return null;
	return {
		id: rows[0].id,
		slug: rows[0].slug,
		fields_schema_json: rows[0].fields_schema_json as FieldDef[],
	};
}
