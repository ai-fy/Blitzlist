---
id: BL-035
title: Airtable-shaped data model — templates + flexible fields + many-to-many lists
slug: airtable-shaped-data-model
list: backlog
state: done
groups:
  - sprint-002-beta
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 8h
  pr_url: null
relations:
  blocks:
    - BL-011
    - BL-013
    - BL-017
    - BL-029
    - BL-032
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-004
    - BL-009
    - BL-010
    - BL-026
    - BL-031
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-06-01T16:30:00Z
updated_at: 2026-06-01T16:30:00Z
---

# Airtable-shaped data model — templates + flexible fields + many-to-many lists

## Description

The current schema is Linear-shaped — items live in exactly one list, the list
owns the state machine, releases need a special FK. This doesn't match
Blitzlist's founding pitch (*"In boardrooms. In family kitchens. In sprint plans.
In grocery shopping."*). Every one of those needs different *columns*, not a
different product.

Reshape the data model so every list is the same universal primitive — a
container with an optional template — and every item carries its own typed
fields (state, dates, responsible, accountable, custom) defined by its template.
This is Airtable for hybrid human-AI work.

## Acceptance criteria

- [ ] New `templates` table — workspace-scoped schemas with `fields_schema_json`
- [ ] Lists collapse — `groups` table dropped; `lists` becomes the universal
      container; `lists.template_id` references `templates(id)`
- [ ] New `item_lists` join (many-to-many) — `role`, `position` per relation
- [ ] `items.list_id` and `items.position` removed; both move to `item_lists`
- [ ] `items.assignee_id`, `items.state` removed; both become entries in
      `fields_json` validated against the item's template
- [ ] `items.promised_in` removed; release commitment = an `item_lists` row
      with `role='release'`
- [ ] `groups` and `item_groups` tables dropped (replaced by lists + item_lists)
- [ ] System templates seeded for every workspace: backlog, bugs, todos, ideas,
      release, sprint, shopping, wishlist, invite, picnic
- [ ] Field type validator in `packages/core` — text, long_text, number, date,
      single_select (with terminal flag), multi_select, checkbox, url, user,
      link_to_item (uses BL-026 relations), attachment (BL-021)
- [ ] All 9 existing MCP tools refactored to the new shape
- [ ] New tools: `create_template`, `list_templates`, `add_field`, `remove_field`,
      `update_field`, `update_item`, `add_item_to_list`, `remove_item_from_list`,
      `reorder_in_list`, `close_list`
- [ ] BL-010 release tools merged in: `create_release` → `create_list` with
      `release` template; `promise_in_release` → `add_item_to_list` with
      `role='release'`; `close_release` → `close_list` (runs delivered/slipped/
      cut audit when list is closeable)
- [ ] `set_state` stays as convenience wrapper over `update_item`
- [ ] Activity log actions renamed/added: `item.added_to_list`,
      `item.removed_from_list`, `item.field_changed`, `list.closed`,
      `template.created`, `template.field_added`, `template.field_removed`
- [ ] Migration is destructive — spike data dropped (no users to preserve)
- [ ] Typecheck clean across all packages
- [ ] Smoke test: create a list with each template, add items with custom
      fields, transition through states, close a release-typed list and verify
      delivered/slipped/cut breakdown

## Notes

This is the schema redesign that makes the founding pitch real. Without it,
Blitzlist is "another Linear with MCP" — with it, Blitzlist is the universal
database for hybrid human-AI work.

Templates are workspace-scoped (system templates are seeded per-workspace).
Users can edit templates freely — including system templates, which become
their own customized copies on edit.

## Open questions

- Should items have an implicit `state` field even if the template doesn't
  declare one? *Recommendation: no — state is just a field; templates that
  don't need it (shopping, wishlist) don't have it.*
- Should system templates be globally shared instead of per-workspace? *Deferred
  to v1.0; per-workspace is simpler for v0.5.*
- Field types `formula` and `rollup` — deferred to v1.0+.
- Per-cell permissions — never; we scope at list-level via stakeholder keys.
