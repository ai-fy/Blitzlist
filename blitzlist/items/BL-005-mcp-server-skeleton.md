---
id: BL-005
title: MCP server skeleton with Streamable HTTP transport
slug: mcp-server-skeleton
list: backlog
state: done
groups:
  - sprint-001-spike
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 1d
  pr_url: null
relations:
  blocks:
    - BL-006
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-003
    - BL-004
attachments:
  - kind: url
    url: https://modelcontextprotocol.io/specification
    title: MCP specification
  - kind: url
    url: https://github.com/modelcontextprotocol/typescript-sdk
    title: Official MCP TypeScript SDK
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# MCP server skeleton with Streamable HTTP transport

## Description

Wire up the MCP server inside the Hono Worker. Streamable HTTP transport
(not stdio), one POST endpoint at `/mcp`. Tool registration is empty for
now — actual tools land in BL-006 and BL-007.

Goal: a Claude Code instance can `claude mcp add blitzlist <url>`, perform
the MCP handshake, and list tools (which returns an empty array). That proves
the plumbing.

## Acceptance criteria

- [x] `POST /mcp` accepts the MCP `initialize` request and responds with full `InitializeResult` (protocolVersion, capabilities, serverInfo, instructions) — verified locally and on production mcp.blitzlist.ai
- [x] `tools/list` returns `{"tools":[]}` (empty array, not an error) — verified
- [x] `resources/list` and `prompts/list` return empty arrays — verified
- [x] Streamable HTTP transport — single-response JSON path implemented for v0.1 (SSE streaming deferred; not needed until tools land in BL-006 and have long-running operations). Verified via plain curl POSTs.
- [ ] Claude Code install + connect — **pending user action**: run `claude mcp add blitzlist https://mcp.blitzlist.ai/mcp` in a Claude Code session, then `/mcp blitzlist` should show it as connected with 0 tools.

## Implementation notes

- MCP protocol hand-rolled in `packages/mcp/` rather than using `@modelcontextprotocol/sdk`. Reason: for v0.1 with zero tools, the four-handler protocol is trivially implemented in ~50 lines; the SDK is heavy on Workers bundle size. Will adopt the SDK in a later item when Zod schemas + resource subscriptions become worth the weight.
- Auth intentionally absent on `/mcp` for v0.1. Token-paste bearer auth ships in BL-008; OAuth in BL-010. Endpoint is publicly reachable but exposes no data (zero tools, resources, prompts) until then.
- Bundle size after MCP integration: 88.58 KiB (gzipped 21.38 KiB). ~5 KiB delta from BL-003.
- GET /mcp returns a helpful hint page rather than 404 — clients sometimes probe.

## Production URL

`https://mcp.blitzlist.ai/mcp` — POST JSON-RPC 2.0 messages.

## Notes

For this sprint we accept any caller — no auth check on `/mcp`. Token-paste
bearer auth lands in BL-008. We're not exposed to the public yet; testing
is local.

## Open questions

- Do we use the official `@modelcontextprotocol/sdk` directly, or wrap it
  in a Hono-friendly adapter? Spike it; if the SDK plays nicely with Hono's
  Request/Response, use it directly. Otherwise, write a thin adapter.
