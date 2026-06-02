---
id: BL-033
title: Workspace data export (and re-import) — no lock-in
slug: workspace-export
list: backlog
state: draft
groups:
  - sprint-003-prod
  - epic-bootstrap
  - epic-commitment-ledger
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 2d
  pr_url: null
relations:
  - label: relates_to
    target: BL-014
  - label: relates_to
    target: BL-015
  - label: relates_to
    target: BL-029
attachments:
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §16 (Migration paths), §18 (Bootstrap directory)
sync:
  version: 1
  content_hash: null
created_at: 2026-06-01T12:00:00Z
updated_at: 2026-06-01T12:00:00Z
---

# Workspace data export (and re-import) — no lock-in

## Description

Let any Blitzlist user export their entire workspace as a portable archive
and either move it to a self-hosted instance, hand it to another tool, or
walk away with their data. Closes the "no lock-in" promise from the
marketing pitch and makes the AGPL/commercial-license story credible to
enterprise procurement.

Most of the infrastructure already exists — the bootstrap convention
(`blitzlist/` directory format, see ARCHITECTURE.md §18) is exactly the
export format. The sync engine (BL-014 importer + BL-015 exporter +
BL-016 conflict detection) handles bidirectional translation between MCP
database and that directory. This item is essentially: **run the sync
exporter on-demand against a target the user owns, package it up, hand it
over.**

## Acceptance criteria

### Surfaces

- [ ] Web UI button "Export workspace" at `/w/[slug]/settings` → downloads zip
- [ ] MCP tool `export_workspace({format?, include_files?, items_only?})`
      → returns a signed R2 download URL (workspaces > 500MB stream from R2;
      smaller ones download directly)
- [ ] CLI command `blz export <workspace> [--format=...]` for self-hosters
      and CI pipelines

### Four format options

- [ ] **`blitzlist`** (default) — native `blitzlist/` directory format.
      Drop-in to a self-hosted Blitzlist instance. Includes README that
      documents what's inside and how to re-import.
- [ ] **`backlog-md`** — reuses BL-029 Backlog.md exporter. Drop-in to any
      Backlog.md-compatible tool. Loses Blitzlist-specific fields (groups,
      sources, custom dimensions) gracefully; documents what was dropped.
- [ ] **`json`** — single-file generic dump for integrations, scripting,
      LLM consumption.
- [ ] **`sqlite`** — full D1 database export (rows + schema). For power
      users + forensics + offline analysis.

### What's included / excluded

- [x] **Included:** items, documents, files (zipped inline or as signed URLs
      if total > 500MB), groups (sprints, milestones, epics, labels, releases),
      relations, comments, approvals, compass configs, list templates,
      workspace settings (visibility defaults, dimension weights), activity log
- [x] **Excluded for security:** OAuth tokens, stakeholder access keys,
      share codes (regenerated on re-import), user account credentials
- [x] **Re-onboarding required after re-import:** members re-invited via
      invite codes; OAuth re-authorized per Claude install

### Re-import (mostly free, reuses BL-014)

- [ ] Web UI: "Import workspace" in onboarding flow accepts a Blitzlist
      export zip
- [ ] CLI: `blz import <workspace> <archive.zip>`
- [ ] Re-import is the same engine as BL-014 (git → MCP importer) reading
      from the `blitzlist/` directory inside the zip
- [ ] Conflict handling: re-importing into a non-empty workspace flags
      conflicts per BL-016; re-importing into a fresh workspace is
      lossless

### Quality + safety

- [ ] Export is **idempotent** — running it twice produces byte-identical
      archives (for diff-ability / verification)
- [ ] Manifest at archive root: `MANIFEST.json` with format version,
      workspace metadata, item/doc/file counts, generation timestamp
- [ ] Self-hosters can verify completeness via the manifest before deleting
      the hosted instance
- [ ] Rate limit: 1 export per workspace per hour (heavy operation)
- [ ] Audit log entry on every export with caller identity + format

## Notes

This is **non-negotiable for the AGPL story and the enterprise sales
pitch.** "Run `blz export` and you walk away with a directory of Markdown
files. We can't hold your data hostage even if we wanted to" is the line
that closes the no-lock-in argument credibly.

It's also a **buyer-confidence signal during fundraising** — enterprise
procurement teams ask about data portability first; having a one-command
answer accelerates deals.

## Open questions

- **Files >500MB total:** stream from R2 via signed URLs (cleaner) vs.
  multi-part zip download (more familiar). *Recommendation: signed URLs
  with a side-car manifest pointing at each file. Modern, scalable, works
  with the existing R2 setup.*
- **Encrypted exports for sensitive workspaces:** v1.1+ feature. Use
  age-style encryption with a workspace-owner-held key.
- **"Export and delete account" flow:** GDPR / right-to-be-forgotten
  alignment. v1.1+ once we have a privacy lawyer review.
