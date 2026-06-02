---
name: capture-requirements
description: When the user states a product requirement, want, or need in natural language during this conversation, append it to REQUIREMENTS.md at the repo root — preserving the user's own phrasing as the source of truth, lightly enriched with implications. Trigger when the user says "I want", "I need", "I'd like to", "should be able to", "must", "we should", or otherwise expresses what the product/system should do in their own voice. Do NOT trigger for technical breakdowns I propose myself, for clarifying questions about what was already said, or for execution-flow requests (those are not product requirements).
---

# capture-requirements

User-voice requirements live in [REQUIREMENTS.md](../../../REQUIREMENTS.md). They are distinct from the technical backlog (`blitzlist/items/*.md`) — backlog is the engineering decomposition, REQUIREMENTS.md is the *source of intent*. When the two drift, intent wins. This skill enforces that the user's actual words don't get lost in translation to BL-XXX items.

## When this skill fires

Trigger when the user **states a product requirement** during the conversation. Signals:

- **Want/need verbs:** "I want", "I need", "I'd like", "we should", "we need to", "must be able to", "should be possible".
- **Behavioral wishes:** descriptions of how the product should behave, what users should experience.
- **Constraint statements:** "must not", "shall not", "can't be in the way of", "should never".
- **Strategic asks:** "I want to be able to exit", "I want this to attract acquirers", "should make adoption easier".
- **Pain-point articulations:** when the user describes a problem they're trying to solve. Their problem framing is the requirement.

Do **not** trigger for:

- **Technical breakdowns I propose** (those are decisions or backlog items, not user requirements).
- **Clarifying questions** about something the user already stated (those don't introduce new requirements).
- **Execution requests** ("run the migration", "deploy now") — those are commands, not product specs.
- **Conversational filler** that doesn't constrain the product.

If you're unsure whether something is a requirement, lean toward capturing it. Better to over-capture user voice than to lose it.

## What to write

Append a new section to REQUIREMENTS.md immediately before any closing matter, using this format:

```markdown
## YYYY-MM-DD — <Short topic>

**As stated:** "<quote or near-verbatim of what the user said, preserving their phrasing>"

**Implications:**
- <Bullet of what follows architecturally / product-wise / strategically>
- <Another implication>
- <Another implication>

**Status:** `open` | `partially addressed` | `addressed by <BL-XXX or decision-name>` | `parked`
```

## Rules for "As stated"

- **Quote when you can.** If the user's message is short and clear, quote it directly with quotation marks.
- **Near-verbatim is fine for long messages.** Compress without changing voice. Drop fillers like "I think", "maybe", "you know" unless they're load-bearing.
- **Preserve original word choices.** If the user said "cockpit," don't write "dashboard." If they said "frictionless," don't write "low-friction."
- **Keep their typos/grammar quirks if minor.** They're part of voice. Fix only when needed for readability.
- **Don't blend multiple user turns.** One requirement = one user statement. If they said multiple things in one turn, multiple entries.

## Rules for "Implications"

The implications are *light enrichment* — what follows directly from the stated requirement, in plain English. Not invention.

- **Architectural implications:** what this means for the data model, MCP tools, web UI.
- **Product implications:** what this means for positioning, audience, pricing.
- **Strategic implications:** what this means for exit-readiness, community, marketing.
- **Constraints it creates** for adjacent decisions.

Each implication should be one bullet. **Three to six bullets** is typical. More than seven means you're inventing.

## Status field

- **open:** No work has begun.
- **partially addressed:** Some BL-XXX items or decisions touch this; gaps remain.
- **addressed by <BL-XXX or decision-name>:** Done. Link the artifact.
- **parked:** Acknowledged but explicitly deferred (e.g., "v2.0+" territory).

Update status when state changes; preserve the original entry.

## Worked example

User said: *"i want to make this a public GitHub repo so that others can help and support and use it and host it on their own if they choose to"*

The skill would append:

```markdown
## 2026-05-27 — Self-hosting + community

**As stated:** "i want to make this a public GitHub repo so that others can help and support and use it and host it on their own if they choose to"

**Implications:**
- Open-source from day one (license decision becomes critical)
- Self-hostability is a first-class feature, not enterprise upsell
- PR-based contribution path needed for non-code requirements
- Implies discoverability — README, public roadmap, community surfaces

**Status:** addressed by the all-Cloudflare stack (3-min self-host), the `blitzlist/` bootstrap directory, AGPL-3.0 license decision.
```

## Discipline notes

- **Add to the bottom in chronological order.** Don't re-shuffle older entries.
- **Preserve voice over polish.** Boring captures are better than over-edited ones.
- **Cross-reference DECISIONS.md** when an implementation choice was made downstream of a requirement. Use `(see DECISIONS.md 2026-MM-DD)`.
- **Update Status when a requirement gets addressed.** Don't delete the entry — link the BL-XXX or the decision that closed it.
- **When intent drifts from implementation,** create a *new* REQUIREMENTS.md entry calling out the drift, with status `open`. Then make the implementation match.
