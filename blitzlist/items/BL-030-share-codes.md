---
id: BL-030
title: Share codes — anyone-with-the-link sharing (3/4-word codes)
slug: share-codes
list: backlog
state: done
groups:
  - sprint-002-beta
  - epic-auth
  - epic-commitment-ledger
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 3d
  pr_url: null
relations:
  - label: blocks
    target: BL-025
  - label: relates_to
    target: BL-011
attachments:
  - kind: url
    url: https://www.eff.org/dice
    title: EFF diceware short wordlist (1296 words)
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §5 — Share codes subsection
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T11:00:00Z
updated_at: 2026-05-28T11:00:00Z
---

# Share codes — anyone-with-the-link sharing (3/4-word codes)

## Description

Implement Google-Drive-style "anyone with the link" sharing for both MCP and
web channels. Codes use the EFF diceware short wordlist (3- or 4-word combos).
The URL path itself is the authentication — no OAuth, no consent screen, no
account required for the holder.

**Three-word codes are NOT IP-protected** (what3words owns the geographic-mapping
patents specifically; generic three-word access codes are widely used and
unencumbered).

This is the low-friction sharing tier alongside stakeholder access keys
(per-identity) and OAuth (per-member). Together the three cover the full
spectrum from "highly governed" to "post the link in any chat."

## Acceptance criteria

### Data model

- [ ] `share_codes` table added per ARCHITECTURE.md §3
- [ ] Legacy `share_links` table removed; only test data, cheap migration
- [ ] Wordlist file `packages/core/share-codes/wordlist.json` with EFF 1296 words

### URL routing

- [ ] Web: `GET /s/{code}` resolves code, renders scoped view
- [ ] MCP: `https://mcp.blitzlist.ai/mcp/share/{code}` is a valid MCP endpoint
        - Code resolved per-request; KV cache for hot codes
        - All MCP tool calls scoped to the code's grant
- [ ] Both URLs return HTTP 410 Gone if code is revoked or expired
- [ ] Both URLs return HTTP 429 if rate-limited (default 100 req/min/code)

### MCP tools (for code owners)

- [ ] `create_share_code({scope, permissions, label?, expires_at?, word_count?: 3|4, channels?})`
        - Returns `{code, web_url, mcp_url}`
        - Default expiry: 30 days
        - Default permissions: `["view"]`
        - Default word_count: 3
        - Default channels: `{web: true, mcp: true}`
        - Workspace cap: 100 active codes
- [ ] `list_share_codes({include_expired?})` — owner dashboard
- [ ] `revoke_share_code({code})` — sub-second revoke; KV cache invalidated

### Security

- [ ] Per-code rate limit enforced at edge (Workers Rate Limiter binding)
- [ ] Audit log: every redemption logs `{code, ip, timestamp, route_or_tool}`
- [ ] Permission `propose` always lands new items in `pending` state until
      a workspace member approves them visible (anti-spam)
- [ ] Permission `view` is the only default; owner explicitly grants more

### Web UI

- [ ] `/w/[slug]/share` — mint, list, revoke codes; copy URLs to clipboard
- [ ] `/s/[code]` — clean public view; "Add to Claude" button (when deep
      links available) and copy-paste MCP URL instructions
- [ ] Expired/revoked codes show a friendly "ask the owner" page with optional
      owner contact (per code setting)

## Notes

Share codes coexist with stakeholder access keys (BL-011). Different jobs:
- Stakeholder keys: per-person, identified, audited, branded onboarding
- Share codes: anonymous, link-shareable, IP-logged, instant

A workspace can have both for the same resource. E.g., a "Q3 Proposals" list
gets one share code (public input from anyone) plus three stakeholder keys
for Alice/Bob/Carol (formal approvers).

## Open questions

- Should share codes support `propose` items appearing in the scope's public
  view (Canny-style upvoting visible to all anonymous viewers)? *v0.5: no,
  pending items only visible to members. Revisit in v1.0 once moderation
  patterns are clearer.*
- IP-based rate limiting in addition to per-code? *Yes, 200 req/min per IP
  across all share codes — prevents one bot from rotating codes.*
- Email confirmation option for sensitive shares? *Defer to enterprise tier;
  default codes are pure anonymous-with-IP-log.*
