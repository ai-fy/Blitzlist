/**
 * Export helpers — render a list's items to CSV, Markdown, or XLSX.
 *
 * All three are pure functions: (list, template, items) → bytes/string.
 * Routes in apps/api/src/index.ts wrap them with the proper Content-Type +
 * Content-Disposition headers.
 *
 * Column derivation:
 *   - id, title come first (every item has them)
 *   - then state if the template declares one
 *   - then the rest of the template's typed fields in template order
 *   - then body, created_at, updated_at last
 *
 * Items without a template fall back to id/title/state/body only.
 */

import * as XLSX from 'xlsx';
import type { lists, items, templates } from '@blitzlist/db';
import type { FieldDef } from '@blitzlist/db';

type ListRow = typeof lists.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type TemplateRow = typeof templates.$inferSelect;

export type ExportInput = {
	list: ListRow;
	template: TemplateRow | null;
	items: ItemRow[];
};

type Column = { key: string; label: string };

// ---- Column derivation -----------------------------------------------------

function deriveColumns(template: TemplateRow | null): Column[] {
	const schema = (template?.fields_schema_json as FieldDef[] | undefined) ?? [];
	const cols: Column[] = [
		{ key: 'id', label: 'ID' },
		{ key: 'title', label: 'Title' },
	];
	const stateDef = schema.find((f) => f.key === 'state');
	if (stateDef) cols.push({ key: 'state', label: stateDef.label ?? 'State' });
	for (const f of schema) {
		if (f.key === 'state') continue;
		cols.push({ key: f.key, label: f.label ?? f.key });
	}
	cols.push({ key: 'body', label: 'Body' });
	cols.push({ key: 'created_at', label: 'Created' });
	cols.push({ key: 'updated_at', label: 'Updated' });
	return cols;
}

function valueFor(item: ItemRow, key: string): string {
	if (key === 'id') return item.id;
	if (key === 'title') return item.title;
	if (key === 'body') return item.body;
	if (key === 'created_at') return formatTs(item.created_at);
	if (key === 'updated_at') return formatTs(item.updated_at);
	const fields = (item.fields_json ?? {}) as Record<string, unknown>;
	const v = fields[key];
	if (v === null || v === undefined) return '';
	if (Array.isArray(v)) return v.map(String).join(', ');
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	return String(v);
}

function formatTs(v: unknown): string {
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return new Date(v * 1000).toISOString();
	return '';
}

// ---- CSV -------------------------------------------------------------------

export function itemsToCSV(input: ExportInput): string {
	const cols = deriveColumns(input.template);
	const header = cols.map((c) => csvCell(c.label)).join(',');
	const lines = input.items.map((it) =>
		cols.map((c) => csvCell(valueFor(it, c.key))).join(','),
	);
	// UTF-8 BOM helps Excel open as UTF-8 instead of guessing.
	return '﻿' + [header, ...lines].join('\n');
}

function csvCell(raw: string): string {
	if (raw == null) return '';
	const needsQuoting = /[",\n\r]/.test(raw);
	const escaped = raw.replace(/"/g, '""');
	return needsQuoting ? `"${escaped}"` : escaped;
}

// ---- Markdown --------------------------------------------------------------

export function itemsToMarkdown(input: ExportInput): string {
	const { list, template, items: rows } = input;
	const lines: string[] = [];
	lines.push(`# ${list.name}`);
	if (list.description) lines.push('', list.description);
	lines.push(
		'',
		`Exported ${new Date().toISOString().slice(0, 10)} from Blitzlist · ${rows.length} item${rows.length === 1 ? '' : 's'}`,
	);

	const schema = (template?.fields_schema_json as FieldDef[] | undefined) ?? [];
	const stateDef = schema.find((f) => f.key === 'state');
	const otherDefs = schema.filter((f) => f.key !== 'state');

	// Summary table — id / title / state
	if (rows.length > 0) {
		lines.push('', '## Summary', '');
		const head: string[] = ['ID', 'Title'];
		if (stateDef) head.push(stateDef.label ?? 'State');
		lines.push(`| ${head.join(' | ')} |`);
		lines.push(`| ${head.map(() => '---').join(' | ')} |`);
		for (const it of rows) {
			const row: string[] = [
				`\`${it.id}\``,
				escapeMd(it.title),
			];
			if (stateDef) row.push(escapeMd(valueFor(it, 'state')));
			lines.push(`| ${row.join(' | ')} |`);
		}
	}

	// Details — heading per item with all fields
	if (rows.length > 0) {
		lines.push('', '## Details', '');
		for (const it of rows) {
			lines.push(`### ${it.title} (\`${it.id}\`)`, '');
			const factLines: string[] = [];
			if (stateDef) {
				const v = valueFor(it, 'state');
				if (v) factLines.push(`- **State:** ${v}`);
			}
			for (const def of otherDefs) {
				const v = valueFor(it, def.key);
				if (v) factLines.push(`- **${def.label ?? def.key}:** ${v}`);
			}
			if (it.executor) factLines.push(`- **Executor:** ${it.executor}`);
			if (factLines.length > 0) {
				lines.push(...factLines, '');
			}
			if (it.body && it.body.trim().length > 0) {
				lines.push(it.body.trim(), '');
			}
		}
	}

	lines.push('', '---', `_Generated by Blitzlist · list slug: \`${list.slug}\`._`);
	return lines.join('\n');
}

function escapeMd(s: string): string {
	return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ---- XLSX ------------------------------------------------------------------

export function itemsToXLSX(input: ExportInput): Uint8Array {
	const cols = deriveColumns(input.template);
	const aoa: unknown[][] = [
		cols.map((c) => c.label),
		...input.items.map((it) => cols.map((c) => valueFor(it, c.key))),
	];
	const ws = XLSX.utils.aoa_to_sheet(aoa);
	// Column widths — readable defaults.
	ws['!cols'] = cols.map((c) => {
		switch (c.key) {
			case 'id': return { wch: 10 };
			case 'title': return { wch: 40 };
			case 'body': return { wch: 60 };
			case 'created_at':
			case 'updated_at': return { wch: 22 };
			default: return { wch: 16 };
		}
	});
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, sheetName(input.list.name));
	const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
	return new Uint8Array(buf as ArrayBuffer);
}

function sheetName(raw: string): string {
	// Excel: <=31 chars, no []*?/\\:
	const cleaned = raw.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
	return cleaned.length > 0 ? cleaned : 'Items';
}

// ---- Helpers exposed for routing -----------------------------------------

export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'list';
}
