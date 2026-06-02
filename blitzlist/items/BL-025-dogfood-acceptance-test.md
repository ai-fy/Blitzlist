---
id: BL-025
title: The canonical user journey (v0.5 acceptance test)
slug: dogfood-acceptance-test
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-commitment-ledger
  - epic-bootstrap
author: malte
assignee: malte
parent: null
fields:
  priority: p0
  estimate: 2d
  pr_url: null
relations:
  - label: blocks
    target: null
  - label: verifies
    target: BL-026
  - label: verifies
    target: BL-027
  - label: verifies
    target: BL-028
  - label: relates_to
    target: BL-019
attachments:
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §12 — The canonical user journey
sync:
  version: 1
  content_hash: null
created_at: 2026-05-28T10:00:00Z
updated_at: 2026-05-28T10:00:00Z
---

# The canonical user journey (v0.5 acceptance test)

## Description

The integration acceptance test for v0.5. Documented in full in ARCHITECTURE.md
§12. **One real builder + one real tester must complete steps 1-11 without
manual workarounds or out-of-band tools** before v0.5 ships.

This is the dog-food story. If any step is friction-y, that's a v0.5 bug, not
a v1.0 nice-to-have.

## The eleven steps

1. Intake from Granola transcript via `add_items_from_transcript`
2. Mint stakeholder access key, email with deep link
3. Tester clicks deep link → MCP installed in their AI client
4. Tester gives feedback through their AI → `submit_feedback` writes back
5. Confirmation call recorded; `record_decision` for each item
6. Builder feeds item to Claude Code; `list_relations` returns full context
7. Decisions captured during implementation via `record_decision`
8. PR webhook → auto-relation `implemented_by`; state → `in_review`
9. Push webhook → auto-relation `shipped_in_commit`; state → `done`
10. Vercel webhook → `link_deploy`; state → `shipped`
11. `close_release` + `generate_release_notes` produces traceable Markdown

## Acceptance criteria

- [ ] All 11 steps documented in a runnable test script
- [ ] Test executed end-to-end with a real Granola call + real tester (not malte)
- [ ] No manual workarounds required (e.g., no "edit a file by hand at step 7")
- [ ] Total time-on-task for builder + tester: under 1 hour cumulative
- [ ] Provenance chain from step 1's transcript → step 11's release notes is
      fully linked via the `relations` table
- [ ] Bug list from the run is empty (or has only "polish" items, no blockers)

## Notes

This item is **not implemented work** — it's the gate that proves everything
else works. Items BL-026, BL-027, BL-028 (and the existing BL-009 through
BL-022) are what must be implemented to make this pass.

The pre-run setup is also tracked: stakeholder must have an MCP-capable
Claude client (Cowork, claude.ai, or Claude Code). If deep links don't yet
work in Claude clients, fall back to the paste-key flow with screenshots
in the email.
