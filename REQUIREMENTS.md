# Requirements (user voice)

> Chronological log of requirements **as the user stated them** — in their own
> natural language, lightly enriched with implications that follow.
>
> This is distinct from the technically-decomposed backlog in [blitzlist/items/](./blitzlist/items/).
> Backlog items are the engineering breakdown; this file is the source of
> intent. When backlog and intent drift, intent wins (or the drift is made
> explicit and tracked back here).
>
> The skill `.claude/skills/capture-requirements.md` enforces that new
> requirements stated in future sessions get appended here.

## Format

Each entry has:
- **Date** (when the user said it).
- **As stated:** quote or near-verbatim of what the user said. Preserve their phrasing.
- **Implications:** what follows architecturally / product-wise / strategically. Light enrichment, not invention.
- **Status:** `open` | `partially addressed` | `addressed by <BL-XXX or decision>` | `parked`.

Keep entries close to the user's words. The point of this log is to preserve
voice and intent that would otherwise be lost in translation to BL-XXX items.

---

## 2026-05-21 — Initial brief

**As stated:** "i want to create a new service Blitzlist.ai with an MCP Server. It shall empower claude code users to easily add requirements to a central backlog, assign to sprints, automatically update state, also share with others for approval or comment. Its the missing link from longterm product vision to implementation. Connecting shall be very easy, low friction account creation, maybe even just by assigning a hashcode (open for best practices for MCPs)."

**Implications:**
- MCP server is the primary interface, not a web UI bolted on
- The "Claude Code user" is the primary audience (vibe coders)
- Workflow: capture → assign → state-update → share for approval
- Low-friction onboarding is core, not a feature — "hashcode" prefigures the share-codes design
- "Missing link from long-term vision to implementation" becomes the founding pitch

**Status:** addressed throughout — drove the MCP-first architecture, three-audiences model, share codes, stakeholder access keys.

## 2026-05-22 — Generic primitive

**As stated:** "i also want to incorporate the idea of the Eisenhower matrix" / "design a more generic data model. it may handle requirements, todos or other list items"

**Implications:**
- The product is NOT a requirements tracker — requirements are one use of a generic list primitive
- Per-list state machines, per-list custom fields (different domains need different shapes)
- Templates ship pre-configured (backlog, todos, bugs, ideas, reading list)
- This forces the schema to be flexible from day one (lists table with states_json, fields_json)

**Status:** addressed by the generic `lists` + `items` + per-template config in the data model.

## 2026-05-23 — Cross-item relationships

**As stated:** "i also want to connect list items to others, e.g. tests to requirements or images of screenshots to requirements. so there needs to be relationship tables or something"

**Implications:**
- Items need typed relations (verifies / blocks / implements / references)
- Attachments are first-class (images, screenshots, files — not just text references)
- The pattern needs to extend to documents and external URLs

**Status:** addressed by the `relations` table (later evolved to fully polymorphic — see 2026-05-28 entry).

## 2026-05-27 — Self-hosting + community

**As stated:** "i want to make this a public GitHub repo so that others can help and support and use it and host it on their own if they choose to" / "we always also store a copy that's human-readable in the repository itself so that it can also be maintained in a central place by the community"

**Implications:**
- Open-source from day one (license decision becomes critical)
- Self-hostability is a first-class feature, not enterprise upsell
- The bootstrap convention: a `blitzlist/` directory in the repo is the canonical backlog, human-readable as Markdown + YAML
- PR-based contribution path needed for non-code requirements

**Status:** addressed by the all-Cloudflare stack (3-min self-host), the `blitzlist/` bootstrap directory, AGPL-3.0 license decision.

## 2026-05-28 — Dog-fooding from day one

**As stated:** "i want to eat my own dogfood and start with this: i connect claude code to granola and let it extract tasks/requirements from a client call, connect to blitzlist mcp and feed the list into it, send it out to the client via invite and receive approval or corrections..."

**Implications:**
- The canonical user journey is consulting/PRD work, not just engineering tickets
- Granola → MCP intake is a real workflow we need to support (BL-027)
- Stakeholder access keys + AI-mediated review are essential, not nice-to-have
- The whole loop from call → decisions → implementation → release notes must work end-to-end
- This becomes the v0.5 acceptance test (BL-025)

**Status:** addressed by the canonical user journey doc (ARCHITECTURE.md §12) and BL-025/BL-027/BL-028.

## 2026-05-28 — Provenance and traceability

**As stated:** "linking (requirements to origins eg. a call on granola, sprints, prompts, agent sessions, github pushes, vercel deploys etc.)"

**Implications:**
- Items must be linkable to *anything*: internal entities AND external URLs (Granola calls, GitHub PRs, Vercel deploys, Slack threads)
- The relation model must be polymorphic, not typed-per-thing
- Provenance chains should be queryable in ONE tool call
- Labels should be free-text (workspace-defined), not enum

**Status:** addressed — drove the polymorphic `relations` table redesign (DECISIONS.md 2026-05-28 entry).

## 2026-05-28 — Frictionless sharing

**As stated:** "i want to have a low friction sharing mechanism like in google workspace with 'everybody who has the link', it shall be possible to connect to the mcp, if possible even without registering/auth, enter a shared code (ideally combination of three words if this is not ip protected or so) and then have access to the shared part of the workspace, like a probosal list."

**Implications:**
- Two-tier auth: identity-tied (OAuth, magic link, stakeholder keys with audit trail) AND anonymous (share codes with URL-is-the-auth)
- Three-word codes (EFF diceware short list) — confirmed not IP-protected
- Same code works on BOTH web (`/s/[code]`) AND MCP (`/mcp/share/[code]`)
- "Proposal list" implies share codes + `propose` permission with pending-state moderation

**Status:** addressed by BL-030 (share codes design) — full sharing matrix in ARCHITECTURE.md §5.

## 2026-05-29 — Hierarchical lists

**As stated:** "i want to make it hierarchical so that it's possible, for example, to just state the short goal, then drill down into actions needed to execute this goal, and then further details. It must be always possible to link list items to others in a hierarchical manner. Also, each item must be linkable to documents or files within the Blitzbox. For example, design screenshots that are then presented in a nice and minimalistic manner in the user interface."

**Implications:**
- Items support unlimited-depth parent-child nesting (not just two levels)
- Drill-down UX with breadcrumbs is the natural pattern (Linear sub-issues, but unlimited depth)
- Attachments (especially images, design files) get prominent inline display — "nice and minimalistic"
- "Renderable" labels distinguish prominent-display attachments from generic relations

**Status:** addressed by BL-031, hybrid parent-state aggregation decision, renderable-label registry.

## 2026-05-29 — Eisenhower matrix → Compass

**As stated:** "i want to incorporate the idea of the Eisenhower matrix as being automatically generated from the lists. Instead of just having a two-dimensional matrix, I want a multi-dimensional matrix also including sizes of the items, the color, and maybe also animation frequency. That way we can incorporate multiple things like not only importance and urgency but also risk, stress level, maybe also frequency of change or uncertainty. Multiple dimensions. I want the key benefit for the user to always focus on the most impact or most important work and not get lost in the sheer size of everything that could be done. It's about steering the effort and attention of humans and agents in the right direction, and I want to always also start with this visual in the UI paths and use a three-dimensional, animated, catchy visual for that."

**Implications:**
- A 3D animated multi-dimensional priority view (later named "Compass") is a signature feature, not a chart bolt-on
- Auto-generated from list data (not manually maintained dimensions)
- Multi-dimensional: importance, urgency, risk, stress, change frequency, uncertainty, effort (more than just 2D)
- Visual encodings: position, size, color, animation, glow — fixed set
- The Compass is the primary navigator on the workspace home, not a side panel
- Same data drives AI agents' `get_focus()` — shared situational awareness

**Status:** addressed by BL-032 design.

## 2026-05-29 — Flexible Compass dimensions (per list)

**As stated:** "With the dimensions of the Compass, I want to stay flexible and not fixate the attribute names in the data model, so it will be more like a mapping of visual capabilities to metrics. That can be defined per list."

**Implications:**
- Visual slots are fixed in code; metrics are free-form per workspace
- Per-list `compass_config` maps slots → metrics
- Same Compass engine renders backlog/bugs/ideas lists differently
- Schema: `item_scores.metrics_json` (free-form keys), `lists.compass_config_json`

**Status:** addressed by Compass refactor (DECISIONS.md 2026-05-29 entry).

## 2026-05-29 — Shape capacity and value mapping

**As stated:** "i want to include shapes, for example: cubes, spheres, cylinders, stars. These are fixed enumerations which need to also number match the variations of the metric. Come up with a solution for that. Probably the mapping needs to be done first before assigning the values to the matrix."

**Implications:**
- Discrete visual slots (shape, pattern, border) get fixed enumeration options
- When a metric is enum and a slot is discrete, an explicit `value_map` is required at config time
- Validation happens at `set_compass_config` time, not render time
- Type bridging rules: continuous→continuous (direct), enum→discrete (value_map), enum→continuous (auto for ordered enums; explicit map for unordered), continuous→discrete (buckets)

**Status:** addressed by Compass type-bridging design.

## 2026-05-29 — Brand vision: shared workspace, not cockpit

**As stated:** "My feeling is, that shared workspace is stronger initial pitch than cockpit, which is often more related to dashboards/analytics, not actual sharing of data"

**Implications:**
- "Shared workspace" is a known category (Notion, Slack, Coda); we claim it and differentiate with "AI-first"
- "Cockpit" implies passive monitoring; rejected because the product is active multi-actor collaboration
- The pitch category claim is "the shared workspace for hybrid human-agent teams"

**Status:** addressed throughout — language reverted from "cockpit" to "shared workspace."

## 2026-05-29 — Documents + files for shared memory

**As stated:** "can we also store and process full md documents, e.g. infos about me, my profession, the project etc? another thought, i wonder if we can replicate the success of dropbox for easy sharing of binaries, ppt, images etc via mcp, without a chain of uploads, downloads and copy paste operations to use them in LLM work?"

**Implications:**
- "Shared memory" extends beyond items to long-form markdown (documents) AND binary artifacts (files)
- The Dropbox-for-MCP angle is a real wedge — eliminate the upload/download/screenshot chain for LLM workflows
- Files are accessible by reference, not by moving bytes
- Server-side text extraction for PPT/PDF/Word/Excel so AI sees content without re-upload
- This is a Blitzbox-named module that could stand alone

**Status:** addressed by BL-020 (documents), BL-021 (files), BL-022 (extraction worker), and the Blitzbox brand framing.

## 2026-05-29 — Two-tier strategy and grand vision

**As stated:** "i still want to start for vibe coders to plan, approve, delegate tasks across agents and monitor progress, make decisions, align with others etc. But the grand vision shall be the 'shared workspace for AI first, for hybrid human agentic teams, with a strong collaboration pull, becoming the central cockpit to manage and empower hybrid teams. I want to eat into the business of notion, airtable, trello, monday, dropbox, confluence. We approach things from an ai native approach like frictionless mcp and overcome current real life hurdles like context and todolist are lost after session, key artefacts can't be easily shared with other sessions, LLMs or human coworkers using their own llm session or slack, sometimes not even from claude cowork to claude code."

**Implications:**
- LAND (vibe coders) → EXPAND (hybrid teams 3-20) → VISION (productivity-suite scale)
- Direct named competitors: Notion, Airtable, Trello, Monday, Dropbox, Confluence
- Three frictions to erase: context dying at session boundaries; artifacts not traveling; AI-to-AI handoff losing state
- Public framing: describe the problem class (retrofitted AI, files don't travel) WITHOUT naming-and-shaming competitors

**Status:** addressed by the Land/Expand/Vision phasing in ARCHITECTURE.md §1 and the "three frictions" marketing pillar.

## 2026-05-29 — Module portfolio strategy

**As stated:** "I want to make it modular or components of the overall. For example: BlitzList is the listing component / BlitzBox is the sharing mechanism / BlitzWork might be something overarching"

**Implications:**
- Named modules with standalone marketing-surface potential, sharing one platform
- Notion-style umbrella+flagship pattern (after evolution: Blitzlist umbrella + Blitzbox module; "BlitzWork"/"Blitzwerk" rejected due to existing companies)
- Don't pre-announce all modules at v1.0 — peel them out as standalones progressively

**Status:** addressed by the two-brand portfolio framing.

## 2026-06-01 — Data export and acquisition-friendly license

**As stated:** "we need an export function to get all your data out of our service to move it to your self hosting or somewhere else." / "I want to be able to exit my business to an acquirer, so the open source license shall not be in the way of an exit and still make an acquisition likely and beneficial."

**Implications:**
- Workspace export is non-negotiable, not optional (BL-033)
- License must preserve commercial dual-licensing AND future relicensing → CLA required, not just DCO
- Acquisition-friendly pattern: AGPL + CLA + commercial tier (Red Hat / GitLab / MongoDB-pre-2018 / Plane pattern)
- Pure permissive (MIT/Apache) ruled out — no SaaS protection, weak exit story

**Status:** addressed by DECISIONS.md 2026-06-01 license decision + BL-033 export feature.

## 2026-06-01 — Decision documentation discipline

**As stated:** "save the design decisions (e.g. the migrations and others) to a list for later understanding. create a skill to enforce this decision documentation. Also create another skill that captures all requirements from our conversation in natural human language in a list, not the technically derived ones, but the ones i state (can be enriched, eg. by implications)"

**Implications:**
- Need a persistent decisions log (DECISIONS.md) that captures what was chosen, alternatives, rationale
- Need a separate user-voice requirements log (this file) distinct from technical backlog items
- Both kinds of records need *skill enforcement* so future sessions don't lose them
- Implication: design decisions made implicitly during coding (like the expression-index migration workaround) deserve documentation just as much as user-facing decisions

**Status:** addressed by this file, DECISIONS.md, and the two new skills.
