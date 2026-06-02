---
id: BL-013
title: Public roadmap + release pages (the marketing surface)
slug: public-roadmap
list: backlog
state: done
groups:
  - sprint-002-beta
  - epic-web-ui
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
    - BL-010
    - BL-012
attachments:
  - kind: url
    url: https://forums.unrealengine.com/t/fortnite-roadmap/
    title: Unreal's UEFN public roadmap (inspiration)
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Public roadmap + release pages (the marketing surface)

## Description

The pages at `/r/[workspace]/...` are the *marketing surface* of Blitzlist —
where stakeholders and prospects see what's coming, what shipped, what was
promised. Inspired by Unreal's UEFN public roadmap.

Critical that these pages are *beautiful*, not just functional. They're how
the world sees both Blitzlist (when we use it for ourselves) and our customers'
products. A polished public roadmap is what makes self-hosting viral.

## Routes

- `/r/[workspace]` — workspace public roadmap (active sprints, upcoming releases, recently shipped)
- `/r/[workspace]/release/[slug]` — single release page (delivered/promised/slipped)
- `/r/[workspace]/release/[slug]/notes` — auto-generated release notes (BL-017)

## Acceptance criteria

- [ ] Routes respect `items.visibility` (only public + stakeholder-with-key items shown)
- [ ] No auth required for `internal=false` workspaces' public pages
- [ ] Roadmap renders releases as cards with progress bars (delivered/promised)
- [ ] Release page shows the breakdown clearly: ✅ shipped, ⏳ in progress, ↩ slipped, ✂ cut
- [ ] OG tags for nice link previews (Twitter, LinkedIn, Slack, Discord)
- [ ] Responsive design — public pages MUST work on mobile
- [ ] Performance: pages SSR'd, cached at edge, FCP < 1s

## Design notes

- Inspiration: UEFN's roadmap, Linear's public projects, Cal.com's roadmap, n8n's roadmap
- One opinionated theme for v0.5; themes/customization in v1.1+
- No login UI on these pages — they're for stakeholders, not members

## Notes

This is the page that, when shared on Twitter/LinkedIn, makes people say
"I want this for my own product." Get it right.
