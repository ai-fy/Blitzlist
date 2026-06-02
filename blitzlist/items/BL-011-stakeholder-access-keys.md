---
id: BL-011
title: Stakeholder access keys for AI-mediated review
slug: stakeholder-access-keys
list: backlog
state: done
groups:
  - sprint-002-beta
  - epic-auth
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 2d
  pr_url: null
relations:
  blocks:
    - BL-012
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-010
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Stakeholder access keys for AI-mediated review

## Description

A lighter auth path for the third audience: stakeholders who connect their
own AI assistant (Claude Cowork, claude.ai) to our MCP server via a per-stakeholder
key. Key gets pasted into their MCP config — no OAuth, no account.

This is the auth model behind the MCP-first stakeholder UX (the wedge).

## Acceptance criteria

- [ ] `stakeholder_access_keys` table added (key_hash bcrypt, scope_json, expires_at, etc.)
- [ ] Worker accepts both OAuth bearer + stakeholder key bearer at `/mcp`
- [ ] Scope enforcement: stakeholder can only see/comment on items/lists in their scope
- [ ] Key minting flow in web UI (`/w/[slug]/keys`):
        - select scope (lists, items, groups, or whole workspace read-only)
        - set permissions (read / read+comment / read+comment+approve)
        - set expiry
        - shows the raw key ONCE; bcrypt-hashed after
- [ ] Stakeholder-facing tools (`view_roadmap`, `submit_feedback`, etc.) check
      stakeholder scope on every call
- [ ] Audit log records every stakeholder key usage with key_hash + scope summary
- [ ] Revoke flow: deletes the key row, immediate effect

## Notes

This is one of two auth paths shipped. OAuth (BL-XXX, separate item) handles
full members. Stakeholder keys handle reviewers, customers, OSS users.

## Open questions

- IP allowlist per key? *Deferred to enterprise / v1.1.*
- Rate limit per key? *Yes, conservative default: 100 req/min per key.*
