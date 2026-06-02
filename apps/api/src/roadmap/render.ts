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
import type { FieldDef, ListMeta, StakeholderPermission } from '@blitzlist/db';

type ListRow = typeof lists.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type TemplateRow = typeof templates.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type CommentRow = typeof comments.$inferSelect;

export type RenderInput = {
	workspace: WorkspaceRow;
	list: ListRow;
	template: TemplateRow | null;
	items: ItemRow[];
	/** comments keyed by item_id (latest 10 per item). */
	commentsByItem?: Record<string, CommentRow[]>;
	share_code: string;
	view_url: string;
	/** Granted permissions for this visitor (from the share code). */
	permissions: StakeholderPermission[];
	/** Display name persisted in cookie, used to prefill the comment form. */
	display_name?: string;
	/** Banner message to show at top (e.g. after a form submit). */
	flash?: { kind: 'ok' | 'error'; message: string };
};

type StateTone = 'on-track' | 'at-risk' | 'off-track' | 'shipped' | 'pending' | 'neutral';

export function renderRoadmap(input: RenderInput): string {
	const { workspace, list, template, items, share_code, view_url } = input;
	const permissions = input.permissions ?? ['read'];
	const commentsByItem = input.commentsByItem ?? {};
	const meta = list.meta_json as ListMeta;
	const schemaFields: FieldDef[] = (template?.fields_schema_json as FieldDef[]) ?? [];
	const stateField = schemaFields.find((f) => f.key === 'state' && f.type === 'single_select');
	const stateOrder = stateField?.options ?? [];
	const terminalStates = new Set(stateField?.terminal ?? []);
	const can = {
		comment: permissions.includes('comment'),
		edit: permissions.includes('edit'),
		create: permissions.includes('create'),
	};
	const interactive = can.comment || can.edit || can.create;

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
		<div class="ws">${escape(workspace.name)}</div>
	</header>

	<main>
		${input.flash ? `<div class="flash flash-${input.flash.kind}">${escape(input.flash.message)}</div>` : ''}

		${renderActionBar(share_code, permissions, input.display_name, interactive)}

		<section class="hero">
			<div class="hero-row">
				<div class="hero-glyph">${DIAMOND_SVG_LARGE(toneForList(meta, isClosed))}</div>
				<div class="hero-text">
					<div class="hero-eyebrow">${template ? escape(humanizeTemplate(template.slug)) : 'List'}</div>
					<h1 class="hero-title">${escape(list.name)}</h1>
					${list.description ? `<p class="hero-desc">${escape(list.description)}</p>` : ''}
				</div>
			</div>
			<div class="hero-meta">${renderListMeta(meta, isClosed)}</div>
			${isClosed && breakdown ? renderBreakdown(breakdown, items, stateField) : renderLiveSummary(items, stateField)}
		</section>

		<section class="items">
			${renderGroups(stateOrder, groups, noState, terminalStates, schemaFields, can, stateField, share_code, commentsByItem, input.display_name)}
		</section>

		${can.create ? renderNewItemForm(share_code, input.display_name, stateField) : ''}
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

	return `
		<div class="audit">
			<div class="audit-header">
				<div class="audit-title">Audit</div>
				<div class="audit-rate"><span class="rate-value">${rate}%</span> delivery rate</div>
			</div>
			<div class="audit-bar" role="img" aria-label="${breakdown.delivered.length} delivered, ${breakdown.slipped.length} slipped, ${breakdown.cut.length} cut">
				<div class="bar-seg seg-delivered" style="width:${deliveredPct}%"></div>
				<div class="bar-seg seg-slipped" style="width:${slippedPct}%"></div>
				<div class="bar-seg seg-cut" style="width:${cutPct}%"></div>
			</div>
			<div class="audit-legend">
				<div class="legend-item tone-shipped">
					<span class="dot"></span>
					<span class="legend-count">${breakdown.delivered.length}</span>
					<span class="legend-label">delivered</span>
				</div>
				<div class="legend-item tone-at-risk">
					<span class="dot"></span>
					<span class="legend-count">${breakdown.slipped.length}</span>
					<span class="legend-label">slipped</span>
				</div>
				<div class="legend-item tone-neutral">
					<span class="dot"></span>
					<span class="legend-count">${breakdown.cut.length}</span>
					<span class="legend-label">cut</span>
				</div>
			</div>
			${
				breakdown.delivered.length + breakdown.slipped.length + breakdown.cut.length > 0
					? `<div class="audit-detail">
				${detailList('Delivered', 'shipped', breakdown.delivered, idToItem)}
				${detailList('Slipped', 'at-risk', breakdown.slipped, idToItem)}
				${detailList('Cut', 'neutral', breakdown.cut, idToItem)}
			</div>`
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
		<div class="audit live">
			<div class="audit-header">
				<div class="audit-title">Progress <span class="live-tag">live</span></div>
				<div class="audit-rate"><span class="rate-value">${pct}%</span> complete</div>
			</div>
			<div class="audit-bar">
				<div class="bar-seg seg-delivered" style="width:${pct}%"></div>
				<div class="bar-seg seg-empty" style="width:${100 - pct}%"></div>
			</div>
			<div class="audit-legend">
				<div class="legend-item tone-shipped">
					<span class="dot"></span>
					<span class="legend-count">${done}</span>
					<span class="legend-label">done</span>
				</div>
				<div class="legend-item tone-neutral">
					<span class="dot"></span>
					<span class="legend-count">${total - done}</span>
					<span class="legend-label">open</span>
				</div>
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
): string {
	const args = { schemaFields, can, stateField, shareCode, commentsByItem, displayName };
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
	shareCode: string;
	commentsByItem: Record<string, CommentRow[]>;
	displayName: string | undefined;
};

function renderItem(item: ItemRow, tone: StateTone, args: ItemRenderArgs): string {
	const { schemaFields, can, stateField, shareCode, commentsByItem, displayName } = args;
	const fields = item.fields_json as Record<string, unknown>;
	const interesting = schemaFields
		.filter((f) => f.key !== 'state' && fields[f.key] !== undefined && fields[f.key] !== null)
		.slice(0, 5);
	const itemComments = commentsByItem[item.id] ?? [];
	const currentState = typeof fields.state === 'string' ? fields.state : null;
	return `
		<article class="card tone-${tone}">
			<div class="card-accent"></div>
			<div class="card-body">
				<div class="card-head">
					${DIAMOND_SVG_MINI(tone)}
					<h3 class="card-title">${escape(item.title)}</h3>
					<code class="card-id">${escape(item.id)}</code>
				</div>
				${item.body ? `<p class="card-desc">${escape(truncate(item.body, 280))}</p>` : ''}
				${
					interesting.length > 0
						? `<div class="card-fields">${interesting
								.map((f) => fieldChip(f, fields[f.key]))
								.join('')}</div>`
						: ''
				}
				${
					can.edit && stateField && stateField.options
						? renderStateEditForm(item.id, shareCode, stateField, currentState)
						: ''
				}
				${itemComments.length > 0 ? renderComments(itemComments) : ''}
				${can.comment ? renderCommentForm(item.id, shareCode, displayName) : ''}
			</div>
		</article>
	`;
}

function renderActionBar(
	shareCode: string,
	permissions: StakeholderPermission[],
	displayName: string | undefined,
	interactive: boolean,
): string {
	const capLabels = permissions
		.filter((p) => p === 'read' || p === 'comment' || p === 'edit' || p === 'create')
		.map((p) => `<span class="cap cap-${p}">${capLabel(p)}</span>`)
		.join('');

	const identityRow = interactive
		? `<div class="action-bar-row identity-row">
				<div class="action-group action-group-caps">
					<span class="action-group-label">You can</span>
					${capLabels}
				</div>
				<form class="action-group action-group-signas" method="POST" action="/r/${escape(shareCode)}/identify">
					<label for="display-name" class="action-group-label">Sign as</label>
					<input id="display-name" type="text" name="display_name" value="${escape(displayName ?? '')}" placeholder="Your name (optional)" maxlength="40" />
					<button type="submit">Save</button>
				</form>
			</div>`
		: '';

	return `
		<section class="action-bar" aria-label="Page actions">
			${identityRow}
			<div class="action-bar-row actions-row">
				<div class="action-group action-group-export">
					<span class="action-group-label">Export</span>
					<a class="action-btn" href="/r/${escape(shareCode)}/export.csv" download>
						${DOWNLOAD_ICON}<span>CSV</span>
					</a>
					<a class="action-btn" href="/r/${escape(shareCode)}/export.md" download>
						${DOWNLOAD_ICON}<span>Markdown</span>
					</a>
					<a class="action-btn" href="/r/${escape(shareCode)}/export.xlsx" download>
						${DOWNLOAD_ICON}<span>Excel</span>
					</a>
				</div>
			</div>
		</section>
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
	stateField: FieldDef,
	currentState: string | null,
): string {
	const options = (stateField.options ?? []).map(
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
						`<div class="comment"><div class="comment-meta"><span class="comment-author">${escape(c.author_label ?? 'Anonymous')}</span><time>${escape(formatTimestamp(c.created_at))}</time></div><div class="comment-body">${escape(c.body)}</div></div>`,
				)
				.join('')}
		</div>
	`;
}

function renderNewItemForm(
	shareCode: string,
	displayName: string | undefined,
	stateField: FieldDef | undefined,
): string {
	const states = stateField?.options ?? [];
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

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max - 1).trimEnd() + '…';
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
.hero { margin-bottom: var(--space-8); }
.hero-row { display: flex; gap: var(--space-5); align-items: flex-start; margin-bottom: var(--space-5); }
.hero-glyph { flex-shrink: 0; padding-top: 6px; }
.hero-diamond {
	width: 48px; height: 48px;
	filter: drop-shadow(0 0 16px currentColor);
}
.hero-diamond.tone-shipped { color: var(--shipped); }
.hero-diamond.tone-on-track { color: var(--on-track); }
.hero-diamond.tone-at-risk { color: var(--at-risk); }
.hero-diamond.tone-off-track { color: var(--off-track); }
.hero-diamond.tone-neutral { color: var(--fg-3); filter: none; }

.hero-eyebrow {
	font-size: 12px; font-weight: 500;
	color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.06em;
	margin-bottom: var(--space-2);
}
.hero-title {
	font-size: clamp(28px, 4.5vw, 44px);
	font-weight: 600; line-height: 1.1;
	letter-spacing: -0.02em;
	margin-bottom: var(--space-3);
	color: var(--fg);
}
.hero-desc {
	font-size: 15px; color: var(--fg-2); max-width: 56ch; line-height: 1.6;
}

.hero-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-6); }

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

/* === Audit / Progress === */
.audit {
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: var(--space-5);
}
.audit-header {
	display: flex; align-items: center; justify-content: space-between;
	margin-bottom: var(--space-4);
}
.audit-title {
	font-size: 12px; font-weight: 600; color: var(--fg-3);
	text-transform: uppercase; letter-spacing: 0.06em;
}
.live-tag {
	margin-left: var(--space-2);
	padding: 1px 6px;
	background: var(--on-track-glow);
	color: var(--on-track);
	border-radius: 4px;
	font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
	text-transform: uppercase;
}
.audit-rate { font-size: 13px; color: var(--fg-3); }
.rate-value { font-size: 18px; font-weight: 600; color: var(--fg); margin-right: 4px; }

.audit-bar {
	display: flex; gap: 2px;
	height: 6px; border-radius: 4px; overflow: hidden;
	background: var(--bg-2);
	margin-bottom: var(--space-4);
}
.bar-seg { transition: width 0.3s ease; }
.seg-delivered { background: var(--shipped); box-shadow: 0 0 8px var(--shipped-glow); }
.seg-slipped { background: var(--at-risk); }
.seg-cut { background: var(--neutral); }
.seg-empty { background: transparent; }

.audit-legend { display: flex; gap: var(--space-5); flex-wrap: wrap; }
.legend-item { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 13px; }
.legend-item .dot { width: 8px; height: 8px; border-radius: 50%; }
.legend-item.tone-shipped .dot { background: var(--shipped); box-shadow: 0 0 6px var(--shipped-glow); }
.legend-item.tone-at-risk .dot { background: var(--at-risk); }
.legend-item.tone-neutral .dot { background: var(--neutral); }
.legend-count { font-weight: 600; color: var(--fg); }
.legend-label { color: var(--fg-3); }

.audit-detail { margin-top: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.detail-block summary {
	cursor: pointer; user-select: none;
	font-size: 13px; color: var(--fg-2); font-weight: 500;
	padding: var(--space-2) 0;
	list-style: none;
}
.detail-block summary::-webkit-details-marker { display: none; }
.detail-block summary::before { content: '▸'; margin-right: var(--space-2); color: var(--fg-3); transition: transform 0.15s; display: inline-block; }
.detail-block[open] summary::before { transform: rotate(90deg); }
.detail-block .count {
	display: inline-block;
	margin-left: var(--space-2);
	padding: 1px 6px;
	background: var(--bg-2);
	border-radius: 4px;
	font-size: 11px; color: var(--fg-3); font-weight: 500;
}
.detail-block ul { list-style: none; padding-left: var(--space-4); margin-top: var(--space-2); }
.detail-block li { display: flex; gap: var(--space-3); padding: 3px 0; font-size: 13px; }
.detail-block .id { color: var(--fg-4); min-width: 60px; }
.detail-block .t { color: var(--fg-2); }

/* === Items === */
.items { display: flex; flex-direction: column; gap: var(--space-7); }

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
.card-id { color: var(--fg-4); font-size: 12px; flex-shrink: 0; }

.card-desc {
	color: var(--fg-2); font-size: 13.5px; line-height: 1.6;
	margin-top: var(--space-2);
	display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
	overflow: hidden;
}

.card-fields { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
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

/* === Top unified action bar: capabilities + export + sign-as === */
.action-bar {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	margin-bottom: var(--space-6);
	padding: var(--space-4) var(--space-5);
	background: var(--bg-1);
	border: 1px solid var(--border);
	border-radius: 12px;
}
.action-bar-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-4);
}
/* Identity row: caps on the left, sign-as pushed to the right. */
.identity-row { justify-content: space-between; }
/* Actions row: dim separator above, slightly less prominent vertical rhythm. */
.identity-row + .actions-row {
	padding-top: var(--space-3);
	border-top: 1px solid var(--border);
}
.action-group {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.action-group-label {
	font-size: 11px;
	font-weight: 600;
	color: var(--fg-3);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin-right: 6px;
}
.action-btn {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 7px 14px;
	background: var(--bg-2);
	border: 1px solid var(--border-bright);
	border-radius: 8px;
	color: var(--fg-2);
	font-size: 13px;
	font-weight: 500;
	transition: border-color 0.15s, color 0.15s, background 0.15s, transform 0.15s;
}
.action-btn:hover {
	color: var(--accent);
	border-color: var(--accent);
	background: rgba(167, 139, 250, 0.06);
	transform: translateY(-1px);
}
.action-btn svg { width: 13px; height: 13px; opacity: 0.85; }
.action-btn:hover svg { opacity: 1; }

/* Sign-as inline form inside the bar */
.action-group-signas input,
.action-group-signas button {
	font: inherit;
	font-family: var(--font-sans);
	padding: 6px 10px;
	background: var(--bg-2);
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--fg);
	font-size: 12px;
}
.action-group-signas input:focus {
	outline: none;
	border-color: var(--accent);
	box-shadow: 0 0 0 1px var(--accent-glow);
}
.action-group-signas button {
	cursor: pointer;
	background: var(--bg-elev);
	transition: background 0.15s, color 0.15s;
}
.action-group-signas button:hover { background: var(--border-bright); color: var(--accent); }

@media (max-width: 700px) {
	.action-bar { padding: var(--space-3) var(--space-4); }
	.identity-row { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
	.action-group { width: 100%; }
	.action-group-signas { justify-content: flex-start; }
	.action-group-signas input { flex: 1; min-width: 0; }
	.action-btn { padding: 6px 12px; font-size: 12px; }
	.action-group-export .action-btn { flex: 1; justify-content: center; min-width: 70px; }
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
.comment-body { color: var(--fg-2); white-space: pre-wrap; }

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
	.audit { padding: var(--space-4); }
	.card-head { flex-wrap: wrap; }
	.card-id { font-size: 11px; }
	.edit-state { flex-wrap: wrap; }
}
</style>`;
