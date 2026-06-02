---
id: BL-018
title: spawn_claude_session MCP tool (Claude Agent SDK)
slug: spawn-claude-session
list: backlog
state: draft
groups:
  - sprint-003-prod
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p1
  estimate: 2d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-009
attachments:
  - kind: url
    url: https://docs.anthropic.com/en/api/agent-sdk
    title: Claude Agent SDK
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# spawn_claude_session MCP tool (Claude Agent SDK)

## Description

Close the "backlog to execution" loop: an MCP tool that, given an item ID,
opens a fresh Claude Code session pre-loaded with the item's body, related
items, target list context, and a starter prompt to begin work.

This is what makes the "self-solving" angle real — items don't just sit in
a backlog, they can be *executed* with one tool call.

## Acceptance criteria

- [ ] MCP tool `spawn_claude_session({ item_id, model?, additional_context? })`
- [ ] Tool returns a session URL + session ID
- [ ] Session is pre-loaded with:
        - The item's body and acceptance criteria
        - All related items (verifies, blocks, implements)
        - The list's template context
        - A starter prompt: "Help me work on [item title]"
- [ ] Item's `executor` auto-updates to `agent:claude` with session ID in metadata
- [ ] Activity log entry when session is spawned
- [ ] Web UI: "Open in Claude" button on every item (calls this tool)
- [ ] Session lifecycle: completion auto-updates item state (via the spawned
      session calling `set_state` back into Blitzlist)

## Notes

This requires Anthropic API credentials in the Worker. v1.0: per-workspace
API key configuration. v1.1: integration with users' own Anthropic accounts.

## Open questions

- What if Claude Agent SDK changes? *Mitigation: abstract behind an
  "agent runner" interface in packages/core that could swap in other agents
  (Devin, Replit Agent, etc.) later.*
