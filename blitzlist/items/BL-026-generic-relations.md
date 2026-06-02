---
id: BL-026
title: Generic polymorphic relations table (link anything to anything)
slug: generic-relations
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-mcp-foundation
  - epic-commitment-ledger
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 2d
  pr_url: null
relations:
  - label: blocks
    target: BL-025
  - label: relates_to
    target: BL-004
attachments:
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §3 (data model) — relations table
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T10:00:00Z
updated_at: 2026-05-28T10:00:00Z
---

# Generic polymorphic relations table (link anything to anything)

## Description

Replace the typed `item_relations` table with a generic, polymorphic `relations`
table. Both endpoints (`from`, `to`) can be any internal entity (item, document,
file, group) OR an external URL. Labels are free-text strings; common labels
have registered inverses in code; unknown labels auto-inverse as `<label>_of`.

This is the foundation that makes the canonical user journey (BL-025) possible —
provenance chains from call → item → PR → deploy → release all live in one table.

## Acceptance criteria

- [ ] Drizzle schema updated: `relations` table with from_type/from_id/from_url,
      to_type/to_id/to_url, label, metadata_json
- [ ] Migration drops `item_relations`; relations data migrated forward
      (existing test data only — no production data yet)
- [ ] `KNOWN_LABELS` registry in `packages/core` with registered inverses
- [ ] MCP tools updated: `link`, `unlink`, `list_relations` (generic, polymorphic)
- [ ] Plus convenience wrappers: `add_source`, `link_deploy` (default labels +
      external URL ergonomics)
- [ ] `list_relations({entity})` returns BOTH directions with correctly resolved
      labels (registered or auto-inverse)
- [ ] Workspace can extend KNOWN_LABELS via config (community-defined ontology)
- [ ] Bootstrap docs (blitzlist/README.md) updated to show the new relations
      array format in item front-matter

## YAML format change

Old:
```yaml
relations:
  blocks: [BL-002]
  verifies: [BL-005]
```

New (generic, supports external + non-item targets):
```yaml
relations:
  - label: blocks
    target: BL-002
  - label: source
    url: https://granola.app/call/abc123
    metadata:
      excerpt: "we need SSO"
  - label: deployed_in
    url: https://vercel.com/.../dpl_xxx
  - label: documented_by
    target: DOC-007
```

## Notes

This is breaking change for the (small) existing test data. Cheap to do now;
expensive later. Land before any user data exists.

## Open questions

- Should `label` be normalized (lowercase, underscore-separated) on insert?
  *Yes — `Verifies`, `verifies`, `VERIFIES` should all be one label.*
- Cardinality limits? *No hard limit; warn if any single entity has >100 relations.*
