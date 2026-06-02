/**
 * OAuth consent screen — the /oauth/authorize endpoint.
 *
 * v0.1 single-user spike: there are no real user accounts yet (BL-009
 * magic-link signup lands in v0.5). The consent screen shows the client's
 * name + requested scopes and a single "Authorize" button. Approving issues
 * an OAuth grant bound to the hardcoded BLITZLIST_SPIKE_USER_ID and
 * BLITZLIST_SPIKE_WORKSPACE_ID.
 *
 * When BL-009 ships, this is where magic-link sign-in injects a real
 * user_id into the consent flow.
 */

import type { Context } from 'hono';
import { html } from 'hono/html';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { Env, OAuthProps } from '../env.js';

export async function consentGet(c: Context<{ Bindings: Env }>) {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);

	const clientName = client?.clientName ?? `Unknown client (${oauthReqInfo.clientId})`;
	const requestedScopes = oauthReqInfo.scope.length > 0 ? oauthReqInfo.scope : ['mcp'];

	// Serialize the auth request into a hidden form field so the POST handler
	// can re-parse it without needing another round-trip to KV.
	const encodedRequest = btoa(JSON.stringify(oauthReqInfo));

	return c.html(renderConsent({
		clientName,
		requestedScopes,
		encodedRequest,
		userDisplay: c.env.BLITZLIST_SPIKE_USER_ID,
	}));
}

export async function consentPost(c: Context<{ Bindings: Env }>) {
	const form = await c.req.formData();
	const decision = form.get('decision');
	const encoded = form.get('request');

	if (typeof encoded !== 'string') {
		return c.html(renderError('Malformed consent submission — missing request blob.'), 400);
	}

	let oauthReqInfo: AuthRequest;
	try {
		oauthReqInfo = JSON.parse(atob(encoded)) as AuthRequest;
	} catch {
		return c.html(renderError('Could not decode auth request.'), 400);
	}

	if (decision !== 'approve') {
		// Standard error: the OAuth client gets access_denied
		const denyUrl = new URL(oauthReqInfo.redirectUri);
		denyUrl.searchParams.set('error', 'access_denied');
		denyUrl.searchParams.set('error_description', 'User declined authorization.');
		if (oauthReqInfo.state) denyUrl.searchParams.set('state', oauthReqInfo.state);
		return c.redirect(denyUrl.toString(), 302);
	}

	const props: OAuthProps = {
		user_id: c.env.BLITZLIST_SPIKE_USER_ID,
		workspace_id: c.env.BLITZLIST_SPIKE_WORKSPACE_ID,
	};

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: c.env.BLITZLIST_SPIKE_USER_ID,
		metadata: {
			label: 'Blitzlist spike user',
		},
		scope: oauthReqInfo.scope.length > 0 ? oauthReqInfo.scope : ['mcp'],
		props,
	});

	return c.redirect(redirectTo, 302);
}

// === Templates ===============================================================

function renderConsent(params: {
	clientName: string;
	requestedScopes: string[];
	encodedRequest: string;
	userDisplay: string;
}) {
	return html`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Authorize ${params.clientName} — Blitzlist</title>
	<style>
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			display: grid;
			place-items: center;
			padding: 1.5rem;
			background: #f8f7f4;
			color: #1a1a1a;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			-webkit-font-smoothing: antialiased;
		}
		.card {
			max-width: 28rem;
			width: 100%;
			background: white;
			border-radius: 1rem;
			padding: 2rem;
			box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
		}
		.brand {
			font-size: 0.875rem;
			font-weight: 600;
			letter-spacing: 0.02em;
			color: #FF6B35;
			text-transform: uppercase;
			margin-bottom: 0.5rem;
		}
		h1 {
			margin: 0 0 1rem;
			font-size: 1.5rem;
			line-height: 1.25;
			font-weight: 600;
		}
		.lede {
			margin: 0 0 1.5rem;
			color: #555;
			line-height: 1.55;
		}
		.detail {
			background: #f8f7f4;
			border-radius: 0.5rem;
			padding: 1rem;
			margin: 0 0 1.5rem;
			font-size: 0.875rem;
		}
		.detail dt {
			color: #777;
			font-weight: 500;
			margin: 0.5rem 0 0.125rem;
		}
		.detail dt:first-child { margin-top: 0; }
		.detail dd {
			margin: 0;
			color: #1a1a1a;
		}
		.scopes {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.scopes li {
			padding: 0.25rem 0;
		}
		.scopes code {
			background: white;
			padding: 0.125rem 0.5rem;
			border-radius: 0.25rem;
			font-size: 0.8125rem;
			border: 1px solid #e8e6e1;
		}
		.notice {
			font-size: 0.8125rem;
			color: #888;
			margin: 0 0 1.5rem;
			padding: 0.75rem;
			border-left: 3px solid #FF6B35;
			background: #fff7f3;
			border-radius: 0 0.25rem 0.25rem 0;
		}
		.actions {
			display: flex;
			gap: 0.75rem;
			justify-content: flex-end;
		}
		button {
			font: inherit;
			font-size: 0.9375rem;
			font-weight: 500;
			padding: 0.625rem 1.25rem;
			border-radius: 0.5rem;
			cursor: pointer;
			border: none;
			transition: transform 0.05s ease, box-shadow 0.15s ease;
		}
		button:active { transform: translateY(1px); }
		.deny {
			background: transparent;
			color: #555;
		}
		.deny:hover { background: #f0eeea; }
		.approve {
			background: #1a1a1a;
			color: white;
			box-shadow: 0 1px 2px rgba(0,0,0,0.1);
		}
		.approve:hover { background: #000; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
		.footer {
			text-align: center;
			margin-top: 1.5rem;
			font-size: 0.75rem;
			color: #999;
		}
		.footer a {
			color: inherit;
			text-decoration: underline;
		}
	</style>
</head>
<body>
	<form method="post" class="card">
		<div class="brand">Blitzlist</div>
		<h1>Authorize ${params.clientName}?</h1>
		<p class="lede">
			An application is requesting access to your Blitzlist workspace.
		</p>

		<dl class="detail">
			<dt>You'll be signed in as</dt>
			<dd>${params.userDisplay} (single-user spike)</dd>
			<dt>Application</dt>
			<dd>${params.clientName}</dd>
			<dt>Permissions requested</dt>
			<dd>
				<ul class="scopes">
					${params.requestedScopes.map((s) => html`<li><code>${s}</code></li>`)}
				</ul>
			</dd>
		</dl>

		<p class="notice">
			This is a v0.1 single-user spike of Blitzlist. Real magic-link sign-in
			and multi-user workspaces ship in v0.5. Approving here authorizes the
			application against the hardcoded spike user.
		</p>

		<input type="hidden" name="request" value="${params.encodedRequest}" />
		<div class="actions">
			<button type="submit" name="decision" value="deny" class="deny">Deny</button>
			<button type="submit" name="decision" value="approve" class="approve">Authorize</button>
		</div>

		<div class="footer">
			Blitzlist — <a href="https://github.com/ai-fy/Blitzlist">github.com/ai-fy/Blitzlist</a>
		</div>
	</form>
</body>
</html>`;
}

function renderError(message: string) {
	return html`<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Authorization error</title></head>
<body style="font-family: system-ui; padding: 2rem; max-width: 32rem; margin: 0 auto;">
	<h1>Authorization error</h1>
	<p>${message}</p>
	<p><a href="https://github.com/ai-fy/Blitzlist">Back to Blitzlist</a></p>
</body>
</html>`;
}
