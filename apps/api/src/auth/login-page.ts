/**
 * Login / magic-link HTML pages (BL-024 phase 2). Shares the visual language
 * of the consent screen.
 */

import { html } from 'hono/html';

const SHELL_STYLE = `
	* { box-sizing: border-box; }
	body { margin:0; min-height:100vh; display:grid; place-items:center; padding:1.5rem;
		background:#f8f7f4; color:#1a1a1a;
		font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
	.card { max-width:28rem; width:100%; background:#fff; border-radius:1rem; padding:2rem;
		box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.06); }
	.brand { font-size:0.875rem; font-weight:600; letter-spacing:0.02em; color:#FF6B35; text-transform:uppercase; margin-bottom:0.5rem; }
	h1 { margin:0 0 1rem; font-size:1.5rem; line-height:1.25; font-weight:600; }
	.lede { margin:0 0 1.5rem; color:#555; line-height:1.55; }
	label.field { display:block; font-size:0.8125rem; font-weight:600; color:#555; margin-bottom:0.4rem; }
	input[type=email] { width:100%; font:inherit; padding:0.7rem 0.85rem; border:1px solid #e8e6e1; border-radius:0.5rem; margin-bottom:1.25rem; }
	input[type=email]:focus { outline:none; border-color:#FF6B35; }
	button { font:inherit; font-size:0.9375rem; font-weight:500; padding:0.7rem 1.25rem; border-radius:0.5rem; cursor:pointer; border:none;
		background:#1a1a1a; color:#fff; width:100%; }
	button:hover { background:#000; }
	.footer { text-align:center; margin-top:1.5rem; font-size:0.75rem; color:#999; }
	.footer a { color:inherit; text-decoration:underline; }
	.note { font-size:0.8125rem; color:#888; margin:1.25rem 0 0; }
`;

export function renderLogin(params: { returnTo: string; clientName: string; error?: string }) {
	return html`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in — Blitzlist</title><style>${SHELL_STYLE}</style></head>
<body>
	<form method="post" action="/auth/login" class="card">
		<div class="brand">Blitzlist</div>
		<h1>Sign in to continue</h1>
		<p class="lede"><strong>${params.clientName}</strong> wants to connect to your Blitzlist. Enter your email and we'll send you a sign-in link.</p>
		${params.error ? html`<p class="note" style="color:#c0392b;">${params.error}</p>` : ''}
		<label class="field" for="email">Email</label>
		<input id="email" type="email" name="email" required autofocus placeholder="you@example.com" autocomplete="email" />
		<input type="hidden" name="return_to" value="${params.returnTo}" />
		<button type="submit">Email me a sign-in link</button>
		<div class="footer">Blitzlist — <a href="https://blitzlist.ai">blitzlist.ai</a></div>
	</form>
</body></html>`;
}

export function renderCheckInbox(params: { email: string }) {
	return html`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Check your inbox — Blitzlist</title><style>${SHELL_STYLE}</style></head>
<body>
	<div class="card">
		<div class="brand">Blitzlist</div>
		<h1>Check your inbox</h1>
		<p class="lede">We sent a sign-in link to <strong>${params.email}</strong>. Click it to continue — it expires in 15 minutes.</p>
		<p class="note">You can close this tab; the link opens a fresh one. Didn't get it? Check spam, or <a href="javascript:history.back()">try again</a>.</p>
		<div class="footer">Blitzlist — <a href="https://blitzlist.ai">blitzlist.ai</a></div>
	</div>
</body></html>`;
}

export function renderAuthError(message: string) {
	return html`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign-in error — Blitzlist</title><style>${SHELL_STYLE}</style></head>
<body>
	<div class="card">
		<div class="brand">Blitzlist</div>
		<h1>Sign-in problem</h1>
		<p class="lede">${message}</p>
		<div class="footer">Blitzlist — <a href="https://blitzlist.ai">blitzlist.ai</a></div>
	</div>
</body></html>`;
}
