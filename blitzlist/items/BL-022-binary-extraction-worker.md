---
id: BL-022
title: Binary text-extraction worker (PPT/PDF/Word/Excel)
slug: binary-extraction-worker
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

# Binary text-extraction worker (PPT/PDF/Word/Excel)

## Description

On file upload, queue an extraction job. A separate Worker pulls extracted
text and metadata using parser libraries, stores the result in
`files.extracted_text` so subsequent `get_file_text` calls return cached
content instantly.

This is what makes the Dropbox-for-MCP UX feel native: PPT/PDF binaries
become text-queryable for Claude without any client-side processing.

## Acceptance criteria

- [ ] Cloudflare Queue `file-extraction` configured in wrangler.toml
- [ ] `upload_file` enqueues an extraction job (file_id only — extractor
      fetches from R2)
- [ ] Extraction Worker handles:
        - PDF via `pdf-parse` or similar (Workers-compatible build)
        - DOCX via `mammoth`
        - PPTX via custom parser (XML extraction)
        - XLSX via `xlsx` library
- [ ] Extracted text stored in `files.extracted_text`; metadata
      (page/slide count) in `files.extracted_metadata_json`
- [ ] Extraction status field: `pending | done | failed | unsupported`
- [ ] Failed extractions retry up to 3x with exponential backoff
- [ ] `get_file_text` returns extracted text if `done`, error otherwise
- [ ] For supported Claude clients with Anthropic Skills, both the raw binary
      (via `get_file`) and extracted text are available

## Notes

Workers have a 1MB bundle size limit per script. The extraction Worker may
need to be a separate Worker (not the main API) to avoid bloating the main
bundle with parser libs.

## Open questions

- Should we expose extraction status changes via the live-update channel
  (Durable Objects)? *Yes — web UI shows "Processing..." badge that updates
  to "Ready" when extraction completes.*
- OCR for image-only PDFs and screenshots? *Defer to v1.0. Workers don't have
  great OCR options today; might need to call an external service.*
