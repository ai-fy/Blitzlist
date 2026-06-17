/**
 * Login sessions (BL-024 phase 2).
 *
 * A session is a random opaque id in a cookie; the mapping id → user_id lives
 * in KV with a TTL. This is the human-identity session for the consent screen
 * (distinct from the MCP OAuth grant, which the OAuthProvider manages).
 *
 * Cookie: bl_session — HttpOnly, Secure, SameSite=Lax (Lax so the cookie
 * survives the top-level redirect back from the magic-link click), Path=/.
 */

import type { Env } from '../env.js';

export const SESSION_COOKIE = 'bl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const KV_PREFIX = 'session:';

function randomId(bytes = 32): string {
	const a = new Uint8Array(bytes);
	crypto.getRandomValues(a);
	return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a session for a user. Returns the Set-Cookie header value.
 */
export async function createSession(env: Env, userId: string): Promise<string> {
	const sid = randomId();
	await env.KV.put(
		KV_PREFIX + sid,
		JSON.stringify({ user_id: userId, created: Date.now() }),
		{ expirationTtl: SESSION_TTL_SECONDS },
	);
	return sessionCookie(sid, SESSION_TTL_SECONDS);
}

/**
 * Resolve the user_id from a request's Cookie header, or null if no valid
 * session.
 */
export async function readSessionUserId(env: Env, cookieHeader: string | undefined): Promise<string | null> {
	const sid = parseCookie(cookieHeader, SESSION_COOKIE);
	if (!sid) return null;
	const raw = await env.KV.get(KV_PREFIX + sid);
	if (!raw) return null;
	try {
		const data = JSON.parse(raw) as { user_id?: string };
		return typeof data.user_id === 'string' ? data.user_id : null;
	} catch {
		return null;
	}
}

export async function destroySession(env: Env, cookieHeader: string | undefined): Promise<void> {
	const sid = parseCookie(cookieHeader, SESSION_COOKIE);
	if (sid) await env.KV.delete(KV_PREFIX + sid);
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
	return [
		`${SESSION_COOKIE}=${value}`,
		'Path=/',
		'HttpOnly',
		'Secure',
		'SameSite=Lax',
		`Max-Age=${maxAgeSeconds}`,
	].join('; ');
}

export function clearSessionCookie(): string {
	return sessionCookie('', 0);
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
	if (!cookieHeader) return null;
	const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]!) : null;
}
