---
id: BL-029
title: Backlog.md importer + exporter (round-trip interop)
slug: backlog-md-interop
list: backlog
state: draft
groups:
  - sprint-003-prod
  - epic-bootstrap
author: malte
assignee: null
parent: null
fields:
  priority: p1
  estimate: 2d
  pr_url: null
relations:
  - label: relates_to
    target: BL-001
attachments:
  - kind: url
    url: https://github.com/MrLesk/Backlog.md
    title: Backlog.md repo
  - kind: url
    url: https://github.com/MrLesk/Backlog.md/blob/main/AGENTS.md
    title: Backlog.md AGENTS.md convention
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T10:00:00Z
updated_at: 2026-05-28T10:00:00Z
---

# Backlog.md importer + exporter (round-trip interop)

## Description

Backlog.md is the closest thing to a de-facto standard for markdown-canonical
task tracking in the Claude-Code-user community. Treat it like we treat
Conventional Commits: not a formal standard, but a real convention worth
interoperating with.

Ship a round-trip compatibility layer:
- **Importer**: read a `backlog/tasks/*.md` directory; translate each task
  into a Blitzlist item.
- **Exporter**: write a subset of Blitzlist items as Backlog.md-format files
  in a `backlog/` directory.

Goal: no lock-in. Anyone using Backlog.md can adopt Blitzlist losslessly for
the core fields. Anyone leaving Blitzlist can fall back to Backlog.md without
losing their tasks.

## Acceptance criteria

### Importer

- [ ] CLI command `blz import backlog-md <path>` reads the directory
- [ ] Backlog.md status → Blitzlist state (configurable mapping)
- [ ] Backlog.md dependencies → Blitzlist relations with label `blocks`
- [ ] Backlog.md labels → Blitzlist groups of type=label
- [ ] Imported items get a `source` relation back to the original Backlog.md
      file path (audit trail)
- [ ] Idempotent: re-running on the same directory is a no-op or update

### Exporter

- [ ] CLI command `blz export backlog-md <path>`
- [ ] Each item rendered as a Backlog.md-shaped Markdown file
- [ ] Loses Blitzlist-specific fields gracefully (groups beyond labels,
      custom fields, sources, etc.) — documents what's dropped
- [ ] Generates AGENTS.md pointing at the convention

## Notes

Backlog.md format is moving target; pin to a specific spec version we test
against and document in our docs.

This is also a marketing angle: "if Blitzlist doesn't work out, you can
leave with one command. We don't lock you in."

## Open questions

- Should the importer be available as an MCP tool too (so Claude can run it
  from a session)? *Yes — `import_backlog_md(path)` for convenience.*
- Two-way sync (continuously mirror)? *No for v1.0 — one-shot import/export.
  Continuous sync is what our own `blitzlist/` directory is for.*
