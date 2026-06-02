---
id: BL-001
title: Set up the blitzlist/ directory and conventions
slug: blitzlist-directory
list: backlog
state: done
groups:
  - sprint-001-spike
  - epic-bootstrap
author: malte
assignee: malte
parent: null
fields:
  priority: p0
  estimate: 1d
  pr_url: null
relations:
  blocks:
    - BL-002
    - BL-014
  verifies: []
  implements: []
  duplicates: []
  relates_to: []
attachments:
  - kind: url
    url: ./README.md
    title: blitzlist/ README
  - kind: url
    url: ./SYNC.md
    title: Sync protocol
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Set up the blitzlist/ directory and conventions

## Description

Establish the canonical file structure for storing Blitzlist's own product
backlog inside this repository. The `blitzlist/` directory holds requirements,
sprints, epics, and the sync configuration as plain Markdown and YAML files
that humans can read and edit via PR.

This is the bootstrap step that lets us dog-food Blitzlist from day one — the
backlog exists in the repo *before* any MCP server code has been written.

## Acceptance criteria

- [x] `blitzlist/README.md` documents the directory conventions and file formats
- [x] `blitzlist/SYNC.md` documents the bidirectional sync protocol with MCP
- [x] `blitzlist/config.yaml` holds workspace + sync configuration
- [x] `blitzlist/lists/backlog.yaml` defines the project's backlog list
- [x] Sprint definitions for v0.1, v0.5, v1.0 in `blitzlist/groups/sprints/`
- [x] Epic definitions for the major workstreams in `blitzlist/groups/epics/`
- [x] At least 8 seed items covering v0.1 spike work + sync engine work
- [ ] JSON Schema for item front-matter — deferred to BL-014
- [ ] CI validation hook — deferred to BL-014

## Notes

The directory convention is the same one we want other projects to use when
they adopt Blitzlist. Keep it general; resist the urge to add Blitzlist-specific
fields here.
