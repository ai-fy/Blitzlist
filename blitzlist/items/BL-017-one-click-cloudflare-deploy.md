---
id: BL-017
title: One-click Deploy to Cloudflare (the self-host moat)
slug: one-click-cloudflare-deploy
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-bootstrap
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 3d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-014
attachments:
  - kind: url
    url: https://docs.n8n.io/hosting/installation/
    title: n8n self-host docs (the model to emulate)
  - kind: url
    url: https://developers.cloudflare.com/workers/get-started/deploy-button/
    title: Cloudflare Deploy Button docs
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# One-click Deploy to Cloudflare (the self-host moat)

## Description

A "Deploy to Cloudflare" button in the README that takes a user from zero to
a running Blitzlist instance in ~3 minutes. This is the n8n-style distribution
moat — every self-hosted instance is a foothold for community + advocacy.

## What gets provisioned

- Forked GitHub repo on the user's account
- Cloudflare Worker (the API + MCP server)
- D1 database (with migrations applied)
- KV namespace (OAuth ephemeral state)
- R2 bucket (attachments)
- Durable Object class (real-time fanout)
- Cloudflare Pages site (web UI)
- DNS record pointing user's custom domain (optional)

## Acceptance criteria

- [ ] README has the "Deploy to Cloudflare" button prominently above the fold
- [ ] Button triggers a workflow that runs the provisioning script
- [ ] Provisioning script idempotent — can re-run if it fails partway
- [ ] First-run setup wizard at `/setup`:
        - choose admin email
        - pick list templates to seed
        - configure custom domain (optional)
        - test MCP endpoint works
- [ ] Documentation: "Self-host in 3 minutes" page with screenshots
- [ ] CI verifies the deploy flow end-to-end on every release
- [ ] Self-hosters can sync their `blitzlist/` directory with the official
      upstream to get updates (documented pattern)

## Notes

This is THE moat. Spend the time to make it actually one-click. Every paper
cut here costs us a self-host adoption.

## Open questions

- Do we want a hosted "trial then export to self-host" flow? *Recommendation:
  yes, but post-v1.0 — the data export tooling is straightforward.*
- How do we handle migrations for self-hosters? *Each self-host gets a
  `wrangler d1 migrations apply` command in their dashboard; we publish
  migration files alongside releases.*
