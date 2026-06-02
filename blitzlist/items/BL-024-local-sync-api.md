---
id: BL-024
title: Local-sync API spec + community plugin program
slug: local-sync-api
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
  estimate: 4d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-021
attachments:
  - kind: url
    url: https://docs.n8n.io/integrations/community-nodes/
    title: n8n community nodes program (the model)
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T16:00:00Z
updated_at: 2026-05-27T16:00:00Z
---

# Local-sync API spec + community plugin program

## Description

Publish the HTTP API spec that local-folder sync clients (Dropbox-client
equivalent for Blitzlist) will use. **We do not build the sync clients
ourselves** — we publish the API + a conformance test suite + a directory
of community-built clients.

This is n8n's community-nodes model adapted to Blitzlist. The community gets
self-hosting + sync clients; we stay focused on the server side.

## Acceptance criteria

- [ ] `apps/api/src/sync/` module implements the API contract:
        - `GET /sync/v1/manifest` — long-poll manifest of file states
        - `GET /sync/v1/file/{path}?version={n}` — versioned download stream
        - `PUT /sync/v1/file/{path}` — resumable multipart upload
        - `DELETE /sync/v1/file/{path}` — soft-delete
        - `POST /sync/v1/conflict/{path}` — report local conflict
        - `GET /sync/v1/changes?since={cursor}` — SSE stream of changes
- [ ] Auth via OAuth bearer or stakeholder key (no new auth model)
- [ ] OpenAPI spec published at `/sync/v1/openapi.json`
- [ ] Conformance test suite in `packages/sync-tests` — clients run this
      against a test workspace; passing earns a verified badge
- [ ] Community plugins directory at `https://blitzlist.ai/plugins` —
      listing local-sync clients per OS
- [ ] Reference client: a minimal Node.js implementation in
      `apps/cli-sync/` that we maintain (proves the API + serves as the
      starting point for community contributors)
- [ ] Documentation: "Build a Blitzlist sync client" guide

## Out of scope

The actual production-quality per-OS sync clients (macOS menu-bar app,
Windows tray, Linux daemon, mobile share extensions). These are
community-built deliverables.

## Notes

The reference CLI (`apps/cli-sync`) is what we own end-to-end. Anyone can use
it directly (`blz sync ~/Projects/myproject/files`), but it's also the
template for community-built native apps.

The conformance test suite is non-negotiable for "verified" status. We don't
want to ship users to a buggy community plugin and ruin trust in the program.

## Open questions

- Pay community plugin authors? *n8n doesn't; community plugins are a labor
  of love. Match that model for v1.0; revisit if a few key plugins need
  paid maintenance.*
- Hosting plugin downloads ourselves vs. linking to community repos?
  *Recommendation: link to community repos with verified badges + last-tested
  date. Lower legal exposure.*
