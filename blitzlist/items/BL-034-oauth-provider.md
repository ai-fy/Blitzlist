---
id: BL-034
title: OAuth 2.1 + DCR via @cloudflare/workers-oauth-provider
slug: oauth-provider
list: backlog
state: done
groups:
  - sprint-001-spike
  - epic-auth
  - epic-mcp-foundation
author: malte
assignee: malte
parent: null
fields:
  priority: p0
  estimate: 1d
  pr_url: null
relations:
  - label: relates_to
    target: BL-005
  - label: supersedes
    target: BL-008
attachments:
  - kind: url
    url: https://github.com/cloudflare/workers-oauth-provider
    title: workers-oauth-provider GitHub
  - kind: url
    url: https://mcp.blitzlist.ai/.well-known/oauth-authorization-server
    title: Live AS metadata
sync:
  version: 1
  content_hash: null
created_at: 2026-06-01T14:30:00Z
updated_at: 2026-06-01T14:30:00Z
---

# OAuth 2.1 + DCR via @cloudflare/workers-oauth-provider

## Description

Originally scoped for v0.5 (epic-auth), pulled forward into the v0.1 spike
because Claude Desktop and most MCP-aware clients require OAuth 2.1 discovery
to complete the connector flow. BL-008 (spike-token paste) was a stub for
Claude Code CLI testing; this item ships the real auth.

Replaces the entire spike-token path. Now: every authenticated request
carries an OAuth grant whose `props` contain the v0.1 hardcoded user_id +
workspace_id. Real per-user accounts ship with BL-009 magic-link sign-in
in v0.5; until then the consent screen auto-approves as `usr-malte`.

## Acceptance criteria

- [x] `@cloudflare/workers-oauth-provider` v0.7.x installed
- [x] Dedicated `OAUTH_KV` namespace provisioned (`219dad750b614b7dbca3526e744712b1`)
- [x] OAuthProvider wraps the Worker entrypoint (apps/api/src/index.ts)
- [x] `/.well-known/oauth-protected-resource` served (RFC 9728)
- [x] `/.well-known/oauth-authorization-server` served (RFC 8414)
- [x] `POST /oauth/register` implements DCR (RFC 7591) — confirmed via curl: registered a test client, got client_id + client_secret
- [x] `GET /oauth/authorize` renders branded v0.1 consent screen with client name + requested scopes + Approve/Deny buttons
- [x] `POST /oauth/authorize` completes authorization, redirects to client's redirect_uri with code
- [x] `POST /oauth/token` issues access tokens (handled by library)
- [x] `POST /mcp` returns 401 with `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="...", error="invalid_token"`
- [x] Valid OAuth token on `POST /mcp` runs through the MCP server with `ctx.props` set to `{user_id, workspace_id}`
- [x] Spike token (`BLITZLIST_SPIKE_TOKEN`) revoked from production secrets
- [x] Bundle size: 225 KiB (51 KiB gzipped) — under 1MB cap
- [ ] **Claude Desktop end-to-end: verify by user** — add Custom Connector, complete consent, see "0 tools available" (correct state until BL-006 ships)

## Implementation notes

- Library is auto-configured via `OAuthProvider` constructor; we provide
  `apiHandler` (for /mcp) and `defaultHandler` (for /, /healthz, /oauth/authorize).
- Consent screen at `apps/api/src/oauth/consent.ts` is hand-written HTML
  (Hono's `html` template literal). Brand-consistent, ~150 lines including CSS.
- `OAUTH_KV` binding is required by the library — it stores client registrations,
  authorization codes, grants, access tokens, and refresh tokens. All hashed.
- v0.1 hardcoded user/workspace IDs live in `wrangler.toml [vars]`. Tokens
  carry `props: { user_id, workspace_id }` from the consent flow; tool handlers
  in BL-006 read `ctx.props` for query scoping.
- `RequestContext` in `packages/core/auth.ts` is the application-layer
  abstraction. Future auth methods (stakeholder keys in BL-011, share codes in
  BL-030) will produce the same shape with different `actor` discriminators.

## What's NOT in scope (deferred)

- Magic-link email sign-in (BL-009, v0.5) — consent screen currently hardcodes
  the spike user; real login lands then.
- Multi-workspace selection during consent (BL-009)
- Per-stakeholder scoped tokens (BL-011)
- Token revocation UI in web app (v0.5 web UI)
- Refresh token rotation policy customization (using library defaults)
