---
id: BL-010
title: Release group type + promise-to-delivery verification
slug: release-type-verification
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
  estimate: 2d
  pr_url: null
relations:
  blocks:
    - BL-011
    - BL-017
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-004
    - BL-009
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Release group type + promise-to-delivery verification

## Description

Add `release` as a new group type alongside sprint/milestone/epic/label. Items
declare `promised_in: release-id`. At release close, the system audits:

- **Delivered**: items with terminal-shipped states
- **Slipped**: still open at close time
- **Cut**: explicitly removed from the release

This closes the commitment-to-delivery loop — the unique wedge from the
competitive analysis.

## Acceptance criteria

- [ ] `groups.type = 'release'` supported with meta `{version, ship_target, public_url_slug, description}`
- [ ] `items.promised_in` column added
- [ ] MCP tools: `create_release`, `close_release`, `promise_in_release`
- [ ] `close_release` computes delivered/slipped/cut breakdown, stores as activity entry
- [ ] Slipped items can be re-promised to next release with audit trail
- [ ] Web UI: release detail page shows the breakdown
- [ ] Generate-release-notes tool deferred to BL-017

## Notes

This is the headline wedge feature. Get the data model right; the UI and
release-notes generator follow.
