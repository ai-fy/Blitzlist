---
id: BL-027
title: add_items_from_transcript MCP tool (Granola-shaped intake)
slug: add-items-from-transcript
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
  - label: blocks
    target: BL-025
  - label: relates_to
    target: BL-026
attachments:
  - kind: url
    url: https://docs.granola.ai
    title: Granola MCP / API docs
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T10:00:00Z
updated_at: 2026-05-28T10:00:00Z
---

# add_items_from_transcript MCP tool (Granola-shaped intake)

## Description

Bulk-extract requirement/task items from a meeting transcript and add them to
a list. Auto-creates a `source` relation back to the transcript URL so each
item carries its provenance from the moment it exists.

The most common source is Granola (which has its own MCP server, so the
builder's Claude can chain calls: Granola → transcript → Blitzlist), but the
tool accepts any transcript text + URL pair — Otter, Fireflies, manual paste,
even an email thread.

## Tool signature

```ts
add_items_from_transcript({
  transcript: string,         // raw transcript text
  source_url: string,         // canonical URL for the source (granola call, etc.)
  list: string,               // target list slug
  source_label?: string,      // default: "source"
  extraction_hint?: string,   // optional: "extract bugs only" / "high-level features"
}) → {
  items_created: Item[],
  relations_created: Relation[],
}
```

## Acceptance criteria

- [ ] Tool accepts transcript text + source URL
- [ ] Transcript chunked sensibly for LLM extraction (handles long calls)
- [ ] Uses Claude API server-side to extract items with:
        - title (short, action-oriented)
        - body (relevant excerpt + context)
        - suggested priority
- [ ] Each extracted item auto-linked to `source_url` with label=`source_label`
- [ ] `metadata_json` on the relation includes the transcript excerpt that
      generated the item
- [ ] Returns count + summary so caller's AI can present a confirmation
- [ ] Handles "extract nothing useful" gracefully (returns empty + reason)
- [ ] Rate-limited per workspace; budget tracking for Claude API costs

## Notes

This is the **first step of the canonical journey (BL-025)** — the experience
of going from a meeting to a populated list in one tool call is what makes
Blitzlist feel magical.

Server-side LLM extraction lets us tune the prompt/quality over time and
keeps the builder's Claude session focused on orchestration.

## Open questions

- Should the user (via Claude) be able to review extracted items before commit?
  *Yes — return them in `pending` state by default; caller can call `confirm`
  or `discard` per item.*
- Multi-language transcripts? *v0.5: English only. Add others in v1.0 based
  on demand.*
