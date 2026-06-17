/**
 * Public roadmap renderer — Linear-style aesthetic.
 *
 * Design language:
 *   - Sans-first typography (Inter); monospace reserved for IDs, dates, counts
 *   - Airy spacing, generous line-height
 *   - Status pills with icons + soft color glow
 *   - Item cards with state-tinted left border + subtle hover glow
 *   - Restrained-but-saturated palette: green / amber / coral / sky / purple
 *
 * Pure function: (workspace, list, template, items, share_code, view_url) → HTML.
 */

import type { lists, items, templates, workspaces, comments } from '@blitzlist/db';
import type { DefaultView, FieldDef, ListMeta, StakeholderPermission } from '@blitzlist/db';
import { renderMarkdown, renderInlinePreview } from '../markdown.js';
import { effectiveStateOptions, effectiveFieldSchema } from '../list-effective.js';

type ListRow = typeof lists.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type TemplateRow = typeof templates.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type CommentRow = typeof comments.$inferSelect;

export type FileSummary = {
	id: string;
	name: string;
	mime_type: string;
	size_bytes: number;
};

export type RenderInput = {
	workspace: WorkspaceRow;
	list: ListRow;
	template: TemplateRow | null;
	items: ItemRow[];
	/** comments keyed by item_id (latest 10 per item). */
	commentsByItem?: Record<string, CommentRow[]>;
	/**
	 * Files referenced by attachment-typed fields on visible items, keyed by
	 * file id. Pre-loaded by the caller (single batched SQL query) so the
	 * renderer stays pure. Missing entries are rendered as a soft "unavailable"
	 * placeholder.
	 */
	filesById?: Record<string, FileSummary>;
	share_code: string;
	view_url: string;
	/** Granted permissions for this visitor (from the share code). */
	permissions: StakeholderPermission[];
	/** Display name persisted in cookie, used to prefill the comment form. */
	display_name?: string;
	/** Banner message to show at top (e.g. after a form submit). */
	flash?: { kind: 'ok' | 'error'; message: string };
	/** Override the resolved view (from URL ?view=... query param). */
	view_override?: DefaultView;
};

/**
 * Resolve which view to render. Precedence:
 *   1. URL override (?view=kanban)
 *   2. List-level override (list.meta_json.default_view)
 *   3. Template default (template.default_view)
 *   4. Hard fallback to 'list'
 *
 * Unimplemented views (calendar, compass) fall back to 'list' until they ship.
 */
const IMPLEMENTED_VIEWS = ['list', 'kanban', 'table', 'todo'] as const;
type ImplementedView = (typeof IMPLEMENTED_VIEWS)[number];

function resolveView(input: RenderInput): ImplementedView {
	const fromOverride = input.view_override;
	const fromList = (input.list.meta_json as ListMeta).default_view;
	const fromTemplate = input.template?.default_view as DefaultView | undefined;
	for (const candidate of [fromOverride, fromList, fromTemplate]) {
		if (candidate && IMPLEMENTED_VIEWS.includes(candidate as ImplementedView)) {
			return candidate as ImplementedView;
		}
	}
	return 'list';
}

type StateTone = 'on-track' | 'at-risk' | 'off-track' | 'shipped' | 'pending' | 'neutral';

export function renderRoadmap(input: RenderInput): string {
	const { workspace, list, template, items, share_code, view_url } = input;
	const permissions = input.permissions ?? ['read'];
	const commentsByItem = input.commentsByItem ?? {};
	const filesById = input.filesById ?? {};
	const meta = list.meta_json as ListMeta;
	// Effective schema = template fields ∪ per-list extra_fields. Lets the
	// user introduce ad-hoc fields (priority on a release list, etc.)
	// without editing the template.
	const schemaFields: FieldDef[] = effectiveFieldSchema(
		(template?.fields_schema_json as FieldDef[] | undefined) ?? null,
		meta,
	);
	const stateField = schemaFields.find((f) => f.key === 'state' && f.type === 'single_select');
	// Effective state options: template options + extras, optionally re-ordered
	// by list.meta_json.state_options_order.
	const stateOrder = effectiveStateOptions(stateField?.options, meta);
	const terminalStates = new Set(stateField?.terminal ?? []);
	const can = {
		comment: permissions.includes('comment'),
		edit: permissions.includes('edit'),
		create: permissions.includes('create'),
	};
	const interactive = can.comment || can.edit || can.create;

	const view = resolveView(input);
	const listDefault = (list.meta_json as ListMeta).default_view;

	const groups = new Map<string, ItemRow[]>();
	for (const state of stateOrder) groups.set(state, []);
	const noState: ItemRow[] = [];
	for (const item of items) {
		const fields = item.fields_json as Record<string, unknown>;
		const s = typeof fields.state === 'string' ? fields.state : null;
		if (s && groups.has(s)) {
			groups.get(s)!.push(item);
		} else if (s) {
			if (!groups.has(s)) groups.set(s, []);
			groups.get(s)!.push(item);
		} else {
			noState.push(item);
		}
	}

	const isClosed = !!meta.closed_at;
	const breakdown = meta.breakdown;

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
	<title>${escape(list.name)} — ${escape(workspace.name)}</title>
	<meta name="description" content="${escape(list.description ?? list.name)}" />
	<meta name="theme-color" content="#08090a" />
	<meta name="robots" content="noindex" />
	<meta name="share-code" content="${escape(share_code)}" />
	<meta property="og:title" content="${escape(list.name)} — ${escape(workspace.name)}" />
	<meta property="og:description" content="${escape(list.description ?? list.name)}" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="${escape(view_url)}" />
	<link rel="preconnect" href="https://rsms.me/" />
	<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
	<link rel="icon" type="image/png" href="https://blitzlist-landing.pages.dev/img/favicon.png" />
	<link rel="apple-touch-icon" href="https://blitzlist-landing.pages.dev/img/logo-256.png" />
	${LINEAR_CSS}
</head>
<body>
	<div class="bg-gradient"></div>

	<header>
		<a class="brand" href="https://blitzlist.ai" rel="noopener">
			<img src="https://blitzlist-landing.pages.dev/img/logo-256.png" alt="" width="36" height="36" />
			<span>Blitzlist</span>
		</a>
		<div class="header-meta">
			${interactive ? renderHeaderCaps(permissions, input.display_name, share_code) : ''}
			<div class="ws">${escape(workspace.name)}</div>
		</div>
	</header>

	<main>
		${input.flash ? `<div class="flash flash-${input.flash.kind}">${escape(input.flash.message)}</div>` : ''}

		<section class="hero">
			<div class="hero-row">
				<div class="hero-glyph">${DIAMOND_SVG_LARGE(toneForList(meta, isClosed))}</div>
				<div class="hero-text">
					<div class="hero-eyebrow">${template ? escape(humanizeTemplate(template.slug)) : 'List'}</div>
					<h1 class="hero-title">${escape(list.name)}</h1>
					${list.description ? `<p class="hero-desc">${escape(list.description)}</p>` : ''}
				</div>
			</div>
			<div class="hero-meta-row">
				<div class="hero-meta">${renderListMeta(meta, isClosed)}</div>
				<div class="hero-controls">
					${renderViewSwitcher(view, listDefault, share_code, can.edit)}
					${renderExportDropdown(share_code)}
				</div>
			</div>
			${isClosed && breakdown ? renderBreakdown(breakdown, items, stateField) : renderLiveSummary(items, stateField)}
		</section>

		<section class="items items-view-${view}">
			${renderItemsForView(view, {
				stateOrder, groups, noState, terminalStates, schemaFields, can, stateField,
				shareCode: share_code, commentsByItem, displayName: input.display_name, items,
				filesById,
			})}
		</section>

		${can.create ? renderNewItemForm(share_code, input.display_name, stateField, stateOrder) : ''}
	</main>

	<footer>
		<div>
			Shared via <code>${escape(share_code)}</code>
			<span class="dot"></span>
			${items.length} item${items.length === 1 ? '' : 's'}
		</div>
		<div class="links">
			<a href="https://blitzlist.ai" rel="noopener">blitzlist.ai</a>
			<a href="https://github.com/ai-fy/Blitzlist" rel="noopener">github</a>
		</div>
	</footer>
	${pageScript(share_code)}
</body>
</html>`;
}

// === Sections ================================================================

function renderListMeta(meta: ListMeta, isClosed: boolean): string {
	const pills: string[] = [];
	if (meta.ship_target)
		pills.push(metaPill('target', formatDate(meta.ship_target)));
	if (meta.target_date)
		pills.push(metaPill('target', formatDate(meta.target_date)));
	if (meta.start_date && meta.end_date)
		pills.push(metaPill('window', `${formatDate(meta.start_date)} → ${formatDate(meta.end_date)}`));
	if (meta.event_date)
		pills.push(metaPill('event', formatDate(meta.event_date)));
	if (isClosed && meta.closed_at)
		pills.push(metaPill('closed', formatDate(meta.closed_at), 'shipped'));
	return pills.join('');
}

function metaPill(label: string, value: string, tone: StateTone = 'neutral'): string {
	return `<span class="meta-pill tone-${tone}"><span class="meta-pill-label">${escape(label)}</span><span class="meta-pill-value">${escape(value)}</span></span>`;
}

function renderBreakdown(
	breakdown: { delivered: string[]; slipped: string[]; cut: string[] },
	allItems: ItemRow[],
	_stateField: FieldDef | undefined,
): string {
	const idToItem = new Map(allItems.map((i) => [i.id, i]));
	const counted = breakdown.delivered.length + breakdown.slipped.length;
	const rate = counted === 0 ? 0 : Math.round((breakdown.delivered.length / counted) * 100);
	const total = breakdown.delivered.length + breakdown.slipped.length + breakdown.cut.length;
	const deliveredPct = total === 0 ? 0 : (breakdown.delivered.length / total) * 100;
	const slippedPct = total === 0 ? 0 : (breakdown.slipped.length / total) * 100;
	const cutPct = total === 0 ? 0 : (breakdown.cut.length / total) * 100;

	const hasAnyItems = breakdown.delivered.length + breakdown.slipped.length + breakdown.cut.length > 0;
	return `
		<div class="audit" role="group" aria-label="Audit summary">
			<div class="audit-strip">
				<span class="audit-rate"><strong>${rate}%</strong> delivered</span>
				<span class="audit-sep" aria-hidden="true"></span>
				<span class="legend-item tone-shipped"><span class="dot"></span><span class="legend-count">${breakdown.delivered.length}</span> delivered</span>
				<span class="legend-item tone-at-risk"><span class="dot"></span><span class="legend-count">${breakdown.slipped.length}</span> slipped</span>
				<span class="legend-item tone-neutral"><span class="dot"></span><span class="legend-count">${breakdown.cut.length}</span> cut</span>
			</div>
			<div class="audit-bar" role="img" aria-label="${breakdown.delivered.length} delivered, ${breakdown.slipped.length} slipped, ${breakdown.cut.length} cut">
				<div class="bar-seg seg-delivered" style="width:${deliveredPct}%"></div>
				<div class="bar-seg seg-slipped" style="width:${slippedPct}%"></div>
				<div class="bar-seg seg-cut" style="width:${cutPct}%"></div>
			</div>
			${
				hasAnyItems
					? `<details class="audit-detail">
				<summary>Item breakdown</summary>
				<div class="audit-detail-body">
					${detailList('Delivered', 'shipped', breakdown.delivered, idToItem)}
					${detailList('Slipped', 'at-risk', breakdown.slipped, idToItem)}
					${detailList('Cut', 'neutral', breakdown.cut, idToItem)}
				</div>
			</details>`
					: ''
			}
		</div>
	`;
}

function renderLiveSummary(items: ItemRow[], stateField: FieldDef | undefined): string {
	if (items.length === 0) return '';
	// For OPEN lists, render a state-distribution sparkline
	const stateCounts = new Map<string, number>();
	for (const item of items) {
		const fields = item.fields_json as Record<string, unknown>;
		const s = typeof fields.state === 'string' ? fields.state : 'unstated';
		stateCounts.set(s, (stateCounts.get(s) ?? 0) + 1);
	}
	const terminal = new Set(stateField?.terminal ?? []);
	const done = Array.from(stateCounts)
		.filter(([s]) => terminal.has(s))
		.reduce((n, [, c]) => n + c, 0);
	const total = items.length;
	const pct = total === 0 ? 0 : Math.round((done / total) * 100);

	return `
		<div class="audit live" role="group" aria-label="Progress">
			<div class="audit-strip">
				<span class="audit-rate"><strong>${pct}%</strong> complete</span>
				<span class="live-tag">live</span>
				<span class="audit-sep" aria-hidden="true"></span>
				<span class="legend-item tone-shipped"><span class="dot"></span><span class="legend-count">${done}</span> done</span>
				<span class="legend-item tone-neutral"><span class="dot"></span><span class="legend-count">${total - done}</span> open</span>
			</div>
			<div class="audit-bar">
				<div class="bar-seg seg-delivered" style="width:${pct}%"></div>
				<div class="bar-seg seg-empty" style="width:${100 - pct}%"></div>
			</div>
		</div>
	`;
}

function detailList(
	heading: string,
	tone: StateTone,
	ids: string[],
	idToItem: Map<string, ItemRow>,
): string {
	if (ids.length === 0) return '';
	return `<details class="detail-block tone-${tone}"><summary>${escape(heading)} <span class="count">${ids.length}</span></summary><ul>${ids
		.map(
			(id) =>
				`<li><code class="id">${escape(id)}</code><span class="t">${escape(idToItem.get(id)?.title ?? '')}</span></li>`,
		)
		.join('')}</ul></details>`;
}

type Capabilities = { comment: boolean; edit: boolean; create: boolean };

function renderGroups(
	stateOrder: string[],
	groups: Map<string, ItemRow[]>,
	noState: ItemRow[],
	terminalStates: Set<string>,
	schemaFields: FieldDef[],
	can: Capabilities,
	stateField: FieldDef | undefined,
	shareCode: string,
	commentsByItem: Record<string, CommentRow[]>,
	displayName: string | undefined,
	filesById: Record<string, FileSummary>,
): string {
	const args = { schemaFields, can, stateField, stateOptions: stateOrder, shareCode, commentsByItem, displayName, filesById };
	const renderedGroups: string[] = [];
	for (const state of stateOrder) {
		const arr = groups.get(state) ?? [];
		if (arr.length === 0) continue;
		const tone: StateTone = terminalStates.has(state) ? 'shipped' : stateTone(state);
		renderedGroups.push(
			`<div class="group">
				<div class="group-header">
					${statusPill(state, tone)}
					<span class="group-count">${arr.length}</span>
				</div>
				<div class="cards">${arr.map((it) => renderItem(it, tone, args)).join('')}</div>
			</div>`,
		);
	}
	for (const [state, arr] of groups) {
		if (stateOrder.includes(state) || arr.length === 0) continue;
		renderedGroups.push(
			`<div class="group">
				<div class="group-header">
					${statusPill(state, 'neutral')}
					<span class="group-count">${arr.length}</span>
				</div>
				<div class="cards">${arr.map((it) => renderItem(it, 'neutral', args)).join('')}</div>
			</div>`,
		);
	}
	if (noState.length > 0) {
		renderedGroups.push(
			`<div class="group">
				<div class="group-header">
					${statusPill('No state', 'neutral')}
					<span class="group-count">${noState.length}</span>
				</div>
				<div class="cards">${noState.map((it) => renderItem(it, 'neutral', args)).join('')}</div>
			</div>`,
		);
	}
	if (renderedGroups.length === 0) return `<p class="empty">No items in this list yet.</p>`;
	return renderedGroups.join('');
}

type ItemRenderArgs = {
	schemaFields: FieldDef[];
	can: Capabilities;
	stateField: FieldDef | undefined;
	/** Effective state options for THIS list = template options ∪ list extras. */
	stateOptions: string[];
	shareCode: string;
	commentsByItem: Record<string, CommentRow[]>;
	displayName: string | undefined;
	filesById: Record<string, FileSummary>;
};

function renderItem(item: ItemRow, tone: StateTone, args: ItemRenderArgs): string {
	const { schemaFields, can, stateField, shareCode, commentsByItem, displayName, filesById } = args;
	const fields = item.fields_json as Record<string, unknown>;
	// Attachment fields render their own block — keep them out of the chip row.
	const attachmentKeys = new Set(schemaFields.filter((f) => f.type === 'attachment').map((f) => f.key));
	const interesting = schemaFields
		.filter(
			(f) =>
				f.key !== 'state' &&
				!attachmentKeys.has(f.key) &&
				fields[f.key] !== undefined &&
				fields[f.key] !== null,
		)
		.slice(0, 5);
	const itemComments = commentsByItem[item.id] ?? [];
	const currentState = typeof fields.state === 'string' ? fields.state : null;
	const attachmentsHtml = renderAttachments(schemaFields, fields, filesById, shareCode, 'card');
	return `
		<article class="card tone-${tone}">
			<div class="card-accent"></div>
			<div class="card-body">
				<div class="card-head">
					${DIAMOND_SVG_MINI(tone)}
					<h3 class="card-title">${escape(item.title)}</h3>
					<code class="card-id">${escape(item.id)}</code>
				</div>
				${item.body ? `<div class="card-desc prose">${renderMarkdown(item.body)}</div>` : ''}
				${
					interesting.length > 0
						? `<div class="card-fields">${interesting
								.map((f) => fieldChip(f, fields[f.key]))
								.join('')}</div>`
						: ''
				}
				${attachmentsHtml}
				${
					can.edit && stateField && args.stateOptions.length > 0
						? renderStateEditForm(item.id, shareCode, args.stateOptions, currentState)
						: ''
				}
				${itemComments.length > 0 ? renderComments(itemComments) : ''}
				${can.comment ? renderCommentForm(item.id, shareCode, displayName) : ''}
			</div>
		</article>
	`;
}

/**
 * Render attachment-typed fields as a block of <img> tags (for images) and
 * chip links (for other mime types). All bytes are streamed via the
 * /r/<code>/file/<id> route — no inline data URIs in v0.5 (browser cache +
 * ETag handle revisits).
 *
 * variant='card' uses larger thumbnails; variant='kanban' uses compact ones.
 */
function renderAttachments(
	schemaFields: FieldDef[],
	fields: Record<string, unknown>,
	filesById: Record<string, FileSummary>,
	shareCode: string,
	variant: 'card' | 'kanban',
): string {
	const parts: string[] = [];
	for (const def of schemaFields) {
		if (def.type !== 'attachment') continue;
		const raw = fields[def.key];
		if (raw === undefined || raw === null) continue;
		const ids = Array.isArray(raw) ? raw : [raw];
		for (const id of ids) {
			if (typeof id !== 'string') continue;
			const file = filesById[id];
			if (!file) {
				parts.push(
					`<span class="att-chip att-missing" title="${escape(def.label ?? def.key)}">📎 (file unavailable)</span>`,
				);
				continue;
			}
			const url = `/r/${encodeURIComponent(shareCode)}/file/${encodeURIComponent(file.id)}`;
			const isImage = file.mime_type.startsWith('image/');
			if (isImage) {
				parts.push(
					`<a class="att-img-wrap att-${variant}" href="${url}" target="_blank" rel="noopener" title="${escape(file.name)}"><img class="att-img" loading="lazy" decoding="async" src="${url}" alt="${escape(file.name)}" /></a>`,
				);
			} else {
				parts.push(
					`<a class="att-chip" href="${url}" target="_blank" rel="noopener" title="${escape(file.name)}">📎 <span class="att-name">${escape(file.name)}</span><span class="att-size">${formatBytes(file.size_bytes)}</span></a>`,
				);
			}
		}
	}
	if (parts.length === 0) return '';
	return `<div class="attachments att-${variant}">${parts.join('')}</div>`;
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderHeaderCaps(
	permissions: StakeholderPermission[],
	displayName: string | undefined,
	shareCode: string,
): string {
	const capLabels = permissions
		.filter((p) => p === 'read' || p === 'comment' || p === 'edit' || p === 'create')
		.map((p) => `<span class="cap cap-${p}">${capLabel(p)}</span>`)
		.join('');
	return `
		<div class="header-caps">
			<span class="header-caps-label">you can</span>
			${capLabels}
			<form class="header-signas" method="POST" action="/r/${escape(shareCode)}/identify">
				<input type="text" name="display_name" value="${escape(displayName ?? '')}" placeholder="sign as…" maxlength="40" />
				<button type="submit" title="Save name">${CHECK_ICON}</button>
			</form>
		</div>
	`;
}

// === View dispatcher + per-view renderers ===================================

type ViewArgs = {
	stateOrder: string[];
	groups: Map<string, ItemRow[]>;
	noState: ItemRow[];
	terminalStates: Set<string>;
	schemaFields: FieldDef[];
	can: Capabilities;
	stateField: FieldDef | undefined;
	shareCode: string;
	commentsByItem: Record<string, CommentRow[]>;
	displayName: string | undefined;
	items: ItemRow[];
	filesById: Record<string, FileSummary>;
};

function renderItemsForView(view: ImplementedView, args: ViewArgs): string {
	switch (view) {
		case 'list':
			return renderGroups(args.stateOrder, args.groups, args.noState, args.terminalStates, args.schemaFields, args.can, args.stateField, args.shareCode, args.commentsByItem, args.displayName, args.filesById);
		// (stateOrder IS the effective options; renderGroups passes it as stateOptions on args)
		case 'kanban':
			return renderKanbanView(args);
		case 'table':
			return renderTableView(args);
		case 'todo':
			return renderTodoView(args);
	}
}

// --- Kanban view -----------------------------------------------------------

function renderKanbanView(args: ViewArgs): string {
	const cols: string[] = [];
	const ordered = args.stateOrder.length > 0 ? args.stateOrder : Array.from(args.groups.keys());
	const seen = new Set<string>();
	const colHeaderDraggable = args.can.edit ? 'true' : 'false';
	const emitCol = (state: string, arr: ItemRow[], tone: StateTone) => {
		cols.push(`
			<div class="kanban-col" data-state="${escape(state)}" data-tone="${tone}">
				<div class="kanban-col-header" draggable="${colHeaderDraggable}" data-state="${escape(state)}" title="${args.can.edit ? 'Drag to reorder columns' : ''}">
					${statusPill(state, tone)}
					<span class="kanban-col-count">${arr.length}</span>
				</div>
				<div class="kanban-col-cards">
					${arr.map((it) => renderKanbanCard(it, tone, args)).join('') || '<div class="kanban-empty">—</div>'}
				</div>
			</div>
		`);
	};
	for (const state of ordered) {
		seen.add(state);
		const arr = args.groups.get(state) ?? [];
		const tone: StateTone = args.terminalStates.has(state) ? 'shipped' : stateTone(state);
		emitCol(state, arr, tone);
	}
	// Surface any in-the-wild state values that aren't in the declared options
	// or extras yet (BL-022 open enum — defensive). Tone neutral.
	for (const [state, arr] of args.groups) {
		if (seen.has(state) || arr.length === 0) continue;
		seen.add(state);
		emitCol(state, arr, 'neutral');
	}
	// BL-022: edit-permission visitors can spawn a new column for an arbitrary
	// state value. The form POSTs to /r/:code/state-option which appends to
	// list.meta_json.extra_state_options and reloads.
	if (args.can.edit && args.stateField?.open) {
		cols.push(`
			<div class="kanban-col kanban-col-add">
				<details class="add-state">
					<summary aria-label="Add a new state column">+ add column</summary>
					<form method="POST" action="/r/${escape(args.shareCode)}/state-option">
						<input type="text" name="state" placeholder="e.g. estimating" maxlength="40" required pattern="[A-Za-z0-9_][A-Za-z0-9_\\- ]*" title="Letters, digits, dash, underscore, space" />
						<button type="submit">Add</button>
					</form>
				</details>
			</div>
		`);
	}
	if (args.noState.length > 0) {
		cols.push(`
			<div class="kanban-col">
				<div class="kanban-col-header">
					${statusPill('No state', 'neutral')}
					<span class="kanban-col-count">${args.noState.length}</span>
				</div>
				<div class="kanban-col-cards">
					${args.noState.map((it) => renderKanbanCard(it, 'neutral', args)).join('')}
				</div>
			</div>
		`);
	}
	if (cols.length === 0) return `<p class="empty">No items in this list yet.</p>`;
	return `<div class="kanban-board">${cols.join('')}</div>`;
}

function renderKanbanCard(item: ItemRow, tone: StateTone, args: ViewArgs): string {
	const fields = item.fields_json as Record<string, unknown>;
	const attachmentKeys = new Set(args.schemaFields.filter((f) => f.type === 'attachment').map((f) => f.key));
	const interesting = args.schemaFields
		.filter(
			(f) =>
				f.key !== 'state' &&
				!attachmentKeys.has(f.key) &&
				fields[f.key] !== undefined &&
				fields[f.key] !== null,
		)
		.slice(0, 3);
	const commentCount = (args.commentsByItem[item.id] ?? []).length;
	const draggable = args.can.edit ? 'true' : 'false';
	const attachmentsHtml = renderAttachments(args.schemaFields, fields, args.filesById, args.shareCode, 'kanban');
	return `
		<article class="kanban-card tone-${tone}" draggable="${draggable}" data-item-id="${escape(item.id)}">
			<div class="kanban-card-head">
				<code class="kanban-card-id">${escape(item.id)}</code>
				${commentCount > 0 ? `<span class="kanban-card-comments">${SPEECH_ICON}${commentCount}</span>` : ''}
			</div>
			<div class="kanban-card-title">${escape(item.title)}</div>
			${item.body ? `<div class="kanban-card-desc prose">${renderMarkdown(item.body)}</div>` : ''}
			${attachmentsHtml}
			${interesting.length > 0 ? `<div class="kanban-card-chips">${interesting.map((f) => fieldChip(f, fields[f.key])).join('')}</div>` : ''}
		</article>
	`;
}

// --- Table view ------------------------------------------------------------

function renderTableView(args: ViewArgs): string {
	if (args.items.length === 0) return `<p class="empty">No items in this list yet.</p>`;
	const cols: Array<{ key: string; label: string; isField: FieldDef | null }> = [
		{ key: '_expand', label: '', isField: null },
		{ key: 'id', label: 'ID', isField: null },
		{ key: 'title', label: 'Title', isField: null },
	];
	if (args.stateField) {
		cols.push({ key: 'state', label: args.stateField.label ?? 'State', isField: args.stateField });
	}
	cols.push({ key: '_description', label: 'Description', isField: null });
	// Add up to 3 more interesting fields from the template.
	for (const f of args.schemaFields) {
		if (f.key === 'state') continue;
		if (cols.length >= 8) break;
		cols.push({ key: f.key, label: f.label ?? f.key, isField: f });
	}
	const ordered = orderItemsByState(args.items, args.stateOrder, args.terminalStates);
	return `
		<div class="table-wrap">
			<table class="items-table">
				<thead>
					<tr>${cols.map((c) => `<th class="th-${c.key}">${escape(c.label)}</th>`).join('')}</tr>
				</thead>
				<tbody>
					${ordered.map((it) => renderTableRow(it, cols, args)).join('')}
				</tbody>
			</table>
		</div>
	`;
}

function renderTableRow(item: ItemRow, cols: Array<{ key: string; label: string; isField: FieldDef | null }>, args: ViewArgs): string {
	const fields = item.fields_json as Record<string, unknown>;
	const hasBody = !!item.body && item.body.trim().length > 0;
	const tds = cols.map((c) => {
		if (c.key === '_expand') {
			return `<td class="td-expand">${hasBody ? CHEVRON_DOWN_ICON : ''}</td>`;
		}
		if (c.key === 'id') return `<td class="td-id"><code>${escape(item.id)}</code></td>`;
		if (c.key === 'title') return `<td class="td-title">${escape(item.title)}</td>`;
		if (c.key === '_description') {
			if (!hasBody) return `<td class="td-empty">—</td>`;
			// Render markdown inline: bold / italic / code / links stay
			// formatted; block markers (#, -, blank lines) flatten to text.
			return `<td class="td-desc prose-inline">${renderInlinePreview(item.body, 100)}</td>`;
		}
		const value = fields[c.key];
		if (value === null || value === undefined) return `<td class="td-empty">—</td>`;
		if (c.isField?.type === 'single_select' && typeof value === 'string') {
			const toneFor = (v: string): StateTone => {
				if (c.key === 'state') return args.terminalStates.has(v) ? 'shipped' : stateTone(v);
				const lc = v.toLowerCase();
				if (/(p0|critical|urgent|high|red)/.test(lc)) return 'off-track';
				if (/(p1|medium|orange)/.test(lc)) return 'at-risk';
				if (/(green|done|low)/.test(lc)) return 'on-track';
				return 'neutral';
			};
			const tone = toneFor(value);
			// Editable dropdown for the state column when the visitor has edit rights.
			if (c.key === 'state' && args.can.edit && c.isField.options) {
				const options = c.isField.options
					.map(
						(o) => `<option value="${escape(o)}" data-tone="${toneFor(o)}"${o === value ? ' selected' : ''}>${escape(humanizeState(o))}</option>`,
					)
					.join('');
				return `<td class="td-state"><select class="state-select tone-${tone}" data-item-id="${escape(item.id)}" aria-label="Change state">${options}</select></td>`;
			}
			return `<td class="td-select"><span class="tag tone-${tone}">${escape(humanizeState(value))}</span></td>`;
		}
		if (c.isField?.type === 'checkbox') return `<td class="td-check">${value ? '✓' : '—'}</td>`;
		if (Array.isArray(value)) return `<td>${escape(value.join(', '))}</td>`;
		return `<td>${escape(String(value))}</td>`;
	}).join('');
	const summaryRow = `<tr class="item-row ${hasBody ? 'has-detail' : ''}" data-item-id="${escape(item.id)}">${tds}</tr>`;
	const detailRow = hasBody
		? `<tr class="detail-row" data-detail-for="${escape(item.id)}"><td colspan="${cols.length}"><div class="detail-body prose">${renderMarkdown(item.body)}</div></td></tr>`
		: '';
	return summaryRow + detailRow;
}

// --- Todo view -------------------------------------------------------------

function renderTodoView(args: ViewArgs): string {
	if (args.items.length === 0) return `<p class="empty">No items in this list yet.</p>`;
	const ordered = orderItemsByState(args.items, args.stateOrder, args.terminalStates);
	const stateField = args.stateField;
	// Toggle target: when checked, transition to the first terminal state; when
	// unchecked, transition to the first non-terminal state.
	const toggleTo = (current: string | null): { to: string; done: boolean } | null => {
		if (!stateField || !stateField.options || stateField.options.length === 0) return null;
		const terminals = stateField.terminal ?? [];
		const isDone = current !== null && terminals.includes(current);
		if (isDone) {
			const firstOpen = stateField.options.find((o) => !terminals.includes(o));
			return firstOpen ? { to: firstOpen, done: false } : null;
		} else {
			const firstDone = terminals[0] ?? null;
			return firstDone ? { to: firstDone, done: true } : null;
		}
	};
	// The default "open" state (first non-terminal option) is redundant in the
	// todo view — the checkbox already says "not done". Only surface a state
	// pill for genuinely informative intermediate states (e.g. "doing",
	// "blocked"). Done-ness is shown by the checkbox + strikethrough.
	const defaultOpenState = stateField?.options?.find((o) => !(stateField.terminal ?? []).includes(o)) ?? null;
	const rows = ordered.map((item) => {
		const fields = item.fields_json as Record<string, unknown>;
		const state = typeof fields.state === 'string' ? fields.state : null;
		const isDone = state !== null && args.terminalStates.has(state);
		const target = toggleTo(state);
		const canToggle = args.can.edit && target !== null;
		const checkbox = canToggle
			? `<form class="todo-toggle" method="POST" action="/r/${escape(args.shareCode)}/state/${escape(item.id)}">
					<input type="hidden" name="state" value="${escape(target!.to)}" />
					<button type="submit" class="todo-checkbox ${isDone ? 'checked' : ''}" aria-label="${isDone ? 'Mark not done' : 'Mark done'}">${isDone ? CHECK_ICON : ''}</button>
				</form>`
			: `<span class="todo-checkbox static ${isDone ? 'checked' : ''}">${isDone ? CHECK_ICON : ''}</span>`;
		const tone: StateTone = isDone ? 'shipped' : state ? stateTone(state) : 'neutral';
		return `
			<li class="todo-item tone-${tone} ${isDone ? 'is-done' : ''}">
				${checkbox}
				<div class="todo-body">
					<div class="todo-head">
						<span class="todo-title">${escape(item.title)}</span>
						<code class="todo-id">${escape(item.id)}</code>
					</div>
					${item.body ? `<div class="todo-desc prose">${renderMarkdown(item.body)}</div>` : ''}
					${state && !isDone && state !== defaultOpenState ? `<div class="todo-state">${statusPill(state, tone)}</div>` : ''}
				</div>
			</li>
		`;
	}).join('');
	return `<ul class="todo-list">${rows}</ul>`;
}

// --- Shared helpers --------------------------------------------------------

function orderItemsByState(items: ItemRow[], stateOrder: string[], terminalStates: Set<string>): ItemRow[] {
	const stateIndex = new Map(stateOrder.map((s, i) => [s, i]));
	return [...items].sort((a, b) => {
		const sa = (a.fields_json as Record<string, unknown>).state;
		const sb = (b.fields_json as Record<string, unknown>).state;
		const ia = typeof sa === 'string' ? (stateIndex.get(sa) ?? 999) : 1000;
		const ib = typeof sb === 'string' ? (stateIndex.get(sb) ?? 999) : 1000;
		// Push terminal states to the bottom for the active view default.
		const ta = typeof sa === 'string' && terminalStates.has(sa) ? 1 : 0;
		const tb = typeof sb === 'string' && terminalStates.has(sb) ? 1 : 0;
		if (ta !== tb) return ta - tb;
		if (ia !== ib) return ia - ib;
		return a.id.localeCompare(b.id);
	});
}

// === View switcher (segmented control) =====================================

const VIEW_LABELS: Record<ImplementedView, string> = {
	list: 'List',
	kanban: 'Board',
	table: 'Table',
	todo: 'Todo',
};

const VIEW_ICONS: Record<ImplementedView, string> = {
	list: `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
	kanban: `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="2.5" width="2.5" height="9" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="5.75" y="2.5" width="2.5" height="6" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="9.5" y="2.5" width="2.5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>`,
	table: `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="2.5" width="10" height="9" rx="0.8" stroke="currentColor" stroke-width="1.2"/><path d="M2 5.5h10M2 8.5h10M5.5 5.5v6" stroke="currentColor" stroke-width="1.2"/></svg>`,
	todo: `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="3.5" width="2.5" height="2.5" rx="0.4" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="8" width="2.5" height="2.5" rx="0.4" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.75l0.6 0.6L4 4.3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 4.75h6M6 9.25h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

function renderViewSwitcher(
	active: ImplementedView,
	listDefault: DefaultView | undefined,
	shareCode: string,
	canEdit: boolean,
): string {
	const buttons = IMPLEMENTED_VIEWS.map((v) => {
		const isActive = v === active;
		const isDefault = listDefault === v;
		return `<a class="view-btn ${isActive ? 'is-active' : ''} ${isDefault ? 'is-default' : ''}" href="?view=${v}" aria-current="${isActive ? 'page' : 'false'}" title="${escape(VIEW_LABELS[v])}${isDefault ? ' (default for this list)' : ''}">
			${VIEW_ICONS[v]}<span>${escape(VIEW_LABELS[v])}</span>
		</a>`;
	}).join('');
	const setDefault = canEdit && listDefault !== active
		? `<form class="view-set-default" method="POST" action="/r/${escape(shareCode)}/view-default">
				<input type="hidden" name="view" value="${active}" />
				<button type="submit" title="Make ${escape(VIEW_LABELS[active])} the default view for this list">Set as default</button>
			</form>`
		: '';
	return `<div class="view-switcher" role="tablist">${buttons}${setDefault}</div>`;
}

const SPEECH_ICON = `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 3.5h10v5H7l-3 2.5v-2.5H2v-5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

function renderExportDropdown(shareCode: string): string {
	return `
		<details class="export-dropdown">
			<summary>
				${DOWNLOAD_ICON}<span>Export</span>${CHEVRON_DOWN_ICON}
			</summary>
			<div class="export-menu" role="menu">
				<a class="export-menu-item" role="menuitem" href="/r/${escape(shareCode)}/export.csv" download>
					<span class="ext-tag">CSV</span><span class="ext-name">Comma-separated values</span>
				</a>
				<a class="export-menu-item" role="menuitem" href="/r/${escape(shareCode)}/export.md" download>
					<span class="ext-tag">MD</span><span class="ext-name">Markdown</span>
				</a>
				<a class="export-menu-item" role="menuitem" href="/r/${escape(shareCode)}/export.xlsx" download>
					<span class="ext-tag">XLSX</span><span class="ext-name">Microsoft Excel</span>
				</a>
			</div>
		</details>
	`;
}

function capLabel(p: StakeholderPermission): string {
	switch (p) {
		case 'read': return '👁 read';
		case 'comment': return '💬 comment';
		case 'edit': return '✎ edit';
		case 'create': return '+ create items';
		case 'approve': return '✓ approve';
		case 'vote': return '⬆ vote';
		default: return p;
	}
}

function renderStateEditForm(
	itemId: string,
	shareCode: string,
	effectiveOptions: string[],
	currentState: string | null,
): string {
	const options = effectiveOptions.map(
		(o) => `<option value="${escape(o)}"${o === currentState ? ' selected' : ''}>${escape(humanizeState(o))}</option>`,
	).join('');
	return `
		<form class="edit-state" method="POST" action="/r/${escape(shareCode)}/state/${escape(itemId)}">
			<label>set to</label>
			<select name="state" aria-label="Change state">${options}</select>
			<button type="submit">apply</button>
		</form>
	`;
}

function renderCommentForm(
	itemId: string,
	shareCode: string,
	displayName: string | undefined,
): string {
	return `
		<details class="comment-form">
			<summary>Add a comment</summary>
			<form method="POST" action="/r/${escape(shareCode)}/comment/${escape(itemId)}">
				<textarea name="body" rows="3" placeholder="What do you think?" maxlength="10000" required></textarea>
				<div class="comment-form-row">
					<input type="text" name="display_name" value="${escape(displayName ?? '')}" placeholder="Your name (optional)" maxlength="40" />
					<button type="submit">Post comment</button>
				</div>
			</form>
		</details>
	`;
}

function renderComments(rows: CommentRow[]): string {
	const ordered = [...rows].sort(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);
	return `
		<div class="comments">
			${ordered
				.map(
					(c) =>
						`<div class="comment"><div class="comment-meta"><span class="comment-author">${escape(c.author_label ?? 'Anonymous')}</span><time>${escape(formatTimestamp(c.created_at))}</time></div><div class="comment-body prose">${renderMarkdown(c.body)}</div></div>`,
				)
				.join('')}
		</div>
	`;
}

function renderNewItemForm(
	shareCode: string,
	displayName: string | undefined,
	stateField: FieldDef | undefined,
	effectiveStateOptions: string[],
): string {
	const states = effectiveStateOptions;
	const defaultState = stateField?.default;
	const stateSelect =
		states.length > 0
			? `<select name="state">${states.map((o) => `<option value="${escape(o)}"${o === defaultState ? ' selected' : ''}>${escape(humanizeState(o))}</option>`).join('')}</select>`
			: '';
	return `
		<section class="new-item-section">
			<details class="new-item">
				<summary>+ Add a new item</summary>
				<form method="POST" action="/r/${escape(shareCode)}/new-item">
					<label>Title</label>
					<input type="text" name="title" required maxlength="200" placeholder="What needs doing?" />
					<label>Description</label>
					<textarea name="body" rows="3" maxlength="10000" placeholder="Details (Markdown)"></textarea>
					${stateField ? `<label>State</label>${stateSelect}` : ''}
					<input type="hidden" name="display_name" value="${escape(displayName ?? '')}" />
					<button type="submit">Add item</button>
				</form>
			</details>
		</section>
	`;
}

function formatTimestamp(ts: unknown): string {
	if (ts instanceof Date) return ts.toISOString().slice(0, 16).replace('T', ' ');
	if (typeof ts === 'string') return ts.slice(0, 16).replace('T', ' ');
	if (typeof ts === 'number') return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
	return '';
}

function fieldChip(def: FieldDef, value: unknown): string {
	const label = def.label ?? def.key;
	let display = formatFieldValue(value);
	let tone: StateTone = 'neutral';
	if (def.type === 'single_select' && typeof value === 'string') {
		// "p0" / "p1" / "high" / "critical" → at-risk; "low" → neutral
		const v = value.toLowerCase();
		if (/(p0|critical|urgent|high|red)/.test(v)) tone = 'off-track';
		else if (/(p1|important|medium|orange)/.test(v)) tone = 'at-risk';
		else if (/(green|done|ok|low)/.test(v)) tone = 'on-track';
	}
	return `<span class="chip tone-${tone}"><span class="chip-label">${escape(label)}</span><span class="chip-value">${escape(display)}</span></span>`;
}

function statusPill(label: string, tone: StateTone): string {
	const icon = STATUS_ICONS[tone];
	return `<span class="status-pill tone-${tone}">${icon}<span>${escape(humanizeState(label))}</span></span>`;
}

// === Helpers =================================================================

function stateTone(state: string): StateTone {
	const s = state.toLowerCase();
	if (s.includes('done') || s.includes('shipped') || s.includes('closed') || s.includes('fixed') || s.includes('promoted')) return 'shipped';
	if (s.includes('progress') || s.includes('doing') || s.includes('active') || s.includes('shipping') || s.includes('exploring')) return 'on-track';
	if (s.includes('review') || s.includes('triaged') || s.includes('plan')) return 'at-risk';
	if (s.includes('new') || s.includes('draft') || s.includes('seed') || s.includes('todo')) return 'pending';
	if (s.includes('parked') || s.includes('wont') || s.includes('cut')) return 'neutral';
	return 'neutral';
}

function toneForList(meta: ListMeta, isClosed: boolean): StateTone {
	if (isClosed && meta.breakdown) {
		const counted = meta.breakdown.delivered.length + meta.breakdown.slipped.length;
		if (counted === 0) return 'neutral';
		const rate = meta.breakdown.delivered.length / counted;
		if (rate >= 0.8) return 'shipped';
		if (rate >= 0.5) return 'at-risk';
		return 'off-track';
	}
	return 'on-track';
}

function humanizeState(state: string): string {
	return state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeTemplate(slug: string | undefined): string {
	if (!slug) return 'List';
	switch (slug) {
		case 'release': return 'Release';
		case 'sprint': return 'Sprint';
		case 'backlog': return 'Backlog';
		case 'bugs': return 'Bugs';
		case 'todos': return 'Todos';
		case 'ideas': return 'Ideas';
		case 'shopping': return 'Shopping list';
		case 'wishlist': return 'Wishlist';
		case 'invite': return 'Invite list';
		case 'picnic': return 'Picnic';
		default: return slug.charAt(0).toUpperCase() + slug.slice(1);
	}
}

function formatDate(s: string): string {
	// Accept ISO date or datetime; render as YYYY-MM-DD or "Jan 1, 2026"
	if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
		const [y, m, d] = s.slice(0, 10).split('-').map(Number);
		if (!y || !m || !d) return s.slice(0, 10);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[m - 1]} ${d}, ${y}`;
	}
	return s;
}

function formatFieldValue(v: unknown): string {
	if (v === null || v === undefined) return '—';
	if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	return String(v);
}

function escape(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// === Icons ===================================================================

// Header brand uses the logo PNG hosted on the landing site; the diamond
// glyph constant is no longer needed (kept for the per-item card variants).

const DOWNLOAD_ICON = `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2v7M3.5 6.5L7 10l3.5-3.5M2.5 12h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHEVRON_DOWN_ICON = `<svg class="chev" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHECK_ICON = `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.5L6 10.5L11 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Inline script: dropdown close-on-outside-click, table row expansion, and
// kanban drag-and-drop with POST-to-redirect on drop. ~70 lines, no library.
function pageScript(shareCode: string): string {
	return `<script>
(function () {
	var SHARE_CODE = ${JSON.stringify(shareCode)};

	// === Dropdown close-on-outside-click + Escape =========================
	document.addEventListener('click', function (e) {
		document.querySelectorAll('details.export-dropdown[open]').forEach(function (d) {
			if (!d.contains(e.target)) d.removeAttribute('open');
		});
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			document.querySelectorAll('details.export-dropdown[open]').forEach(function (d) {
				d.removeAttribute('open');
			});
		}
	});

	// === Table: click row to expand the description =======================
	document.querySelectorAll('tr.item-row.has-detail').forEach(function (row) {
		row.addEventListener('click', function (e) {
			// Ignore clicks on interactive elements inside the row.
			if (e.target.closest('a, button, input, select, textarea, form')) return;
			row.classList.toggle('is-expanded');
		});
		row.style.cursor = 'pointer';
	});

	// === Shared AJAX helper for state changes (table dropdown + todo checkbox)
	function postStateChange(itemId, newState) {
		return fetch('/r/' + SHARE_CODE + '/state/' + encodeURIComponent(itemId), {
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'state=' + encodeURIComponent(newState),
		}).then(function (res) {
			if (!res.ok) throw new Error('HTTP ' + res.status);
			return res.json();
		});
	}

	function flashCell(el) {
		el.classList.add('is-saved');
		setTimeout(function () { el.classList.remove('is-saved'); }, 700);
	}

	// === Table: editable state dropdown (no page reload) ===================
	var TONE_RX = /tone-[a-z-]+/g;
	document.querySelectorAll('select.state-select').forEach(function (sel) {
		var lastValue = sel.value;
		sel.addEventListener('change', function () {
			var itemId = sel.dataset.itemId;
			var newState = sel.value;
			var opt = sel.options[sel.selectedIndex];
			var newTone = opt && opt.dataset.tone ? opt.dataset.tone : 'neutral';
			sel.classList.add('is-pending');
			sel.disabled = true;
			postStateChange(itemId, newState)
				.then(function () {
					sel.className = sel.className.replace(TONE_RX, '').trim() + ' tone-' + newTone;
					sel.classList.remove('is-pending');
					sel.disabled = false;
					lastValue = newState;
					flashCell(sel);
				})
				.catch(function (err) {
					console.error('state update failed', err);
					sel.value = lastValue;
					sel.classList.remove('is-pending');
					sel.disabled = false;
					alert('Could not update state: ' + err.message);
				});
		});
	});

	// === Todo: fetch-based checkbox toggle (no navigation) =================
	document.querySelectorAll('form.todo-toggle').forEach(function (form) {
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var input = form.querySelector('input[name="state"]');
			if (!input) return;
			var newState = input.value;
			var item = form.closest('.todo-item');
			var button = form.querySelector('.todo-checkbox');
			if (!button) return;
			var itemId = form.action.split('/').pop();
			button.disabled = true;
			button.classList.add('is-pending');
			postStateChange(decodeURIComponent(itemId), newState)
				.then(function (data) {
					button.disabled = false;
					button.classList.remove('is-pending');
					if (data.is_terminal) {
						button.classList.add('checked');
						button.innerHTML = ${JSON.stringify(CHECK_ICON)};
						item.classList.add('is-done');
						// Replay the completion animation from the top each time.
						item.classList.remove('just-completed');
						void item.offsetWidth; // force reflow so the animation restarts
						item.classList.add('just-completed');
						setTimeout(function () { item.classList.remove('just-completed'); }, 950);
					} else {
						item.classList.remove('is-done');
						item.classList.remove('just-completed');
						button.classList.remove('checked');
						button.innerHTML = '';
					}
					if (data.next_toggle_state) input.value = data.next_toggle_state;
				})
				.catch(function (err) {
					console.error('todo toggle failed', err);
					button.disabled = false;
					button.classList.remove('is-pending');
					alert('Could not toggle: ' + err.message);
				});
		});
	});

	// === Kanban: drag-and-drop + click-to-expand ===========================
	var dragging = null;
	var lastDragEndAt = 0;
	// Per-column counter tracking how deeply the cursor is nested in the column.
	// Without this, moving from the column body onto a child card fires
	// dragleave (target = column) and removes the highlight — only to be
	// re-added by the next dragover, causing visible flicker.
	var dragDepth = new WeakMap();

	document.querySelectorAll('.kanban-card').forEach(function (card) {
		// Click-to-expand: toggle the full body. Suppress if a drag just finished.
		card.addEventListener('click', function (e) {
			if (e.target.closest('a, button, input, select, textarea, form')) return;
			if (Date.now() - lastDragEndAt < 200) return;
			card.classList.toggle('is-expanded');
		});
		if (card.getAttribute('draggable') !== 'true') return;
		card.addEventListener('dragstart', function (e) {
			dragging = card.dataset.itemId;
			card.classList.add('is-dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', dragging || '');
			}
		});
		card.addEventListener('dragend', function () {
			card.classList.remove('is-dragging');
			dragging = null;
			lastDragEndAt = Date.now();
			document.querySelectorAll('.kanban-col.is-drop-target').forEach(function (c) {
				c.classList.remove('is-drop-target');
				dragDepth.set(c, 0);
			});
		});
	});

	document.querySelectorAll('.kanban-col[data-state]').forEach(function (col) {
		col.addEventListener('dragenter', function (e) {
			if (!dragging) return;
			e.preventDefault();
			var d = (dragDepth.get(col) || 0) + 1;
			dragDepth.set(col, d);
			col.classList.add('is-drop-target');
		});
		col.addEventListener('dragover', function (e) {
			if (!dragging) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		});
		col.addEventListener('dragleave', function () {
			var d = (dragDepth.get(col) || 1) - 1;
			dragDepth.set(col, d);
			if (d <= 0) {
				dragDepth.set(col, 0);
				col.classList.remove('is-drop-target');
			}
		});
		col.addEventListener('drop', function (e) {
			e.preventDefault();
			dragDepth.set(col, 0);
			col.classList.remove('is-drop-target');
			if (!dragging) return;
			var itemId = dragging;
			var newState = col.dataset.state;
			var newTone = col.dataset.tone || 'neutral';
			var card = document.querySelector('.kanban-card[data-item-id="' + (window.CSS && CSS.escape ? CSS.escape(itemId) : itemId) + '"]');
			if (!card) return;
			var oldCol = card.closest('.kanban-col');
			if (oldCol === col) return; // dropped back into the same column — nothing to do

			var newCardsContainer = col.querySelector('.kanban-col-cards');
			var oldCardsContainer = oldCol.querySelector('.kanban-col-cards');
			var oldTone = oldCol.dataset.tone || 'neutral';
			var oldNextSibling = card.nextElementSibling;
			var newCountEl = col.querySelector('.kanban-col-count');
			var oldCountEl = oldCol.querySelector('.kanban-col-count');

			// === Optimistic move ===
			var TONE_RX = /tone-[a-z-]+/g;
			card.className = card.className.replace(TONE_RX, '').trim() + ' tone-' + newTone;
			card.classList.add('is-pending');
			var existingPh = newCardsContainer.querySelector('.kanban-empty');
			if (existingPh) existingPh.remove();
			newCardsContainer.appendChild(card);
			if (newCountEl) newCountEl.textContent = String((parseInt(newCountEl.textContent, 10) || 0) + 1);
			if (oldCountEl) oldCountEl.textContent = String(Math.max(0, (parseInt(oldCountEl.textContent, 10) || 0) - 1));
			if (oldCardsContainer.children.length === 0) {
				var ph = document.createElement('div');
				ph.className = 'kanban-empty';
				ph.textContent = '—';
				oldCardsContainer.appendChild(ph);
			}

			postStateChange(itemId, newState)
				.then(function () {
					card.classList.remove('is-pending');
					flashCell(card);
				})
				.catch(function (err) {
					// Revert tone
					card.className = card.className.replace(TONE_RX, '').trim() + ' tone-' + oldTone;
					card.classList.remove('is-pending');
					// Revert position
					var ph2 = oldCardsContainer.querySelector('.kanban-empty');
					if (ph2) ph2.remove();
					if (oldNextSibling && oldNextSibling.parentNode === oldCardsContainer) {
						oldCardsContainer.insertBefore(card, oldNextSibling);
					} else {
						oldCardsContainer.appendChild(card);
					}
					// Re-add placeholder to target if it's empty
					if (newCardsContainer.children.length === 0) {
						var newPh = document.createElement('div');
						newPh.className = 'kanban-empty';
						newPh.textContent = '—';
						newCardsContainer.appendChild(newPh);
					}
					// Revert counts
					if (newCountEl) newCountEl.textContent = String(Math.max(0, (parseInt(newCountEl.textContent, 10) || 0) - 1));
					if (oldCountEl) oldCountEl.textContent = String((parseInt(oldCountEl.textContent, 10) || 0) + 1);
					console.error('kanban drop failed', err);
					alert('Could not move card: ' + err.message);
				});
		});
	});

	// === Kanban: column-header drag-to-reorder =============================
	// Edit-permission visitors can drag column headers to reorder the
	// columns. On drop we POST the new state-name order to
	// /r/<code>/state-order; server persists to list.meta_json.
	var headerDragging = null;
	var shareCodeRaw = document.querySelector('meta[name="share-code"]');
	var shareCode = shareCodeRaw ? shareCodeRaw.getAttribute('content') : null;
	document.querySelectorAll('.kanban-col-header[draggable="true"]').forEach(function (hdr) {
		hdr.addEventListener('dragstart', function (e) {
			headerDragging = hdr.dataset.state || null;
			hdr.classList.add('is-dragging-col');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('application/x-kanban-col', headerDragging || '');
			}
		});
		hdr.addEventListener('dragend', function () {
			hdr.classList.remove('is-dragging-col');
			headerDragging = null;
			document.querySelectorAll('.kanban-col.is-col-drop-target').forEach(function (c) {
				c.classList.remove('is-col-drop-target');
			});
		});
	});
	// Drop targets are the columns themselves — we read the new order from DOM
	// after rearranging.
	document.querySelectorAll('.kanban-col[data-state]').forEach(function (col) {
		col.addEventListener('dragover', function (e) {
			if (!headerDragging) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			col.classList.add('is-col-drop-target');
		});
		col.addEventListener('dragleave', function () {
			col.classList.remove('is-col-drop-target');
		});
		col.addEventListener('drop', function (e) {
			if (!headerDragging) return;
			e.preventDefault();
			col.classList.remove('is-col-drop-target');
			var draggedState = headerDragging;
			var targetState = col.dataset.state;
			if (!draggedState || !targetState || draggedState === targetState) return;
			var board = col.closest('.kanban-board');
			if (!board) return;
			var draggedCol = board.querySelector('.kanban-col[data-state="' + (window.CSS && CSS.escape ? CSS.escape(draggedState) : draggedState) + '"]');
			if (!draggedCol) return;
			// Move dragged column before the target (insert-before semantics).
			board.insertBefore(draggedCol, col);
			// Read the new order from the DOM, skipping the "no state" + "+ add"
			// columns which don't have data-state.
			var newOrder = Array.prototype.map.call(
				board.querySelectorAll('.kanban-col[data-state]'),
				function (c) { return c.dataset.state; }
			);
			if (!shareCode) {
				alert('Share code missing — cannot persist reorder.');
				return;
			}
			fetch('/r/' + encodeURIComponent(shareCode) + '/state-order', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'accept': 'application/json' },
				body: JSON.stringify({ options: newOrder }),
			}).then(function (r) {
				if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
				flashCell(col);
			}).catch(function (err) {
				console.error('column reorder failed', err);
				alert('Could not persist column order: ' + err.message);
			});
		});
	});
})();
</script>`;
}

function DIAMOND_SVG_LARGE(tone: StateTone): string {
	return `<svg class="hero-diamond tone-${tone}" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 4l20 20-20 20L4 24 24 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 14l10 10-10 10-10-10 10-10z" fill="currentColor" fill-opacity="0.15"/></svg>`;
}

function DIAMOND_SVG_MINI(tone: StateTone): string {
	return `<svg class="card-diamond tone-${tone}" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1l6 6-6 6-6-6 6-6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}

const STATUS_ICONS: Record<StateTone, string> = {
	'on-track': `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M5 8.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	'at-risk': `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
	'off-track': `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
	shipped: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.4"/><path d="M5 8.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	pending: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/></svg>`,
	neutral: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>`,
};

// === CSS =====================================================================

const LINEAR_CSS = `<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
	/* Backgrounds */
	--bg-0: #08090a;
	--bg-1: #0e0f11;
	--bg-2: #16181c;
	--bg-elev: #1a1c20;

	/* Borders */
	--border: #1c1e22;
	--border-bright: #26282d;

	/* Text */
	--fg: #e6e6e8;
	--fg-2: #b4b4bc;
	--fg-3: #7a7b82;
	--fg-4: #4e4f55;

	/* Status palette */
	--on-track: #4cb782;
	--on-track-glow: rgba(76, 183, 130, 0.18);
	--shipped: #4cb782;
	--shipped-glow: rgba(76, 183, 130, 0.22);
	--at-risk: #d4a017;
	--at-risk-glow: rgba(212, 160, 23, 0.18);
	--off-track: #e5484d;
	--off-track-glow: rgba(229, 72, 77, 0.18);
	--info: #3e9eff;
	--pending: #7a7b82;
	--neutral: #6a6a72;

	/* Brand */
	--accent: #a78bfa;
	--accent-glow: rgba(167, 139, 250, 0.18);

	/* Type */
	--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
	--font-mono: 'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace;

	/* Spacing scale — generous */
	--space-1: 4px;
	--space-2: 10px;
	--space-3: 16px;
	--space-4: 22px;
	--space-5: 32px;
	--space-6: 48px;
	--space-7: 72px;
	--space-8: 112px;
}

@supports (font-variation-settings: normal) {
	:root { --font-sans: 'Inter var', -apple-system, system-ui, sans-serif; }
}

html, body {
	background: var(--bg-0);
	color: var(--fg);
	font-family: var(--font-sans);
	-webkit-font-smoothing: antialiased;
	font-size: 14px;
	line-height: 1.55;
}
body { min-height: 100vh; display: flex; flex-direction: column; }
a { color: inherit; text-decoration: none; }
code { font-family: var(--font-mono); font-size: 0.86em; letter-spacing: -0.01em; }

/* Subtle ambient gradient */
.bg-gradient {
	position: fixed; inset: 0; pointer-events: none; z-index: 0;
	background:
		radial-gradient(60vw 50vh at 20% 0%, rgba(167, 139, 250, 0.07), transparent 60%),
		radial-gradient(50vw 40vh at 80% 100%, rgba(76, 183, 130, 0.05), transparent 60%);
}

header, footer, main { position: relative; z-index: 1; }

header {
	display: flex; align-items: center; justify-content: space-between;
	padding: var(--space-4) clamp(var(--space-4), 4vw, var(--space-7));
	border-bottom: 1px solid var(--border);
}
.brand {
	display: inline-flex; align-items: center; gap: 12px;
	font-weight: 600; font-size: 17px; color: var(--fg); letter-spacing: -0.015em;
}
.brand img { width: 36px; height: 36px; display: block; }
.ws { font-size: 13px; color: var(--fg-3); }

main {
	flex: 1;
	padding: clamp(var(--space-7), 8vw, var(--space-8)) clamp(var(--space-4), 5vw, var(--space-7));
	max-width: 1080px; margin: 0 auto; width: 100%;
}

/* === Hero === */
/* Kept deliberately compact so the list is visible almost immediately —
   small glyph, modest title, tight vertical rhythm. */
.hero { margin-bottom: var(--space-4); }
.hero-row { display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3); }
.hero-glyph { flex-shrink: 0; padding-top: 0; }
.hero-diamond {
	width: 28px; height: 28px;
	filter: drop-shadow(0 0 10px currentColor);
}
.hero-diamond.tone-shipped { color: var(--shipped); }
.hero-diamond.tone-on-track { color: var(--on-track); }
.hero-diamond.tone-at-risk { color: var(--at-risk); }
.hero-diamond.tone-off-track { color: var(--off-track); }
.hero-diamond.tone-neutral { color: var(--fg-3); filter: none; }

.hero-eyebrow {
	font-size: 11px; font-weight: 500;
	color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.06em;
	margin-bottom: 2px;
}
.hero-title {
	font-size: clamp(22px, 3vw, 30px);
	font-weight: 600; line-height: 1.15;
	letter-spacing: -0.02em;
	margin-bottom: 0;
	color: var(--fg);
}
.hero-desc {
	font-size: 14px; color: var(--fg-2); max-width: 64ch; line-height: 1.55;
	margin-top: var(--space-2);
}

.hero-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: 0; }

.meta-pill {
	display: inline-flex; align-items: center; gap: var(--space-2);
	padding: 4px var(--space-3);
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 999px;
	font-size: 12px;
}
.meta-pill-label { color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
.meta-pill-value { color: var(--fg); font-weight: 500; }
.meta-pill.tone-shipped { color: var(--shipped); border-color: rgba(76, 183, 130, 0.35); }
.meta-pill.tone-shipped .meta-pill-label { color: var(--shipped); opacity: 0.8; }

/* === Audit / Progress — compact single-strip + thin bar === */
.audit { display: flex; flex-direction: column; gap: 6px; }
.audit-strip {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: var(--space-3);
	font-size: 12.5px;
	color: var(--fg-3);
	line-height: 1.4;
}
.audit-rate { color: var(--fg-3); }
.audit-rate strong { color: var(--fg); font-weight: 600; font-size: 14px; margin-right: 4px; }
.audit-sep { width: 1px; height: 12px; background: var(--border-bright); align-self: center; }
.live-tag {
	padding: 1px 6px;
	background: var(--on-track-glow);
	color: var(--on-track);
	border-radius: 3px;
	font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
	text-transform: uppercase;
}

.audit-bar {
	display: flex; gap: 1px;
	height: 4px; border-radius: 2px; overflow: hidden;
	background: var(--bg-2);
}
.bar-seg { transition: width 0.3s ease; }
.seg-delivered { background: var(--shipped); box-shadow: 0 0 6px var(--shipped-glow); }
.seg-slipped { background: var(--at-risk); }
.seg-cut { background: var(--neutral); }
.seg-empty { background: transparent; }

.legend-item {
	display: inline-flex; align-items: baseline; gap: 4px;
	font-size: 12px;
}
.legend-item .dot {
	width: 6px; height: 6px; border-radius: 50%;
	display: inline-block;
	transform: translateY(-1px);
}
.legend-item.tone-shipped .dot { background: var(--shipped); }
.legend-item.tone-at-risk .dot { background: var(--at-risk); }
.legend-item.tone-neutral .dot { background: var(--neutral); }
.legend-count { font-weight: 600; color: var(--fg); }

/* Collapsible item-breakdown lives below as a tiny chevron link */
.audit-detail { margin-top: 2px; }
.audit-detail > summary {
	cursor: pointer; user-select: none;
	font-size: 11.5px; color: var(--fg-3); font-weight: 500;
	padding: 2px 0;
	list-style: none;
	display: inline-block;
}
.audit-detail > summary::-webkit-details-marker { display: none; }
.audit-detail > summary::before {
	content: '▸';
	margin-right: 4px; color: var(--fg-4);
	transition: transform 0.15s;
	display: inline-block;
}
.audit-detail[open] > summary::before { transform: rotate(90deg); color: var(--fg-3); }
.audit-detail > summary:hover { color: var(--fg); }
.audit-detail-body { margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }

.detail-block summary {
	cursor: pointer; user-select: none;
	font-size: 12.5px; color: var(--fg-2); font-weight: 500;
	padding: 4px 0;
	list-style: none;
}
.detail-block summary::-webkit-details-marker { display: none; }
.detail-block summary::before { content: '▸'; margin-right: var(--space-2); color: var(--fg-3); transition: transform 0.15s; display: inline-block; }
.detail-block[open] summary::before { transform: rotate(90deg); }
.detail-block .count {
	display: inline-block;
	margin-left: var(--space-2);
	padding: 0 5px;
	background: var(--bg-2);
	border-radius: 3px;
	font-size: 10.5px; color: var(--fg-3); font-weight: 500;
}
.detail-block ul { list-style: none; padding-left: var(--space-4); margin-top: 2px; }
.detail-block li { display: flex; gap: var(--space-3); padding: 2px 0; font-size: 12.5px; }
.detail-block .id { color: var(--fg-4); min-width: 60px; }
.detail-block .t { color: var(--fg-2); }

/* === Items: list view (default) === */
.items { display: flex; flex-direction: column; gap: var(--space-7); }
.items-view-kanban, .items-view-table, .items-view-todo { display: block; gap: 0; }

/* === Kanban view === */
.kanban-board {
	display: flex;
	gap: var(--space-3);
	overflow-x: auto;
	scroll-snap-type: x proximity;
	padding-bottom: var(--space-3);
	margin-bottom: var(--space-3);
}
.kanban-col {
	flex: 0 0 280px;
	min-width: 280px;
	scroll-snap-align: start;
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: var(--space-3);
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
.kanban-col-header { display: flex; align-items: center; justify-content: space-between; }
.kanban-col-header[draggable="true"] { cursor: grab; user-select: none; }
.kanban-col-header[draggable="true"]:active { cursor: grabbing; }
.kanban-col-header.is-dragging-col { opacity: 0.4; }
.kanban-col.is-col-drop-target { box-shadow: inset 3px 0 0 var(--accent); }
.kanban-col-count { font-family: var(--font-mono); font-size: 12px; color: var(--fg-3); }
.kanban-col-cards { display: flex; flex-direction: column; gap: var(--space-2); min-height: 40px; }

/* "+ add column" affordance (BL-022 open state enum) */
.kanban-col-add {
	background: transparent;
	border: 1px dashed var(--border-2);
	align-items: stretch;
}
.kanban-col-add details { width: 100%; }
.kanban-col-add summary {
	cursor: pointer; list-style: none;
	color: var(--fg-3); font-size: 13px;
	padding: var(--space-3); text-align: center;
	border-radius: 8px;
	transition: color 120ms ease, background 120ms ease;
}
.kanban-col-add summary::-webkit-details-marker { display: none; }
.kanban-col-add summary:hover { color: var(--accent); background: var(--bg-2); }
.kanban-col-add details[open] summary { color: var(--fg-2); }
.kanban-col-add form {
	display: flex; flex-direction: column; gap: var(--space-2);
	padding: var(--space-2) 0 0;
}
.kanban-col-add input[type="text"] {
	background: var(--bg-2); color: var(--fg-1);
	border: 1px solid var(--border-1); border-radius: 6px;
	padding: 6px 8px; font-size: 13px;
}
.kanban-col-add input[type="text"]:focus {
	outline: none; border-color: var(--accent);
}
.kanban-col-add button {
	background: var(--accent); color: #000; font-weight: 600;
	border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer;
	font-size: 12.5px;
}
.kanban-col-add button:hover { filter: brightness(1.1); }
.kanban-empty { color: var(--fg-4); font-size: 12px; font-style: italic; padding: var(--space-2); text-align: center; }
.kanban-card {
	background: var(--bg-2);
	border: 1px solid var(--border-bright);
	border-left-width: 3px;
	border-radius: 8px;
	padding: var(--space-3);
	display: flex;
	flex-direction: column;
	gap: 6px;
	transition: border-color 0.15s, transform 0.15s;
	cursor: default;
}
.kanban-card:hover { border-color: var(--fg-4); transform: translateY(-1px); }
.kanban-card.tone-shipped { border-left-color: var(--shipped); }
.kanban-card.tone-on-track { border-left-color: var(--on-track); }
.kanban-card.tone-at-risk { border-left-color: var(--at-risk); }
.kanban-card.tone-off-track { border-left-color: var(--off-track); }
.kanban-card.tone-pending, .kanban-card.tone-neutral { border-left-color: var(--fg-4); }
.kanban-card-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; }
.kanban-card-id { color: var(--fg-4); font-family: var(--font-mono); }
.kanban-card-comments { display: inline-flex; align-items: center; gap: 4px; color: var(--fg-3); }
.kanban-card-comments svg { width: 11px; height: 11px; }
.kanban-card-title { font-size: 13.5px; color: var(--fg); font-weight: 500; line-height: 1.4; }
.kanban-card-desc {
	font-size: 12.5px;
	color: var(--fg-3);
	line-height: 1.5;
	max-height: 4.5em; /* ~3 lines */
	overflow: hidden;
	position: relative;
	-webkit-mask-image: linear-gradient(to bottom, #000 60%, transparent);
	mask-image: linear-gradient(to bottom, #000 60%, transparent);
}
.kanban-card-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.kanban-card-chips .chip { font-size: 10.5px; padding: 1px 6px; }

/* Card interactions */
.kanban-card {
	cursor: pointer;
	transition: border-color 0.15s, transform 0.15s, opacity 0.18s, box-shadow 0.3s;
}
.kanban-card[draggable="true"] { cursor: grab; }
.kanban-card.is-dragging { opacity: 0.4; cursor: grabbing; }
.kanban-card.is-pending { opacity: 0.55; }
.kanban-card.is-saved { animation: pulse-accent 0.6s ease; }

/* Click-to-expand: remove the body line-clamp + show full chips */
.kanban-card.is-expanded .kanban-card-desc {
	max-height: none;
	overflow: visible;
	-webkit-mask-image: none;
	mask-image: none;
}

/* Drop target highlight — outline + background only (no layout-affecting
   pseudo-element, which previously caused flicker as the column resized). */
.kanban-col {
	transition: background-color 0.12s ease, border-color 0.12s ease;
}
.kanban-col.is-drop-target {
	background: rgba(167, 139, 250, 0.06);
	border-color: var(--accent);
	box-shadow: 0 0 0 1px var(--accent-glow), inset 0 0 20px -8px var(--accent-glow);
}

/* === Table view === */
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-1); }
.items-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
.items-table thead th {
	text-align: left;
	font-size: 11px;
	font-weight: 600;
	color: var(--fg-3);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	padding: var(--space-3) var(--space-4);
	border-bottom: 1px solid var(--border);
	background: var(--bg-1);
	position: sticky; top: 0; z-index: 2;
}
.items-table tbody td {
	padding: 11px var(--space-4);
	border-bottom: 1px solid var(--border);
	color: var(--fg-2);
	vertical-align: middle;
}
.items-table tbody tr:last-child td { border-bottom: none; }
.items-table tbody tr:hover { background: var(--bg-2); }
/* ID column: shrink to its content + tighter padding so the title gets the room. */
.items-table .th-id, .items-table .td-id {
	width: 1%;
	white-space: nowrap;
	padding-left: var(--space-3);
	padding-right: var(--space-2);
}
.items-table .td-id code { color: var(--fg-4); font-size: 12px; }
.items-table .td-title { color: var(--fg); font-weight: 500; }
.items-table .td-empty { color: var(--fg-4); }
.items-table .td-check { color: var(--shipped); }
.items-table .th-_expand, .items-table .td-expand { width: 28px; padding-left: var(--space-3); padding-right: 0; }
.items-table .td-expand svg { width: 11px; height: 11px; color: var(--fg-4); transition: transform 0.15s; }
.items-table tr.item-row.is-expanded .td-expand svg { transform: rotate(180deg); color: var(--accent); }
.items-table .th-_description, .items-table .td-desc {
	color: var(--fg-3);
	max-width: 340px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
/* Inline markdown preview inside table description cell — keep formatting
   visible without blowing out the single-line constraint. */
.items-table .td-desc.prose-inline strong { color: var(--fg-1); font-weight: 600; }
.items-table .td-desc.prose-inline em { font-style: italic; }
.items-table .td-desc.prose-inline code {
	font-family: var(--font-mono); font-size: 0.9em;
	background: var(--bg-2); padding: 0 4px; border-radius: 3px;
	color: var(--fg-1);
}
.items-table .td-desc.prose-inline a {
	color: var(--accent); text-decoration: underline; text-underline-offset: 2px;
}
.items-table .item-row.is-expanded { background: var(--bg-2); }
.items-table .detail-row { display: none; }
.items-table .item-row.is-expanded + .detail-row { display: table-row; }
.items-table .detail-row td {
	padding: 0;
	background: var(--bg-2);
	border-bottom: 1px solid var(--border);
}
.items-table .detail-body {
	padding: var(--space-3) var(--space-4) var(--space-4) calc(var(--space-3) + 28px);
	color: var(--fg-2);
	font-size: 13px;
	line-height: 1.6;
	white-space: pre-wrap;
	border-left: 2px solid var(--accent);
	margin-left: var(--space-4);
}
.items-table .tag,
.items-table .state-select {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 4px;
	font-size: 11px;
	font-weight: 500;
	background: var(--bg-2);
	border: 1px solid var(--border);
}
.items-table .state-select {
	font-family: var(--font-sans);
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	padding: 2px 22px 2px 8px;
	background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
	background-position: calc(100% - 9px) 50%, calc(100% - 5px) 50%;
	background-size: 4px 4px;
	background-repeat: no-repeat;
	transition: filter 0.12s ease, opacity 0.12s ease;
}
.items-table .state-select:hover { filter: brightness(1.1); }
.items-table .state-select:focus { outline: 1px solid currentColor; outline-offset: 1px; }
.items-table .state-select.is-pending { opacity: 0.5; cursor: progress; }
.items-table .state-select option { background: var(--bg-elev); color: var(--fg); font-family: var(--font-sans); }
.items-table .tag.tone-shipped,
.items-table .state-select.tone-shipped { color: var(--shipped); background: rgba(76, 183, 130, 0.08); border-color: rgba(76, 183, 130, 0.3); }
.items-table .tag.tone-on-track,
.items-table .state-select.tone-on-track { color: var(--on-track); background: rgba(76, 183, 130, 0.06); border-color: rgba(76, 183, 130, 0.25); }
.items-table .tag.tone-at-risk,
.items-table .state-select.tone-at-risk { color: var(--at-risk); background: rgba(212, 160, 23, 0.06); border-color: rgba(212, 160, 23, 0.25); }
.items-table .tag.tone-off-track,
.items-table .state-select.tone-off-track { color: var(--off-track); background: rgba(229, 72, 77, 0.06); border-color: rgba(229, 72, 77, 0.25); }
.items-table .tag.tone-pending,
.items-table .state-select.tone-pending,
.items-table .tag.tone-neutral,
.items-table .state-select.tone-neutral { color: var(--fg-3); }

/* === Todo view === */
.todo-list {
	list-style: none;
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 12px;
	overflow: hidden;
}
.todo-item {
	display: flex;
	align-items: flex-start;
	gap: var(--space-3);
	padding: var(--space-3) var(--space-4);
	border-bottom: 1px solid var(--border);
	transition: background 0.12s;
}
.todo-item:last-child { border-bottom: none; }
.todo-item:hover { background: var(--bg-2); }
.todo-toggle { margin-top: 2px; }
.todo-checkbox {
	width: 18px; height: 18px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1.5px solid var(--fg-4);
	border-radius: 4px;
	color: var(--shipped);
	cursor: pointer;
	padding: 0;
	transition: border-color 0.15s, background 0.15s;
}
.todo-checkbox svg { width: 13px; height: 13px; }
.todo-checkbox svg path { stroke-width: 2.2; } /* bolder tick — legible on mobile */
.todo-checkbox:hover { border-color: var(--shipped); background: rgba(76, 183, 130, 0.06); }
/* Checked: SOLID green fill + WHITE tick. The old faint-green-on-green tick was
   invisible (esp. on mobile) — this is unmistakable. */
.todo-checkbox.checked {
	background: var(--shipped);
	border-color: var(--shipped);
	color: #fff;
}
.todo-checkbox.static { cursor: default; }
.todo-checkbox.is-pending { opacity: 0.5; cursor: progress; }
.todo-checkbox.is-saved,
.items-table .state-select.is-saved {
	animation: pulse-accent 0.6s ease;
}
@keyframes pulse-accent {
	0% { box-shadow: 0 0 0 0 var(--accent-glow); }
	40% { box-shadow: 0 0 0 6px var(--accent-glow); }
	100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0); }
}
.todo-body { flex: 1; min-width: 0; }
.todo-head { display: flex; align-items: center; gap: var(--space-2); }
.todo-title {
	color: var(--fg); font-weight: 500; font-size: 14px;
	position: relative; transition: color 0.3s ease 0.18s;
}
/* Animated strikethrough: a line that draws left→right, sequenced just after
   the row flash (transition-delay). Already-done items on load show it
   statically (no transition fires on initial render). */
.todo-title::after {
	content: ''; position: absolute; left: 0; top: 52%;
	width: 100%; height: 1.5px; background: currentColor;
	transform: scaleX(0); transform-origin: left center;
	transition: transform 0.32s cubic-bezier(.4,0,.2,1) 0.18s;
	pointer-events: none;
}
.todo-id { color: var(--fg-4); font-size: 11px; }
.todo-item.is-done .todo-title { color: var(--fg-3); }
.todo-item.is-done .todo-title::after { transform: scaleX(1); }
.todo-item.is-done .todo-desc { color: var(--fg-4); }

/* "Atemberaubend": the whole row flashes green on completion, the checkbox
   pops, then settles. Driven by a transient .just-completed class. */
.todo-item.just-completed { animation: todo-complete-row 0.9s cubic-bezier(.2,.7,.2,1); }
.todo-item.just-completed .todo-checkbox { animation: todo-complete-pop 0.55s cubic-bezier(.34,1.56,.64,1); }
@keyframes todo-complete-row {
	0%   { background: transparent; box-shadow: inset 0 0 0 0 transparent; }
	18%  { background: rgba(76, 183, 130, 0.28); box-shadow: inset 3px 0 0 0 var(--shipped), 0 0 26px -6px var(--shipped-glow); }
	55%  { background: rgba(76, 183, 130, 0.12); }
	100% { background: transparent; box-shadow: inset 0 0 0 0 transparent; }
}
@keyframes todo-complete-pop {
	0%   { transform: scale(1); }
	40%  { transform: scale(1.28) rotate(-4deg); }
	70%  { transform: scale(0.94); }
	100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
	.todo-item.just-completed,
	.todo-item.just-completed .todo-checkbox { animation: none; }
	.todo-title::after { transition: none; }
}
.todo-desc { color: var(--fg-3); font-size: 13px; margin-top: 2px; line-height: 1.5; }
.todo-state { margin-top: 6px; }

@media (max-width: 700px) {
	.view-switcher .view-btn span { display: none; }
	.view-set-default { width: 100%; margin-left: 0; margin-top: var(--space-2); }
	.kanban-col { flex-basis: 240px; min-width: 240px; }
}

.group-header {
	display: flex; align-items: center; gap: var(--space-3);
	margin-bottom: var(--space-4);
	padding-bottom: var(--space-3);
	border-bottom: 1px solid var(--border);
}
.group-count {
	margin-left: auto;
	font-family: var(--font-mono); font-size: 12px;
	color: var(--fg-3);
}

.status-pill {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 4px 10px;
	border-radius: 999px;
	font-size: 12px; font-weight: 500;
	background: var(--bg-1);
	border: 1px solid var(--border);
	color: var(--fg-2);
}
.status-pill svg { width: 12px; height: 12px; }
.status-pill.tone-on-track { color: var(--on-track); border-color: rgba(76, 183, 130, 0.3); background: rgba(76, 183, 130, 0.06); }
.status-pill.tone-shipped { color: var(--shipped); border-color: rgba(76, 183, 130, 0.4); background: rgba(76, 183, 130, 0.08); box-shadow: 0 0 12px -2px var(--shipped-glow); }
.status-pill.tone-at-risk { color: var(--at-risk); border-color: rgba(212, 160, 23, 0.3); background: rgba(212, 160, 23, 0.06); }
.status-pill.tone-off-track { color: var(--off-track); border-color: rgba(229, 72, 77, 0.3); background: rgba(229, 72, 77, 0.06); }
.status-pill.tone-pending { color: var(--fg-3); }
.status-pill.tone-neutral { color: var(--fg-3); }

.cards { display: flex; flex-direction: column; gap: var(--space-2); }

.card {
	position: relative;
	display: flex;
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 10px;
	overflow: hidden;
	transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.card:hover {
	border-color: var(--border-bright);
	transform: translateY(-1px);
}
.card-accent { width: 3px; flex-shrink: 0; }
.card.tone-shipped .card-accent { background: var(--shipped); box-shadow: 0 0 12px var(--shipped-glow); }
.card.tone-shipped:hover { box-shadow: 0 0 0 1px rgba(76, 183, 130, 0.35), 0 0 28px -6px var(--shipped-glow); }
.card.tone-on-track .card-accent { background: var(--on-track); }
.card.tone-on-track:hover { box-shadow: 0 0 0 1px rgba(76, 183, 130, 0.25), 0 0 24px -8px var(--on-track-glow); }
.card.tone-at-risk .card-accent { background: var(--at-risk); }
.card.tone-at-risk:hover { box-shadow: 0 0 0 1px rgba(212, 160, 23, 0.25), 0 0 24px -8px var(--at-risk-glow); }
.card.tone-off-track .card-accent { background: var(--off-track); }
.card.tone-pending .card-accent { background: var(--fg-4); }
.card.tone-neutral .card-accent { background: var(--fg-4); }

.card-body { padding: var(--space-4) var(--space-5); flex: 1; min-width: 0; }
.card-head { gap: var(--space-3); }
.card-head { display: flex; align-items: center; gap: var(--space-3); }
.card-diamond { width: 12px; height: 12px; flex-shrink: 0; }
.card-diamond.tone-shipped { color: var(--shipped); }
.card-diamond.tone-on-track { color: var(--on-track); }
.card-diamond.tone-at-risk { color: var(--at-risk); }
.card-diamond.tone-off-track { color: var(--off-track); }
.card-diamond.tone-pending, .card-diamond.tone-neutral { color: var(--fg-3); }
.card-title { font-size: 15px; font-weight: 500; color: var(--fg); flex: 1; min-width: 0; }
.card-id { color: var(--fg-4); font-size: 11px; font-family: var(--font-mono); flex-shrink: 0; opacity: 0.8; }

.card-desc {
	color: var(--fg-2); font-size: 13.5px; line-height: 1.6;
	margin-top: var(--space-2);
}

.card-fields { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }

/* Attachments (BL-021 follow-on) — inline thumbnails + chips for non-images */
.attachments {
	display: flex; flex-wrap: wrap; gap: var(--space-2);
	margin-top: var(--space-3);
}
.attachments.att-kanban { gap: 4px; margin-top: 6px; }
.att-img-wrap {
	display: inline-block;
	border-radius: 8px; overflow: hidden;
	border: 1px solid var(--border-1);
	background: var(--bg-2);
	transition: border-color 120ms ease, transform 120ms ease;
}
.att-img-wrap:hover { border-color: var(--border-2); transform: translateY(-1px); }
.att-img-wrap.att-card .att-img {
	display: block;
	max-width: 220px; max-height: 160px;
	width: auto; height: auto;
	object-fit: cover;
}
.att-img-wrap.att-kanban .att-img {
	display: block;
	max-width: 100%; max-height: 96px;
	width: 100%; height: auto;
	object-fit: cover;
}
.att-chip {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 3px 8px;
	background: var(--bg-2); color: var(--fg-2);
	border-radius: 6px;
	font-size: 11.5px;
	text-decoration: none;
	border: 1px solid var(--border-1);
}
.att-chip:hover { background: var(--bg-3); border-color: var(--border-2); }
.att-chip .att-name { font-weight: 500; }
.att-chip .att-size {
	color: var(--fg-3); font-family: var(--font-mono); font-size: 10.5px;
}
.att-chip.att-missing { color: var(--fg-3); font-style: italic; cursor: default; }
.attachments.att-kanban .att-chip { font-size: 10.5px; padding: 2px 6px; }

.chip {
	display: inline-flex; align-items: center; gap: 6px;
	padding: 2px 8px;
	background: var(--bg-2); border-radius: 6px;
	font-size: 11.5px;
}
.chip-label { color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; font-size: 10px; }
.chip-value { color: var(--fg-2); font-family: var(--font-mono); }
.chip.tone-on-track { background: rgba(76, 183, 130, 0.08); }
.chip.tone-on-track .chip-value { color: var(--on-track); }
.chip.tone-at-risk { background: rgba(212, 160, 23, 0.08); }
.chip.tone-at-risk .chip-value { color: var(--at-risk); }
.chip.tone-off-track { background: rgba(229, 72, 77, 0.08); }
.chip.tone-off-track .chip-value { color: var(--off-track); }

.empty { color: var(--fg-3); font-style: italic; padding: var(--space-6) 0; }

/* === Footer === */
footer {
	border-top: 1px solid var(--border);
	padding: var(--space-4) clamp(var(--space-4), 4vw, var(--space-7));
	display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3);
	font-size: 12px; color: var(--fg-3);
}
footer a { color: var(--fg-3); transition: color 0.15s; }
footer a:hover { color: var(--fg); }
footer code { color: var(--fg-2); }
footer .dot { display: inline-block; width: 3px; height: 3px; border-radius: 50%; background: var(--fg-4); margin: 0 var(--space-2); vertical-align: middle; }
footer .links { display: flex; gap: var(--space-4); }

/* === Header capabilities (top bar, right side) === */
.header-meta {
	display: inline-flex;
	align-items: center;
	gap: var(--space-4);
	flex-wrap: wrap;
	justify-content: flex-end;
}
.header-caps {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}
.header-caps-label {
	font-size: 10px;
	font-weight: 600;
	color: var(--fg-4);
	text-transform: uppercase;
	letter-spacing: 0.08em;
	margin-right: 2px;
}
.header-signas {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-left: 6px;
}
.header-signas input {
	font: inherit;
	font-family: var(--font-sans);
	padding: 4px 10px;
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 999px;
	color: var(--fg);
	font-size: 12px;
	width: 130px;
	transition: width 0.15s ease, border-color 0.15s ease;
}
.header-signas input:focus {
	outline: none;
	width: 180px;
	border-color: var(--accent);
	box-shadow: 0 0 0 1px var(--accent-glow);
}
.header-signas button {
	font: inherit;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	padding: 0;
	background: transparent;
	border: 1px solid var(--border);
	border-radius: 999px;
	color: var(--fg-3);
	transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.header-signas button:hover {
	color: var(--accent);
	border-color: var(--accent);
	background: rgba(167, 139, 250, 0.06);
}
.header-signas button svg { width: 12px; height: 12px; }

/* === Hero meta row: list metadata + view switcher + export dropdown === */
.hero-meta-row {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-3);
	align-items: center;
	justify-content: space-between;
	margin-bottom: var(--space-3);
}
.hero-meta-row .hero-meta { margin-bottom: 0; flex: 1; min-width: 0; }
.hero-controls { display: inline-flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }

/* === View switcher (segmented control) === */
.view-switcher {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 3px;
	background: var(--bg-1);
	border: 1px solid var(--border-bright);
	border-radius: 999px;
}
.view-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 11px;
	border-radius: 999px;
	color: var(--fg-3);
	font-size: 12.5px;
	font-weight: 500;
	transition: color 0.15s, background 0.15s;
}
.view-btn svg { width: 13px; height: 13px; opacity: 0.85; }
.view-btn:hover { color: var(--fg); background: var(--bg-2); }
.view-btn.is-active {
	color: var(--accent);
	background: rgba(167, 139, 250, 0.08);
}
.view-btn.is-active svg { opacity: 1; }
.view-btn.is-default::after {
	content: '';
	display: inline-block;
	width: 4px; height: 4px;
	border-radius: 50%;
	background: currentColor;
	opacity: 0.55;
	margin-left: 2px;
}
.view-set-default { display: inline-flex; align-items: center; margin-left: 4px; }
.view-set-default button {
	font: inherit;
	cursor: pointer;
	padding: 5px 11px;
	background: transparent;
	border: 1px dashed var(--border-bright);
	border-radius: 999px;
	color: var(--fg-3);
	font-size: 11.5px;
	font-weight: 500;
	transition: color 0.15s, border-color 0.15s;
}
.view-set-default button:hover { color: var(--accent); border-color: var(--accent); }

/* === Export dropdown === */
.export-dropdown { position: relative; }
.export-dropdown summary {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 7px 12px 7px 14px;
	background: var(--bg-1);
	border: 1px solid var(--border-bright);
	border-radius: 999px;
	color: var(--fg-2);
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	list-style: none;
	transition: border-color 0.15s, color 0.15s, background 0.15s;
	user-select: none;
}
.export-dropdown summary::-webkit-details-marker { display: none; }
.export-dropdown summary:hover {
	color: var(--accent);
	border-color: var(--accent);
	background: rgba(167, 139, 250, 0.06);
}
.export-dropdown summary svg { width: 13px; height: 13px; opacity: 0.85; }
.export-dropdown summary .chev { width: 11px; height: 11px; transition: transform 0.18s ease; opacity: 0.65; }
.export-dropdown[open] summary {
	color: var(--accent);
	border-color: var(--accent);
	background: rgba(167, 139, 250, 0.08);
}
.export-dropdown[open] summary .chev { transform: rotate(180deg); }
.export-menu {
	position: absolute;
	top: calc(100% + 8px);
	right: 0;
	min-width: 240px;
	padding: 6px;
	background: var(--bg-elev);
	border: 1px solid var(--border-bright);
	border-radius: 10px;
	box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--bg-0);
	z-index: 20;
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.export-menu-item {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	padding: 8px 12px;
	border-radius: 6px;
	color: var(--fg-2);
	font-size: 13px;
	transition: background 0.12s, color 0.12s;
}
.export-menu-item:hover { background: var(--bg-2); color: var(--fg); }
.export-menu-item .ext-tag {
	font-family: var(--font-mono);
	font-size: 10px;
	font-weight: 600;
	padding: 2px 6px;
	background: var(--bg-2);
	border-radius: 4px;
	color: var(--fg-3);
	letter-spacing: 0.04em;
}
.export-menu-item:hover .ext-tag { color: var(--accent); background: rgba(167, 139, 250, 0.1); }
.export-menu-item .ext-name { font-size: 13px; }

/* Click-outside-to-close is handled by a tiny inline <script> at the bottom
   of the body — see CLOSE_ON_OUTSIDE_CLICK_SCRIPT below. Native <details>
   doesn't auto-close, so JS is required. */

@media (max-width: 700px) {
	header { flex-wrap: wrap; gap: var(--space-3); }
	.header-meta { width: 100%; justify-content: flex-start; }
	.header-signas input { width: 110px; }
	.header-signas input:focus { width: 140px; }
	.hero-meta-row { flex-direction: column; align-items: flex-start; }
	.export-menu { right: auto; left: 0; }
}

/* === Flash messages === */
.flash {
	padding: var(--space-3) var(--space-4);
	margin-bottom: var(--space-5);
	border-radius: 10px;
	font-size: 13.5px;
	font-weight: 500;
	border: 1px solid var(--border);
}
.flash-ok {
	color: var(--shipped);
	background: rgba(76, 183, 130, 0.08);
	border-color: rgba(76, 183, 130, 0.3);
	box-shadow: 0 0 24px -8px var(--shipped-glow);
}
.flash-error {
	color: var(--off-track);
	background: rgba(229, 72, 77, 0.08);
	border-color: rgba(229, 72, 77, 0.3);
}

/* === Capability pills (used inside the action bar) === */
.cap {
	display: inline-flex;
	align-items: center;
	padding: 4px 12px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 500;
	background: var(--bg-2);
	border: 1px solid var(--border);
	color: var(--fg-2);
}
.cap-read { color: var(--fg-3); }
.cap-comment {
	color: var(--info);
	background: rgba(62, 158, 255, 0.08);
	border-color: rgba(62, 158, 255, 0.3);
}
.cap-edit {
	color: var(--accent);
	background: rgba(167, 139, 250, 0.08);
	border-color: rgba(167, 139, 250, 0.3);
	box-shadow: 0 0 12px -4px var(--accent-glow);
}
.cap-create {
	color: var(--shipped);
	background: rgba(76, 183, 130, 0.08);
	border-color: rgba(76, 183, 130, 0.3);
}


/* === Edit-state form (intentionally quiet) === */
.edit-state {
	margin-top: var(--space-3);
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	font-size: 12px;
	color: var(--fg-3);
}
.edit-state label {
	color: var(--fg-4);
	font-size: 11px;
	font-weight: 400;
}
.edit-state select {
	font: inherit;
	font-family: var(--font-sans);
	padding: 2px 22px 2px 6px;
	background: transparent;
	border: none;
	border-bottom: 1px dashed var(--border-bright);
	border-radius: 0;
	color: var(--fg-2);
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	background-image: linear-gradient(45deg, transparent 50%, var(--fg-4) 50%), linear-gradient(135deg, var(--fg-4) 50%, transparent 50%);
	background-position: calc(100% - 9px) 50%, calc(100% - 5px) 50%;
	background-size: 4px 4px, 4px 4px;
	background-repeat: no-repeat;
	transition: color 0.15s, border-color 0.15s;
}
.edit-state select:hover { color: var(--fg); border-bottom-color: var(--fg-3); }
.edit-state select:focus { outline: none; color: var(--fg); border-bottom-color: var(--accent); }
.edit-state button {
	font: inherit;
	font-family: var(--font-sans);
	cursor: pointer;
	padding: 2px 4px;
	background: transparent;
	border: none;
	color: var(--fg-3);
	font-size: 12px;
	font-weight: 400;
	transition: color 0.15s;
}
.edit-state button:hover { color: var(--accent); }

/* === Comment form === */
.comment-form {
	margin-top: var(--space-3);
	font-size: 13px;
}
.comment-form summary {
	cursor: pointer;
	color: var(--fg-3);
	padding: var(--space-2) 0;
	list-style: none;
	font-weight: 500;
}
.comment-form summary::-webkit-details-marker { display: none; }
.comment-form summary::before {
	content: '+';
	margin-right: var(--space-2);
	color: var(--fg-3);
	display: inline-block;
	transition: transform 0.15s;
}
.comment-form[open] summary::before { transform: rotate(45deg); }
.comment-form summary:hover { color: var(--fg); }
.comment-form form { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); }
.comment-form textarea,
.comment-form input[type=text] {
	font: inherit;
	font-family: var(--font-sans);
	padding: var(--space-3);
	background: var(--bg-2);
	border: 1px solid var(--border);
	border-radius: 8px;
	color: var(--fg);
	resize: vertical;
}
.comment-form textarea:focus,
.comment-form input:focus {
	outline: none;
	border-color: var(--accent);
	box-shadow: 0 0 0 1px var(--accent-glow);
}
.comment-form-row { display: flex; gap: var(--space-2); }
.comment-form-row input { flex: 1; }
.comment-form button[type=submit] {
	cursor: pointer;
	padding: 8px 16px;
	background: var(--accent);
	border: 1px solid var(--accent);
	border-radius: 8px;
	color: #1a0b3d;
	font: inherit;
	font-family: var(--font-sans);
	font-weight: 500;
	transition: filter 0.15s;
}
.comment-form button[type=submit]:hover { filter: brightness(1.1); }

/* === Comments display === */
.comments {
	margin-top: var(--space-3);
	padding-top: var(--space-3);
	border-top: 1px solid var(--border);
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
.comment { font-size: 13px; line-height: 1.55; }
.comment-meta {
	display: flex; gap: var(--space-2); align-items: baseline;
	margin-bottom: 2px;
	font-size: 11.5px;
}
.comment-author { font-weight: 600; color: var(--fg-2); }
.comment-meta time { color: var(--fg-4); font-family: var(--font-mono); font-size: 11px; }
.comment-body { color: var(--fg-2); }

/* === Markdown prose === */
/* Applied to item bodies + comment bodies. Tight, content-density-friendly. */
.prose { color: var(--fg-2); line-height: 1.55; }
.prose > :first-child { margin-top: 0; }
.prose > :last-child { margin-bottom: 0; }
.prose p { margin: 0 0 var(--space-2); }
.prose strong { color: var(--fg-1); font-weight: 600; }
.prose em { font-style: italic; }
.prose code {
	font-family: var(--font-mono); font-size: 0.9em;
	background: var(--bg-2); padding: 1px 5px; border-radius: 4px;
	color: var(--fg-1);
}
.prose pre {
	background: var(--bg-2); padding: var(--space-2) var(--space-3);
	border-radius: 6px; overflow-x: auto;
	margin: var(--space-2) 0;
	border: 1px solid var(--border-1);
}
.prose pre code { background: transparent; padding: 0; }
.prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.prose a:hover { color: var(--accent-bright); }
.prose ul, .prose ol { margin: var(--space-2) 0; padding-left: 1.5em; }
.prose li { margin: 2px 0; }
.prose blockquote {
	border-left: 3px solid var(--border-2);
	margin: var(--space-2) 0;
	padding: 2px 0 2px var(--space-3);
	color: var(--fg-3);
}
.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
	margin: var(--space-3) 0 var(--space-2);
	color: var(--fg-1); font-weight: 600;
	line-height: 1.25;
}
.prose h1 { font-size: 18px; }
.prose h2 { font-size: 16px; }
.prose h3 { font-size: 14.5px; }
.prose h4, .prose h5, .prose h6 { font-size: 13px; }
.prose hr {
	border: 0; border-top: 1px solid var(--border-1);
	margin: var(--space-3) 0;
}
.prose img {
	max-width: 100%; height: auto;
	border-radius: 6px; border: 1px solid var(--border-1);
	margin: var(--space-2) 0;
}
/* Compact mode for kanban / todo where space is tight */
.kanban-card-desc.prose, .todo-desc.prose { font-size: 12.5px; }
.kanban-card-desc.prose p { margin: 0 0 4px; }
.kanban-card-desc.prose code { font-size: 0.85em; }
.kanban-card-desc.prose pre { display: none; } /* code blocks too noisy in card */
.kanban-card-desc.prose h1, .kanban-card-desc.prose h2, .kanban-card-desc.prose h3 {
	font-size: 13px; margin: 4px 0 2px;
}

/* === New-item form === */
.new-item-section { margin-top: var(--space-7); }
.new-item {
	background: var(--bg-1);
	border: 1px dashed var(--border-bright);
	border-radius: 12px;
	padding: var(--space-4) var(--space-5);
	transition: border-color 0.15s, box-shadow 0.15s;
}
.new-item:hover {
	border-color: var(--accent);
	box-shadow: 0 0 28px -8px var(--accent-glow);
}
.new-item summary {
	cursor: pointer;
	font-weight: 500;
	color: var(--accent);
	list-style: none;
	padding: var(--space-2) 0;
}
.new-item summary::-webkit-details-marker { display: none; }
.new-item form {
	margin-top: var(--space-3);
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
.new-item label {
	font-size: 11px;
	font-weight: 600;
	color: var(--fg-3);
	text-transform: uppercase;
	letter-spacing: 0.06em;
}
.new-item input[type=text],
.new-item textarea,
.new-item select {
	font: inherit;
	font-family: var(--font-sans);
	padding: var(--space-3);
	background: var(--bg-2);
	border: 1px solid var(--border);
	border-radius: 8px;
	color: var(--fg);
}
.new-item input:focus,
.new-item textarea:focus,
.new-item select:focus {
	outline: none;
	border-color: var(--accent);
	box-shadow: 0 0 0 1px var(--accent-glow);
}
.new-item button {
	cursor: pointer;
	padding: 10px 20px;
	background: var(--accent);
	border: 1px solid var(--accent);
	border-radius: 8px;
	color: #1a0b3d;
	font: inherit;
	font-family: var(--font-sans);
	font-weight: 500;
	align-self: flex-start;
	transition: filter 0.15s;
}
.new-item button:hover { filter: brightness(1.1); }

@media (max-width: 600px) {
	.hero-title { font-size: 28px; }
	.hero-row { gap: var(--space-3); }
	.hero-diamond { width: 36px; height: 36px; }
	.card-head { flex-wrap: wrap; }
	.card-id { font-size: 11px; }
	.edit-state { flex-wrap: wrap; }
}
</style>`;
