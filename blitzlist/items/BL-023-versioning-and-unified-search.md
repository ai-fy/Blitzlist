---
id: BL-023
title: File versioning UI + unified search across items/documents/files
slug: versioning-and-unified-search
list: backlog
state: draft
groups:
  - sprint-003-prod
  - epic-shared-memory
author: malte
assignee: null
parent: null
fields:
  priority: p1
  estimate: 3d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-020
    - BL-021
    - BL-022
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T16:00:00Z
updated_at: 2026-05-27T16:00:00Z
---

# File versioning UI + unified search across items/documents/files

## Description

Two related polish features for v1.0:

1. **Versioning UI**: web view for browsing previous versions of files and
   documents, with one-click restore (Dropbox-style).
2. **Unified search**: one search box that queries items + documents + files
   (including extracted text from binaries) via FTS5.

## Acceptance criteria

### Versioning

- [ ] File detail page shows version history sidebar
- [ ] Each version: timestamp, uploader, size, version note
- [ ] One-click restore via `restore_file_version` tool
- [ ] Diff view for text files (markdown, code) — side-by-side
- [ ] Same UX for documents (`document_versions`)
- [ ] Retention policy configurable per workspace (default: 10 versions, 90 days)

### Unified search

- [ ] FTS5 virtual tables for items, documents, files (extracted_text + name)
- [ ] Single MCP tool `search_workspace({ query, types?: ["item","document","file"], limit? })`
- [ ] Web UI: workspace-wide search bar with type filters and snippets
- [ ] Search results show source primitive + snippet of match
- [ ] Stakeholder access keys can search within their scope

## Notes

The unified search is what closes the "shared memory" loop in user perception.
One query across all three primitives = "I asked Blitzlist and it knew."
