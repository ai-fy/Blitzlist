---
id: BL-028
title: Vercel/Netlify/Fly deploy webhooks → auto-link to items
slug: deploy-webhook-linking
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-github-integration
author: malte
assignee: null
parent: null
fields:
  priority: p1
  estimate: 1.5d
  pr_url: null
relations:
  - label: blocks
    target: BL-025
  - label: relates_to
    target: BL-026
attachments:
  - kind: url
    url: https://vercel.com/docs/observability/webhooks-overview
    title: Vercel webhooks docs
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T10:00:00Z
updated_at: 2026-05-28T10:00:00Z
---

# Vercel/Netlify/Fly deploy webhooks → auto-link to items

## Description

Receive deploy webhooks from Vercel (priority for v0.5), Netlify, and Fly. For
each deploy event, find items referenced in the commit messages or PR titles
and auto-create relations with label `deployed_in`, plus state transitions
to `shipped` (when target list supports it).

Closes the loop on the canonical journey (BL-025): a builder doesn't need to
manually tell Blitzlist "this deployed" — it knows.

## Acceptance criteria

- [ ] `/webhooks/vercel` endpoint receives deploy events
- [ ] Webhook signature verified per provider
- [ ] Commits in the deploy are scanned for item IDs (BL-NNN pattern)
- [ ] For each matched item: `link(from=item, to=external vercel_url,
      label=deployed_in, metadata={env, commit_sha, timestamp})`
- [ ] State transition to `shipped` IF the item's list states_json includes
      `shipped` AND the deploy is to production env
- [ ] Same pattern for Netlify (`/webhooks/netlify`) and Fly (`/webhooks/fly`)
- [ ] Convenience MCP tool `link_deploy({item_id, deploy_url, env?, commit_sha?})`
      for manual linking when webhooks aren't available
- [ ] Web UI: deploy badges shown on item cards (env color-coded)

## Notes

Vercel first because it's the most common deploy target for the LAND
audience. Netlify/Fly are quick additions.

GitHub PR/push webhooks (BL-018 territory) handle the upstream side; this
handles the downstream side. Together they cover the full implement→ship arc.

## Open questions

- Multiple deploys per item (preview, staging, production)? *Yes — each is
  its own relation with `env` in metadata.*
- What about deploy rollbacks? *Add relation with label `rolled_back_in`;
  don't auto-revert state — surface for human review.*
