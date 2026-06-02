---
id: BL-016
title: Conflict detection and resolution PR flow
slug: conflict-detection
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-bootstrap
  - epic-github-integration
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
    - BL-014
    - BL-015
attachments:
  - kind: url
    url: ../SYNC.md
    title: Sync protocol — conflict resolution section
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Conflict detection and resolution PR flow

## Description

When the importer (BL-014) or exporter (BL-015) detects that the same item
was edited on both sides since the last sync, open a dedicated conflict-PR
that shows a 3-way diff and lets a human resolve.

This is the only "manual" path in the sync; everything else is auto. Goal:
make conflicts rare *and* easy to resolve when they happen.

## Acceptance criteria

- [ ] When both `repo_changed` and `mcp_changed` are true for an item,
      a conflict-PR is opened (or comment added to an existing one)
- [ ] PR title: "blitzlist: CONFLICT on BL-NNN (manual resolution needed)"
- [ ] PR body contains:
        - The base version (from ledger)
        - The repo version (current file)
        - The MCP version (rendered from D1)
        - A field-by-field diff highlighting divergent fields
- [ ] Conflict-prone fields trigger detection: title, body, state, priority,
      assignee, parent, fields.*, relations.*, groups
- [ ] Last-write-wins fields don't trigger: updated_at, sync.version,
      attachments (treated as union)
- [ ] Label `sync-conflict` applied; auto-merge disabled while label present
- [ ] On merge of conflict-PR: apply merged version to MCP, update ledger,
      remove conflict-PR-related comments
- [ ] Conflict-PR shown in the web app's notification feed

## Notes

The 3-way merge rendering is the UX-critical bit. Resist showing raw JSON.
Render each conflicting field as: `field: ours = "X" | theirs = "Y" | base = "Z"`.

## Open questions

- Should we auto-attempt a 3-way merge for non-overlapping field changes?
  E.g., if repo changed `assignee` and MCP changed `state`, those don't
  conflict — they can be merged automatically. *Recommendation: yes, do
  field-level merge for non-overlapping changes; only flag truly overlapping
  edits.* This makes conflicts even rarer in practice.
