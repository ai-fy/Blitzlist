---
id: BL-009
title: Executor field + routing logic for items
slug: executor-routing
list: backlog
state: done
groups:
  - sprint-002-beta
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 1.5d
  pr_url: null
relations:
  blocks:
    - BL-013
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-004
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Executor field + routing logic for items

## Description

Add the `executor` field to items: `human:<user_id> | agent:claude | agent:<other> | self | contractor:<label> | null`.

Orthogonal to `assignee_id` (the accountable human). Executor says who/what is *currently doing* the work — could be Claude, could be a contractor, could be yourself in a different session.

Default executor inferred from list template (bugs default to `agent:claude` for triage; ideas default to `self`).

## Acceptance criteria

- [ ] `items.executor` column added via migration
- [ ] MCP tool `set_executor({ id, executor })` validates format and applies
- [ ] Routing default logic in `packages/core` — given a new item, suggest an executor based on list template
- [ ] Activity log entry on every executor change
- [ ] Web UI shows executor badge on item rows (color-coded by kind)
- [ ] Filter `list_items({ executor: "agent:claude" })` works

## Notes

Executor is the foundation for the "self-solving" feature — items get routed
to whoever should handle them, and state moves regardless of who/what does it.

## Open questions

- Should `set_executor("agent:claude")` automatically queue a `spawn_claude_session`
  notification, or stay purely declarative? *Recommendation: declarative for v0.5,
  add auto-spawn opt-in in v1.0 (BL-013).*
