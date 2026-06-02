# `blitzlist/` — the canonical backlog

> *MCP-native shared memory for product teams. Open-source. Self-hostable.*

This directory is the source-of-truth for Blitzlist's own product backlog, sprints, and roadmap. **We dog-food our own product:** every requirement, sprint goal, and tracked item for building Blitzlist lives here as a file in this repo.

Once the Blitzlist MCP server is running, this directory **syncs bidirectionally** with the live database at `mcp.blitzlist.ai`. The repo stays human-readable and PR-reviewable; the MCP server stays fast and queryable from Claude Code. See [SYNC.md](./SYNC.md) for the protocol.

---

## Why this directory exists

- **Bootstrap.** Until the MCP server is running, the repo IS the backlog. Anyone can read it, propose changes via PR. No service required.
- **Eating our own dog food.** Once MCP is live, we use Blitzlist to manage Blitzlist. Conviction-building, and the fastest way to find sharp edges in the product.
- **Public + community-maintainable.** Contributors don't need an account or an MCP install to propose a requirement — open a PR against `blitzlist/items/`.
- **Self-hostable convention.** Anyone forking Blitzlist for their own use can keep their own backlog in their own repo's `blitzlist/` directory, sync'd to their own MCP instance.

---

## Directory structure

```
blitzlist/
├── README.md                   # this file
├── SYNC.md                     # sync protocol with the MCP server
├── config.yaml                 # workspace + sync configuration
├── lists/
│   └── backlog.yaml            # list definition (states, fields, template)
├── groups/
│   ├── sprints/
│   │   ├── sprint-001-spike.yaml
│   │   ├── sprint-002-beta.yaml
│   │   └── sprint-003-prod.yaml
│   └── epics/
│       ├── epic-bootstrap.yaml
│       ├── epic-mcp-foundation.yaml
│       └── ...
├── items/
│   ├── BL-001-blitzlist-directory.md
│   ├── BL-002-monorepo-setup.md
│   └── ...
└── .sync/                      # sync engine ledger (auto-managed, do not edit)
    └── index.json              # id → {mcp_id, last_hash, last_synced_at}
```

---

## File format: items

Each item is one Markdown file with YAML front-matter. Front-matter holds the structured data; the body is the description, acceptance criteria, and any context.

```markdown
---
# === Identity ===
id: BL-001                         # workspace-prefixed counter, permanent, never reused
title: Set up the blitzlist/ directory
slug: blitzlist-directory          # used for filename and URLs; auto-derived from title

# === Membership ===
list: backlog                      # which list this belongs to (matches lists/*.yaml)
state: in_progress                 # must appear in list's states_json.states
groups:                            # array of group ids (sprints, epics, milestones, labels)
  - sprint-001-spike
  - epic-bootstrap

# === People ===
author: malte                      # GitHub handle
assignee: malte

# === Hierarchy ===
parent: null                       # id of parent item, for intra-list nesting

# === Custom fields ===
fields:                            # typed by the list's fields_json schema
  priority: p0
  estimate: 1d
  pr_url: null

# === Relations (outgoing only — inverses are rendered from the other side) ===
relations:
  blocks: []                       # item IDs this blocks
  verifies: []                     # item IDs this verifies (tests → reqs)
  implements: []                   # item IDs this implements (PRs → reqs)
  duplicates: []
  relates_to: []

# === Attachments ===
attachments:
  - kind: url
    url: https://github.com/...
    title: PR #42

# === Sync metadata (auto-managed by the sync engine — do not edit by hand) ===
sync:
  version: 1
  content_hash: null

# === Timestamps (ISO 8601, UTC) ===
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Set up the blitzlist/ directory

## Description

Establish the canonical file structure for storing Blitzlist's own product
backlog in this repository. Define the YAML front-matter schema for items,
the list/group YAML formats, and the sync protocol with the MCP server.

## Acceptance criteria

- [ ] `blitzlist/README.md` documents the conventions
- [ ] `blitzlist/SYNC.md` documents the sync protocol
- [ ] At least 5 seed items exist covering v0.1 work
- [ ] Front-matter format validates against a published schema
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `BL-NNN`, permanent, set on creation |
| `title` | yes | Short human-readable name |
| `slug` | yes | URL-safe; auto-derived from title; used in filename |
| `list` | yes | Matches a file in `lists/` |
| `state` | yes | Must be one of the list's defined states |
| `groups` | no | Array of group IDs from `groups/sprints/` or `groups/epics/` |
| `author`, `assignee` | no | GitHub handle, or null |
| `parent` | no | Item ID, for intra-list nesting |
| `fields` | no | Object, typed by `list.fields_json` |
| `relations` | no | Object with arrays per relation type |
| `attachments` | no | Array of `{kind, url, title?}` for v1 |
| `sync` | auto | Managed by sync engine, do not edit |
| `created_at`, `updated_at` | yes | ISO 8601 UTC timestamps |

---

## File format: lists

A list defines the container for items — its states, fields, and template. One file per list in `lists/`.

```yaml
# blitzlist/lists/backlog.yaml
id: backlog
name: Product backlog
description: |
  The main backlog for building Blitzlist itself. Items here represent
  product requirements and engineering tasks.
template_id: backlog               # which template was used to seed this list
states:
  - draft
  - proposed
  - approved
  - in_progress
  - in_review
  - done
  - shipped
  - rejected
default_state: draft
terminal_states: [done, shipped, rejected]
fields:
  - key: priority
    type: enum
    options: [p0, p1, p2, p3]
  - key: estimate
    type: string                   # free-form: "1d", "S", "M", etc.
  - key: pr_url
    type: url
default_view: table
color: '#FF6B35'
icon: backlog
archived: false
```

---

## File format: groups (sprints, epics, milestones, labels)

Groups span lists — an item from any list can belong to a sprint or milestone. One YAML file per group, organized by type.

**Sprint:**

```yaml
# blitzlist/groups/sprints/sprint-001-spike.yaml
id: sprint-001-spike
type: sprint
name: v0.1 — Single-user spike
state: planned                     # planned | active | closed
meta:
  starts_at: 2026-05-28
  ends_at: 2026-06-04
  goal: |
    Validate the capture-while-coding loop on Workers + D1.
    Working MCP server with 5 core tools, no auth, no web UI.
```

**Epic:**

```yaml
# blitzlist/groups/epics/epic-mcp-foundation.yaml
id: epic-mcp-foundation
type: epic
name: MCP server foundation
state: active
meta:
  description: |
    Core MCP server: transport, tool registration, OAuth, tool implementations.
```

**Label:**

```yaml
# blitzlist/groups/labels/backend.yaml
id: label-backend
type: label
name: backend
state: active
meta:
  color: '#0070F3'
```

---

## IDs

- **Items**: `BL-NNN` — `BL` is the workspace prefix (Blitzlist), `NNN` is a monotonic counter that never reuses numbers. Permanent across renames, list changes, anything.
- **Groups**: kebab-case slugs (`sprint-001-spike`, `epic-mcp-foundation`). The `sprint-NNN-` prefix is convention for ordering, not required.
- **Lists**: kebab-case slugs (`backlog`, `todos`, `bugs`).

**Filenames** for items follow `BL-NNN-slug.md`. If the title changes, the sync engine renames the file on next sync. Items never change ID.

---

## Contributing

Two ways:

### Via PR (works without an MCP account)

1. Fork the repo.
2. To **propose** a new item: add a file `blitzlist/items/BL-XXX-slug.md`. Use `XXX` as a placeholder ID; the sync engine assigns the real ID on merge.
3. To **edit** an existing item: edit the file directly.
4. Open a PR. Maintainers review like any code change.
5. On merge, the sync engine propagates the change to the live MCP server (and assigns a real ID if needed).

### Via MCP (once you have an account on mcp.blitzlist.ai)

1. Use Claude Code with the Blitzlist MCP server connected. Run `add_item`, `set_state`, etc.
2. Changes batch up and are written back to this repo every ~5 minutes as auto-PRs from the `blitzlist-sync[bot]` account.
3. Auto-PRs that pass CI auto-merge. Conflicts stay open for human resolution.

---

## State machine

The `backlog` list uses this lifecycle:

```
  draft ──▶ proposed ──▶ approved ──▶ in_progress ──▶ in_review ──▶ done ──▶ shipped
                  │                                          │
                  └─▶ rejected                               └─▶ changes_requested ─▶ in_progress
```

v1: any transition between defined states is allowed; the lifecycle is a guideline, not enforced edges. Terminal states (`done`, `shipped`, `rejected`) are flagged so "open" counts work.

---

## For projects using Blitzlist

If you're using Blitzlist for your own project (not Blitzlist itself), copy the same `blitzlist/` directory convention into your repo:

1. Create `your-repo/blitzlist/` with the same structure.
2. Fill in `config.yaml` with your MCP server URL and workspace slug.
3. Install the Blitzlist GitHub App on your repo to enable bidirectional sync.
4. Done. PRs propose changes; Claude/MCP makes live changes; both stay in sync.

The format is intentionally simple enough that you can also use it **without** an MCP server — just files in a folder. The MCP server is the live-collaboration accelerant, not a hard dependency.

---

## Validation

A JSON Schema for the item front-matter lives at [`schemas/item.schema.json`](./schemas/item.schema.json) (TODO: add in BL-101). A pre-commit hook and a CI check both validate against it on every PR.
