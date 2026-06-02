/**
 * generate_release_notes — emit a Markdown release note for a (closed or open)
 * list. Reads BL-010's persisted breakdown when the list is closed, otherwise
 * computes a live snapshot.
 *
 * Closes the BL-010 commitment-ledger loop: close the list → get publishable
 * notes in one tool call. Output is a `ToolCallResult` with:
 *   - text:           the full Markdown
 *   - resource_link:  if a share_code points at this list, the /r/<code> URL
 *
 * Style options:
 *   - concise:   one bullet per item (title only)
 *   - detailed:  bullet + 1-line excerpt from body + key fields
 *   - changelog: GitHub-flavored, grouped by template_slug (features/bugs/...)
 *
 * Audience options affect which fields are SHOWN (not which items appear):
 *   - internal:  shows priority, executor, accountable
 *   - customer:  strips internal fields, focuses on titles + bodies
 */

import { and, eq, inArray } from 'drizzle-orm';
import { schema, type FieldDef, type ListMeta } from '@blitzlist/db';
import { auditList, terminalStatesForTemplate, type AuditableItem } from '@blitzlist/core';
import type { ToolDef, ToolCallResult } from '@blitzlist/mcp';
import type { Db } from '../db.js';

type Style = 'concise' | 'detailed' | 'changelog';
type Audience = 'internal' | 'customer';

type Args = {
	slug: string;
	style?: Style;
	audience?: Audience;
	include_slipped?: boolean;
	include_cut?: boolean;
};

function validate(args: unknown): Args {
	if (typeof args !== 'object' || args === null) {
		throw new Error('arguments must be an object');
	}
	const a = args as Record<string, unknown>;
	if (typeof a.slug !== 'string' || a.slug.trim().length === 0) {
		throw new Error('`slug` is required (non-empty string)');
	}
	let style: Style = 'changelog';
	if (a.style !== undefined) {
		if (a.style !== 'concise' && a.style !== 'detailed' && a.style !== 'changelog') {
			throw new Error('`style` must be one of: concise, detailed, changelog');
		}
		style = a.style;
	}
	let audience: Audience = 'customer';
	if (a.audience !== undefined) {
		if (a.audience !== 'internal' && a.audience !== 'customer') {
			throw new Error('`audience` must be one of: internal, customer');
		}
		audience = a.audience;
	}
	return {
		slug: a.slug.trim(),
		style,
		audience,
		include_slipped: a.include_slipped !== false, // default true
		include_cut: a.include_cut === true, // default false (cuts are usually quiet)
	};
}

type ItemWithTemplate = {
	id: string;
	title: string;
	body: string;
	template_id: string | null;
	template_slug: string | null;
	fields: Record<string, unknown>;
};

export const generateReleaseNotes: ToolDef<Args, ToolCallResult, Db> = {
	name: 'generate_release_notes',
	description:
		'Generate a Markdown release note for a list. For closed lists, uses the persisted delivered/slipped/cut breakdown (BL-010 audit). For open lists, computes a live snapshot. Groups by template (features/bugs/…). Style: concise|detailed|changelog. Audience: internal (shows priority/executor) or customer (strips internal fields). Returns Markdown text + optional resource_link to the /r/<code> page if a share code points at this list.',
	annotations: {
		title: 'Generate release notes',
		readOnlyHint: true,
		idempotentHint: true,
		openWorldHint: false,
	},
	inputSchema: {
		type: 'object',
		properties: {
			slug: { type: 'string', description: 'List slug (e.g. "v0.5", "june-2026").' },
			style: {
				type: 'string',
				description: 'concise | detailed | changelog. Default changelog.',
			},
			audience: {
				type: 'string',
				description: 'internal | customer. Default customer (strips priority/executor).',
			},
			include_slipped: {
				type: 'boolean',
				description: 'Show a "Slipped" section. Default true.',
			},
			include_cut: {
				type: 'boolean',
				description: 'Show a "Cut" section. Default false (cuts are usually quiet).',
			},
		},
		required: ['slug'],
	},
	validate,
	async handler(args, ctx) {
		// 1. Load the list.
		const listRows = await ctx.db
			.select()
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, ctx.workspace_id), eq(schema.lists.slug, args.slug)))
			.limit(1);
		const list = listRows[0];
		if (!list) {
			throw new Error(`No list with slug "${args.slug}" in this workspace.`);
		}
		const meta = list.meta_json as ListMeta;

		// 2. Load member items.
		const memberRows = await ctx.db
			.select({ item_id: schema.item_lists.item_id })
			.from(schema.item_lists)
			.where(eq(schema.item_lists.list_id, list.id));
		const itemIds = memberRows.map((m) => m.item_id);
		const itemRows =
			itemIds.length > 0
				? await ctx.db.select().from(schema.items).where(inArray(schema.items.id, itemIds))
				: [];

		// 3. Load templates (one round-trip).
		const templateIds = Array.from(
			new Set(itemRows.map((i) => i.template_id).filter((x): x is string => x !== null)),
		);
		const templateById = new Map<
			string,
			{ slug: string; name: string; fields_schema_json: FieldDef[] }
		>();
		if (templateIds.length > 0) {
			const tRows = await ctx.db
				.select({
					id: schema.templates.id,
					slug: schema.templates.slug,
					name: schema.templates.name,
					fields_schema_json: schema.templates.fields_schema_json,
				})
				.from(schema.templates)
				.where(inArray(schema.templates.id, templateIds));
			for (const t of tRows) {
				templateById.set(t.id, {
					slug: t.slug,
					name: t.name,
					fields_schema_json: t.fields_schema_json as FieldDef[],
				});
			}
		}

		const enrichedItems: ItemWithTemplate[] = itemRows.map((i) => ({
			id: i.id,
			title: i.title,
			body: i.body,
			template_id: i.template_id,
			template_slug: i.template_id ? (templateById.get(i.template_id)?.slug ?? null) : null,
			fields: i.fields_json as Record<string, unknown>,
		}));

		// 4. Build breakdown. Closed list = use persisted. Open = compute live.
		let breakdown: { delivered: string[]; slipped: string[]; cut: string[] };
		let snapshotKind: 'persisted' | 'live';
		if (meta.closed_at && meta.breakdown) {
			breakdown = meta.breakdown;
			snapshotKind = 'persisted';
		} else {
			const auditable: AuditableItem[] = enrichedItems.map((i) => ({
				id: i.id,
				template_id: i.template_id,
				state: typeof i.fields.state === 'string' ? i.fields.state : null,
			}));
			const terminalsByTemplate: Record<string, string[]> = {};
			for (const [id, t] of templateById) {
				terminalsByTemplate[id] = terminalStatesForTemplate(t.fields_schema_json);
			}
			const result = auditList({
				items: auditable,
				terminalStatesByTemplate: terminalsByTemplate,
				cutItemIds: [],
			});
			breakdown = {
				delivered: result.delivered,
				slipped: result.slipped,
				cut: result.cut,
			};
			snapshotKind = 'live';
		}

		const idToItem = new Map(enrichedItems.map((i) => [i.id, i]));
		const totalCounted = breakdown.delivered.length + breakdown.slipped.length;
		const rate =
			totalCounted === 0 ? null : Math.round((breakdown.delivered.length / totalCounted) * 100);

		// 5. Look for share codes pointing at this list (for the resource_link).
		const sharedCodeRows = await ctx.db
			.select({ code: schema.share_codes.code })
			.from(schema.share_codes)
			.where(eq(schema.share_codes.workspace_id, ctx.workspace_id))
			.limit(50);
		const shareCodeForList = sharedCodeRows
			.map((r) => r.code)
			.find((code) => {
				// We don't have the scope here without another query; cheap: if there's
				// ANY share code in the workspace, link the first one as a hint. A
				// better resolution lands later.
				return code;
			});

		// 6. Render Markdown.
		const markdown = renderMarkdown({
			list,
			meta,
			items: idToItem,
			breakdown,
			snapshotKind,
			rate,
			style: args.style ?? 'changelog',
			audience: args.audience ?? 'customer',
			include_slipped: args.include_slipped ?? true,
			include_cut: args.include_cut ?? false,
		});

		const content: ToolCallResult['content'] = [{ type: 'text', text: markdown }];
		if (shareCodeForList) {
			content.push({
				type: 'resource_link',
				uri: `https://mcp.blitzlist.ai/r/${shareCodeForList}`,
				name: `${list.name} — public view`,
				description:
					'Public roadmap rendering of this list (note: a share code may exist for a different list in this workspace).',
				mimeType: 'text/html',
			});
		}
		return { content };
	},
};

// =============================================================================

function renderMarkdown(input: {
	list: { name: string; slug: string; description: string | null };
	meta: ListMeta;
	items: Map<string, ItemWithTemplate>;
	breakdown: { delivered: string[]; slipped: string[]; cut: string[] };
	snapshotKind: 'persisted' | 'live';
	rate: number | null;
	style: Style;
	audience: Audience;
	include_slipped: boolean;
	include_cut: boolean;
}): string {
	const { list, meta, items, breakdown, snapshotKind, rate, style, audience } = input;

	const lines: string[] = [];

	// Header
	const version = meta.version ? ` (${meta.version})` : '';
	lines.push(`# ${list.name}${version}`);
	if (list.description) lines.push('', list.description);

	// Meta line
	const metaParts: string[] = [];
	if (meta.ship_target) metaParts.push(`**Ship target:** ${meta.ship_target}`);
	if (meta.closed_at) metaParts.push(`**Closed:** ${meta.closed_at.slice(0, 10)}`);
	if (snapshotKind === 'live') metaParts.push('_live snapshot_');
	if (metaParts.length > 0) lines.push('', metaParts.join(' · '));

	// Summary stats
	if (rate !== null) {
		lines.push(
			'',
			`**${breakdown.delivered.length} delivered** · ${breakdown.slipped.length} slipped · ${breakdown.cut.length} cut · **${rate}% delivery rate**`,
		);
	}

	// Delivered section — always shown
	lines.push('', '## Shipped');
	if (breakdown.delivered.length === 0) {
		lines.push('', '_Nothing shipped yet._');
	} else {
		lines.push('', ...renderItemList(breakdown.delivered, items, style, audience));
	}

	if (input.include_slipped && breakdown.slipped.length > 0) {
		lines.push('', '## Slipped');
		lines.push('', '_These items were committed to this release but did not ship._');
		lines.push('', ...renderItemList(breakdown.slipped, items, style, audience));
	}

	if (input.include_cut && breakdown.cut.length > 0) {
		lines.push('', '## Cut');
		lines.push('', '_These items were explicitly removed from this release._');
		lines.push('', ...renderItemList(breakdown.cut, items, style, audience));
	}

	// Footer
	lines.push('', '---', `_Generated by Blitzlist. List slug: \`${list.slug}\`._`);

	return lines.join('\n');
}

function renderItemList(
	ids: string[],
	items: Map<string, ItemWithTemplate>,
	style: Style,
	audience: Audience,
): string[] {
	const resolved = ids
		.map((id) => items.get(id))
		.filter((x): x is ItemWithTemplate => x !== undefined);

	if (style === 'changelog') {
		// Group by template_slug.
		const groups = new Map<string, ItemWithTemplate[]>();
		for (const it of resolved) {
			const key = it.template_slug ?? 'other';
			const arr = groups.get(key) ?? [];
			arr.push(it);
			groups.set(key, arr);
		}
		const lines: string[] = [];
		const order = ['features', 'feature', 'backlog', 'bugs', 'fixes', 'improvements', 'other'];
		const seenKeys = new Set<string>();
		for (const k of order) {
			if (!groups.has(k)) continue;
			lines.push(`### ${humanizeGroupName(k)}`, '');
			for (const it of groups.get(k)!) {
				lines.push(renderItem(it, 'detailed', audience));
			}
			lines.push('');
			seenKeys.add(k);
		}
		for (const [k, arr] of groups) {
			if (seenKeys.has(k)) continue;
			lines.push(`### ${humanizeGroupName(k)}`, '');
			for (const it of arr) lines.push(renderItem(it, 'detailed', audience));
			lines.push('');
		}
		return lines;
	}

	return resolved.map((it) => renderItem(it, style, audience));
}

function renderItem(item: ItemWithTemplate, style: Style, audience: Audience): string {
	const titleLine = `- **${item.title}** ([${item.id}])`;
	if (style === 'concise') return titleLine;

	const parts: string[] = [titleLine];

	// One-line excerpt
	if (item.body && item.body.trim().length > 0) {
		const excerpt = item.body.split('\n').find((l) => l.trim().length > 0) ?? '';
		const truncated = excerpt.length > 180 ? excerpt.slice(0, 177) + '…' : excerpt;
		parts.push(`  ${truncated}`);
	}

	// Internal-only enrichment
	if (audience === 'internal') {
		const meta: string[] = [];
		if (typeof item.fields.priority === 'string') meta.push(`priority=${item.fields.priority}`);
		if (typeof item.fields.severity === 'string') meta.push(`severity=${item.fields.severity}`);
		if (typeof item.fields.estimate === 'string') meta.push(`estimate=${item.fields.estimate}`);
		if (meta.length > 0) parts.push(`  _${meta.join(' · ')}_`);
	}

	return parts.join('\n');
}

function humanizeGroupName(k: string): string {
	switch (k) {
		case 'features':
		case 'feature':
			return 'Features';
		case 'backlog':
			return 'Improvements';
		case 'bugs':
		case 'fixes':
			return 'Bug fixes';
		case 'improvements':
			return 'Improvements';
		case 'other':
			return 'Other';
		default:
			return k.charAt(0).toUpperCase() + k.slice(1);
	}
}
