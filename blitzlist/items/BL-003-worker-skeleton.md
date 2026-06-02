---
id: BL-003
title: Deployable Hono Worker skeleton with /healthz
slug: worker-skeleton
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
    - BL-005
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-002
attachments:
  - kind: url
    url: https://hono.dev/getting-started/cloudflare-workers
    title: Hono on Workers — getting started
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T14:00:00Z
updated_at: 2026-05-27T14:00:00Z
---

# Deployable Hono Worker skeleton with /healthz

## Description

Stand up the minimum viable Worker that we can `wrangler deploy` to a preview
environment and hit from the public internet. Hono routing, two routes
(`/healthz` and a placeholder root), TypeScript build, sourcemaps in dev.

## Acceptance criteria

- [x] `wrangler dev` runs the Worker locally on port 8787 (Miniflare booted clean; D1/KV/R2 bindings simulated locally despite placeholder IDs in wrangler.toml)
- [ ] `wrangler deploy --env preview` deploys to a *.workers.dev URL — **pending user's `wrangler login`** (cloud auth + real D1/KV/R2 resource creation; dry-run deploy already succeeds)
- [x] `GET /healthz` returns `{ ok: true, version: "0.1.0", timestamp: "..." }` (verified via curl: 7ms response, 200 OK)
- [x] Worker bundle size under 1MB (actual: 83.65 KiB / 20.00 KiB gzipped — 1.2% of the cap)
- [x] TypeScript strict mode passes (pnpm typecheck clean across whole monorepo)
- [x] No runtime errors in local `wrangler dev` (clean log: GET /healthz 200 OK, GET / 200 OK, GET /nope 404 Not Found)

## Notes

This is the moment of truth for the all-Cloudflare decision — if `wrangler dev`
and deploy feel rough, surface that fast. Don't try to do too much in this item;
just prove the loop.
