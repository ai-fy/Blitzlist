---
id: BL-020
title: Documents primitive (markdown knowledge layer)
slug: documents-primitive
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-shared-memory
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 3d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-021
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T16:00:00Z
updated_at: 2026-05-27T16:00:00Z
---

# Documents primitive (markdown knowledge layer)

## Description

Add `documents` as a top-level primitive alongside `items`. Documents are
long-form markdown reference content with version history but no state
machine. Use cases: "About me," project briefs, profession profiles,
vision docs, meeting notes, ADRs.

This is what makes Claude Code sessions resumable across days/weeks — load
the project brief and you're back in context without re-typing it.

## Acceptance criteria

- [ ] `documents` + `document_versions` tables added (Drizzle schema)
- [ ] Drizzle migration applies cleanly
- [ ] 6 MCP tools: `add_document`, `get_document`, `update_document`,
      `list_documents`, `search_documents`, `revert_document`
- [ ] FTS5 virtual table for documents (title + body + tags)
- [ ] `update_document` bumps version and appends to `document_versions`
- [ ] Web UI: `/w/[slug]/docs` index, `/w/[slug]/docs/[slug]` editor with
      version dropdown
- [ ] Visibility enforcement (private/internal/stakeholder/public)
- [ ] Activity log entries on create/update/revert

## Notes

Documents and items both have markdown body, but they're different primitives.
Don't unify them — items have state, documents have version history. Different
mental models.

Default doc_type values from `packages/core` (informational, not enforced):
`profile | brief | spec | meeting_notes | reference | custom`.

## Open questions

- Should documents support inline `[item:BL-042]` references that auto-link
  to items? *Recommendation: yes, render in v1.0; the link store is the
  existing `item_relations` table with type=`mentioned_in`.*
