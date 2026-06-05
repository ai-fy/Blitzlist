/**
 * Effective-list helpers: combine a template's declared shape with the
 * per-list overrides stored in lists.meta_json.
 *
 * Two kinds of override:
 *  1. State options — template.fields_schema_json.state.options is the
 *     baseline; meta.extra_state_options appends novel values; if
 *     meta.state_options_order is set, it's the authoritative order.
 *  2. Field schema — template.fields_schema_json is the baseline;
 *     meta.extra_fields appends per-list-only field defs (priority,
 *     due_date, etc.). Validator + renderer use the merged set.
 */

import type { FieldDef, ListMeta } from '@blitzlist/db';

/**
 * Compute the effective state options for a list: declared template
 * options plus per-list extras, in either explicit order (if set) or
 * append order (template options first, then extras in insertion order).
 *
 * Returns [] if the template has no state field.
 */
export function effectiveStateOptions(
	templateStateOptions: string[] | undefined,
	meta: ListMeta | undefined | null,
): string[] {
	const base = templateStateOptions ?? [];
	const extras = meta?.extra_state_options ?? [];
	const merged = mergeUnique(base, extras);
	const order = meta?.state_options_order;
	if (!order || order.length === 0) return merged;
	// Use the explicit order, but defensively append anything in `merged`
	// that's missing from the order (so an inconsistent order array still
	// surfaces all valid columns).
	const inOrder = order.filter((v) => merged.includes(v));
	const seen = new Set(inOrder);
	for (const v of merged) if (!seen.has(v)) inOrder.push(v);
	return inOrder;
}

/**
 * Compute the effective field schema for an item being rendered or
 * validated as part of a specific list: template schema concatenated with
 * the list's extra_fields (deduped by key — extras override on collision).
 */
export function effectiveFieldSchema(
	templateSchema: FieldDef[] | undefined | null,
	meta: ListMeta | undefined | null,
): FieldDef[] {
	const base = templateSchema ?? [];
	const extras = meta?.extra_fields ?? [];
	if (extras.length === 0) return base;
	const byKey = new Map<string, FieldDef>();
	for (const f of base) byKey.set(f.key, f);
	for (const f of extras) byKey.set(f.key, f); // extras override
	return Array.from(byKey.values());
}

function mergeUnique(base: string[], extras: string[]): string[] {
	if (extras.length === 0) return base;
	const seen = new Set(base);
	const out = [...base];
	for (const e of extras) if (!seen.has(e)) {
		seen.add(e);
		out.push(e);
	}
	return out;
}

/**
 * Heuristic type-guess for an unknown field key auto-extended into a
 * list's extra_fields. Used when a write tool encounters a key not in
 * the template — instead of rejecting, we materialise a minimal field
 * def of the inferred type so the value is accepted and subsequent
 * writes / renders treat it consistently.
 *
 * Rules (intentionally simple):
 *   - boolean → checkbox
 *   - finite number → number
 *   - array of strings → multi_select (no enum constraint; open)
 *   - string → text
 *   - anything else → text (stringified later)
 */
export function guessFieldDef(key: string, sampleValue: unknown): FieldDef {
	if (typeof sampleValue === 'boolean') {
		return { key, type: 'checkbox', label: humanize(key) };
	}
	if (typeof sampleValue === 'number' && Number.isFinite(sampleValue)) {
		return { key, type: 'number', label: humanize(key) };
	}
	if (Array.isArray(sampleValue) && sampleValue.every((v) => typeof v === 'string')) {
		return { key, type: 'multi_select', label: humanize(key), options: [], open: true };
	}
	return { key, type: 'text', label: humanize(key) };
}

function humanize(key: string): string {
	return key
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
