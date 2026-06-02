---
id: BL-007
title: Implement set_state and comment tools
slug: set-state-comment-tools
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
  estimate: 0.5d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-006
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Implement set_state and comment tools

## Description

The two write tools that finish the v0.1 minimum viable loop. Both emit
`activity_log` rows.

## Acceptance criteria

- [ ] `set_state({ id, state, note? })` validates state against the item's
      list states_json. Returns updated item + the new activity entry.
- [ ] `comment({ id, body })` appends a comment, returns the comment row.
- [ ] Both tools resolve actor from the bearer token stub.
- [ ] Activity log row format: `{action, actor_id, item_id, details_json, created_at}`
- [ ] End-to-end: Claude Code can call `add_item` → `set_state` → `get_item`
      and see the state change reflected in the returned activity.

## Notes

`set_state` validation: list the allowed transitions in error message if
caller passes an invalid state. Helps Claude self-correct without a retry
loop.
