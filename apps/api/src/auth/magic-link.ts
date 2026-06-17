/**
 * Magic-link tokens (BL-024 phase 2).
 *
 * A magic-link token is a one-time, short-lived random value stored in KV.
 * Requesting one emails the user a verify URL; clicking it consumes the token
 * (deleted on read) and establishes a session.
 *
 * The token payload carries the `return_to` — the original /oauth/authorize
 * query string — so after login we resume the exact OAuth authorization the
 * user started.
 */

import type { Env } from '../env.js';
import { sendEmail, type SendResult } from '../email/resend.js';

const KV_PREFIX = 'magic:';
const TOKEN_TTL_SECONDS = 60 * 15; // 15 minutes

type MagicPayload = { email: string; return_to: string };

function randomToken(bytes = 32): string {
	const a = new Uint8Array(bytes);
	crypto.getRandomValues(a);
	return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mint a magic-link token, store it, and email the verify link.
 * `origin` is the request origin (e.g. https://mcp.blitzlist.ai) so the link
 * points back at the same host the user is on.
 */
export async function requestMagicLink(
	env: Env,
	opts: { email: string; returnTo: string; origin: string },
): Promise<SendResult> {
	const token = randomToken();
	const payload: MagicPayload = { email: opts.email, return_to: opts.returnTo };
	await env.KV.put(KV_PREFIX + token, JSON.stringify(payload), { expirationTtl: TOKEN_TTL_SECONDS });

	const verifyUrl = `${opts.origin}/auth/verify?token=${encodeURIComponent(token)}`;
	const subject = 'Your Blitzlist sign-in link';
	const html = renderEmail(verifyUrl);
	const text = `Sign in to Blitzlist:\n\n${verifyUrl}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`;
	return sendEmail(env, { to: opts.email, subject, html, text });
}

/**
 * Consume a magic-link token (one-time). Returns the payload or null if the
 * token is unknown/expired/already used.
 */
export async function verifyMagicLink(env: Env, token: string): Promise<MagicPayload | null> {
	if (!token) return null;
	const raw = await env.KV.get(KV_PREFIX + token);
	if (!raw) return null;
	await env.KV.delete(KV_PREFIX + token); // one-time use
	try {
		const p = JSON.parse(raw) as MagicPayload;
		if (typeof p.email !== 'string') return null;
		return { email: p.email, return_to: typeof p.return_to === 'string' ? p.return_to : '' };
	} catch {
		return null;
	}
}

function renderEmail(verifyUrl: string): string {
	return `<!doctype html><html><body style="margin:0;background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1a1a1a;">
  <div style="max-width:28rem;margin:2rem auto;background:#fff;border-radius:1rem;padding:2rem;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
    <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.02em;color:#FF6B35;text-transform:uppercase;margin-bottom:0.5rem;">Blitzlist</div>
    <h1 style="font-size:1.4rem;margin:0 0 1rem;">Sign in</h1>
    <p style="color:#555;line-height:1.55;margin:0 0 1.5rem;">Click the button below to sign in to Blitzlist. This link expires in 15 minutes.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:500;padding:0.7rem 1.4rem;border-radius:0.5rem;">Sign in to Blitzlist</a>
    <p style="color:#999;font-size:0.8rem;line-height:1.5;margin:1.5rem 0 0;">If the button doesn't work, paste this URL into your browser:<br><span style="color:#666;word-break:break-all;">${verifyUrl}</span></p>
    <p style="color:#bbb;font-size:0.75rem;margin:1.5rem 0 0;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body></html>`;
}
