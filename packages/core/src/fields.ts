/**
 * Field validation — runtime guards for Airtable-shaped items (BL-035).
 *
 * Templates declare a schema (array of FieldDef). When write tools update an
 * item's fields_json, we validate each provided value against the template's
 * field def. Unknown fields are rejected; required-but-missing fields are
 * rejected on initial creation only (subsequent partial updates allow missing).
 *
 * Pure functions; throw on failure with a useful message.
 */

export type FieldType =
	| 'text'
	| 'long_text'
	| 'number'
	| 'date'
	| 'single_select'
	| 'multi_select'
	| 'checkbox'
	| 'url'
	| 'user'
	| 'link_to_item'
	| 'attachment'
	| 'formula';

export type FieldDef = {
	key: string;
	type: FieldType;
	label?: string;
	required?: boolean;
	default?: unknown;
	options?: string[];
	terminal?: string[];
	/**
	 * When true (single_select / multi_select), values outside `options` are
	 * accepted. The tool layer is responsible for persisting novel values
	 * somewhere appropriate (e.g. list-level extras for the state field).
	 * Defaults to false (strict enum).
	 */
	open?: boolean;
	min?: number;
	max?: number;
	multiline?: boolean;
	description?: string;
};

const URL_RX = /^https?:\/\/[^\s]+$/i;
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a single field value against its type. Throws on mismatch.
 * Returns the (possibly normalized) value to store.
 *
 * `extras` is an optional per-field augmentation to the declared `options`
 * (used by the canonical state field: list.meta_json.extra_state_options).
 * When `def.open` is true OR the value is found in `options + extras`, the
 * enum check is satisfied. When `def.open` is true the value is accepted
 * even if it's not in either set — the caller is then responsible for
 * recording it (e.g. appending to list-level extras).
 */
export function validateFieldValue(
	def: FieldDef,
	value: unknown,
	extras?: { options?: string[] },
): unknown {
	// null / undefined permitted unless required at the parent level.
	if (value === null || value === undefined) return null;

	switch (def.type) {
		case 'text': {
			if (typeof value !== 'string') {
				throw new Error(`Field "${def.key}" expects text (got ${typeof value})`);
			}
			return value;
		}
		case 'long_text': {
			if (typeof value !== 'string') {
				throw new Error(`Field "${def.key}" expects long_text (got ${typeof value})`);
			}
			return value;
		}
		case 'number': {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				throw new Error(`Field "${def.key}" expects a finite number (got ${typeof value})`);
			}
			if (def.min !== undefined && value < def.min) {
				throw new Error(`Field "${def.key}" must be >= ${def.min} (got ${value})`);
			}
			if (def.max !== undefined && value > def.max) {
				throw new Error(`Field "${def.key}" must be <= ${def.max} (got ${value})`);
			}
			return value;
		}
		case 'date': {
			if (typeof value !== 'string' || !ISO_DATE_RX.test(value)) {
				throw new Error(
					`Field "${def.key}" expects ISO date string (e.g. "2026-09-01") (got ${JSON.stringify(value)})`,
				);
			}
			return value;
		}
		case 'single_select': {
			if (typeof value !== 'string') {
				throw new Error(`Field "${def.key}" expects a string (got ${typeof value})`);
			}
			const allowed = effectiveOptions(def, extras);
			if (def.open) return value; // open enum — anything string-ish accepted
			if (allowed.length > 0 && !allowed.includes(value)) {
				throw new Error(
					`Field "${def.key}" must be one of: ${allowed.join(', ')} (got "${value}")`,
				);
			}
			return value;
		}
		case 'multi_select': {
			if (!Array.isArray(value)) {
				throw new Error(`Field "${def.key}" expects an array (got ${typeof value})`);
			}
			const allowed = effectiveOptions(def, extras);
			for (const v of value) {
				if (typeof v !== 'string') {
					throw new Error(`Field "${def.key}" array items must be strings`);
				}
				if (def.open) continue; // open enum — any string accepted
				if (allowed.length > 0 && !allowed.includes(v)) {
					throw new Error(
						`Field "${def.key}" values must be one of: ${allowed.join(', ')} (got "${v}")`,
					);
				}
			}
			return value;
		}
		case 'checkbox': {
			if (typeof value !== 'boolean') {
				throw new Error(`Field "${def.key}" expects a boolean (got ${typeof value})`);
			}
			return value;
		}
		case 'url': {
			if (typeof value !== 'string' || !URL_RX.test(value)) {
				throw new Error(`Field "${def.key}" expects an http(s) URL`);
			}
			return value;
		}
		case 'user': {
			if (typeof value !== 'string' || value.length === 0) {
				throw new Error(`Field "${def.key}" expects a user_id string`);
			}
			return value;
		}
		case 'link_to_item': {
			if (typeof value === 'string') return value;
			if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
			throw new Error(`Field "${def.key}" expects an item ID string or array of item IDs`);
		}
		case 'attachment': {
			// Stores file_id(s) — pure shape check here; existence/workspace
			// scope is verified at the tool layer (BL-021). Accepts a single
			// uuid or an array of uuids (forward-looking for multi-attach).
			if (typeof value === 'string') {
				if (!UUID_RX.test(value)) {
					throw new Error(`Field "${def.key}" expects a file_id (uuid)`);
				}
				return value;
			}
			if (Array.isArray(value) && value.every((v) => typeof v === 'string' && UUID_RX.test(v))) {
				return value;
			}
			throw new Error(`Field "${def.key}" expects a file_id (uuid) or array of file_ids`);
		}
		case 'formula': {
			// Computed; not writable. Reject explicit writes.
			throw new Error(`Field "${def.key}" is a formula and cannot be written directly`);
		}
		default: {
			const _exhaustive: never = def.type;
			throw new Error(`Unknown field type: ${String(_exhaustive)}`);
		}
	}
}

/**
 * Effective option set for a single_select / multi_select field:
 * the declared `options` plus any caller-supplied `extras.options`
 * (typically list-level extras for the canonical state field).
 */
export function effectiveOptions(
	def: FieldDef,
	extras?: { options?: string[] },
): string[] {
	const base = def.options ?? [];
	const extra = extras?.options ?? [];
	if (extra.length === 0) return base;
	const seen = new Set(base);
	const out = [...base];
	for (const v of extra) {
		if (!seen.has(v)) {
			seen.add(v);
			out.push(v);
		}
	}
	return out;
}

/**
 * Validate a partial fields_json patch against the template schema. Returns
 * the merged-and-normalized fields_json. `isCreate=true` enforces `required`
 * on all fields; `isCreate=false` only validates types/options on fields that
 * are present (partial-update semantics).
 *
 * `extrasByKey` lets the caller pass list-level option extras keyed by field.
 * Typically: { state: { options: list.meta_json.extra_state_options ?? [] } }.
 */
export function validateItemFields(opts: {
	schema: FieldDef[];
	current?: Record<string, unknown>;
	patch: Record<string, unknown>;
	isCreate: boolean;
	extrasByKey?: Record<string, { options?: string[] }>;
}): Record<string, unknown> {
	const { schema, current = {}, patch, isCreate, extrasByKey = {} } = opts;
	const byKey = new Map(schema.map((f) => [f.key, f]));

	// 1. Reject unknown keys in the patch.
	for (const key of Object.keys(patch)) {
		if (!byKey.has(key)) {
			throw new Error(
				`Unknown field "${key}". Allowed: ${schema.map((f) => f.key).join(', ') || '(none)'}`,
			);
		}
	}

	// 2. Build the merged fields object.
	const merged: Record<string, unknown> = { ...current };

	// On creation, apply defaults for fields not in the patch.
	if (isCreate) {
		for (const def of schema) {
			if (def.key in patch) continue;
			if (def.key in merged) continue;
			if (def.default !== undefined) {
				merged[def.key] = def.default;
			}
		}
	}

	// 3. Validate each provided value.
	for (const [key, raw] of Object.entries(patch)) {
		const def = byKey.get(key)!;
		merged[key] = validateFieldValue(def, raw, extrasByKey[key]);
	}

	// 4. On create, enforce `required`.
	if (isCreate) {
		for (const def of schema) {
			if (def.required && (merged[def.key] === undefined || merged[def.key] === null)) {
				throw new Error(`Field "${def.key}" is required`);
			}
		}
	}

	return merged;
}

/**
 * Given a single_select field and a new value, return the value if it's
 * not yet in `options + extras` (i.e. it's a novel value the caller needs
 * to record), or null if it's already known.
 */
export function novelOptionValue(
	def: FieldDef,
	value: string,
	extras?: { options?: string[] },
): string | null {
	if (def.type !== 'single_select' && def.type !== 'multi_select') return null;
	const known = new Set(effectiveOptions(def, extras));
	return known.has(value) ? null : value;
}

/**
 * Compute terminal states for a template — used by close_list's audit.
 * Returns the union of `terminal` arrays across all single_select fields
 * in the schema. (Most templates only have a `state` field that's terminal;
 * this allows multiple closeable fields just in case.)
 */
export function terminalStatesForTemplate(schema: FieldDef[]): string[] {
	const terminal = new Set<string>();
	for (const def of schema) {
		if (def.type !== 'single_select') continue;
		for (const t of def.terminal ?? []) terminal.add(t);
	}
	return Array.from(terminal);
}

/**
 * Find the canonical "state" field on a template. By convention this is the
 * single_select field keyed "state" if present; otherwise the first
 * single_select with a `terminal` array. Returns null if no state field exists
 * (e.g. shopping-list template has no state).
 */
export function findStateFieldDef(schema: FieldDef[]): FieldDef | null {
	const named = schema.find((f) => f.key === 'state' && f.type === 'single_select');
	if (named) return named;
	const closeable = schema.find(
		(f) => f.type === 'single_select' && (f.terminal?.length ?? 0) > 0,
	);
	return closeable ?? null;
}
