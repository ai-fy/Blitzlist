---
id: BL-012
title: Stakeholder-facing MCP tools + Mermaid rendering
slug: stakeholder-mcp-tools
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-mcp-foundation
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 2d
  pr_url: null
relations:
  blocks: []
  verifies: []
  implements: []
  duplicates: []
  relates_to:
    - BL-011
    - BL-010
attachments:
  - kind: url
    url: https://mermaid.js.org/
    title: Mermaid diagram syntax
sync:
  version: 1
  content_hash: null
created_at: 2026-05-27T15:00:00Z
updated_at: 2026-05-27T15:00:00Z
---

# Stakeholder-facing MCP tools + Mermaid rendering

## Description

Implement the MCP tools that stakeholders call through their own AI assistant
(Claude Cowork, claude.ai). All tools return BOTH structured data AND visual/
narrative renderings so any MCP-capable AI client can present the answer well.

This is the killer-feature surface — the bit that makes Blitzlist different
from every other PM tool.

## Tools to implement

- [ ] `view_roadmap({ workspace?, release? })` → items + Mermaid Gantt + executive summary
- [ ] `view_release({ release_id })` → delivered/slipped/cut + Mermaid pie + narrative
- [ ] `present_for_review({ item_id })` → item formatted as a review brief with auto-generated clarification questions
- [ ] `submit_feedback({ item_id, feedback, intent? })` → appends structured comment
- [ ] `request_clarification({ item_id, question })` → notifies builder
- [ ] `approve({ item_id, conditions? })` → formal approval with optional conditions
- [ ] `list_open_for_review()` → items in the stakeholder's scope awaiting input

## Mermaid renderings

- Roadmap: `gantt` syntax with releases as sections, items as tasks
- Relations: `graph LR` showing verifies/blocks/implements arrows
- State machine: `stateDiagram-v2` per list
- Release composition: `pie` chart delivered vs. slipped

## Acceptance criteria

- [ ] All 7 tools implemented with Zod schemas
- [ ] Each tool returns `{data, rendered: {mermaid?, markdown_summary, executive_brief?}}`
- [ ] Mermaid output is valid (validate in CI against `@mermaid-js/parser`)
- [ ] Tools enforce stakeholder key scope (404 for out-of-scope items)
- [ ] End-to-end test from a Claude Cowork session: paste key, ask for roadmap,
      verify Mermaid renders and structured data is correct

## Notes

This is what makes Cowork demos look impressive. Resist the urge to over-design
the rendering — keep Mermaid output minimal and clear.
