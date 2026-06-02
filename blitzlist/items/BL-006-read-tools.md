---
id: BL-006
title: Implement add_item, list_items, get_item tools
slug: read-tools
list: backlog
state: done
groups:
  - sprint-001-spike
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 1d
  pr_url: null
relations:
  blocks:
    - BL-007
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-005
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Implement add_item, list_items, get_item tools

## Description

Three core read/write MCP tools defined in §4 of ARCHITECTURE.md. Each is a
function that takes typed parameters, runs queries against D1, returns small
JSON. Schema validation via Zod (or the MCP SDK's built-in schema support).

## Acceptance criteria

- [x] `add_item({ list?, title, body?, state?, fields? })` — inserts a new item, atomic BL-NNN id via UPDATE workspaces RETURNING; records activity log entry; defaults to workspace's first list + the list's default_state if omitted
- [x] `list_items({ list?, state?, assignee?, search?, limit? })` — filterable by list slug, state, assignee, substring (title+body); default limit 50, max 200; returns items + total + applied filters
- [x] `get_item({ id })` — returns `{ item, comments (last 10), activity (last 20) }` with workspace-scoped lookup that 404s items in other workspaces
- [x] All three callable from MCP clients via the deployed Worker at `mcp.blitzlist.ai/mcp` (OAuth-gated via BL-034)
- [x] Workspace scoping — tools resolve `workspace_id` from `ctx.props` set by the OAuth grant during the consent flow; every Drizzle query filters by workspace_id
- [x] Validation in each tool's `validate()`: typed args, clear error messages on invalid input
- [x] All three tools registered through `createToolRegistry` and exposed via `tools/list`
- [ ] Wrangler `unstable_dev` integration test — *deferred*; manual end-to-end through Claude Desktop covers BL-006 acceptance; automated tests land with a dedicated test infrastructure item

## Implementation notes

- Tools live in `apps/api/src/tools/` (one file per tool); registry assembled in `apps/api/src/tools/index.ts`
- Tool definitions consume a `Db = ReturnType<typeof drizzle<typeof schema>>` from `apps/api/src/db.ts`
- Item ID generation: `nextItemId()` runs `UPDATE workspaces SET item_counter = item_counter + 1 ... RETURNING counter, prefix`. Atomic, no race.
- Custom field validation against `list.fields_json` is *not* enforced server-side yet — the schema says `priority: p0..p3` for backlog, but `add_item({fields: {priority: "purple"}})` would currently insert. Add field-schema validation in a follow-up item (likely with the executor field in BL-009).

## Notes

`list` parameter resolution: if omitted, fall back to the workspace's
default list. For the spike with one workspace and one list, this is trivial.
