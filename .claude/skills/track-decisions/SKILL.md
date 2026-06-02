---
name: track-decisions
description: When a design or strategic decision is finalized in this conversation — architecture choice, library pick, schema shape, branding, licensing, scoping cut, named-product decision — append it to DECISIONS.md at the repo root preserving the format already in use. Trigger when the user confirms a choice ("yes, go with X", "let's do Y", "lock that in"), when a recommendation is accepted, when a tradeoff is resolved, or when you discover an implementation-time decision (like the expression-index migration workaround) that future readers should know about. Do NOT trigger for minor implementation details that don't shape the product or the architecture.
---

# track-decisions

Blitzlist treats design decisions as durable artifacts, not chat history. They live in [DECISIONS.md](../../../DECISIONS.md). This skill enforces that policy.

## When this skill fires

Trigger this skill any of these happen in the conversation:

- **The user explicitly commits to a choice.** "Yes, go with the AGPL recommendation." / "Let's use Drizzle." / "Lock that in."
- **A recommendation is accepted implicitly** by proceeding with the work it implies.
- **An architectural tradeoff is resolved** — picking one option over alternatives that were discussed.
- **An implementation-time decision** comes up that future readers should know about — e.g., a workaround for a library bug, a deliberate scoping cut, a deferred concern. Decisions discovered *during* coding count.
- **Scope is changed for a backlog item** — e.g., "BL-XXX is v1.0 not v0.5 anymore." Worth a DECISIONS.md entry.

Do **not** trigger for:

- Pure execution steps (running `pnpm install`, writing a route handler) that don't decide anything.
- Tactical bug fixes that don't represent a strategic choice.
- Decisions the user has not yet confirmed — flag the *pending* decision in your response but don't write to DECISIONS.md until it's locked.

## What to write

Append a new section at the end of DECISIONS.md (under the existing entries, before any "Pending decisions" section if present). Use this exact format:

```markdown
## YYYY-MM-DD — <Short decision name>

- **Decision:** What was chosen, plainly.
- **Alternatives considered:** What was rejected, with one-line "why not" per option.
- **Rationale:** Why the chosen option wins, in plain English. Avoid jargon.
- **Decided by:** Who decided. `malte` for user decisions; `Claude` for implementation-time discoveries that malte accepted; `malte (after Claude proposed X)` when the credit is shared.
- **Status:** `active` | `superseded by <decision-name>` | `revisited` (start as `active` unless context says otherwise).
- **References:** Paths to files that codify the decision, links to relevant BL-XXX items.
```

Keep entries **terse**. The point is the decision and its reasoning — not a re-explanation of the architecture. Link to ARCHITECTURE.md / specific files for long-form content.

## Worked example

User said: *"go with your license recommendation"* (AGPL-3.0 + CLA + commercial tier).

The skill would append:

```markdown
## 2026-06-01 — License: AGPL-3.0 + CLA + commercial tier

- **Decision:** Blitzlist is licensed under AGPL-3.0. Contributors sign a CLA (via CLA Assistant on GitHub) granting the project the right to dual-license. Commercial license tier available for enterprises that legally can't use AGPL.
- **Alternatives considered:**
  - MIT (rejected: no SaaS protection, weak acquisition story).
  - Apache 2.0 (rejected: same SaaS-protection gap; better patent grant but doesn't enable dual-licensing revenue).
  - n8n Sustainable Use License (rejected: not OSI-approved; we lack n8n's product gravity).
  - DCO instead of CLA (rejected: blocks future relicense; one-way door).
- **Rationale:** AGPL preserves OSI-approved credibility. CLA preserves future relicensing options (MongoDB/HashiCorp pattern). Commercial tier creates revenue line and acquisition story.
- **Decided by:** malte (after acquisition-lens research).
- **Status:** active. **TODO before public push:** populate `CLA.md`; configure CLA Assistant on GitHub.
- **References:** [LICENSE](./LICENSE), [CONTRIBUTING.md](./CONTRIBUTING.md), [README.md §License](./README.md).
```

## Pending decisions section

If a decision is researched but not yet committed (the user is still thinking), don't put it in the main log. Instead, ensure DECISIONS.md has a `## Pending decisions` section near the end with a brief note: what's pending, what the recommendation is, what action unblocks the call. Move the entry up to the main log once committed.

## Discipline notes

- **One decision per entry.** Don't combine multiple decisions into one section even if they happened in the same turn.
- **Preserve the alternatives** — future readers care about *why not* almost as much as *what*.
- **Don't editorialize.** The log is a factual record; opinions belong in the rationale, not in commentary.
- **Cross-reference REQUIREMENTS.md** when a decision is downstream of a user-stated requirement. Use the format `(addresses REQUIREMENTS.md 2026-MM-DD entry)`.
- **Update Status when superseded.** If a later decision overrides an earlier one, edit the old entry's status to `superseded by <new decision name>` rather than deleting it.
