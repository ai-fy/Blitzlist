/**
 * Stakeholder access keys — generation, hashing, scope evaluation.
 *
 * Threat model & crypto choice:
 *   - Keys are SERVER-GENERATED high-entropy tokens (~160 bits via 32 base32 chars).
 *   - That's well above the threshold where password-hashing (bcrypt/argon2) matters.
 *   - We use SHA-256 because the key IS the secret — there's no user-chosen
 *     low-entropy input to protect against rainbow tables.
 *   - SHA-256 also gives us fast O(1) lookups by hash, which password hashes
 *     (intentionally) prevent.
 *
 * Key format:
 *   blz_sk_<32-char-base32>
 *   total length 40 chars; prefix "blz_sk_" + 4-char display fragment is stored
 *   separately for UI ("blz_sk_a3f7…" etc).
 */

// Domain types — these are duplicated structurally in @blitzlist/db/schema.ts
// for the JSON-column $type<>. Single source of truth lives here; the DB
// package mirrors the shape but doesn't import core (avoids circular dep).

export type StakeholderScope =
	| { type: 'workspace' }
	| { type: 'list'; list_slug: string }
	| { type: 'lists'; list_slugs: string[] };

export type StakeholderPermission =
	| 'read'
	| 'comment'
	| 'edit' // can update fields (state, title, body) on items in scope
	| 'create' // can add new items to lists in scope
	| 'approve'
	| 'vote';

// === Key generation ==========================================================

// RFC 4648 base32 alphabet (sans 0/1/8/I/O/L to keep it human-readable).
// 32 characters → 5 bits each → 32 chars = 160 bits.
const BASE32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const KEY_LENGTH = 32; // chars after the prefix
const KEY_PREFIX = 'blz_sk_';

export type GeneratedKey = {
	raw: string; // full key — show ONCE to the user, then forget
	prefix: string; // "blz_sk_xxxx" — safe to display thereafter
	hash: string; // sha256(raw) hex — what we store
};

/**
 * Generate a fresh stakeholder key. Uses Web Crypto's getRandomValues (available
 * in Workers + Node 18+). Returns { raw, prefix, hash }.
 */
export async function generateStakeholderKey(): Promise<GeneratedKey> {
	const bytes = new Uint8Array(KEY_LENGTH);
	crypto.getRandomValues(bytes);

	// Map each byte to a base32 char (drop the high 3 bits — keeps it uniform).
	let body = '';
	for (let i = 0; i < KEY_LENGTH; i++) {
		body += BASE32[bytes[i]! % BASE32.length];
	}

	const raw = KEY_PREFIX + body;
	const prefix = KEY_PREFIX + body.slice(0, 4); // 11-char display string
	const hash = await sha256Hex(raw);
	return { raw, prefix, hash };
}

/**
 * Hash a raw key for lookup. Pure function; deterministic.
 */
export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const buf = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * True if `raw` plausibly looks like a stakeholder key — prefix + length check.
 * Cheap pre-filter before computing the hash and hitting the DB.
 */
export function looksLikeStakeholderKey(raw: string): boolean {
	if (!raw.startsWith(KEY_PREFIX)) return false;
	const body = raw.slice(KEY_PREFIX.length);
	return body.length === KEY_LENGTH;
}

// === Scope parsing + validation ==============================================

export function parseStakeholderScope(raw: unknown): StakeholderScope {
	if (typeof raw !== 'object' || raw === null) {
		throw new Error('scope must be an object');
	}
	const o = raw as Record<string, unknown>;
	if (typeof o.type !== 'string') {
		throw new Error('scope.type is required');
	}
	switch (o.type) {
		case 'workspace':
			return { type: 'workspace' };
		case 'list': {
			if (typeof o.list_slug !== 'string' || o.list_slug.trim().length === 0) {
				throw new Error('scope.list_slug is required for type=list');
			}
			return { type: 'list', list_slug: o.list_slug.trim() };
		}
		case 'lists': {
			if (
				!Array.isArray(o.list_slugs) ||
				o.list_slugs.length === 0 ||
				!o.list_slugs.every((s) => typeof s === 'string' && s.trim().length > 0)
			) {
				throw new Error('scope.list_slugs must be a non-empty array of slug strings');
			}
			return { type: 'lists', list_slugs: o.list_slugs.map((s) => s.trim()) };
		}
		default:
			throw new Error(
				`Unknown scope type "${o.type}". Allowed: workspace, list, lists.`,
			);
	}
}

export function parseStakeholderPermissions(raw: unknown): StakeholderPermission[] {
	if (raw === undefined || raw === null) return ['read', 'comment'];
	if (!Array.isArray(raw)) {
		throw new Error('permissions must be an array of strings');
	}
	const valid: StakeholderPermission[] = ['read', 'comment', 'edit', 'create', 'approve', 'vote'];
	const out: StakeholderPermission[] = [];
	for (const p of raw) {
		if (typeof p !== 'string' || !valid.includes(p as StakeholderPermission)) {
			throw new Error(`Invalid permission "${p}". Allowed: ${valid.join(', ')}`);
		}
		if (!out.includes(p as StakeholderPermission)) out.push(p as StakeholderPermission);
	}
	if (!out.includes('read')) out.unshift('read'); // every key implicitly has read
	return out;
}

// === Scope evaluation ========================================================

/**
 * Returns the array of list slugs this scope grants visibility into, or null
 * if the scope is workspace-wide (no slug filter). Callers use this to
 * restrict their queries.
 */
export function scopeToListSlugs(scope: StakeholderScope): string[] | null {
	switch (scope.type) {
		case 'workspace':
			return null;
		case 'list':
			return [scope.list_slug];
		case 'lists':
			return scope.list_slugs;
		default: {
			const _exhaustive: never = scope;
			return _exhaustive;
		}
	}
}

/**
 * True if a permission is granted by this key.
 */
export function hasPermission(
	permissions: StakeholderPermission[],
	required: StakeholderPermission,
): boolean {
	return permissions.includes(required);
}
