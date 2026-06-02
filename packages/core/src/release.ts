/**
 * List audit — bucket items in a list into delivered / slipped / cut.
 *
 * Generalized from BL-010's release audit: this works for ANY list that
 * carries a closeable state machine (release, sprint, milestone). The caller
 * supplies what counts as "terminal" — usually computed from each item's
 * template's state field options where `terminal: true` is set.
 *
 *  - delivered : item's state ∈ its template's terminal states (and not in cut)
 *  - cut       : explicitly removed from the list at close time
 *  - slipped   : everything else (still open at close time)
 *
 * One item can only be in one bucket. Order of precedence: cut > delivered > slipped.
 * Rationale: if the closer says "this is cut," we honor that even if the item
 * also happens to be in a terminal state — they might be cutting it as a no-op
 * to clean up the list summary.
 */

export type AuditableItem = {
	id: string;
	/** Current state value from item.fields_json.state (or null if no state field). */
	state: string | null;
	/** The item's template_id — used to look up which states are terminal. */
	template_id: string | null;
};

export type AuditListInput = {
	items: AuditableItem[];
	/** Terminal-state lookup, keyed by template_id. Items with no template_id or
	 * an unknown template_id are treated as having no terminal states (always
	 * slipped unless cut). */
	terminalStatesByTemplate: Record<string, string[]>;
	/** Explicit cut set — IDs the closer marked as removed. */
	cutItemIds: string[];
};

export type AuditListResult = {
	delivered: string[];
	slipped: string[];
	cut: string[];
	total: number;
	delivery_rate: number; // NaN if 0 non-cut items
};

export function auditList(input: AuditListInput): AuditListResult {
	const cutSet = new Set(input.cutItemIds);
	const delivered: string[] = [];
	const slipped: string[] = [];
	const cut: string[] = [];

	for (const item of input.items) {
		if (cutSet.has(item.id)) {
			cut.push(item.id);
			continue;
		}
		const terminals = item.template_id
			? (input.terminalStatesByTemplate[item.template_id] ?? [])
			: [];
		if (item.state !== null && terminals.includes(item.state)) {
			delivered.push(item.id);
		} else {
			slipped.push(item.id);
		}
	}

	const counted = delivered.length + slipped.length;
	const delivery_rate = counted === 0 ? NaN : delivered.length / counted;

	return {
		delivered,
		slipped,
		cut,
		total: input.items.length,
		delivery_rate,
	};
}

// Back-compat alias — `auditRelease` was the BL-010 name; `auditList` is the
// BL-035 name. Both export the same function; consumers can move on their own
// schedule.
export const auditRelease = auditList;
export type ReleaseAuditInput = AuditListInput;
export type ReleaseAuditResult = AuditListResult;
