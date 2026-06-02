---
id: BL-002
title: Initialize the monorepo (pnpm + Turborepo + wrangler)
slug: monorepo-setup
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
  estimate: 0.5d
  pr_url: null
relations:
  blocks:
    - BL-003
    - BL-004
  verifies: []
  implements: []
  duplicates: []
  relates_to: []
attachments: []
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Initialize the monorepo (pnpm + Turborepo + wrangler)

## Description

Scaffold the workspace layout described in §9 of ARCHITECTURE.md:

```
blitzlist/
├── apps/
│   ├── api/                # Hono on Workers
│   └── web/                # Pages app (defer until BL-012)
├── packages/
│   ├── db/                 # Drizzle schema (SQLite dialect for D1)
│   ├── core/               # Pure domain logic, no platform imports
│   ├── mcp/                # MCP tool definitions
│   └── ui/                 # Shared components (defer)
├── package.json            # pnpm workspaces + Turborepo
└── turbo.json
```

## Acceptance criteria

- [x] `pnpm install` works from clean clone (8.8s, 2 pre-existing deprecated subdependencies — accepted)
- [x] `pnpm typecheck` passes (9 tasks, 9 successful, 1.658s)
- [x] `pnpm build` runs through Turborepo without errors (Worker bundles to 21.69 KiB / 5.15 KiB gzipped via wrangler --dry-run)
- [x] `apps/api/wrangler.toml` exists with stub bindings (D1, KV, R2 placeholders; DO + Queues commented for later items)
- [x] README in repo root explains the project; apps/api/README.md covers dev/build/deploy specifically

## Out of scope

- Actual code in any package (that's BL-003 onward)
- CI workflows (separate item)
- Production deploy (separate item)
