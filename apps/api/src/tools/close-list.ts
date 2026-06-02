/**
 * close_list — close a list, optionally running the delivered/slipped/cut audit.
 *
 * BL-035 generalization of BL-010's close_release. Works for any list whose
 * members carry templates with terminal states (release, sprint, milestone,
 * any custom list with a stateful template). For lists without terminal states
 * (shopping, wishlist), close_list just flips closed_at; no breakdown is
 * computed.
 *
 * Idempotent: re-running on a closed list returns the stored breakdown without
 * recomputation (closed lists are immutable).
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type FieldDef, type ListMeta } from '@blitzlist/db';
import { auditList, terminalStatesForTemplate, type AuditableItem } from '@blitzlist/core';
import type { ToolDef } from '@blitzlist/mcp';
import { uuid, type Db } from '../db.js';

type CloseListArgs = {
	slug: string;
	cut_items?: string[];
	note?: string;
};

function validate(args: unknown): CloseListArgs {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.slug !== 'string' || a.slug.trim().length === 0) {
		throw new Error('`slug` is required (non-empty string)');
	}
	let cut_items: string[] | undefined;
	if (a.cut_items !== undefined) {
		if (!Array.isArray(a.cut_items)) throw new Error('`cut_items` must be an array');
		cut_items = a.cut_items.map((x, i) => {
			if (typeof x !== 'string' || x.trim().length === 0) {
				throw new Error(`cut_items[${i}] must be a non-empty string`);
			}
			return x.trim();
		});
	}
	if (a.note !== undefined && typeof a.note !== 'string') {
		throw new Error('`note` must be a string');
	}
	return {
		slug: a.slug.trim(),
		cut_items,
		note: (a.note as string | undefined)?.trim(),
	};
}

export const closeList: ToolDef<CloseListArgs, unknown, Db> = {
	name: 'close_list',
	description:
		'Close a list. If members carry templates with terminal states (e.g. release / sprint / backlog), runs the delivered/slipped/cut audit and persists the breakdown into the list\'s meta_json. Re-calling on a closed list returns the stored breakdown without recomputation.',
	annotations: {
		title: 'Close list',
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			slug: { type: 'string', description: 'List slug.' },
			cut_items: {
				type: 'array',
				items: { type: 'string' },
				description: 'Item IDs to mark as "cut" (overrides delivered/slipped). Optional.',
			},
			note: { type: 'string', description: 'Closer note recorded in activity log.' },
		},
		required: ['slug'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Load the list.
		const lrows = await ctx.db
			.select()
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.slug)))
			.limit(1);
		const list = lrows[0];
		if (!list) {
			throw new Error(`No list with slug "${args.slug}" in this workspace.`);
		}
		const meta = list.meta_json as ListMeta;

		// 2. If already closed, return stored breakdown verbatim.
		if (meta.closed_at) {
			return {
				list: { id: list.id, slug: list.slug, name: list.name },
				already_closed: true,
				closed_at: meta.closed_at,
				breakdown: meta.breakdown ?? null,
			};
		}

		// 3. Load all member items (via item_lists join).
		const members = await ctx.db
			.select({
				id: schema.items.id,
				template_id: schema.items.template_id,
				fields_json: schema.items.fields_json,
			})
			.from(schema.items)
			.innerJoin(schema.item_lists, eq(schema.item_lists.item_id, schema.items.id))
			.where(
				and(
					eq(schema.items.workspace_id, ctx.workspace_id),
					eq(schema.item_lists.list_id, list.id),
				),
			);

		// 4. Build terminal-states map per template_id touched by the members.
		const templateIds = Array.from(
			new Set(members.map((m) => m.template_id).filter((x): x is string => x !== null)),
		);
		const terminalsByTemplate: Record<string, string[]> = {};
		if (templateIds.length > 0) {
			const trows = await ctx.db
				.select({
					id: schema.templates.id,
					fields_schema_json: schema.templates.fields_schema_json,
				})
				.from(schema.templates)
				.where(inArray(schema.templates.id, templateIds));
			for (const t of trows) {
				terminalsByTemplate[t.id] = terminalStatesForTemplate(t.fields_schema_json as FieldDef[]);
			}
		}

		// 5. Build AuditableItem list (extract state from fields_json).
		const auditable: AuditableItem[] = members.map((m) => {
			const fields = m.fields_json as Record<string, unknown>;
			const state = typeof fields.state === 'string' ? fields.state : null;
			return { id: m.id, state, template_id: m.template_id };
		});

		// 6. Run audit.
		const result = auditList({
			items: auditable,
			terminalStatesByTemplate: terminalsByTemplate,
			cutItemIds: args.cut_items ?? [],
		});

		const now = new Date();
		const closedIso = now.toISOString();
		const updatedMeta: ListMeta = {
			...meta,
			closed_at: closedIso,
			breakdown: {
				delivered: result.delivered,
				slipped: result.slipped,
				cut: result.cut,
			},
		};

		await ctx.db
			.update(schema.lists)
			.set({ meta_json: updatedMeta, updated_at: now })
			.where(eq(schema.lists.id, list.id));

		await ctx.db.insert(schema.activity_log).values({
			id: uuid(),
			workspace_id: ctx.workspace_id,
			item_id: null,
			actor_id: ctx.user_id,
			action: 'list.closed',
			details_json: {
				list_id: list.id,
				slug: list.slug,
				closed_at: closedIso,
				breakdown: updatedMeta.breakdown,
				delivery_rate: result.delivery_rate,
				total: result.total,
				...(args.note && { note: args.note }),
			},
			created_at: now,
		});

		return {
			list: { id: list.id, slug: list.slug, name: list.name },
			already_closed: false,
			closed_at: closedIso,
			breakdown: updatedMeta.breakdown,
			delivery_rate: result.delivery_rate,
			total: result.total,
		};
	},
};
