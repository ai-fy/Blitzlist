/**
 * OAuth consent screen — the /oauth/authorize endpoint.
 *
 * Multi-tenant phase 1 (BL-024): the consent screen now lists the workspaces
 * the signed-in user belongs to and lets them pick WHICH workspace this MCP
 * client connection targets. The chosen workspace is baked into the grant
 * props, so different clients (or re-authorizations) can target different
 * workspaces.
 *
 * Identity is still the bootstrap user (BLITZLIST_SPIKE_USER_ID) until phase 2
 * wires real login (magic-link). When that lands, only the "who is the user"
 * resolution here changes — the workspace picker stays.
 */

import type { Context } from 'hono';
import { html } from 'hono/html';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import { eq } from 'drizzle-orm';
import { schema } from '@blitzlist/db';
import type { Env, OAuthProps } from '../env.js';
import { getDb } from '../db.js';

type WorkspaceChoice = { id: string; name: string; slug: string; role: string };

/**
 * Resolve the current consenting user. Phase 1: the bootstrap user. Phase 2
 * replaces this with the magic-link-authenticated identity.
 */
function currentUserId(c: Context<{ Bindings: Env }>): string {
	return c.env.BLITZLIST_SPIKE_USER_ID;
}

async function membershipsFor(c: Context<{ Bindings: Env }>, userId: string): Promise<WorkspaceChoice[]> {
	const db = getDb(c.env);
	const rows = await db
		.select({
			id: schema.workspaces.id,
			name: schema.workspaces.name,
			slug: schema.workspaces.slug,
			role: schema.workspace_members.role,
		})
		.from(schema.workspace_members)
		.innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspace_members.workspace_id))
		.where(eq(schema.workspace_members.user_id, userId));
	return rows;
}

export async function consentGet(c: Context<{ Bindings: Env }>) {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);

	const clientName = client?.clientName ?? `Unknown client (${oauthReqInfo.clientId})`;
	const requestedScopes = oauthReqInfo.scope.length > 0 ? oauthReqInfo.scope : ['mcp'];
	const encodedRequest = btoa(JSON.stringify(oauthReqInfo));

	const userId = currentUserId(c);
	const workspaces = await membershipsFor(c, userId);
	const defaultWorkspaceId =
		workspaces.find((w) => w.id === c.env.BLITZLIST_SPIKE_WORKSPACE_ID)?.id ??
		workspaces[0]?.id ??
		c.env.BLITZLIST_SPIKE_WORKSPACE_ID;

	return c.html(renderConsent({
		clientName,
		requestedScopes,
		encodedRequest,
		userDisplay: userId,
		workspaces,
		defaultWorkspaceId,
	}));
}

export async function consentPost(c: Context<{ Bindings: Env }>) {
	const form = await c.req.formData();
	const decision = form.get('decision');
	const encoded = form.get('request');
	const chosenWorkspace = form.get('workspace_id');

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
		const denyUrl = new URL(oauthReqInfo.redirectUri);
		denyUrl.searchParams.set('error', 'access_denied');
		denyUrl.searchParams.set('error_description', 'User declined authorization.');
		if (oauthReqInfo.state) denyUrl.searchParams.set('state', oauthReqInfo.state);
		return c.redirect(denyUrl.toString(), 302);
	}

	const userId = currentUserId(c);

	// Validate the chosen workspace against the user's memberships — never trust
	// the posted value. Fall back to the bootstrap workspace if absent/invalid.
	const workspaces = await membershipsFor(c, userId);
	const valid = workspaces.find((w) => w.id === chosenWorkspace);
	const workspace_id = valid?.id ?? c.env.BLITZLIST_SPIKE_WORKSPACE_ID;

	const props: OAuthProps = { user_id: userId, workspace_id };

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId,
		metadata: {
			label: 'Blitzlist user',
			workspace_id,
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
	workspaces: WorkspaceChoice[];
	defaultWorkspaceId: string;
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
		.ws-picker {
			margin: 0 0 1.5rem;
		}
		.ws-picker > .label {
			display: block;
			font-size: 0.8125rem;
			font-weight: 600;
			color: #555;
			margin-bottom: 0.5rem;
		}
		.ws-option {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			padding: 0.75rem;
			border: 1px solid #e8e6e1;
			border-radius: 0.5rem;
			margin-bottom: 0.5rem;
			cursor: pointer;
			transition: border-color 0.12s, background 0.12s;
		}
		.ws-option:hover { border-color: #FF6B35; background: #fff7f3; }
		.ws-option:last-child { margin-bottom: 0; }
		.ws-option input { accent-color: #FF6B35; }
		.ws-option .ws-name { font-weight: 500; }
		.ws-option .ws-role {
			margin-left: auto;
			font-size: 0.6875rem;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: #999;
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
			<dd>${params.userDisplay}</dd>
			<dt>Application</dt>
			<dd>${params.clientName}</dd>
			<dt>Permissions requested</dt>
			<dd>
				<ul class="scopes">
					${params.requestedScopes.map((s) => html`<li><code>${s}</code></li>`)}
				</ul>
			</dd>
		</dl>

		<div class="ws-picker">
			<span class="label">Connect this app to which workspace?</span>
			${params.workspaces.length > 0
				? params.workspaces.map(
						(w) => html`<label class="ws-option">
							<input type="radio" name="workspace_id" value="${w.id}" ${w.id === params.defaultWorkspaceId ? 'checked' : ''} />
							<span class="ws-name">${w.name}</span>
							<span class="ws-role">${w.role}</span>
						</label>`,
					)
				: html`<label class="ws-option">
						<input type="radio" name="workspace_id" value="${params.defaultWorkspaceId}" checked />
						<span class="ws-name">Default workspace</span>
					</label>`}
		</div>

		<p class="notice">
			This MCP client connection will be bound to the workspace you pick.
			To use a different workspace, re-authorize and choose another — or mint
			an agent token while connected to it.
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
