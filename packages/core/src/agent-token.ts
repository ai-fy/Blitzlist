/**
 * Agent tokens — static bearer credentials for HEADLESS agents (e.g. Hermes)
 * that need write access without the interactive OAuth flow.
 *
 * Difference from stakeholder keys (stakeholder.ts):
 *   - Stakeholder keys are EXTERNAL + SCOPED + mostly read (list/get/comment),
 *     served at /s/mcp.
 *   - Agent tokens are INTERNAL workspace agents with CREATE/EDIT/SHARE reach
 *     (no admin: can't mint/revoke other keys), served at /a/mcp. They resolve
 *     to the full workspace context (acting as the owner who minted them).
 *
 * Same crypto rationale as stakeholder keys: server-generated high-entropy
 * token, SHA-256 for O(1) hash lookup (the token IS the secret).
 *
 * Format: blz_at_<32-char base32>  (prefix "blz_at_" + 4-char display fragment)
 */

import { sha256Hex } from './stakeholder.js';

const BASE32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // RFC4648-ish, human-readable
const TOKEN_LENGTH = 32;
const TOKEN_PREFIX = 'blz_at_';

export type GeneratedAgentToken = {
	raw: string; // full token — show ONCE, then forget
	prefix: string; // "blz_at_xxxx" — safe to display thereafter
	hash: string; // sha256(raw) hex — what we store
};

export async function generateAgentToken(): Promise<GeneratedAgentToken> {
	const bytes = new Uint8Array(TOKEN_LENGTH);
	crypto.getRandomValues(bytes);
	let body = '';
	for (let i = 0; i < TOKEN_LENGTH; i++) {
		body += BASE32[bytes[i]! % BASE32.length];
	}
	const raw = TOKEN_PREFIX + body;
	const prefix = TOKEN_PREFIX + body.slice(0, 4);
	const hash = await sha256Hex(raw);
	return { raw, prefix, hash };
}

/**
 * Cheap pre-filter before hashing + DB lookup. Mutually exclusive with
 * looksLikeStakeholderKey (different prefix) so the two bearer paths can't
 * cross over.
 */
export function looksLikeAgentToken(raw: string): boolean {
	if (!raw.startsWith(TOKEN_PREFIX)) return false;
	const body = raw.slice(TOKEN_PREFIX.length);
	return body.length === TOKEN_LENGTH;
}
