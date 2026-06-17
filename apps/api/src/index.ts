/**
 * Blitzlist API Worker — entrypoint.
 *
 * Wrapped by `OAuthProvider` (from @cloudflare/workers-oauth-provider).
 * The provider:
 *   - serves the OAuth metadata endpoints
 *       /.well-known/oauth-protected-resource
 *       /.well-known/oauth-authorization-server
 *   - serves /oauth/token and /oauth/register itself
 *   - delegates /oauth/authorize to our defaultHandler (we show consent UI)
 *   - validates Bearer tokens on /mcp before passing to apiHandler
 *   - passes the grant's `props` into ctx.props for the apiHandler
 *
 * Routes summary:
 *   GET  /                              service description (public)
 *   GET  /healthz                       liveness probe (public)
 *   GET  /oauth/authorize               consent screen (public)
 *   POST /oauth/authorize               consent decision handler (public)
 *   POST /mcp                           MCP server (OAuth-gated; tools in BL-006+)
 *
 * Auto-served by OAuthProvider (no code in this file):
 *   GET  /.well-known/oauth-protected-resource
 *   GET  /.well-known/oauth-authorization-server
 *   POST /oauth/token
 *   POST /oauth/register
 */

import { Hono } from 'hono';
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema, type StakeholderPermission, type StakeholderScope, type FieldDef, type ListMeta } from '@blitzlist/db';
import { findStateFieldDef, validateFieldValue, validateItemFields } from '@blitzlist/core';
import {
	type JsonRpcNotification,
	type JsonRpcRequest,
	RpcError,
	errorResponse,
	handleMcpMessage,
	isJsonRpcRequest,
	isNotification,
} from '@blitzlist/mcp';
import { looksLikeStakeholderKey, looksLikeShareCode, looksLikeAgentToken, sha256Hex } from '@blitzlist/core';
import type { Env, OAuthProps } from './env.js';
import { consentGet, consentPost } from './oauth/consent.js';
import { getDb, nextItemId, uuid } from './db.js';
import { toolRegistry } from './tools/index.js';
import { stakeholderToolRegistry } from './tools/stakeholder/index.js';
import { agentToolRegistry } from './tools/agent/index.js';
import type { ScopedToolContext } from './stakeholder-context.js';
import { resolveAllowedListIds } from './tools/stakeholder/_scope-helper.js';
import { itemsToCSV, itemsToMarkdown, itemsToXLSX, sanitizeFilename } from './roadmap/export.js';
import { renderRoadmap } from './roadmap/render.js';
import { getObject } from './r2.js';
import { recordNovelStateForItem, recordNovelStateForList } from './tools/_state-extras-helper.js';

const VERSION = '0.1.0';

export type { Env, OAuthProps } from './env.js';

// === Default handler — everything except /mcp ================================
//
// Public routes plus the OAuth consent screen at /oauth/authorize.

const defaultApp = new Hono<{ Bindings: Env }>();

defaultApp.get('/', (c) => {
	return c.json({
		name: 'blitzlist-api',
		version: VERSION,
		description: 'Shared memory for hybrid human-agent teams. AI-first. MCP-native.',
		docs: 'https://github.com/ai-fy/Blitzlist',
		mcp: '/mcp (POST, OAuth-gated; tools in BL-006+)',
		oauth: {
			metadata: '/.well-known/oauth-authorization-server',
			resource_metadata: '/.well-known/oauth-protected-resource',
			authorize: '/oauth/authorize',
			token: '/oauth/token',
			register: '/oauth/register',
		},
	});
});

defaultApp.get('/healthz', (c) => {
	return c.json({
		ok: true,
		version: VERSION,
		timestamp: new Date().toISOString(),
	});
});

defaultApp.get('/oauth/authorize', consentGet);
defaultApp.post('/oauth/authorize', consentPost);

// === Stakeholder MCP at /s/mcp (BL-011) ======================================
//
// Bearer-key authentication (NOT OAuth). Scoped tool surface — only the three
// stakeholder-scoped tools are exposed. Auth flow:
//   1. Read Authorization: Bearer blz_sk_<32-base32>
//   2. Hash, look up in stakeholder_access_keys (not revoked, not expired)
//   3. Resolve scope -> allowed_list_ids
//   4. Bump use_count + last_used_at (fire-and-forget)
//   5. Build StakeholderToolContext, route through handleMcpMessage
//
// Path is /s/mcp (not /mcp/...) because OAuthProvider's apiRoute='/mcp' would
// otherwise gate this with OAuth too.

defaultApp.post('/s/mcp', async (c) => {
	const authHeader = c.req.header('authorization') ?? c.req.header('Authorization');
	const match = authHeader?.match(/^Bearer\s+(.+)$/i);
	const raw = match?.[1]?.trim();
	if (!raw || !looksLikeStakeholderKey(raw)) {
		return c.json(
			{ error: 'invalid_token', error_description: 'Bearer stakeholder key required.' },
			401,
		);
	}

	const hash = await sha256Hex(raw);
	const db = getDb(c.env);
	const now = new Date();
	const nowSeconds = Math.floor(now.getTime() / 1000);

	const keyRows = await db
		.select()
		.from(schema.stakeholder_access_keys)
		.where(
			and(
				eq(schema.stakeholder_access_keys.key_hash, hash),
				isNull(schema.stakeholder_access_keys.revoked_at),
				or(
					isNull(schema.stakeholder_access_keys.expires_at),
					gt(schema.stakeholder_access_keys.expires_at, new Date(nowSeconds * 1000)),
				),
			),
		)
		.limit(1);
	const key = keyRows[0];
	if (!key) {
		return c.json({ error: 'invalid_token', error_description: 'Key not recognized.' }, 401);
	}

	// Resolve scope → list ids.
	const scope = key.scope_json as StakeholderScope;
	const permissions = key.permissions_json as StakeholderPermission[];
	const allowed_list_ids = await resolveAllowedListIds(db, key.workspace_id, scope);

	// Bump usage stats (fire-and-forget — we don't await beyond the kickoff).
	c.executionCtx.waitUntil(
		db
			.update(schema.stakeholder_access_keys)
			.set({
				last_used_at: now,
				use_count: sql`use_count + 1`,
			})
			.where(eq(schema.stakeholder_access_keys.id, key.id)),
	);

	// Parse the MCP request body.
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return Response.json(
			errorResponse(null, RpcError.PARSE_ERROR, 'Invalid JSON in request body'),
			{ status: 400 },
		);
	}
	const isReq = isJsonRpcRequest(body);
	const isNotif = isNotification(body);
	if (!isReq && !isNotif) {
		return Response.json(
			errorResponse(null, RpcError.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 message'),
			{ status: 400 },
		);
	}
	const message = body as JsonRpcRequest | JsonRpcNotification;

	const toolContext: ScopedToolContext = {
		workspace_id: key.workspace_id,
		db,
		actor: {
			type: 'stakeholder',
			key_id: key.id,
			prefix: key.prefix,
			label: key.label,
		},
		scope,
		permissions,
		allowed_list_ids,
	};

	const response = await handleMcpMessage(message, {
		name: 'blitzlist',
		version: VERSION,
		tools: stakeholderToolRegistry,
		toolContext,
	});

	if (response === null) {
		return new Response(null, { status: 202 });
	}
	return Response.json(response);
});

// === Agent MCP at /a/mcp (BL-023) ============================================
//
// Headless agents (e.g. Hermes) authenticate with a static blz_at_ bearer
// token and get create/edit/share access — NO admin tools. The token resolves
// to the FULL workspace context (it acts AS the owner who minted it), so the
// tools run with the same WorkspaceToolCtx as the OAuth /mcp path; only the
// registry is narrower (agentToolRegistry).
defaultApp.post('/a/mcp', async (c) => {
	const authHeader = c.req.header('authorization') ?? c.req.header('Authorization');
	const match = authHeader?.match(/^Bearer\s+(.+)$/i);
	const raw = match?.[1]?.trim();
	if (!raw || !looksLikeAgentToken(raw)) {
		return c.json(
			{ error: 'invalid_token', error_description: 'Bearer agent token required.' },
			401,
		);
	}

	const hash = await sha256Hex(raw);
	const db = getDb(c.env);
	const now = new Date();
	const nowSeconds = Math.floor(now.getTime() / 1000);

	const tokenRows = await db
		.select()
		.from(schema.agent_tokens)
		.where(
			and(
				eq(schema.agent_tokens.token_hash, hash),
				isNull(schema.agent_tokens.revoked_at),
				or(
					isNull(schema.agent_tokens.expires_at),
					gt(schema.agent_tokens.expires_at, new Date(nowSeconds * 1000)),
				),
			),
		)
		.limit(1);
	const token = tokenRows[0];
	if (!token) {
		return c.json({ error: 'invalid_token', error_description: 'Token not recognized.' }, 401);
	}
	if (!token.created_by) {
		return c.json(
			{ error: 'invalid_token', error_description: 'Token has no owner context.' },
			401,
		);
	}

	c.executionCtx.waitUntil(
		db
			.update(schema.agent_tokens)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.agent_tokens.id, token.id)),
	);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return Response.json(
			errorResponse(null, RpcError.PARSE_ERROR, 'Invalid JSON in request body'),
			{ status: 400 },
		);
	}
	const isReq = isJsonRpcRequest(body);
	const isNotif = isNotification(body);
	if (!isReq && !isNotif) {
		return Response.json(
			errorResponse(null, RpcError.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 message'),
			{ status: 400 },
		);
	}
	const message = body as JsonRpcRequest | JsonRpcNotification;

	const response = await handleMcpMessage(message, {
		name: 'blitzlist',
		version: VERSION,
		tools: agentToolRegistry,
		toolContext: {
			user_id: token.created_by,
			workspace_id: token.workspace_id,
			db,
			env: c.env,
		},
	});

	if (response === null) {
		return new Response(null, { status: 202 });
	}
	return Response.json(response);
});

// === Share-code MCP at /c/:code/mcp (BL-030) =================================
//
// "Anyone with the link." The 4-word code in the URL path IS the credential —
// no separate Authorization header. Same scope/permission shape as /s/mcp;
// different actor type (share_code vs stakeholder). Default 30-day expiry,
// default read-only, optional comment permission.

defaultApp.post('/c/:code/mcp', async (c) => {
	const rawCode = c.req.param('code');
	if (!rawCode || !looksLikeShareCode(rawCode)) {
		return c.json({ error: 'invalid_code', error_description: 'Malformed share code in URL.' }, 401);
	}

	const db = getDb(c.env);
	const now = new Date();

	const rows = await db
		.select()
		.from(schema.share_codes)
		.where(
			and(
				eq(schema.share_codes.code, rawCode),
				isNull(schema.share_codes.revoked_at),
				or(
					isNull(schema.share_codes.expires_at),
					gt(schema.share_codes.expires_at, now),
				),
			),
		)
		.limit(1);
	const sc = rows[0];
	if (!sc) {
		return c.json(
			{ error: 'invalid_code', error_description: 'Share code not found, revoked, or expired.' },
			401,
		);
	}

	const scope = sc.scope_json as StakeholderScope;
	const permissions = sc.permissions_json as StakeholderPermission[];
	const allowed_list_ids = await resolveAllowedListIds(db, sc.workspace_id, scope);

	c.executionCtx.waitUntil(
		db
			.update(schema.share_codes)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return Response.json(
			errorResponse(null, RpcError.PARSE_ERROR, 'Invalid JSON in request body'),
			{ status: 400 },
		);
	}
	const isReq = isJsonRpcRequest(body);
	const isNotif = isNotification(body);
	if (!isReq && !isNotif) {
		return Response.json(
			errorResponse(null, RpcError.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 message'),
			{ status: 400 },
		);
	}
	const message = body as JsonRpcRequest | JsonRpcNotification;

	const toolContext: ScopedToolContext = {
		workspace_id: sc.workspace_id,
		db,
		actor: {
			type: 'share_code',
			code: sc.code,
			label: sc.label,
		},
		scope,
		permissions,
		allowed_list_ids,
	};

	const response = await handleMcpMessage(message, {
		name: 'blitzlist',
		version: VERSION,
		tools: stakeholderToolRegistry,
		toolContext,
	});

	if (response === null) {
		return new Response(null, { status: 202 });
	}
	return Response.json(response);
});

// Minimal HTML error page used by /r/:code and other web routes.
function renderError(title: string, message: string): string {
	const esc = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Blitzlist</title><style>html,body{background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,system-ui,sans-serif;margin:0;height:100%;}body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;}h1{font-family:ui-monospace,monospace;font-size:1.5rem;font-weight:800;margin:0 0 .5rem;}p{color:#888;max-width:30rem;line-height:1.5;}a{color:#ffd400;text-decoration:none;margin-top:2rem;font-family:ui-monospace,monospace;font-size:.85rem;}</style></head><body><h1>${esc(title)}</h1><p>${esc(message)}</p><a href="https://blitzlist.ai">⚡ blitzlist.ai</a></body></html>`;
}

// === Public roadmap web page at /r/:code (BL-013) ============================
//
// Renders a single-page HTML view of the share-code-scoped data. Same auth
// surface as /c/:code/mcp; just an HTML rendering instead of JSON-RPC.
// Lives on mcp.blitzlist.ai/r/<code> for v0.5; can be re-homed to
// blitzlist.ai/r/<code> later via Pages Functions or routes.

defaultApp.get('/r/:code', async (c) => {
	const rawCode = c.req.param('code');
	if (!rawCode || !looksLikeShareCode(rawCode)) {
		return c.html(renderError('Bad link', 'That share code is malformed.'), 404);
	}

	const db = getDb(c.env);
	const now = new Date();

	const scRows = await db
		.select()
		.from(schema.share_codes)
		.where(
			and(
				eq(schema.share_codes.code, rawCode),
				isNull(schema.share_codes.revoked_at),
				or(
					isNull(schema.share_codes.expires_at),
					gt(schema.share_codes.expires_at, now),
				),
			),
		)
		.limit(1);
	const sc = scRows[0];
	if (!sc) {
		return c.html(
			renderError(
				'Link unavailable',
				'This share link is invalid, expired, or has been revoked.',
			),
			404,
		);
	}

	const scope = sc.scope_json as StakeholderScope;
	const allowed_list_ids = await resolveAllowedListIds(db, sc.workspace_id, scope);

	// For v0.5 the page renders ONE list — the first one in scope. Workspace-
	// wide codes get a "pick a list" page later; for now use the first list.
	let targetListId: string | null = null;
	if (allowed_list_ids !== null && allowed_list_ids.length > 0) {
		targetListId = allowed_list_ids[0]!;
	} else if (allowed_list_ids === null) {
		// workspace-wide — pick the first non-archived list
		const lr = await db
			.select({ id: schema.lists.id })
			.from(schema.lists)
			.where(
				and(eq(schema.lists.workspace_id, sc.workspace_id), eq(schema.lists.archived, false)),
			)
			.limit(1);
		targetListId = lr[0]?.id ?? null;
	}
	if (!targetListId) {
		return c.html(
			renderError('Nothing to show', 'This workspace has no lists yet.'),
			404,
		);
	}

	// Load list, workspace, template, items.
	const [listRow, wsRow] = await Promise.all([
		db.select().from(schema.lists).where(eq(schema.lists.id, targetListId)).limit(1),
		db.select().from(schema.workspaces).where(eq(schema.workspaces.id, sc.workspace_id)).limit(1),
	]);
	const list = listRow[0];
	const workspace = wsRow[0];
	if (!list || !workspace) {
		return c.html(renderError('Nothing to show', 'The shared list could not be loaded.'), 500);
	}

	const template = list.template_id
		? (
				await db
					.select()
					.from(schema.templates)
					.where(eq(schema.templates.id, list.template_id))
					.limit(1)
			)[0] ?? null
		: null;

	const memberRows = await db
		.select({ item_id: schema.item_lists.item_id })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.list_id, list.id));
	const itemIds = memberRows.map((m) => m.item_id);
	const itemRows = itemIds.length > 0
		? await db.select().from(schema.items).where(inArray(schema.items.id, itemIds))
		: [];

	// Load comments for these items (latest 10 per item, batched).
	const commentsByItem: Record<string, typeof schema.comments.$inferSelect[]> = {};
	if (itemIds.length > 0) {
		const commentRows = await db
			.select()
			.from(schema.comments)
			.where(inArray(schema.comments.item_id, itemIds))
			.orderBy(desc(schema.comments.created_at));
		for (const row of commentRows) {
			const arr = commentsByItem[row.item_id] ?? [];
			if (arr.length < 10) arr.push(row);
			commentsByItem[row.item_id] = arr;
		}
	}

	// Pre-load attachment file metadata referenced by visible items. Single
	// batched query; rendering layer stays pure.
	const attachmentFieldKeys = new Set(
		(template?.fields_schema_json as FieldDef[] | undefined ?? [])
			.filter((f) => f.type === 'attachment')
			.map((f) => f.key),
	);
	const referencedFileIds = new Set<string>();
	if (attachmentFieldKeys.size > 0) {
		for (const item of itemRows) {
			const fields = item.fields_json as Record<string, unknown>;
			for (const key of attachmentFieldKeys) {
				const v = fields[key];
				if (typeof v === 'string') referencedFileIds.add(v);
				else if (Array.isArray(v)) {
					for (const e of v) if (typeof e === 'string') referencedFileIds.add(e);
				}
			}
		}
	}
	const filesById: Record<string, { id: string; name: string; mime_type: string; size_bytes: number }> = {};
	if (referencedFileIds.size > 0) {
		const fileRows = await db
			.select({
				id: schema.files.id,
				name: schema.files.name,
				mime_type: schema.files.mime_type,
				size_bytes: schema.files.size_bytes,
			})
			.from(schema.files)
			.where(
				and(
					inArray(schema.files.id, Array.from(referencedFileIds)),
					eq(schema.files.workspace_id, sc.workspace_id),
					isNull(schema.files.revoked_at),
				),
			);
		for (const f of fileRows) filesById[f.id] = f;
	}

	const permissions = sc.permissions_json as StakeholderPermission[];
	const displayName = readDisplayNameCookie(c.req.header('cookie'));

	// Flash messages via query param. Cleared on next render.
	const flashKind = c.req.query('flash') === 'error' ? 'error' : c.req.query('flash') === 'ok' ? 'ok' : null;
	const flashMsg = c.req.query('msg');
	const flash =
		flashKind && flashMsg
			? { kind: flashKind as 'ok' | 'error', message: flashMsg }
			: undefined;

	// Visitor-side view override via ?view=...
	const rawView = c.req.query('view');
	const validViews = ['list', 'kanban', 'table', 'todo', 'calendar', 'compass'] as const;
	const view_override = rawView && (validViews as readonly string[]).includes(rawView)
		? (rawView as (typeof validViews)[number])
		: undefined;

	// Bump use_count fire-and-forget.
	c.executionCtx.waitUntil(
		db
			.update(schema.share_codes)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);

	const html = renderRoadmap({
		workspace,
		list,
		template,
		items: itemRows,
		commentsByItem,
		filesById,
		share_code: sc.code,
		view_url: `https://mcp.blitzlist.ai/r/${sc.code}`,
		permissions,
		display_name: displayName,
		flash,
		view_override,
	});

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'private, max-age=30, must-revalidate',
			'x-frame-options': 'DENY',
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'strict-origin-when-cross-origin',
		},
	});
});

// =============================================================================
// /r/:code POST handlers — comment, state change, new item, identify
// =============================================================================

/**
 * Load + validate a share code by raw URL string. Returns the row or null.
 */
async function loadShareCode(db: ReturnType<typeof getDb>, rawCode: string) {
	if (!looksLikeShareCode(rawCode)) return null;
	const now = new Date();
	const rows = await db
		.select()
		.from(schema.share_codes)
		.where(
			and(
				eq(schema.share_codes.code, rawCode),
				isNull(schema.share_codes.revoked_at),
				or(
					isNull(schema.share_codes.expires_at),
					gt(schema.share_codes.expires_at, now),
				),
			),
		)
		.limit(1);
	return rows[0] ?? null;
}

function readDisplayNameCookie(cookie: string | undefined): string | undefined {
	if (!cookie) return undefined;
	const match = cookie.match(/(?:^|;\s*)blz_name=([^;]+)/);
	if (!match) return undefined;
	try {
		return decodeURIComponent(match[1]!).slice(0, 40);
	} catch {
		return undefined;
	}
}

function setDisplayNameCookieHeader(name: string | null): string {
	if (!name) {
		return `blz_name=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
	}
	const encoded = encodeURIComponent(name.slice(0, 40));
	// 90 days
	return `blz_name=${encoded}; Path=/; Max-Age=7776000; SameSite=Lax; Secure`;
}

const VALID_VIEW_NAMES = ['list', 'kanban', 'table', 'todo', 'calendar', 'compass'];

/**
 * Extract the ?view=... value from a request's Referer header so we can
 * preserve the user's chosen view through POST→303 redirects. Used by every
 * form/interaction on the /r/<code> page.
 */
function viewFromReferer(referer: string | undefined): string | undefined {
	if (!referer) return undefined;
	try {
		const v = new URL(referer).searchParams.get('view');
		if (v && VALID_VIEW_NAMES.includes(v)) return v;
	} catch {
		/* ignore malformed */
	}
	return undefined;
}

function redirectToRoadmap(
	code: string,
	flash?: { kind: 'ok' | 'error'; message: string },
	setCookie?: string,
	view?: string,
) {
	const u = new URL(`https://mcp.blitzlist.ai/r/${code}`);
	if (view && VALID_VIEW_NAMES.includes(view)) u.searchParams.set('view', view);
	if (flash) {
		u.searchParams.set('flash', flash.kind);
		u.searchParams.set('msg', flash.message);
	}
	const headers: HeadersInit = { Location: u.toString() };
	if (setCookie) headers['Set-Cookie'] = setCookie;
	return new Response(null, { status: 303, headers });
}

async function readForm(req: Request): Promise<URLSearchParams> {
	const ct = req.headers.get('content-type') ?? '';
	if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
		const text = await req.text();
		return new URLSearchParams(text);
	}
	return new URLSearchParams();
}

// =============================================================================
// /r/:code export endpoints — CSV, Markdown, XLSX
// =============================================================================

async function loadExportData(db: ReturnType<typeof getDb>, sc: typeof schema.share_codes.$inferSelect) {
	const scope = sc.scope_json as StakeholderScope;
	const allowed = await resolveAllowedListIds(db, sc.workspace_id, scope);
	let listId: string | null = null;
	if (allowed !== null && allowed.length > 0) listId = allowed[0]!;
	else if (allowed === null) {
		const lr = await db
			.select({ id: schema.lists.id })
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, sc.workspace_id), eq(schema.lists.archived, false)))
			.limit(1);
		listId = lr[0]?.id ?? null;
	}
	if (!listId) return null;
	const list = (await db.select().from(schema.lists).where(eq(schema.lists.id, listId)).limit(1))[0];
	if (!list) return null;
	const template = list.template_id
		? (await db.select().from(schema.templates).where(eq(schema.templates.id, list.template_id)).limit(1))[0] ?? null
		: null;
	const memberRows = await db
		.select({ item_id: schema.item_lists.item_id })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.list_id, listId));
	const itemIds = memberRows.map((m) => m.item_id);
	const items = itemIds.length > 0
		? await db.select().from(schema.items).where(inArray(schema.items.id, itemIds))
		: [];
	return { list, template, items };
}

defaultApp.get('/r/:code/export.csv', async (c) => {
	const db = getDb(c.env);
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);
	const data = await loadExportData(db, sc);
	if (!data) return c.html(renderError('Nothing to export', 'No list is in scope for this share code.'), 404);
	const csv = itemsToCSV(data);
	const fname = sanitizeFilename(data.list.slug) + '.csv';
	c.executionCtx.waitUntil(
		db.update(schema.share_codes)
			.set({ last_used_at: new Date(), use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${fname}"`,
			'cache-control': 'private, max-age=60',
		},
	});
});

defaultApp.get('/r/:code/export.md', async (c) => {
	const db = getDb(c.env);
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);
	const data = await loadExportData(db, sc);
	if (!data) return c.html(renderError('Nothing to export', 'No list is in scope for this share code.'), 404);
	const md = itemsToMarkdown(data);
	const fname = sanitizeFilename(data.list.slug) + '.md';
	c.executionCtx.waitUntil(
		db.update(schema.share_codes)
			.set({ last_used_at: new Date(), use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);
	return new Response(md, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${fname}"`,
			'cache-control': 'private, max-age=60',
		},
	});
});

defaultApp.get('/r/:code/export.xlsx', async (c) => {
	const db = getDb(c.env);
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);
	const data = await loadExportData(db, sc);
	if (!data) return c.html(renderError('Nothing to export', 'No list is in scope for this share code.'), 404);
	const xlsx = itemsToXLSX(data);
	const fname = sanitizeFilename(data.list.slug) + '.xlsx';
	c.executionCtx.waitUntil(
		db.update(schema.share_codes)
			.set({ last_used_at: new Date(), use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);
	return new Response(xlsx, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${fname}"`,
			'cache-control': 'private, max-age=60',
		},
	});
});

// === /r/:code/file/:id — share-code-authenticated file streaming ============
//
// Serves a file's current version bytes from R2. Authorization is via the
// share code in the URL — same trust model as the rest of /r/:code. The file
// must belong to the share code's workspace and not be revoked.
//
// Used by inline <img> tags on the public roadmap page (small images get
// data-URI inlined; everything else routes through here).
defaultApp.get('/r/:code/file/:id', async (c) => {
	const db = getDb(c.env);
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return new Response('not found', { status: 404 });

	const fileId = c.req.param('id');
	const rows = await db
		.select()
		.from(schema.files)
		.where(
			and(
				eq(schema.files.id, fileId),
				eq(schema.files.workspace_id, sc.workspace_id),
				isNull(schema.files.revoked_at),
			),
		)
		.limit(1);
	const file = rows[0];
	if (!file || !file.current_version_id) {
		return new Response('not found', { status: 404 });
	}

	const vrows = await db
		.select()
		.from(schema.file_versions)
		.where(eq(schema.file_versions.id, file.current_version_id))
		.limit(1);
	const version = vrows[0];
	if (!version) return new Response('not found', { status: 404 });

	// Conditional GET via sha256 ETag — file content is immutable per version,
	// so the client can cache aggressively across page loads.
	const etag = `"${version.sha256_hex}"`;
	if (c.req.header('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const obj = await getObject(c.env, version.r2_key);
	const fname = sanitizeFilename(file.name);

	return new Response(obj.bytes, {
		headers: {
			'content-type': file.mime_type || 'application/octet-stream',
			'content-disposition': `inline; filename="${fname}"`,
			'cache-control': 'private, max-age=300',
			etag,
		},
	});
});

defaultApp.post('/r/:code/identify', async (c) => {
	const code = c.req.param('code');
	const sc = await loadShareCode(getDb(c.env), code);
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);

	const view = viewFromReferer(c.req.header('referer'));
	const form = await readForm(c.req.raw);
	const name = (form.get('display_name') ?? '').trim().slice(0, 40);
	return redirectToRoadmap(
		sc.code,
		name ? { kind: 'ok', message: `Signed in as ${name}.` } : undefined,
		setDisplayNameCookieHeader(name || null),
		view,
	);
});

defaultApp.post('/r/:code/comment/:item_id', async (c) => {
	const db = getDb(c.env);
	const view = viewFromReferer(c.req.header('referer'));
	const code = c.req.param('code');
	const itemId = c.req.param('item_id');
	const sc = await loadShareCode(db, code);
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);

	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('comment')) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This share code is read-only.' }, undefined, view);
	}

	const form = await readForm(c.req.raw);
	const body = (form.get('body') ?? '').trim().slice(0, 10_000);
	const displayName = (form.get('display_name') ?? '').trim().slice(0, 40);
	if (body.length === 0) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Comment cannot be empty.' }, undefined, view);
	}

	// Scope check — confirm the item is in scope.
	const scope = sc.scope_json as StakeholderScope;
	const allowed = await resolveAllowedListIds(db, sc.workspace_id, scope);
	const memberRows = await db
		.select({ list_id: schema.item_lists.list_id })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.item_id, itemId));
	const itemListIds = memberRows.map((m) => m.list_id);
	if (allowed !== null && !itemListIds.some((lid) => allowed.includes(lid))) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item is not in this share scope.' }, undefined, view);
	}

	// Verify the item exists in this workspace.
	const itemRow = (
		await db
			.select({ id: schema.items.id })
			.from(schema.items)
			.where(and(eq(schema.items.id, itemId), eq(schema.items.workspace_id, sc.workspace_id)))
			.limit(1)
	)[0];
	if (!itemRow) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item not found.' }, undefined, view);
	}

	const now = new Date();
	const commentId = uuid();
	const authorLabel = displayName
		? `${displayName} (via ${sc.code.split('-')[0]}…)`
		: `Anonymous via ${sc.code.split('-')[0]}…`;
	await db.insert(schema.comments).values({
		id: commentId,
		item_id: itemId,
		author_id: null,
		author_label: authorLabel,
		body,
		created_at: now,
	});
	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: sc.workspace_id,
		item_id: itemId,
		actor_id: null,
		action: 'comment.created',
		details_json: {
			comment_id: commentId,
			via: 'web',
			actor: { type: 'share_code', code: sc.code, display_name: displayName || null },
		},
		created_at: now,
	});
	c.executionCtx.waitUntil(
		db
			.update(schema.share_codes)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);

	return redirectToRoadmap(
		sc.code,
		{ kind: 'ok', message: 'Comment posted.' },
		displayName ? setDisplayNameCookieHeader(displayName) : undefined,
	);
});

defaultApp.post('/r/:code/state/:item_id', async (c) => {
	const db = getDb(c.env);
	const view = viewFromReferer(c.req.header('referer'));
	const code = c.req.param('code');
	const itemId = c.req.param('item_id');
	const sc = await loadShareCode(db, code);
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);

	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('edit')) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This share code does not grant edit rights.' }, undefined, view);
	}

	const form = await readForm(c.req.raw);
	const newState = (form.get('state') ?? '').trim();
	if (newState.length === 0) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'No state provided.' }, undefined, view);
	}

	// Load item + scope + template.
	const itemRow = (
		await db
			.select()
			.from(schema.items)
			.where(and(eq(schema.items.id, itemId), eq(schema.items.workspace_id, sc.workspace_id)))
			.limit(1)
	)[0];
	if (!itemRow) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item not found.' }, undefined, view);
	}
	const scope = sc.scope_json as StakeholderScope;
	const allowed = await resolveAllowedListIds(db, sc.workspace_id, scope);
	const memberRows = await db
		.select({ list_id: schema.item_lists.list_id })
		.from(schema.item_lists)
		.where(eq(schema.item_lists.item_id, itemId));
	const itemListIds = memberRows.map((m) => m.list_id);
	if (allowed !== null && !itemListIds.some((lid) => allowed.includes(lid))) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item is not in this share scope.' }, undefined, view);
	}
	if (!itemRow.template_id) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item has no template — state cannot be validated.' }, undefined, view);
	}
	const templateRow = (
		await db
			.select({ fields_schema_json: schema.templates.fields_schema_json })
			.from(schema.templates)
			.where(eq(schema.templates.id, itemRow.template_id))
			.limit(1)
	)[0];
	if (!templateRow) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Item template missing.' }, undefined, view);
	}
	const stateField = findStateFieldDef(templateRow.fields_schema_json as FieldDef[]);
	if (!stateField) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Template has no state field.' }, undefined, view);
	}
	try {
		validateFieldValue(stateField, newState);
	} catch (err) {
		return redirectToRoadmap(sc.code, {
			kind: 'error',
			message: err instanceof Error ? err.message : 'State validation failed.',
		}, undefined, view);
	}

	const current = itemRow.fields_json as Record<string, unknown>;
	const prev = (current[stateField.key] as string | undefined) ?? null;
	const isNoOp = prev === newState;
	const now = new Date();
	if (!isNoOp) {
		const newFields = { ...current, [stateField.key]: newState };
		await db
			.update(schema.items)
			.set({ fields_json: newFields, updated_at: now })
			.where(eq(schema.items.id, itemId));
		// BL-022: register novel state value as a per-list extra.
		await recordNovelStateForItem(
			db,
			sc.workspace_id,
			itemId,
			newState,
			stateField,
		);
	}
	const displayName = readDisplayNameCookie(c.req.header('cookie'));
	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: sc.workspace_id,
		item_id: itemId,
		actor_id: null,
		action: 'item.state_changed',
		details_json: {
			field_key: stateField.key,
			from: prev,
			to: newState,
			no_op: isNoOp,
			via: 'web',
			actor: { type: 'share_code', code: sc.code, display_name: displayName ?? null },
		},
		created_at: now,
	});
	c.executionCtx.waitUntil(
		db
			.update(schema.share_codes)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);

	// AJAX branch: return JSON for fetch-based callers (table dropdown,
	// todo checkbox) so the page doesn't reload. Detected via Accept header.
	if ((c.req.header('accept') ?? '').includes('application/json')) {
		const terminals = stateField.terminal ?? [];
		const isTerminal = terminals.includes(newState);
		const options = stateField.options ?? [];
		const nextToggleState = isTerminal
			? (options.find((o) => !terminals.includes(o)) ?? null)
			: (terminals[0] ?? null);
		return c.json({
			ok: true,
			id: itemId,
			field_key: stateField.key,
			from: prev,
			to: newState,
			no_op: isNoOp,
			is_terminal: isTerminal,
			next_toggle_state: nextToggleState,
		});
	}

	return redirectToRoadmap(sc.code, {
		kind: 'ok',
		message: isNoOp ? 'State unchanged.' : `State → ${newState}.`,
	}, undefined, view);
});

defaultApp.post('/r/:code/view-default', async (c) => {
	const db = getDb(c.env);
	const view = viewFromReferer(c.req.header('referer'));
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);
	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('edit')) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This share code does not grant edit rights.' }, undefined, view);
	}
	const form = await readForm(c.req.raw);
	const newView = (form.get('view') ?? '').trim();
	const validViews = ['list', 'kanban', 'table', 'todo', 'calendar', 'compass'];
	if (!validViews.includes(newView)) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: `Invalid view "${newView}".` }, undefined, view);
	}

	// Find the list in scope.
	const data = await loadExportData(db, sc); // reuses the same scope resolver
	if (!data) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'No list in scope to update.' }, undefined, view);
	}

	const meta = (data.list.meta_json ?? {}) as Record<string, unknown>;
	const newMeta = { ...meta, default_view: newView };
	const now = new Date();
	await db
		.update(schema.lists)
		.set({ meta_json: newMeta as typeof schema.lists.$inferInsert.meta_json, updated_at: now })
		.where(eq(schema.lists.id, data.list.id));

	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: sc.workspace_id,
		item_id: null,
		actor_id: null,
		action: 'list.created', // closest existing action; an item.field_changed-style 'list.view_changed' would need a schema add
		details_json: {
			via: 'web',
			actor: { type: 'share_code', code: sc.code },
			list_id: data.list.id,
			default_view: newView,
			note: 'default view changed',
		},
		created_at: now,
	});

	return redirectToRoadmap(sc.code, { kind: 'ok', message: `Default view set to ${newView}.` }, undefined, newView);
});

// === /r/:code/state-option — add a new kanban column / state value ==========
//
// BL-022: the kanban view exposes a "+ new lane" affordance for visitors with
// edit permission. Submitting it adds the value to list.meta_json.extra_state_options
// so the column appears, but doesn't touch any item's state. Drag items into
// the new column afterwards.
defaultApp.post('/r/:code/state-option', async (c) => {
	const db = getDb(c.env);
	const view = viewFromReferer(c.req.header('referer'));
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);
	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('edit')) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This share code does not grant edit rights.' }, undefined, view);
	}
	const form = await readForm(c.req.raw);
	const newState = (form.get('state') ?? '').toString().trim();
	if (newState.length === 0 || newState.length > 40) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'State name must be 1–40 characters.' }, undefined, view);
	}
	// Resolve the list in scope (same logic as /r/:code render: first in scope).
	const data = await loadExportData(db, sc);
	if (!data || !data.list.template_id) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'No list with a template in scope.' }, undefined, view);
	}
	const templateRow = (
		await db
			.select({ fields_schema_json: schema.templates.fields_schema_json })
			.from(schema.templates)
			.where(eq(schema.templates.id, data.list.template_id))
			.limit(1)
	)[0];
	if (!templateRow) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Template not found.' }, undefined, view);
	}
	const stateField = findStateFieldDef(templateRow.fields_schema_json as FieldDef[]);
	if (!stateField) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Template has no state field.' }, undefined, view);
	}
	if (!stateField.open) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This template uses a closed state vocabulary.' }, undefined, view);
	}
	const extended = await recordNovelStateForList(
		db,
		sc.workspace_id,
		data.list.id,
		newState,
		stateField,
	);
	return redirectToRoadmap(
		sc.code,
		{
			kind: 'ok',
			message: extended
				? `Added column "${newState}".`
				: `Column "${newState}" already exists.`,
		},
		undefined,
		view,
	);
});

// === /r/:code/state-order — persist drag-and-drop column reorder ============
//
// BL-022: kanban column headers are draggable for edit-permission visitors.
// On drop the client POSTs the new state-name order; we persist to
// lists.meta_json.state_options_order. Body is JSON: {options: string[]}.
defaultApp.post('/r/:code/state-order', async (c) => {
	const db = getDb(c.env);
	const sc = await loadShareCode(db, c.req.param('code'));
	if (!sc) return c.json({ error: 'not_found' }, 404);
	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('edit')) {
		return c.json({ error: 'forbidden', message: 'Edit permission required.' }, 403);
	}
	let body: { options?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: 'bad_request', message: 'Invalid JSON body.' }, 400);
	}
	const optionsRaw = body?.options;
	if (!Array.isArray(optionsRaw) || !optionsRaw.every((v) => typeof v === 'string')) {
		return c.json({ error: 'bad_request', message: '`options` must be an array of strings.' }, 400);
	}
	const options = (optionsRaw as string[]).map((s) => s.trim()).filter((s) => s.length > 0);
	if (options.length === 0) {
		return c.json({ error: 'bad_request', message: '`options` cannot be empty.' }, 400);
	}
	const data = await loadExportData(db, sc);
	if (!data) return c.json({ error: 'not_found', message: 'No list in scope.' }, 404);
	const meta = (data.list.meta_json ?? {}) as ListMeta;
	const newMeta: ListMeta = { ...meta, state_options_order: options };
	const now = new Date();
	await db
		.update(schema.lists)
		.set({ meta_json: newMeta, updated_at: now })
		.where(eq(schema.lists.id, data.list.id));
	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: sc.workspace_id,
		item_id: null,
		actor_id: null,
		action: 'list.state_options_reordered',
		details_json: {
			list_id: data.list.id,
			list_slug: data.list.slug,
			new_order: options,
			previous_order: meta.state_options_order ?? null,
			via: 'web-drag',
		},
		created_at: now,
	});
	return c.json({ ok: true, options });
});

defaultApp.post('/r/:code/new-item', async (c) => {
	const db = getDb(c.env);
	const view = viewFromReferer(c.req.header('referer'));
	const code = c.req.param('code');
	const sc = await loadShareCode(db, code);
	if (!sc) return c.html(renderError('Link unavailable', 'This share link is invalid, expired, or revoked.'), 404);

	const permissions = sc.permissions_json as StakeholderPermission[];
	if (!permissions.includes('create')) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'This share code does not grant create rights.' }, undefined, view);
	}

	const form = await readForm(c.req.raw);
	const title = (form.get('title') ?? '').trim().slice(0, 200);
	const body = (form.get('body') ?? '').trim().slice(0, 10_000);
	const requestedState = (form.get('state') ?? '').trim();
	const displayName = (form.get('display_name') ?? '').trim().slice(0, 40);

	if (title.length === 0) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'Title is required.' }, undefined, view);
	}

	// Use the first list in scope (matches GET-side behavior).
	const scope = sc.scope_json as StakeholderScope;
	const allowed = await resolveAllowedListIds(db, sc.workspace_id, scope);
	let targetListId: string | null = null;
	if (allowed !== null && allowed.length > 0) targetListId = allowed[0]!;
	else if (allowed === null) {
		const lr = await db
			.select({ id: schema.lists.id })
			.from(schema.lists)
			.where(and(eq(schema.lists.workspace_id, sc.workspace_id), eq(schema.lists.archived, false)))
			.limit(1);
		targetListId = lr[0]?.id ?? null;
	}
	if (!targetListId) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'No list in scope to add to.' }, undefined, view);
	}

	const listRow = (
		await db.select().from(schema.lists).where(eq(schema.lists.id, targetListId)).limit(1)
	)[0];
	if (!listRow) {
		return redirectToRoadmap(sc.code, { kind: 'error', message: 'List not found.' }, undefined, view);
	}

	// Resolve template + initial fields.
	let templateId: string | null = listRow.template_id ?? null;
	let fields: Record<string, unknown> = {};
	let resolvedStateField: FieldDef | null = null;
	if (templateId) {
		const t = (
			await db
				.select({ fields_schema_json: schema.templates.fields_schema_json })
				.from(schema.templates)
				.where(eq(schema.templates.id, templateId))
				.limit(1)
		)[0];
		if (t) {
			const schemaFields = t.fields_schema_json as FieldDef[];
			const stateField = findStateFieldDef(schemaFields);
			resolvedStateField = stateField;
			const patch: Record<string, unknown> = {};
			if (requestedState && stateField) {
				try {
					validateFieldValue(stateField, requestedState);
					patch[stateField.key] = requestedState;
				} catch {
					// Fall back to template default.
				}
			}
			try {
				fields = validateItemFields({
					schema: schemaFields,
					current: {},
					patch,
					isCreate: true,
				});
			} catch (err) {
				return redirectToRoadmap(sc.code, {
					kind: 'error',
					message: err instanceof Error ? err.message : 'Field validation failed.',
				}, undefined, view);
			}
		}
	}

	const itemId = await nextItemId(db, sc.workspace_id);
	const now = new Date();
	await db.insert(schema.items).values({
		id: itemId,
		workspace_id: sc.workspace_id,
		title,
		body,
		template_id: templateId,
		fields_json: fields,
		executor: null,
		author_id: null,
		created_at: now,
		updated_at: now,
	});
	await db.insert(schema.item_lists).values({
		item_id: itemId,
		list_id: targetListId,
		role: 'primary',
		position: 0,
		added_by: null,
		added_at: now,
	});
	await db.insert(schema.activity_log).values({
		id: uuid(),
		workspace_id: sc.workspace_id,
		item_id: itemId,
		actor_id: null,
		action: 'item.created',
		details_json: {
			list: listRow.slug,
			title,
			via: 'web',
			actor: { type: 'share_code', code: sc.code, display_name: displayName || null },
		},
		created_at: now,
	});

	// BL-022: if the new item carries a novel state value, register it as a
	// per-list extra so the kanban + state-edit dropdown see it.
	if (resolvedStateField) {
		const newState = fields[resolvedStateField.key];
		if (typeof newState === 'string') {
			await recordNovelStateForItem(
				db,
				sc.workspace_id,
				itemId,
				newState,
				resolvedStateField,
			);
		}
	}

	c.executionCtx.waitUntil(
		db
			.update(schema.share_codes)
			.set({ last_used_at: now, use_count: sql`use_count + 1` })
			.where(eq(schema.share_codes.code, sc.code)),
	);

	return redirectToRoadmap(
		sc.code,
		{ kind: 'ok', message: `Added ${itemId}.` },
		displayName ? setDisplayNameCookieHeader(displayName) : undefined,
	);
});

defaultApp.notFound((c) => {
	return c.json(
		{
			error: 'not_found',
			path: new URL(c.req.url).pathname,
			message: 'See / for the list of available routes.',
		},
		404,
	);
});

defaultApp.onError((err, c) => {
	console.error('Unhandled error (default handler):', err);
	return c.json({ error: 'internal_error', message: err.message }, 500);
});

// === API handler — /mcp ======================================================
//
// Only reached when the OAuth provider has already validated the bearer token.
// The grant's `props` (user_id, workspace_id) are attached by the provider to
// `ctx.props` (typed `unknown` at this boundary; cast to OAuthProps below).

async function apiFetch(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	const url = new URL(request.url);

	// MCP endpoint is /mcp on any host. Root-mounting on mcp.blitzlist.ai was
	// attempted but had to be reverted — host-wide apiRoute matched /oauth/authorize
	// too, blocking the OAuth consent screen from rendering. Install URL is
	// therefore https://mcp.blitzlist.ai/mcp (with the /mcp suffix).
	if (url.pathname !== '/mcp') {
		return new Response(JSON.stringify({ error: 'not_found', path: url.pathname }), {
			status: 404,
			headers: { 'content-type': 'application/json' },
		});
	}

	if (request.method !== 'POST') {
		return new Response(
			JSON.stringify({ error: 'method_not_allowed', message: 'POST required' }),
			{ status: 405, headers: { 'content-type': 'application/json' } },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json(
			errorResponse(null, RpcError.PARSE_ERROR, 'Invalid JSON in request body'),
			{ status: 400 },
		);
	}

	const isReq = isJsonRpcRequest(body);
	const isNotif = isNotification(body);

	if (!isReq && !isNotif) {
		return Response.json(
			errorResponse(null, RpcError.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 message'),
			{ status: 400 },
		);
	}

	const message = body as JsonRpcRequest | JsonRpcNotification;

	// The OAuthProvider attached the grant's props on ctx.props.
	const props = (ctx as ExecutionContext & { props?: OAuthProps }).props;
	if (!props || !props.user_id || !props.workspace_id) {
		return Response.json(
			errorResponse(
				null,
				RpcError.INTERNAL_ERROR,
				'OAuth grant did not carry expected user_id/workspace_id props',
			),
			{ status: 500 },
		);
	}

	const response = await handleMcpMessage(message, {
		name: 'blitzlist',
		version: VERSION,
		tools: toolRegistry,
		toolContext: {
			user_id: props.user_id,
			workspace_id: props.workspace_id,
			db: getDb(env),
			env,
		},
	});

	if (response === null) {
		return new Response(null, { status: 202 });
	}

	return Response.json(response);
}

// === Worker entrypoint =======================================================
//
// OAuthProvider wraps everything. It serves OAuth metadata + token + register
// endpoints itself; routes everything else through `defaultHandler`, except
// requests to `apiRoute` which require a valid Bearer token and are forwarded
// to `apiHandler` with ctx.props set from the grant.

const apiHandler = {
	fetch: apiFetch,
};

const defaultHandler = {
	fetch(req: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
		return defaultApp.fetch(req, env, ctx);
	},
};

export default new OAuthProvider({
	// Path-only matcher: /mcp on any host is the protected endpoint.
	// Tried 'https://mcp.blitzlist.ai/' (host-wide) for a cleaner root URL but
	// that ate /oauth/authorize too, blocking the consent flow. Install URL is
	// the conventional https://mcp.blitzlist.ai/mcp instead.
	apiRoute: '/mcp',
	apiHandler,
	defaultHandler,
	authorizeEndpoint: '/oauth/authorize',
	tokenEndpoint: '/oauth/token',
	clientRegistrationEndpoint: '/oauth/register',
	scopesSupported: ['mcp'],
});
