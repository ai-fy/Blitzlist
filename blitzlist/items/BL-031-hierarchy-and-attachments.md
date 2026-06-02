---
id: BL-031
title: Hierarchical items + drill-down UI + inline Blitzbox attachments
slug: hierarchy-and-attachments
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-mcp-foundation
  - epic-web-ui
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 4d
  pr_url: null
relations:
  - label: blocks
    target: BL-025
  - label: relates_to
    target: BL-020
  - label: relates_to
    target: BL-021
  - label: relates_to
    target: BL-026
attachments:
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §3 (Hierarchy), §4 (Hierarchy + attachment tools), §6 (Item view UX)
sync:
  version: 1
  content_hash: null
created_at: 2026-05-29T10:00:00Z
updated_at: 2026-05-29T10:00:00Z
---

# Hierarchical items + drill-down UI + inline Blitzbox attachments

## Description

Make item hierarchy and Blitzbox attachment **ergonomically native**, so
top-down planning (goal → action → detail) feels first-class and visual
artifacts (screenshots, design files, specs) render minimally inline on
item cards.

The data model already supports both (parent_id + polymorphic relations);
this item ships the MCP tool ergonomics, the renderable-label registry
extension, and the web UI rendering rules.

## Acceptance criteria

### MCP tools (5 hierarchy + 3 attachment convenience)

- [ ] `add_subitem({parent_id, title, body?, state?, fields?, inherit_groups?})`
- [ ] `list_subtree({item_id, max_depth?})` — returns nested structure
- [ ] `get_breadcrumbs({item_id})` — chain back to root
- [ ] `move_subtree({item_id, new_parent_id})` — atomic reparent + descendants
- [ ] `roll_up_progress({item_id})` — aggregate state counts across subtree
- [ ] `attach_file({item_id, file_id, label?})` — defaults `attached_to`,
      accepts `designed_in`/`screenshot`/`mockup`/etc.
- [ ] `attach_document({item_id, document_id, label?})` — defaults `documented_in`
- [ ] `list_attachments({item_id, renderable_only?})` — filtered renderable view

### KNOWN_LABELS registry

- [ ] Add `renderable` flag to label definitions in `packages/core/relations/labels.ts`
- [ ] Renderable labels: `designed_in`, `illustrated_by`, `screenshot`,
      `mockup`, `specified_in`, `documented_in`, `referenced_in`
- [ ] Inverse labels render correctly on the target side

### Hybrid parent-state aggregation

- [ ] Parent item has its own manually-set `state` (no auto-derivation)
- [ ] UI shows rollup as derived display: `{total, draft, in_progress, done, blocked}`
- [ ] UI shows warning badge when parent state contradicts rollup
      (e.g., parent=done but a child=blocked)
- [ ] `roll_up_progress` tool returns rollup data so AI can see it too

### Web UI

- [ ] Single-item view (`/w/[slug]/i/[id]`) renders subtree below item body
- [ ] Subtree default state: top level expanded, deeper levels collapsed
- [ ] Click sub-item → URL becomes that item; breadcrumbs grow
- [ ] Escape (or click breadcrumb) zooms out
- [ ] Renderable attachments render as compact row above body:
        - 64×64 thumbnails for images/designs (no border, hover shadow)
        - Icon + title for docs (hover reveals first paragraph)
        - Hard cap 6 visible thumbnails; `+N more` link beyond
        - Loading: skeleton boxes for ~150ms, never text
        - Click image → lightbox; click doc → side-panel view
- [ ] Non-renderable relations (blocks, verifies, source, etc.) live in
      a less prominent "Related" section below the body
- [ ] Responsive: thumbnails wrap on narrow viewports

### Validation

- [ ] Schema validation: `parent_id` must reference an item in the same list
- [ ] Cycle detection on `move_subtree` (refuse to make a tree a child of its
      own descendant)
- [ ] Depth warning at >10 levels (storage allows, UX gets awkward)

## Notes

This item is foundational for the drill-down planning experience. Without
it, hierarchy works at the data level but feels clunky in practice.

The "minimalistic rendering" is design-critical — the attachment row is the
first thing a stakeholder sees on a shared item. Spend time on the visual
hierarchy.

## Open questions

- Multi-parent items (DAG instead of tree)? *No for v0.5 — single parent is
  the canonical hierarchy. Cross-cutting concerns use groups. If users need
  multi-parent later, the relations table can express it without schema
  changes.*
- Drag-to-reparent in web UI? *Yes for v1.0; calls `move_subtree`. Not v0.5.*
- Auto-resize images on upload to generate the 64×64 thumb? *Yes — handled
  by the binary-extraction worker (BL-022) on upload, stored alongside the
  original.*
