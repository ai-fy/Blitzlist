---
id: BL-021
title: Files primitive (Dropbox-for-MCP layer)
slug: files-primitive
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-shared-memory
  - epic-commitment-ledger
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 5d
  pr_url: null
relations:
  blocks:
    - BL-022
    - BL-023
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-020
    - BL-024
attachments:
  - kind: url
    url: https://developers.cloudflare.com/r2/
    title: Cloudflare R2 docs
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T16:00:00Z
updated_at: 2026-05-27T16:00:00Z
---

# Files primitive (Dropbox-for-MCP layer)

## Description

Add `files` as a top-level primitive alongside `items` and `documents`. Files
are binary artifacts (PPT, PDF, images, audio, video, exports) stored in R2,
organized in virtual folders, accessible from MCP via reference (no
upload/download chains).

**This is the bigger wedge.** Eliminating the upload/download/paste chain for
binary files in LLM workflows is a friction nobody else has solved.

## Acceptance criteria

- [ ] `files` + `file_versions` tables added (Drizzle schema)
- [ ] R2 bucket bound to Worker; presigned URLs for large file uploads
- [ ] 9 MCP tools: `list_files`, `get_file`, `upload_file`, `update_file`,
      `move_file`, `delete_file`, `search_files`, `share_file`, `restore_file_version`
- [ ] `get_file` returns base64 + mime for files <1MB; presigned R2 URL for larger
- [ ] `upload_file` accepts base64 from MCP clients; large web uploads use
      presigned URLs directly to R2
- [ ] Virtual folder paths (no real folder objects — just `folder_path` string)
- [ ] Soft-delete with 30-day restore window
- [ ] Web UI: `/w/[slug]/files` with folder tree, drag-drop upload, preview pane
      for images, PPT/PDF preview via extracted content
- [ ] Visibility enforcement matches documents
- [ ] Stakeholder access keys can be scoped to specific folders

## Out of scope (separate items)

- Binary text extraction for PPT/PDF/Word/Excel — BL-022
- File versioning UI + FTS5 search across extracted content — BL-023
- Local-sync client (community plugin) — BL-024

## Notes

R2's zero-egress is what makes this economical. Files get served to PMs,
stakeholders, customers many times each; on S3 this would be a non-trivial
bill. On R2 it's free.

## Open questions

- File size limit? *Recommendation: 100MB per file in v0.5 (matches Workers
  request limit); 1GB via presigned URL flow in v1.0.*
- Folder permissions independent of file permissions? *Recommendation: no for v0.5,
  permissions are per-file. Folders are virtual organization only.*
