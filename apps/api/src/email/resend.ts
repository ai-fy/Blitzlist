/**
 * Email sending via Resend (BL-024 phase 2).
 *
 * Behind a tiny interface so the provider is swappable — if we move off
 * Resend, only this file changes. The rest of the auth code calls
 * sendEmail(env, msg).
 *
 * Config:
 *   env.RESEND_API_KEY  — secret (wrangler secret put / dashboard)
 *   env.EMAIL_FROM      — verified sender, e.g. "blitzlist@flowsy.de"
 */

import type { Env } from '../env.js';

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
	text?: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(env: Env, msg: EmailMessage): Promise<SendResult> {
	if (!env.RESEND_API_KEY) {
		return { ok: false, error: 'RESEND_API_KEY is not configured' };
	}
	if (!env.EMAIL_FROM) {
		return { ok: false, error: 'EMAIL_FROM is not configured' };
	}
	try {
		const res = await fetch(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${env.RESEND_API_KEY}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				from: env.EMAIL_FROM,
				to: [msg.to],
				subject: msg.subject,
				html: msg.html,
				...(msg.text ? { text: msg.text } : {}),
			}),
		});
		if (!res.ok) {
			const body = await res.text();
			return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
		}
		const data = (await res.json()) as { id?: string };
		return { ok: true, id: data.id ?? 'unknown' };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'email send failed' };
	}
}
