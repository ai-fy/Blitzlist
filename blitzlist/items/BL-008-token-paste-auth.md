---
id: BL-008
title: Token-paste bearer auth for v0.1 spike
slug: token-paste-auth
list: backlog
state: done
groups:
  - sprint-001-spike
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p1
  estimate: 0.5d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-005
    - BL-010
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Token-paste bearer auth for v0.1 spike

## Description

Stub auth for the v0.1 spike: a single shared bearer token (set via Worker
secret) gates the `/mcp` endpoint. Token resolves to one hardcoded workspace
+ user. Enough to validate the tool flow; **explicitly not** the v1 auth.

The real OAuth 2.1 + DCR implementation lands in BL-010 (epic-auth).

## Acceptance criteria

- [x] `wrangler secret put BLITZLIST_SPIKE_TOKEN` stores the token (set via stdin pipe; production secret active)
- [x] `/mcp` requests without `Authorization: Bearer <token>` return 401 with `WWW-Authenticate: Bearer realm="blitzlist-api"` (RFC 6750)
- [x] Requests with the correct token resolve to a hardcoded user_id (`usr-malte`) + workspace_id (`ws-blitzlist`) — read from wrangler.toml [vars]; token verified against `BLITZLIST_SPIKE_TOKEN` secret
- [x] Wrong token returns 401 with `WWW-Authenticate: Bearer realm="blitzlist-api", error="invalid_token"` and JSON body `{"error":"invalid_token","message":"Invalid bearer token."}`
- [x] Local dev token in `apps/api/.dev.vars` (gitignored); same value in production secret store
- [x] Constant-time string comparison (no token-length leak via timing)
- [x] Operator misconfig (missing env vars) returns 500 not silent grant — fails loudly
- [x] Verified end-to-end on production `mcp.blitzlist.ai/mcp` (no-auth=401, wrong-token=401, correct-token=200)
- [ ] README install command documented — pending small README update

## Implementation notes

- Resolver logic lives in `packages/core/src/auth.ts` (transport-agnostic). Hono middleware in `apps/api/src/middleware/spike-auth.ts` wraps it.
- `RequestContext` type is the foundation for BL-006+ — tool handlers read `c.get('ctx')` for workspace_id and actor.
- Public routes untouched: `/`, `/healthz`, `GET /mcp` (hint page) remain open. Only `POST /mcp` requires auth.
- Throwaway — entirely replaced by `@cloudflare/workers-oauth-provider` in BL-010.

## Notes

This is throwaway code. Keep it minimal. The OAuth implementation will
replace this entire module, not extend it.
