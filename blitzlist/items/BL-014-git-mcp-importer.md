---
id: BL-014
title: Sync importer — git → MCP
slug: git-mcp-importer
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
  priority: p0
  estimate: 3d
  pr_url: null
relations:
  blocks:
    - BL-015
    - BL-016
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-001
attachments:
  - kind: url
    url: ../SYNC.md
    title: Sync protocol
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Sync importer — git → MCP

## Description

Implement the importer half of the sync engine, per SYNC.md. A GitHub webhook
on push-to-`main` triggers a Worker endpoint that reads the diff, parses
changed `blitzlist/*` files, and applies the changes to D1.

Includes:
- Webhook receiver at `/webhooks/github`
- File parsing (front-matter + body) with schema validation
- Hash computation per item (canonical form)
- Ledger updates to `.sync/index.json`
- Conflict detection (defer resolution to BL-016)

## Acceptance criteria

- [ ] GitHub App created with `blitzlist-sync` name + webhook URL
- [ ] Webhook handler verifies signature with installation secret
- [ ] On push, importer fetches `git diff` of `blitzlist/` and processes
      each changed file
- [ ] New items: insert into D1, assign mcp_id, append to ledger
- [ ] Updated items (no conflict): apply to D1, update ledger
- [ ] Updated items (conflict detected): no-op + emit event for BL-016
- [ ] Deleted files: soft-delete corresponding items in D1
- [ ] Schema validation rejects malformed front-matter with clear errors
- [ ] Idempotent: re-running on the same commit is a no-op

## Notes

The webhook payload includes the commit range. We fetch file contents from
the GitHub raw API using the installation token — no need to clone the repo
inside the Worker (would be too slow and 1MB-bundle-hostile).

## Open questions

- Should we batch multiple file changes from one push into one D1 transaction?
  *Recommendation: yes, atomic per-push apply. Either all changes land or none.*
- What happens if a push touches `blitzlist/config.yaml`? Treat as a
  workspace-level config change with audit log; sync settings take effect
  on the next sync cycle.
