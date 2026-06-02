/**
 * Response shape helpers — present items to MCP callers in a way that's easy
 * for agents to read.
 *
 * Storage uses `fields_json: Record<string, unknown>` (Airtable shape).
 * Responses ALSO expose:
 *   - `fields` — the same object, renamed (drops the `_json` suffix)
 *   - `state` — lifted to the top level (the canonical workflow field; most
 *     common access pattern)
 *   - `template_slug` — when available, resolved alongside template_id
 *
 * The original `fields_json` is omitted from responses to avoid confusion
 * (two keys with the same data). Callers wanting the full flexible shape
 * use `.fields`; callers wanting state use `.state`.
 *
 * This is the fix for "agents don't see the state in nested JSON" — the
 * canonical workflow column is now at the top, where it's always seen.
 */

import type { items as itemsTable } from '@blitzlist/db';

type ItemRow = typeof itemsTable.$inferSelect;

export type ItemResponse = Omit<ItemRow, 'fields_json'> & {
	fields: Record<string, unknown>;
	state: string | null;
	template_slug?: string | null;
};

export function itemToResponse(
	row: ItemRow,
	template_slug?: string | null,
): ItemResponse {
	const fields = (row.fields_json ?? {}) as Record<string, unknown>;
	const { fields_json: _omit, ...rest } = row;
	void _omit;
	return {
		...rest,
		fields,
		state: typeof fields.state === 'string' ? fields.state : null,
		...(template_slug !== undefined && { template_slug }),
	};
}

/**
 * Batch helper — given items + a templates-by-id map, produce flattened
 * responses with template_slug resolved.
 */
export function itemsToResponses(
	rows: ItemRow[],
	templateSlugById: Record<string, string> = {},
): ItemResponse[] {
	return rows.map((r) =>
		itemToResponse(r, r.template_id ? (templateSlugById[r.template_id] ?? null) : null),
	);
}
