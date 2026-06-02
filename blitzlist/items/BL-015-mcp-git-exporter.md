---
id: BL-015
title: Sync exporter — MCP → git
slug: mcp-git-exporter
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
    - BL-016
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-014
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

# Sync exporter — MCP → git

## Description

The reverse direction of BL-014: detect changes in the MCP database and
write them back to the GitHub repo as auto-PRs. Cron-triggered, every 5
minutes by default (configurable in `config.yaml`).

Includes:
- Cron-triggered Worker (`cron: "*/5 * * * *"`)
- Per-workspace tracking of `last_exported_at`
- Markdown rendering: D1 row → canonical front-matter + body
- Branch creation + file commits via GitHub API (using installation token)
- PR creation with auto-merge when clean
- Filename renaming when item titles change

## Acceptance criteria

- [ ] Cron trigger configured in `wrangler.toml`
- [ ] Exporter queries D1 for items where `updated_at > last_exported_at`
- [ ] For each modified item, renders Markdown matching the canonical format
- [ ] Compares against ledger; safe updates go in the PR, conflicts skipped
- [ ] Creates branch `blitzlist-sync/<timestamp>`, commits, opens PR
- [ ] PR title format: "blitzlist: sync MCP → repo (N items)"
- [ ] Auto-merge enabled if CI green AND no conflict labels
- [ ] On merge, updates `workspace.last_exported_at`
- [ ] Title changes trigger filename renames (old file deleted, new file created)

## Notes

**Canonical rendering is critical.** If the exporter renders the same item
differently than the importer expects, every sync round-trips changes and we
get infinite drift PRs. Define a deterministic serializer (key order, YAML
quoting, trailing newlines) and pin it.

## Open questions

- What if the exporter wants to write to a file that has an open PR? Skip it
  for this cycle, retry next cycle. Don't fight a human PR.
- Should we batch many small workspace changes into one big sync PR per hour,
  or one PR per 5 minutes? *Default per `config.yaml`, but per-5-min as base.*
