---
id: BL-004
title: D1 schema + first migration via Drizzle
slug: d1-schema
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
    - BL-005
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-003
attachments:
  - kind: url
    url: https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1
    title: Drizzle + D1 docs
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# D1 schema + first migration via Drizzle

## Description

Translate the data model from §3 of ARCHITECTURE.md into Drizzle's SQLite
dialect, generate the first migration, apply it to a D1 database. Includes
the workspaces, users, members, lists, items, groups, item_groups,
item_relations, attachments, comments, approvals, activity_log, share_links,
and oauth_* tables.

JSON fields stored as TEXT with `json_extract()` access patterns. Expression
indexes on hot custom fields per the strategy in §3.

## Acceptance criteria

- [x] `packages/db/src/schema.ts` defines the v0.1 minimum tables
      (workspaces, users, workspace_members, invite_codes, lists, items,
      comments, activity_log). Remaining tables from §3 (groups, relations,
      documents, files, attachments, approvals, item_scores, oauth_*,
      share_codes, stakeholder_access_keys) ship as additive migrations
      with their respective items — not in BL-004's scope.
- [x] `pnpm db:generate` produces a clean migration SQL file
      (`0000_workable_the_order.sql`)
- [x] `wrangler d1 migrations apply blitzlist-dev --local` succeeds
      (20 commands from 0000, 4 commands from 0001, all green)
- [x] Expression indexes exist for `backlog.priority`, `todos.due_date`,
      `bugs.severity` — added via raw-SQL migration `0001_expression_indexes.sql`
      because Drizzle's SQLite emitter mangled the expression-index syntax.
      Documented in schema.ts.
- [x] A seed script inserts the Blitzlist workspace + Malte user +
      `backlog` list with canonical states/fields + BL-001 test item
      + activity log entry. Lives at `apps/api/seed/dev-seed.sql`.
- [x] Round-trip verified: `SELECT id, title, state, json_extract(custom_fields_json, '$.priority'), json_extract(custom_fields_json, '$.estimate') FROM items WHERE id = 'BL-001'` returns `(BL-001, "Set up...", done, "p0", "1d")`.

## Notes

This is the foundation everything else queries against. Take the time to get
the foreign keys and indexes right.

**Drizzle SQLite expression-index quirk** — When you define an expression
index like `index('x').on(sql\`json_extract(...)\`)`, drizzle-kit emits
backtick-wrapped SQL that breaks. Workaround: keep the schema declarative,
add expression indexes as hand-written migrations. Worth a bug report
upstream; not blocking us.

## Open questions

- Do we need separate dev/preview/prod D1 databases, or one per environment
  with prefixed table names? (Recommendation: separate D1 databases per env;
  cheaper and cleaner isolation.)
