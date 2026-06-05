/**
 * add_list_field — declare a per-list field that's NOT in the template.
 *
 * Use cases:
 *   - "Add priority to v2-tournament-manager" without touching the
 *     release template (which would affect every release list).
 *   - Make a typed single_select with options, terminal flags, defaults.
 *   - Upgrade an auto-extended text field to a structured single_select.
 *
 * Stored in lists.meta_json.extra_fields. The validator + renderer
 * automatically include extras when validating items in this list or
 * displaying them.
 *
 * If a field with the same key already exists in extras, this REPLACES
 * its definition (useful for the auto-extend → structured upgrade).
 *
 * Returns the updated list of extras + which key was added/replaced.
 */

import { and, eq } from 'drizzle-orm';
import { schema, type ListMeta, type FieldDef } from '@blitzlist/db';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type Args = {
	list_id?: string;
	list_slug?: string;
	field: FieldDef;
};

const KEY_RX = /^[a-z][a-z0-9_]*$/i;
const ALLOWED_TYPES = new Set([
	'text', 'long_text', 'number', 'date', 'single_select', 'multi_select',
	'checkbox', 'url', 'user', 'link_to_item', 'attachment',
]);

function validateField(raw: unknown): FieldDef {
	if (typeof raw !== 'object' || raw === null) {
		throw new Error('`field` must be an object');
	}
	const f = raw as Record<string, unknown>;
	if (typeof f.key !== 'string' || !KEY_RX.test(f.key)) {
		throw new Error('`field.key` must be a string matching /^[a-z][a-z0-9_]*$/i');
	}
	if (f.key === 'state') {
		throw new Error('`state` is reserved — use reorder_state_options / set_state instead.');
	}
	if (typeof f.type !== 'string' || !ALLOWED_TYPES.has(f.type)) {
		throw new Error(`\`field.type\` must be one of: ${Array.from(ALLOWED_TYPES).join(', ')}`);
	}
	const def: FieldDef = { key: f.key, type: f.type as FieldDef['type'] };
	if (f.label !== undefined) {
		if (typeof f.label !== 'string') throw new Error('`field.label` must be a string');
		def.label = f.label;
	}
	if (f.description !== undefined) {
		if (typeof f.description !== 'string') throw new Error('`field.description` must be a string');
		def.description = f.description;
	}
	if (f.required !== undefined) {
		if (typeof f.required !== 'boolean') throw new Error('`field.required` must be boolean');
		def.required = f.required;
	}
	if (f.open !== undefined) {
		if (typeof f.open !== 'boolean') throw new Error('`field.open` must be boolean');
		def.open = f.open;
	}
	if (f.default !== undefined) def.default = f.default;
	if (f.options !== undefined) {
		if (!Array.isArray(f.options) || !f.options.every((v) => typeof v === 'string')) {
			throw new Error('`field.options` must be an array of strings');
		}
		def.options = f.options as string[];
	}
	if (f.terminal !== undefined) {
		if (!Array.isArray(f.terminal) || !f.terminal.every((v) => typeof v === 'string')) {
			throw new Error('`field.terminal` must be an array of strings');
		}
		def.terminal = f.terminal as string[];
	}
	if (f.min !== undefined) {
		if (typeof f.min !== 'number') throw new Error('`field.min` must be a number');
		def.min = f.min;
	}
	if (f.max !== undefined) {
		if (typeof f.max !== 'number') throw new Error('`field.max` must be a number');
		def.max = f.max;
	}
	if (f.multiline !== undefined) {
		if (typeof f.multiline !== 'boolean') throw new Error('`field.multiline` must be boolean');
		def.multiline = f.multiline;
	}
	return def;
}

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	const list_id = typeof a.list_id === 'string' && a.list_id.trim().length > 0 ? a.list_id.trim() : undefined;
	const list_slug = typeof a.list_slug === 'string' && a.list_slug.trim().length > 0 ? a.list_slug.trim() : undefined;
	if (!list_id && !list_slug) {
		throw new Error('At least one of `list_id` or `list_slug` is required.');
	}
	if (a.field === undefined) throw new Error('`field` is required');
	return { list_id, list_slug, field: validateField(a.field) };
}

export const addListField: ToolDef<Args, unknown, Db> = {
	name: 'add_list_field',
	description:
		'Add a typed field to a SPECIFIC list (without editing the template). Use this to bolt "priority", "due_date", "assignee" etc. onto a single list — analogous to the kanban "+ add column" pattern but for arbitrary fields, not just state. Stored in lists.meta_json.extra_fields. Re-calling with the same key REPLACES the definition (useful for upgrading an auto-extended text field to a structured single_select with options). The validator + renderer merge template fields with these extras automatically. Pass field shapes like {key: "priority", type: "single_select", options: ["p0","p1","p2","p3"], label: "Priority", default: "p2"}.',
	annotations: {
		title: 'Add field to list (per-list schema extension)',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			list_id: { type: 'string', description: 'List id (uuid). One of list_id / list_slug required.' },
			list_slug: { type: 'string', description: 'List slug (workspace-unique).' },
			field: {
				type: 'object',
				description:
					'Field definition. Same shape as template fields. Required: key, type. Optional: label, description, required, default, options (for selects), terminal (workflow-terminal state values), open (accept values outside options), min/max (for number), multiline (for text).',
				properties: {
					key: { type: 'string', description: 'Identifier used in items.fields_json. Must match /^[a-z][a-z0-9_]*$/i. Reserved: "state".' },
					type: {
						type: 'string',
						enum: ['text', 'long_text', 'number', 'date', 'single_select', 'multi_select', 'checkbox', 'url', 'user', 'link_to_item', 'attachment'],
					},
					label: { type: 'string' },
					description: { type: 'string' },
					required: { type: 'boolean' },
					default: {},
					options: { type: 'array', items: { type: 'string' } },
					terminal: { type: 'array', items: { type: 'string' } },
					open: { type: 'boolean' },
					min: { type: 'number' },
					max: { type: 'number' },
					multiline: { type: 'boolean' },
				},
				required: ['key', 'type'],
			},
		},
		required: ['field'],
	},
	validate,
	async handler(args, ctx) {
		const conds = [eq(schema.lists.workspace_id, ctx.workspace_id)];
		if (args.list_id) conds.push(eq(schema.lists.id, args.list_id));
		else if (args.list_slug) conds.push(eq(schema.lists.slug, args.list_slug));
		const rows = await ctx.db.select().from(schema.lists).where(and(...conds)).limit(1);
		const list = rows[0];
		if (!list) {
			throw new Error(
				args.list_id
					? `No list with id "${args.list_id}" in this workspace.`
					: `No list with slug "${args.list_slug}" in this workspace.`,
			);
		}
		const meta = (list.meta_json ?? {}) as ListMeta;
		const extras = meta.extra_fields ?? [];
		const existingIdx = extras.findIndex((f) => f.key === args.field.key);
		const action = existingIdx >= 0 ? 'replaced' : 'added';
		const newExtras = [...extras];
		if (existingIdx >= 0) newExtras[existingIdx] = args.field;
		else newExtras.push(args.field);
		const newMeta: ListMeta = { ...meta, extra_fields: newExtras };
		const now = new Date();
		await ctx.db
			.update(schema.lists)
			.set({ meta_json: newMeta, updated_at: now })
			.where(eq(schema.lists.id, list.id));
		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'list.field_added',
			details_json: {
				list_id: list.id,
				list_slug: list.slug,
				field_key: args.field.key,
				field_type: args.field.type,
				action,
				via: 'tool',
			},
			created_at: now,
		});
		return {
			ok: true,
			list_id: list.id,
			list_slug: list.slug,
			action,
			field: args.field,
			extra_fields_count: newExtras.length,
		};
	},
};
