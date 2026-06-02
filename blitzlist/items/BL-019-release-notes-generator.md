---
id: BL-019
title: Auto release notes generator (delivered vs. promised)
slug: release-notes-generator
list: backlog
state: draft
groups:
  - sprint-003-prod
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
  implements:
    - BL-010
  duplicates: []
  relates_to:
    - BL-010
    - BL-013
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Auto release notes generator (delivered vs. promised)

## Description

When a release closes, auto-generate release notes that compare what was
promised at release-open vs. what actually shipped. This is the verification
half of the commitment-to-delivery loop.

Output: Markdown file in the workspace's `blitzlist/releases/` directory,
plus public release page (`/r/[workspace]/release/[slug]/notes`), plus an
MCP tool `generate_release_notes` that any stakeholder can invoke.

## Acceptance criteria

- [ ] MCP tool `generate_release_notes({ release_id, format? })` returns Markdown
- [ ] Three sections: ✅ Delivered, ✂ Cut, ↩ Slipped to next release
- [ ] Each item links to: original promise commit, implementing PR(s), final state
- [ ] Optional AI-summarized "What changed" narrative (calls Claude API)
- [ ] Web UI: "Generate release notes" button on release page
- [ ] Notes get committed back to git as `blitzlist/releases/v1-2-notes.md`
- [ ] Public release notes page is shareable + has OG tags

## Notes

This is the moment the commitment-ledger pitch becomes tangible. "Here's the
release. Here's what we promised. Here's what we delivered. Here's the audit."

A polished release-notes generation is itself good marketing — every release
becomes a public artifact.
