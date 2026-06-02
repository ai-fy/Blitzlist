# Blitzlist.ai — Architecture

> **The shared workspace for hybrid human-agent teams. AI-first, MCP-native.**
>
> Where humans and agents collaborate as peers — across plans, docs, files,
> and decisions — without losing context between sessions, tools, or LLMs.
>
> Open-source. Self-hostable on Cloudflare in one click.
>
> ---
>
> **Voice variants:**
> - **Buyer-facing:** *Shared memory for AI-augmented teams.*
> - **Dev-facing (README, social):** *MCP-native shared lists. Open-source. Self-hostable.*

---

## 1. Product positioning

### Three voices, one product

Blitzlist's pitch lives in three coexisting voices, each calibrated to a different reader:

| Voice | Audience | Use it where |
|---|---|---|
| **Category claim**: "The shared workspace for hybrid human-agent teams" | Investors, press, partners | Pitch deck, company tagline |
| **Product tagline**: "Shared memory for AI-augmented teams" | Buyers, early adopters | Marketing site, ads |
| **Technical tagline**: "Shared lists. Via MCP." | Vibe coders, OSS contributors | GitHub README, dev docs |

All three describe the same product. None contradict. Pick the right voice for the room.

### The problem we solve

Today's productivity stack was built for humans typing in browser tabs. AI features were *retrofitted*: a sidebar here, a "summarize" button there. Humans still do all the maintenance — updating status, syncing docs, copy-pasting context between tools.

When you bring an LLM into the loop, the seams show. Three frictions break the experience:

1. **Context dies at session boundaries.** Your AI's todo list is gone after a day. Long-term product perspective has nowhere to live between Claude Code sessions.
2. **Key artifacts can't move without humans.** Files, designs, decisions — every time you want another AI session, another LLM, or a human teammate to see them, somebody screenshots, downloads, copies, pastes. The work happens in the gaps between tools.
3. **Even AI-to-AI handoff drops state.** Going from one AI session to another — even from the same vendor's products — loses context. There's no shared memory layer.

Blitzlist is **AI-first from the foundation**: every primitive (items, documents, files) is designed to be accessed equally by humans and agents through MCP. It's the layer the existing productivity stack was never designed to be.

### The product portfolio

**Blitzlist** is both the **parent brand** and the **flagship integrated workspace product**. Inside Blitzlist lives one named module — **Blitzbox** — that has its own identity, target audience, and standalone marketing surface, while sharing the platform with the rest of Blitzlist (one MCP server, one auth layer, one data model, one codebase).

This is the Notion / Atlassian model in a smaller form: same underlying platform, one distinct named module that can win its own category independently.

| Brand | What it is | Standalone audience | Role inside Blitzlist |
|---|---|---|---|
| **Blitzlist** | The full hybrid-team workspace. Items + docs + files + sprints + workflows + collaboration + roadmaps. | Vibe coders, consulting teams, AI-augmented teams, B2B | (this IS Blitzlist — the integrated surface) |
| **Blitzbox** | AI-native file sharing. Drop binaries; any MCP client (Claude Code, Cowork, claude.ai) reads them by reference. Dropbox for the LLM workflow. | LLM users, indie hackers, anyone juggling files between AI sessions | The files + attachments + document-storage surface |

**Why two named brands, not one:**

- **Blitzbox can win its own category independently.** "Share files with your AI" is a universal pain point felt by anyone who's ever screenshotted a PPT into Claude. That audience is much wider than "I need a hybrid-team workspace." A separately-branded Blitzbox landing page lets us capture this audience without making them think about the broader workspace pitch.
- **Cross-pollination is free.** Someone uses Blitzbox solo to share files with their AI → discovers they can collaborate with teammates on the same files via Blitzlist → adopts the full workspace. Solo-user-to-team adoption pyramid (the Dropbox playbook).
- **Engineering stays unified.** One platform, two marketing surfaces. Cost is in marketing, not code.
- **Optionality.** If Blitzbox breaks out as a hit, we invest harder there without diluting Blitzlist's brand.

**Launch sequence:**

```
v0.1 → v1.0    Blitzlist ships (the full workspace; file-sharing
               is one of its features, not yet separately branded)
v1.0 → v1.5    Blitzbox spins out as a standalone marketing
               surface (sharper landing page, onboarding for
               the "I just want to share files with my AI"
               use case — same underlying MCP server, just a
               different front door)
v1.5+          Both live in parallel; cross-sell active;
               "Blitzlist + Blitzbox" is the family narrative
```

**Architecturally, nothing changes.** Items, documents, files are already the three primitives in the data model (§3). Blitzbox is a *named marketing surface and lens* on the file-sharing subset of the platform, not a separate product with a separate stack. A Blitzbox-only user and a full Blitzlist user are calling the same MCP server with the same tools — the difference is what UI they land on and what features get emphasized in their onboarding.

**Don't announce Blitzbox publicly at v1.0.** Saying "we're building two products" out of the gate dilutes focus and invites skepticism. Better to ship Blitzlist as a strong standalone (with file-sharing as one of its features), then peel Blitzbox out as a standalone landing page once the platform is proven and ready for parallel marketing surfaces.

### Three audiences, three interfaces

Blitzlist's defining axis isn't list type — it's audience. Each list, item, and roadmap is consumed by one of three audiences, each through a different interface:

| Audience | Who | Primary interface | Auth |
|---|---|---|---|
| **Builder** | You, dev team, vibe coders | MCP via Claude Code | OAuth 2.1 + DCR |
| **Executor** | AI agents, contractors, teammates, future-you | MCP with scoped token, OR web app | OAuth (scoped) or web session |
| **Stakeholder** | Customers, OSS users, reviewers | **MCP via their own AI assistant** (Claude Cowork, claude.ai) OR public roadmap web view | Stakeholder access key (per-stakeholder, scope-limited) |

### The MCP-first collaboration loop

The innovative bit: **stakeholders connect to the same MCP server** via Claude Cowork (or any MCP-supporting AI client), authenticated by a per-stakeholder access key. They never visit our web app.

```
   Builder (Claude Code)                Stakeholder (Claude Cowork)
         │                                       │
         │ "Add a requirement: PR sync"          │ "What's in v1.2?"
         │                                       │ "I'd prefer X to ship
         │                                       │  in v1.1 not v1.2"
         ▼                                       ▼
         └──────────▶  Blitzlist MCP  ◀──────────┘
                            │
                            │  tools return both structured data
                            │  AND visual artifacts (Mermaid diagrams,
                            │  rendered summaries, executive briefs)
                            ▼
                     D1 + Durable Objects
                            │
                            │ live updates
                            ▼
                  Web UI (secondary; for tasks
                  that don't fit conversational UX:
                  bulk edits, attachments, settings)
```

**Why this is novel:**

- Existing stakeholder portals require non-technical users to learn yet another web UI.
- Blitzlist makes their **own AI assistant the UI** — they use the chat interface they already use daily.
- MCP tools return **visual artifacts shaped for AI rendering** — Mermaid roadmaps, dependency graphs, state diagrams — not just JSON for a custom frontend.
- Conversational feedback becomes structured because the stakeholder's AI translates "I want feature X earlier" into the right `submit_feedback(item_id=…, ...)` call.
- **Faceless coordination**: builders and stakeholders don't need synchronous meetings; they each communicate with the system through their own AI, asynchronously.

### Land → Expand → Vision

The strategy is phased. We don't try to be the full shared workspace on day one — we start with a sharp wedge for vibe coders, then expand outward as the platform matures.

"Shared workspace" is a known category (Notion, Slack, Coda all use the term). We claim that category and differentiate inside it with a sharper modifier: every other workspace was *built for humans typing in browser tabs, with AI bolted on later*. Blitzlist is built **AI-first**, with humans and agents as equal participants from the foundation. Same category, different physics.

| Phase | Audience | Pitch | Timeframe | Distribution |
|---|---|---|---|---|
| **LAND** | Vibe coders + Claude Code power users | "Plan, approve, delegate to agents, monitor progress — persistent across sessions, with files and docs you share across your AI sessions and your teammates." | v0.1 → v1.0, **0-9 months** | GitHub, HN, MCP awesome-lists, Anthropic dev rel, Cloudflare partnership |
| **EXPAND** | Small AI-augmented teams (3-20 people, mixed humans + agents) | "Shared workspace for your hybrid team. Stakeholders use their own AI; engineers use Claude Code; agents execute and report. One workspace, no tool-switching." | v1.0 → v2.0, **9-24 months** | Viral via stakeholder keys + public roadmaps; content on hybrid-team workflows |
| **VISION** | Productivity-suite scale | "The AI-first shared workspace where humans and agents are equal participants." | v2.0+, **2-5 years** | Enterprise sales, ecosystem partners, integrations |

The vision is the north star, not the v1 promise. We earn the right to the larger pitch by nailing the smaller one first.

### Core jobs to be done (LAND phase)

These are what we sell to vibe coders today:

1. **Capture a commitment in 5 seconds** without leaving the terminal.
2. **Survive across sessions** — return to a project after a week and Claude knows exactly what's open, what's promised, what's blocking.
3. **Route work** to whichever executor (AI agent, human, yourself) makes sense, and track state regardless of who does it.
4. **Share files with your other AI sessions** — drop a PPT into a folder, every Claude session you spawn can read it via MCP. No downloads, no re-uploads.
5. **Share a roadmap with a customer** by giving them an access key; they review via their own Claude — no account, no UI to learn.
6. **At release, auto-generate release notes** that verify delivered vs. promised, with traceable links from promise → PR → shipped feature.
7. **Self-host the whole thing** on Cloudflare in 3 minutes, $5/month, full control of your own workspace.

### Why this position is defensible

The productivity tools market is crowded, but every incumbent shares the same structural weakness: **they were built for humans, then had AI added**. That's not a fixable defect with a feature — it's a foundation choice.

The market scan (May 2026) showed that no single competitor lights up the shared-workspace pitch with AI-first foundations:

|  | Long-term memory | Multi-executor routing | AI-mediated stakeholder UX | Promise→release verification | Shared files via MCP | One-click self-host |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Claude Code Tasks API | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| Backlog.md | partial | ❌ | ❌ | ❌ | ❌ | ❌ |
| Plane (MCP, OSS) | partial | ❌ | ❌ | partial | ❌ | partial |
| Linear MCP | partial | ❌ | ❌ | partial | ❌ | ❌ (SaaS) |
| ProductBoard / Aha! | partial | ❌ | ❌ | ✅ but heavy | ❌ | ❌ |
| Wiki/database tools (Notion-class) | partial | ❌ | ❌ | ❌ | partial | varies |
| File-sharing tools (Dropbox-class) | ❌ | ❌ | ❌ | ❌ | retrofitted | varies |
| **Blitzlist** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

The individual features are copyable. The **AI-first foundation + synthesis + n8n-style distribution** is the moat. Retrofitted AI tooling can match a feature in a quarter; it can't rebuild its foundation in less than years.

---

## 2. System overview

Everything runs on **Cloudflare's developer platform**. One vendor, one CI pipeline, one secret store. The web app may move to Vercel later if Cloudflare Pages proves too rough for our UI needs (see §16 Migration paths).

```
                       ┌──────────────────────────┐
                       │   blitzlist.ai           │
                       │   (Cloudflare Pages,     │
                       │    Next.js or Hono+JSX)  │
                       └────────────┬─────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────┐         ┌──────────────────────┐
│  Claude Code    │  HTTP   │  mcp.blitzlist.ai    │
│  (MCP client)   │────────▶│  (Cloudflare Worker, │
│                 │  +OAuth │   Hono)              │
│                 │         │  - REST API          │
└─────────────────┘         │  - MCP server        │
                            │  - OAuth AS          │
                            └─┬────┬────┬────┬─────┘
                              │    │    │    │
                              │    │    │    └──▶ Queues  (async tasks)
                              │    │    │
                              │    │    └──▶ KV  (OAuth ephemeral state)
                              │    │
                              │    └──▶ R2  (attachments, zero egress)
                              │
                              ▼
                       ┌────────────┐      ┌──────────────────────┐
                       │     D1     │      │  Durable Object      │
                       │  (SQLite,  │◀────▶│  per workspace       │
                       │   edge-    │      │  (WebSocket fanout   │
                       │   local)   │      │   for live updates)  │
                       └────────────┘      └──────────┬───────────┘
                                                      │ WebSocket
                                                      ▼
                                              Web app browser
                                              (live UI updates)
```

**One Worker, multiple surfaces.** The Hono app exposes:
- `/api/*` — REST for the web UI (cookie-session auth)
- `/mcp` — Streamable HTTP MCP endpoint (OAuth bearer token auth)
- `/.well-known/oauth-*` — OAuth metadata
- `/oauth/*` — authorization, token, register, revoke endpoints
- `/webhooks/github` — GitHub App webhook receiver

Co-locating keeps the OAuth Resource Server and Authorization Server on the same origin — the simplest MCP-spec-compliant shape.

**Why this stack:**

| Concern | Cloudflare primitive | What it gives us |
|---|---|---|
| Compute | Workers | 5ms cold starts, global edge, Hono is native here |
| OAuth for MCP | `@cloudflare/workers-oauth-provider` | Purpose-built spec-compliant DCR + PKCE library |
| Database | D1 (SQLite) | Sub-millisecond queries, no network hop, time-travel restore |
| Real-time | Durable Objects | One DO per workspace, holds WebSocket clients, fans out writes |
| Attachments | R2 | S3-compatible, **zero egress fees** |
| OAuth ephemeral state | KV | Eventually-consistent, perfect for PKCE challenges + auth codes |
| Async work | Queues | OG metadata fetch, email send, webhook reactions |
| Web hosting | Pages | Next.js via `@cloudflare/next-on-pages`, or Hono+JSX |

---

## 3. Data model

The model has three orthogonal axes — keeping them separate is what stops the schema from becoming a kitchen sink:

A workspace's "shared memory" has **three primitives**:

| Primitive | What it stores | State machine? | Use case |
|---|---|---|---|
| **`items`** | Short actionable units | Yes (per list) | Backlog items, todos, bugs |
| **`documents`** | Long-form markdown | No — version history instead | Profiles, project briefs, vision docs, meeting notes |
| **`files`** | Binary artifacts | No — version history instead | PPTs, PDFs, images, generated exports |

Items have these orthogonal axes:

| Axis | What it expresses | Example |
|---|---|---|
| **State** | Lifecycle position | `todo → done`, `draft → shipped` |
| **Group** | Many-to-many membership | "Sprint 14", "Q3 launch" milestone, "backend" label |
| **Field** | Per-item attributes | priority, due date, severity, PR url |
| **Relation** | Typed, directional item↔item links | test `verifies` requirement, bug `blocks` feature |
| **Attachment** | Files, images, or URLs attached to an item | screenshot, Figma link, PR url, log file |

State is per-list (configurable). Groups span the workspace (one milestone can pull items from multiple lists). Fields are per-list, defined by the list's template. Relations span lists within a workspace (a test in the Tests list can verify a requirement in the Backlog list) but never cross workspace boundaries. Attachments live on items or comments.

**Storage: D1 (SQLite at the edge).** JSON columns store as TEXT and are read via `json_extract()`. Most JSON columns (`states_json`, `fields_json`, `meta_json`, `details_json`) are read by known schema and need no indexes. The one queryable JSON column is `items.custom_fields_json` — for that we define **per-list expression indexes** on the fields users actually filter by (priority, due_date, severity). If a list grows enough custom fields that expression-index maintenance gets painful, we promote the hot fields to real columns or switch to an EAV table — both are clean refactors.

```
workspaces
  id (uuid)
  slug              -- e.g. "acme" → blitzlist.ai/w/acme
  name
  created_at

users
  id, email, display_name, avatar_url, created_at

workspace_members
  workspace_id, user_id
  role              -- owner | editor | reviewer | viewer
  joined_at
  PRIMARY KEY (workspace_id, user_id)

invite_codes        -- the "hashcode" join experience
  code              -- 8-char base32, human-typeable
  workspace_id, role, created_by
  expires_at, max_uses, uses

lists               -- containers; an item belongs to exactly one
  id
  workspace_id
  slug              -- e.g. "backlog", "todos", "bugs"
  name, description
  template_id       -- which template this was created from (informational)
  states_json       -- {states: [...], default: "...", terminal: [...]}
  fields_json       -- [{key, type, label, options?, required?}, ...]
  default_view      -- table | kanban | calendar (presentation hint)
  color, icon
  archived
  created_by, created_at, updated_at

items               -- the unit of work, regardless of list type
  id                -- e.g. "ACM-142" (workspace-wide counter, list-agnostic)
  list_id
  workspace_id      -- denormalized for fast cross-list queries
  title
  body              -- markdown
  state             -- must be one of list.states_json.states
  parent_id         -- nullable, for intra-list nesting (epic → sub-items)
  position          -- manual ordering within list
  assignee_id       -- nullable; the human "owner"
  executor          -- who/what is doing the work; see "Executor model" below
  promised_in       -- nullable; group_id of type=release (commitment loop)
  visibility        -- internal | stakeholder | public (controls roadmap exposure)
  author_id
  custom_fields_json -- typed by list.fields_json; e.g. {priority: "p1", due: "2026-06-01"}
  created_at, updated_at

groups              -- cross-list membership: sprints, milestones, labels, epics, releases
  id
  workspace_id
  name
  type              -- sprint | milestone | label | epic | release | custom
  meta_json         -- {starts_at, ends_at, goal} for sprints;
                    -- {version, ship_target, public_url_slug} for releases;
                    -- {color} for labels; etc.
  state             -- planned | active | closed (sprints, releases); active (labels)
  visibility        -- internal | stakeholder | public (releases are often public)
  created_by, created_at

-- New table for stakeholder access (separate from full OAuth users)
stakeholder_access_keys
  key_hash          -- bcrypt hash; raw key shown once at creation
  workspace_id
  stakeholder_label -- e.g. "Acme Corp - sarah@acme.com"
  scope_json        -- {lists: [...], items: [...], groups: [...], permissions: [read, comment, approve]}
  expires_at
  last_used_at
  created_by, created_at

item_groups         -- M:N: items ↔ groups
  item_id, group_id
  added_by, added_at
  PRIMARY KEY (item_id, group_id)

relations           -- polymorphic, directional, free-text labels
                    -- LINK ANYTHING TO ANYTHING (items, docs, files, groups, external URLs)
  id
  workspace_id      -- relations never cross workspaces
  from_type         -- item | document | file | group | external
  from_id           -- nullable when from_type=external
  from_url          -- nullable; required when from_type=external
  to_type           -- item | document | file | group | external
  to_id             -- nullable when to_type=external
  to_url            -- nullable; required when to_type=external
  label             -- FREE-TEXT, e.g. "verifies", "source", "deployed_in", "discussed_in"
  metadata_json     -- optional: {excerpt, commit_sha, deploy_env, speaker, timestamp, ...}
  created_by, created_at
  -- inverse labels for known labels defined in code; custom labels auto-inverse as "<label>_of"

attachments         -- files, images, or external URLs attached to items or comments
  id
  workspace_id
  item_id           -- nullable
  comment_id        -- nullable; exactly one of item_id/comment_id is set
  kind              -- image | file | url | embed
  -- blob fields (kind in [image, file]):
  storage_key       -- S3/R2/Blob object key
  mime_type
  size_bytes
  width, height     -- nullable, images only
  -- url fields (kind in [url, embed]):
  url
  title, description -- OG metadata, cached at link-time
  thumbnail_url
  -- universal:
  filename          -- original filename, or URL display label
  uploaded_by, created_at

comments
  id, item_id
  author_id         -- nullable for anonymous share-link comments
  author_label      -- e.g. "alice@stakeholder.com" if anonymous
  body, created_at

approvals
  id, item_id
  reviewer_id, reviewer_label
  decision          -- approved | changes_requested | rejected
  reason, created_at

activity_log        -- powers timeline view + Claude can read it
  id, workspace_id
  item_id           -- nullable (workspace-level events)
  actor_id          -- nullable (system events)
  action            -- created | state_changed | grouped | commented | assigned | ...
  details_json
  created_at

share_codes         -- "anyone with the link" sharing (replaces legacy share_links)
                    -- Both web and MCP access; URL path IS the auth
  code              -- e.g. "tiger-painting-jazz" (three-word) or "river-glass-quartz-shadow" (four-word)
  code_format       -- "three-word" | "four-word" | "opaque"
  workspace_id
  scope_json        -- {lists: [], items: [], groups: [], documents: [], files: [], folders: []}
  permissions       -- subset of ["view","comment","propose","approve"]
                    -- "propose" creates items in `pending` state pending member approval
  channels          -- {web: bool, mcp: bool} -- gate each channel independently
  label             -- "Q3 Proposals - public" (for owner's dashboard)
  expires_at        -- nullable for permanent; default 30 days
  max_uses          -- nullable for unlimited
  uses_count        -- monotonic counter
  rate_limit_rpm    -- per-code rate limit; default 100
  created_by, created_at
  revoked_at        -- soft-revoke; soft-revoked codes return 410 Gone

item_scores         -- arbitrary metric values per item, flexible JSON
                    -- drives the Compass via per-list visual-slot mapping
  item_id, workspace_id
  metrics_json     -- {importance: 0.8, urgency: 0.6, severity: 0.4, novelty: 0.9, ...}
                   -- keys are free-form; values are normalized 0.0-1.0
  scored_at        TIMESTAMP
  scored_by_json   -- per-metric provenance: {importance: "ai", urgency: "derived", ...}
  reasoning_json   -- per-metric AI explanation: {importance: "...", urgency: "...", ...} (nullable)

-- The per-list mapping of visual slots → metric keys lives on the lists table:
--   lists.compass_config_json: { x_axis: {metric, label, invert?},
--                                y_axis: {...}, z_axis: {...},
--                                size: {metric, label, range?},
--                                color: {metric, gradient, label},
--                                pulse: {...}, glow: {...}, ... }
-- Templates ship sensible defaults; workspaces tune per list.

-- (Workspace-wide dimension weights are not a separate table — they are
-- expressed as a derived metric in metrics_json, e.g. "focus_score", whose
-- formula lives in workspace_metric_definitions for v1.0+; for v0.5 the
-- formula is hardcoded per template.)

documents           -- long-form markdown shared memory
  id, workspace_id
  slug, title
  body              -- markdown
  doc_type          -- profile | brief | spec | meeting_notes | reference | custom
  parent_id         -- nullable, for folder-like nesting
  visibility        -- private | internal | stakeholder | public
  tags_json         -- array of strings
  version           -- monotonic counter, incremented on every edit
  author_id, editor_ids_json
  created_at, updated_at

document_versions   -- diff history, last N retained per document
  document_id, version, body, edited_by, edited_at

files               -- binary artifacts (Dropbox-for-MCP)
  id, workspace_id
  name              -- e.g. "Q3-roadmap.pptx"
  folder_path       -- e.g. "/presentations/2026-q3" (virtual folder)
  storage_key       -- R2 object key
  mime_type, size_bytes
  width, height     -- nullable, images only
  extracted_text    -- nullable; populated async by extraction worker (PPT/PDF/Word/Excel)
  extracted_metadata_json -- {slides: 24, pages: 12, ...}
  extraction_status -- pending | done | failed | unsupported
  visibility        -- private | internal | stakeholder | public
  version           -- monotonic; bumps on update_file
  uploaded_by, created_at, updated_at

file_versions       -- previous versions retained (Dropbox-style)
  file_id, version, storage_key, size_bytes, uploaded_by, uploaded_at

-- OAuth tables (unchanged)
oauth_clients, oauth_authorizations, oauth_tokens
```

### List templates

A workspace starts with one or more lists seeded from templates. Users can edit `states_json` / `fields_json` later — the JSON shape makes this cheap. Templates live in code, not the DB:

```yaml
- id: backlog                                # the original Blitzlist use case
  name: Product backlog
  states: [draft, proposed, approved, in_progress, in_review, done, shipped, rejected]
  default_state: draft
  terminal_states: [done, shipped, rejected]
  fields:
    - {key: priority, type: enum, options: [p0, p1, p2, p3]}
    - {key: estimate, type: string}
    - {key: pr_url,   type: url}
  default_groups: [sprint, epic]

- id: todos
  name: Todo list
  states: [todo, doing, done]
  default_state: todo
  terminal_states: [done]
  fields:
    - {key: due_date, type: date}
  default_groups: [label]

- id: bugs
  name: Bug tracker
  states: [reported, triaged, in_progress, resolved, wontfix, duplicate]
  default_state: reported
  terminal_states: [resolved, wontfix, duplicate]
  fields:
    - {key: severity, type: enum, options: [critical, high, medium, low]}
    - {key: repro,    type: text}
  default_groups: [milestone, label]

- id: ideas
  name: Idea pool
  states: [new, considering, accepted, rejected]
  default_state: new
  terminal_states: [accepted, rejected]
  fields: []
  default_groups: [label]
```

### Hierarchy: items as trees

Items support **unlimited-depth hierarchical nesting** via `items.parent_id`. This makes top-down planning native: state a short goal, decompose into actions, decompose actions into details — three or more levels deep, all queryable in one tool call.

```
BL-101  Launch v1.0                                      ← Goal (top level)
├─ BL-102  Ship MCP server                               ← Action
│  ├─ BL-104  Wire OAuth                                 ← Detail
│  ├─ BL-105  Implement core tools                       ← Detail
│  └─ BL-106  Tests                                      ← Detail
├─ BL-103  Set up billing                                ← Action
└─ BL-107  Public roadmap                                ← Action
```

**Hierarchy vs. groups — orthogonal, on purpose:**

| Mechanism | Cardinality | Purpose |
|---|---|---|
| **`parent_id`** | One parent per item | "This is *part of* that bigger thing" — semantic decomposition |
| **Groups** (`item_groups`) | Many groups per item | "This is *also tagged* with sprint-X, label-backend, milestone-Q3" — cross-cutting membership |

A child item doesn't auto-inherit its parent's group memberships unless you pass `inherit_groups: true` when creating it.

**Parent state aggregation: hybrid model.** A parent item has its own manually-set `state` (default flow: same as any item — draft → in_progress → done). Independently, the UI rolls up child completion as a derived progress display (`{total: 12, done: 4, in_progress: 6, blocked: 2}`). If the parent's state contradicts the rollup (e.g. parent says `done` but a child is `blocked`), the UI shows a warning badge but doesn't auto-correct. Manual state stays authoritative; the rollup is a sanity check.

### The Compass: multi-dimensional priority visualization

The Compass is Blitzlist's signature view — a 3D animated scene that **steers both humans and AI agents** toward high-impact work. It replaces the traditional "wall of lists" workspace landing with a scene where items are spheres positioned in priority space, sized and colored and animated by whatever the list says matters.

**Two orthogonal concepts, by design:**

1. **Visual slots** are fixed in code — the rendering capabilities the Compass exposes: `x_axis`, `y_axis`, `z_axis`, `size`, `color`, `pulse`, `glow`, `border`, `rotation`. Workspaces don't invent new visual slots.
2. **Metrics** are flexible per workspace — any numeric attribute of an item. Standard metrics ship pre-registered (importance, urgency, effort, risk, uncertainty, change_frequency); workspaces extend with custom ones (severity, novelty, customer_impact, freshness, whatever the domain needs).

A **per-list `compass_config`** maps slots to metrics. Three lists in the same workspace can render the same Compass engine three different ways:

| Visual slot | Backlog list | Bugs list | Ideas list |
|---|---|---|---|
| **x_axis** | urgency | time_since_reported | feasibility |
| **y_axis** | importance | severity | potential_value |
| **z_axis** | focus_score | customer_impact | freshness |
| **size** | effort | report_count | team_excitement |
| **color** | risk (g→r) | regression_risk (g→r) | novelty (blue→magenta) |
| **pulse** | uncertainty | reproducibility (inverted) | (none) |

Each list template ships a sensible default `compass_config`; workspace owners tune per list. Visual slot capabilities don't change — only which metric they show.

**Slot types and metric types — the bridging rules**

The mapping isn't just "slot ← metric"; both sides have **types** that must be bridged. This is checked at `set_compass_config` time so the renderer never encounters mismatches.

```ts
const VISUAL_SLOTS = {
  x_axis:   { type: "continuous", range: [-10, 10] },
  y_axis:   { type: "continuous", range: [-10, 10] },
  z_axis:   { type: "continuous", range: [-10, 10] },
  size:     { type: "continuous", range: [16, 64] },         // pixel range; configurable
  color:    { type: "either",     gradient: true, palette: true },  // continuous (gradient) OR discrete (palette)
  pulse:    { type: "continuous", range: [0.5, 4.0] },        // Hz
  glow:     { type: "continuous", range: [0, 1] },
  rotation: { type: "continuous", range: [0, 360] },          // deg/sec
  shape:    { type: "discrete",   options: ["sphere","cube","cylinder","star","cone"] },
  pattern:  { type: "discrete",   options: ["solid","dotted","striped","wireframe"] },
  border:   { type: "discrete",   options: ["solid","dashed","dotted","double","none"] },
};
```

Metrics are typed when registered: `continuous` (0.0–1.0 float), `enum` (string from known set), or `enum_ordered` (string + position).

Four bridging cases:

**Case 1: continuous → continuous** (most common, no bridge needed)

```yaml
size: { metric: effort, label: "Effort", range: [16, 64] }
```

Value `0.4` → `16 + (64-16) × 0.4 = 35px`. Direct linear interpolation.

**Case 2: enum → discrete** (requires explicit `value_map`)

```yaml
shape:
  metric: executor_kind
  label: "Executor"
  value_map:
    human:      sphere
    agent:      cube
    contractor: cylinder
    self:       star
```

Validation: every enum value must map to a slot option; no duplicates allowed unless `allow_overlap: true`.

**Case 3: enum → continuous** (auto-bridges for ordered enums)

```yaml
y_axis:
  metric: priority      # ordered enum: p0 > p1 > p2 > p3
  label: "Priority"
  # value_map auto-derived: p0 → 1.0, p1 → 0.66, p2 → 0.33, p3 → 0.0
  # ...unless explicit value_map overrides:
  value_map: { p0: 1.0, p1: 0.8, p2: 0.4, p3: 0.0 }   # non-linear, optional
```

For unordered enums on continuous slots: explicit `value_map` is required; otherwise the config is rejected.

**Case 4: continuous → discrete** (requires `buckets`)

```yaml
shape:
  metric: risk
  label: "Risk bucket"
  buckets:
    - { max: 0.25, value: sphere }    # low
    - { max: 0.50, value: cube }      # medium
    - { max: 0.75, value: cylinder }  # high
    - { max: 1.00, value: star }      # critical
```

Validation: buckets must cover `[0, 1]` continuously with no gaps or overlaps.

**Validation at config time, not render time.** `set_compass_config` rejects any config that can't be bridged, with structured error messages the UI renders directly:

```json
{
  "error": "compass_config.shape.invalid_mapping",
  "details": "Metric 'severity' has 4 values [critical, high, medium, low]; value_map covers only 3. Missing: 'low'.",
  "suggestion": { "low": "sphere" }
}
```

By the time the renderer reads the config, every slot has a guaranteed-valid bridge.

**Where metric values come from — three-layer resolution:**

```
1. Explicit field     items.fields.severity = "high" → normalizes to 0.75
2. Derived            time_since_reported = (now - created_at) / 30 days
3. AI-inferred        Claude API scores via metric prompt, cached
```

AI scoring refreshes on item edits (debounced) and nightly via Cloudflare Cron. Each AI score includes `reasoning_json` for transparency — open an item, see *why* a metric is what it is.

**For v0.5:** standard metrics pre-registered + automatic promotion of any numeric/enum custom field to a metric. **User-defined metric formulas and AI prompts ship in v1.0+** to keep v0.5 scope tight.

**Shared situational awareness:** the same `item_scores` and `compass_config` data powers both the human visual and `get_focus()` calls from AI agents. A Builder looking at the Compass and a Claude Code session calling `get_focus()` independently arrive at the same top-three items. **No coordination needed.**

### Executor model

`items.executor` is orthogonal to `assignee_id`. Assignee is the human accountable for the item; executor is who/what is *currently doing* the work.

```
executor format: "<kind>:<id>"

  human:<user_id>          -- a person on the team
  agent:claude             -- a Claude Code session (or any Claude agent)
  agent:<other>            -- some other AI agent registered with the workspace
  self                     -- the item is meant for the creator to handle
  contractor:<label>       -- external party (e.g. "contractor:design-agency-x")
  null                     -- not yet routed
```

Routing logic lives in `packages/core`. When an item is created, a default executor may be inferred from the list template (e.g. items in a `bugs` list default to `agent:claude` for triage; items in `ideas` default to `self`). Executor changes are activity-logged so we can ask "who routed this where, when."

**The Claude-launch button**: items can be opened in a fresh Claude Code session via the `spawn_claude_session(item_id)` MCP tool, which uses Claude Agent SDK to create a session pre-loaded with the item's body, related items, and target list context. Closes the "from backlog to execution" loop in one click.

### Release group type

`type=release` is a first-class group used for the **commitment-to-delivery loop**:

```yaml
type: release
meta:
  version: "v1.2.0"
  ship_target: 2026-08-15
  public_url_slug: "v1-2"        # → /r/blitzlist/release/v1-2 (public page)
  description: |
    First production release. Includes GitHub auto-state, Stripe billing,
    and email notifications.
```

When an item declares `promised_in: release-v12`, it's tracked against that release. At release close:

1. Auto-compare items in the release: which shipped (`state ∈ terminal_shipped`), which slipped (still open), which were cut.
2. Generate **release notes** as a Markdown artifact + a public roadmap update.
3. Slipped items get re-promised to the next release or moved to backlog with an audit trail.
4. The public release page (`/r/[workspace]/release/[slug]`) shows: what was promised, what shipped, what slipped, link to PR/commit for each delivered item.

This is the loop the market hasn't closed — every other tool treats releases as labels or version numbers without the verification step.

### Documents — the markdown knowledge layer

Documents are long-form markdown reference content. Unlike items, they don't have a state machine — they have version history. Examples: "About me," "Project brief for client X," "Coding style guide," "Architecture decision record," meeting notes.

The killer flow: at the start of a Claude Code session, ask Claude to load your profession profile or the project brief. It calls `get_document(slug)` → context loaded. Stakeholder's Claude can fetch the same doc with their access key. No copy-paste, no re-uploads, no drift between local files and what Claude knows.

Document types are informational (used for organizing and filtering), not enforced — workspaces can add custom types.

### Files — the Dropbox-for-MCP layer

The bigger wedge. In LLM-augmented work, binary files bounce between platforms constantly: upload to web Claude, download, screenshot for paste, re-upload, etc. Files solves this by making the file a **reference-able resource** that all MCP clients can read and write without moving bytes through humans.

The Dropbox insight: **files don't move; references do.** R2's zero-egress economics make this viable for us where it would be expensive elsewhere.

**The killer workflow that's currently impossible:**

```
PM:  Drops Q3-deck.pptx into Blitzlist folder /reviews/q3 (web UI drag-drop).

Designer's Claude:
     "Pull the Q3 deck and create a one-pager summary"
     → list_files("/reviews/q3") → finds Q3-deck.pptx
     → get_file_text(id) → returns extracted slide text (cached server-side)
     → analyzes, writes markdown summary
     → upload_file("Q3-summary.md", content, "/reviews/q3")

PM's Claude (next morning):
     "What's new in /reviews/q3?"
     → list_files("/reviews/q3") → sees the deck AND the summary
     → reads summary, briefs PM
```

Zero downloads. Zero uploads. Zero copy-paste. Multi-actor.

**Binary extraction: how `get_file_text` actually works**

PPT/PDF/Excel/Word can't be consumed raw by an LLM. On upload, the file goes into a Cloudflare Queue; an extraction Worker pulls text/metadata using parser libraries (mammoth for docx, pdf-parse, pptx-parser, etc.) and stores the result in `files.extracted_text`. Subsequent `get_file_text` calls return cached text instantly.

For Claude clients that have Anthropic Skills (`pptx`, `xlsx`, `pdf`, `docx`), the raw binary is also available via `get_file` and the Skill can do its own processing. Best of both worlds: cached extraction for non-Skill clients, raw bytes for Skill clients.

**Versioning is Dropbox-style:** updates create a new `file_versions` row pointing at a new R2 object. Previous versions retained per workspace policy (default: last 10 versions, 90 days). Restore via `restore_file_version(file_id, version)`.

**Local sync (the Dropbox client equivalent)** is published as a **separate community project** — see §17 and BL-024. We define the API; OSS contributors build the actual sync clients per OS. Keeps Blitzlist focused on the server side.

### Relation labels (free-text, with registered defaults)

Labels are **free-text strings**, not an enum. Workspaces can use any label they want; common labels have **registered inverses** in code so they render correctly on both sides of the link. Unknown labels auto-inverse as `<label>_of`.

```ts
const KNOWN_LABELS = {
  // item↔item (engineering provenance)
  verifies:       { inverse: "verified_by",    symmetric: false },
  blocks:         { inverse: "blocked_by",     symmetric: false },
  implements:     { inverse: "implemented_by", symmetric: false },
  duplicates:     { inverse: "duplicated_by",  symmetric: false },
  relates_to:     { inverse: "relates_to",     symmetric: true  },

  // item↔external (provenance — where it came from, where it went)
  source:         { inverse: "produces",       symmetric: false },  // call/prompt/email → item
  discussed_in:   { inverse: "discusses",      symmetric: false },  // item ← meeting
  extracted_from: { inverse: "extracted",      symmetric: false },  // item ← transcript
  deployed_in:    { inverse: "includes",       symmetric: false },  // item ← deploy
  shipped_in:     { inverse: "includes",       symmetric: false },  // item ← release
  promised_in:    { inverse: "promises",       symmetric: false },  // item ← release commit
  documented_by:  { inverse: "documents",      symmetric: false },  // item ← doc
  attached_to:    { inverse: "attaches",       symmetric: false },  // file ← item

  // Renderable attachments — UI shows these prominently inline on item cards
  // `renderable` flag is the hint to the web UI's attachment row
  designed_in:    { inverse: "design_for",    renderable: "design",     symmetric: false }, // item → file/url (Figma)
  illustrated_by: { inverse: "illustrates",   renderable: "image",      symmetric: false }, // item → image file
  screenshot:     { inverse: "screenshot_of", renderable: "image",      symmetric: false }, // item → image
  mockup:         { inverse: "mockup_of",     renderable: "design",     symmetric: false }, // item → design file
  specified_in:   { inverse: "specifies",     renderable: "doc",        symmetric: false }, // item → document
  documented_in:  { inverse: "documents",     renderable: "doc",        symmetric: false }, // item → document
  referenced_in:  { inverse: "references",    renderable: "doc",        symmetric: false }, // item → document

  // …workspaces extend freely; unknown labels auto-inverse as "<label>_of"
};
```

**Polymorphic endpoints**: both sides of a relation can be an internal entity (item, document, file, group) OR an external URL. Workspaces use this to link anything to anything:

| Example | from | to | label |
|---|---|---|---|
| Test verifies requirement | item BL-099 | item BL-042 | `verifies` |
| Item came from a Granola call | item BL-042 | external `granola.app/call/abc` | `source` |
| Item documented in an ADR | item BL-042 | document DOC-007 | `documented_by` |
| Decision discussed in a Slack thread | item BL-042 | external `slack.com/...` | `discussed_in` |
| Vercel deploy shipped a feature | item BL-042 | external `vercel.com/.../dpl_xxx` | `deployed_in` |
| Release notes reference items | document DOC-099 | item BL-042 | `mentions` |
| File generated by an item | file FILE-001 | item BL-042 | `produced_by` |

**Provenance chains are queryable in one call:** `list_relations(entity_id, direction?)` returns all relations in/out, with each side labeled correctly. The full lineage of an item — from the call that birthed it through the deploy that shipped it — is one query.

**Why free-text over enum:** different workspaces have different vocabularies. An OSS project tracks `proposed_by` ↔ `proposes`; a consulting team tracks `requested_by` ↔ `requests`; a regulated team tracks `mitigates` ↔ `mitigated_by`. The registry gives ergonomic defaults; the schema accepts anything. The community contributes new common labels over time.

### Attachment storage

- **Cloudflare R2** from v1 — S3-compatible, zero egress fees, lives in the same network as the Worker.
- Web app uploads via direct-to-R2 presigned URLs (Worker mints the URL, browser PUTs the file, then notifies the Worker of completion).
- Storage layer is hidden behind a small adapter in `packages/core` in case we ever need to swap.
- Image uploads from Claude Code: deferred to v1.1. The MCP server can't read user disk; for v1, Claude attaches URLs only (`attach_url`). Inline base64 image upload with a 1MB cap ships in v1.1.

### State machine (per list)

The state machine isn't hardcoded — each list defines its own. The original requirements flow becomes the `backlog` template:

```
  draft ──▶ proposed ──▶ approved ──▶ in_progress ──▶ in_review ──▶ done ──▶ shipped
                  │                                          │
                  └─▶ rejected                               └─▶ changes_requested ─▶ in_progress
```

For v1 we allow any transition between defined states (no enforcement of edges) — the template defines the *vocabulary*, not the *graph*. Edge enforcement is a v1.1 feature once we have real user data on which transitions matter. Terminal states are flagged so we can compute "open" counts.

All transitions emit `activity_log` rows. `set_state` returns the new activity entries so Claude sees them in its tool response.

---

## 4. MCP tool surface

Goal: each tool does one thing, returns small JSON, and is callable in under one Claude turn. Tool names are verbs. The surface is **generic over list type** — there's one `add_item`, not `add_requirement` + `add_todo` + `add_bug`.

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `whoami`                   | Returns current user, workspace, role, default list. Sanity check.            |
| `list_workspaces`          | If user belongs to multiple. Most have one.                                   |
| `select_default_list`      | `{list}` — session-scoped default so subsequent calls can omit `list`.        |
| `list_lists`               | `{include_archived?}` — all lists in workspace + their templates.             |
| `create_list`              | `{name, template?, slug?}` — spin up a new list from a template.              |
| `add_item`                 | `{list?, title, body?, state?, group?, fields?}` — quick capture.             |
| `list_items`               | `{list?, group?, state?, assignee?, search?, limit?}` filterable.             |
| `get_item`                 | `{id}` → full detail + recent activity + comments.                            |
| `update_item`              | Partial update of title/body/assignee/parent/custom fields.                   |
| `set_state`                | `{id, state, note?}` — validated against the item's list states.              |
| `add_to_group`             | `{item_id, group}` — group by slug, id, or `"current sprint"`.                |
| `remove_from_group`        | `{item_id, group}`                                                            |
| `list_groups`              | `{type?, state?}` — sprints / milestones / labels in workspace.               |
| `create_group`             | `{name, type, meta?}` — e.g. sprints get `{starts_at, ends_at, goal}`.        |
| `link`                     | `{from, to, label, metadata?}` — generic, polymorphic, free-text. `from`/`to` is `{type, id}` for internal entities OR `{type: "external", url}`. |
| `unlink`                   | `{from, to, label}` — remove a specific relation.                             |
| `list_relations`           | `{entity}` → all relations in/out, with inverse labels resolved (registered or auto-inverse). |
| `add_source`               | `{entity, source_url, label?, metadata?}` — convenience: link an entity to an external URL with default `label="source"`. |
| `add_items_from_transcript`| `{transcript, source_url, list?, source_label?}` — bulk extract items from a meeting transcript (Granola, Otter, raw text). Each item is auto-linked back to the transcript via the chosen label. |
| `record_decision`          | `{entity, decision, rationale?, source_url?}` — store a decision as a comment; auto-creates a relation to the source if provided. |
| `link_deploy`              | `{item_id, deploy_url, env?, commit_sha?}` — convenience: link an item to a deploy with label=`deployed_in`. |
| `attach_url`               | `{id, url, title?}` — attach a URL; server fetches OG metadata async.         |
| `list_attachments`         | `{id}` — files + URLs on an item.                                             |
| `remove_attachment`        | `{attachment_id}`                                                             |
| `link_pr`                  | `{id, pr_url}` — convenience: creates `implemented_by` relation + auto-state. |
| `comment`                  | `{id, body}` — Claude can summarize what it did and post.                     |
| `request_review`           | `{id, reviewer_emails[]?, generate_link?}` — emails or returns share link.    |
| `create_share_code`        | `{scope, permissions, label?, expires_at?, word_count?: 3\|4, channels?}` — mints code, returns `{code, web_url, mcp_url}`. |
| `list_share_codes`         | Workspace's active + expired codes for owner dashboard.                       |
| `revoke_share_code`        | `{code}` — immediate kill, sub-second propagation via KV invalidation.        |
| `recent_activity`          | `{list?, since?, limit?}` — what's changed lately, for catch-up.              |

### Hierarchy + attachment tools (drill-down ergonomics)

Convenience wrappers over `parent_id` and the generic polymorphic `link`. These make top-down planning and minimal-UI attachment feel native.

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `add_subitem`              | `{parent_id, title, body?, state?, fields?, inherit_groups?}` — creates a child with `parent_id` set. `inherit_groups=true` copies parent's sprint/epic memberships. |
| `list_subtree`             | `{item_id, max_depth?}` — returns the full subtree as a nested structure. One call for the entire drill-down. |
| `get_breadcrumbs`          | `{item_id}` → `[root → … → item]` chain. For breadcrumb UI and AI context. |
| `move_subtree`             | `{item_id, new_parent_id}` — reparent an item and all its descendants atomically. |
| `roll_up_progress`         | `{item_id}` → `{total, draft, in_progress, in_review, done, blocked, ...}` aggregate counts across the subtree. |
| `attach_file`              | `{item_id, file_id, label?}` — defaults `label="attached_to"`; pass `designed_in`/`screenshot`/`mockup` for renderable attachments. |
| `attach_document`          | `{item_id, document_id, label?}` — defaults `label="documented_in"`. Renderable. |
| `list_attachments`         | `{item_id, renderable_only?}` — filtered view of `list_relations` showing renderable attachments first. |

### Compass tools (shared situational awareness)

The same flexible metric scoring drives the human 3D visual AND the AI's "what should I work on next" decision.

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `get_focus`                | `{list?, group?, executor?, sort_by?: metric_key, limit?}` — returns top-N items by the named metric (defaults to whatever the list's compass_config has on its z_axis). Agent calls this to know what's most important. |
| `score_item`               | `{item_id, metrics?}` — force-recompute metric values for a single item. `metrics?` optionally restricts to specific keys. |
| `get_compass_config`       | `{list_id}` — returns the current visual-slot→metric mapping for a list. |
| `set_compass_config`       | `{list_id, config}` — update the visual-slot mapping. |
| `list_metrics`             | `{list_id?}` — returns metrics available in the workspace (or scoped to a list's relevant set), with their type (`explicit_field` \| `derived` \| `ai`) and current value range. |
| `get_compass_snapshot`     | `{list?, group?, format?: "json"\|"svg"\|"three"}` — returns the full Compass scene: JSON for programmatic use, SVG for sharing in chat, Three.js scene description for the web client. Uses the relevant list's compass_config to map metrics → visual slots. |
| `explain_score`            | `{item_id, metric_key?}` — returns AI's reasoning per metric (or one specific metric). Transparency for "why is this scored 0.8 on novelty?" |

### Commitment-ledger tools (the wedge)

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `set_executor`             | `{id, executor}` — route item to human, agent, contractor, or self.           |
| `promise_in_release`       | `{id, release_id}` — bind item to a release for delivered-vs-promised check.  |
| `create_release`           | `{version, ship_target, description, public_url_slug?}`                       |
| `close_release`            | `{release_id}` — triggers verification: shipped / slipped / cut report.       |
| `generate_release_notes`   | `{release_id, format?}` — Markdown summary comparing promises to deliveries.  |
| `spawn_claude_session`     | `{item_id}` — open a Claude Code session pre-loaded with item context.        |

### Document tools (markdown knowledge layer)

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `add_document`             | `{title, body, doc_type?, tags?, parent?, visibility?}` — create.             |
| `get_document`             | `{id_or_slug}` — fetch body + metadata + recent versions.                     |
| `update_document`          | `{id, body, version_note?}` — edit; bumps version, appends to history.        |
| `list_documents`           | `{doc_type?, tags?, parent?, visibility?}` — filter and browse.               |
| `search_documents`         | `{query, doc_type?}` — FTS5 over title + body + tags.                         |
| `revert_document`          | `{id, version}` — restore to a previous version.                              |

### File tools (Dropbox-for-MCP)

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `list_files`               | `{folder?, mime_type?, search?}` — browse a folder or workspace.              |
| `get_file`                 | `{id_or_path}` — base64 + mime for small files (<1MB), presigned R2 URL otherwise. |
| `get_file_text`            | `{id_or_path}` — extracted text content for PPT/PDF/Word/Excel.               |
| `upload_file`              | `{name, content_base64, folder?, mime?}` — Claude saves its own artifacts.    |
| `update_file`              | `{id, content_base64, version_note?}` — new version, previous retained.       |
| `move_file`                | `{id, new_folder}` — virtual folder reorganization.                           |
| `delete_file`              | `{id}` — soft-delete with restore window.                                     |
| `search_files`             | `{query, folder?}` — matches name + extracted text.                           |
| `share_file`               | `{id, stakeholder_key?, expires_at?}` — generate share URL.                   |
| `restore_file_version`     | `{id, version}` — Dropbox-style version restore.                              |

### Stakeholder-facing tools (used by stakeholder access keys, not full OAuth)

| Tool                       | Purpose                                                                       |
|----------------------------|-------------------------------------------------------------------------------|
| `view_roadmap`             | `{workspace?, release?}` — returns Mermaid Gantt + narrative summary.         |
| `view_release`             | `{release_id}` — shipped/promised/slipped breakdown with item links.          |
| `present_for_review`       | `{item_id}` — formats item as a review brief with clarification questions.   |
| `submit_feedback`          | `{item_id, feedback, intent?}` — structured feedback from stakeholder.        |
| `request_clarification`    | `{item_id, question}` — pose a question; builder gets a notification.         |
| `approve`                  | `{item_id, conditions?}` — formal approval, optionally with conditions.       |
| `list_open_for_review`     | Items the stakeholder's scope grants and that are awaiting input.             |

### Visual rendering: MCP tools return artifacts, not just JSON

Most MCP servers return plain JSON. Blitzlist tools return **rendering hints** alongside data, so AI clients (Claude Cowork, claude.ai, Claude Code) can show diagrams when their UI supports them:

```ts
// What view_roadmap returns:
{
  "items": [...],                  // structured data
  "rendered": {
    "mermaid": "gantt\n  title Roadmap...\n  ...",
    "markdown_summary": "## Q3 Roadmap\n- v1.0 ships 2026-07-15...\n",
    "executive_brief": "..."       // short narrative for verbal presentation
  }
}
```

Diagrams we generate:
- **Mermaid Gantt** for roadmaps (`view_roadmap`)
- **Mermaid graph LR** for relations (test → req, req → PR)
- **Mermaid stateDiagram** for list state machines
- **Mermaid pie** for release composition (% shipped vs. slipped)

Claude Cowork specifically renders Mermaid natively. Claude Code shows it as a code block. Either way, the AI assistant has structured content to reason over.

**The `select_default_list` ergonomic trick.** A Claude Code session usually works in one context. At the start of a session, Claude (or you) calls `select_default_list("backlog")`. After that `add_item("fix the auth race")` lands in the right place without restating context every turn. Default is scoped per OAuth token.

**Read vs. write split.** Read tools (`list_*`, `get_*`, `view_*`, `whoami`, `recent_activity`) are safe to auto-allow. Write tools should prompt the user. We'll publish a recommended allowlist for Claude Code's `settings.json`.

**Resources & prompts.** Beyond tools, expose:
- **MCP resource** `blitzlist://workspace/{slug}/list/{list}.md` — rendered markdown of any list, so Claude can `@`-reference it.
- **MCP resource** `blitzlist://workspace/{slug}/release/{release}.md` — public release brief.
- **MCP prompt** `plan-sprint` — pre-baked prompt that pulls the current backlog and walks through prioritization.
- **MCP prompt** `stakeholder-review` — for stakeholder sessions: presents the roadmap, walks them through open items for review.
- **MCP prompt** `release-retrospective` — at release close, walks through delivered/slipped/cut.

---

## 5. Auth: OAuth 2.1 + Dynamic Client Registration

This is the most spec-correct MCP auth flow today. Claude Code handles the full browser dance; the user just clicks "Approve."

**Implementation: [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider).** Purpose-built for MCP-spec OAuth on Workers. Handles DCR (RFC 7591), PKCE, resource indicators (RFC 8707), token issuance, and revocation. Saves us writing ~1000 lines of auth plumbing and the associated bug surface. Our code only owns the user-facing consent screen and the workspace-binding logic on top.

### Discovery

`https://mcp.blitzlist.ai/.well-known/oauth-protected-resource` (RFC 9728):
```json
{
  "resource": "https://mcp.blitzlist.ai/mcp",
  "authorization_servers": ["https://mcp.blitzlist.ai"],
  "scopes_supported": ["backlog:read", "backlog:write", "workspace:admin"]
}
```

`https://mcp.blitzlist.ai/.well-known/oauth-authorization-server` (RFC 8414):
```json
{
  "issuer": "https://mcp.blitzlist.ai",
  "authorization_endpoint": "https://mcp.blitzlist.ai/oauth/authorize",
  "token_endpoint": "https://mcp.blitzlist.ai/oauth/token",
  "registration_endpoint": "https://mcp.blitzlist.ai/oauth/register",
  "revocation_endpoint": "https://mcp.blitzlist.ai/oauth/revoke",
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "response_types_supported": ["code"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

### Flow (first-time user)

1. User runs `claude mcp add blitzlist https://mcp.blitzlist.ai/mcp`.
2. Claude Code calls `/mcp`, gets `401` with `WWW-Authenticate: Bearer resource_metadata=...`.
3. Claude Code fetches PRM → AS metadata → POSTs to `/oauth/register` (DCR, RFC 7591) to get a `client_id` for this install.
4. Claude Code opens `/oauth/authorize?...&code_challenge=...&resource=https://mcp.blitzlist.ai/mcp` in the user's browser (PKCE, RFC 8707 resource indicators).
5. User signs in (email magic link — see §6) and approves scopes.
6. **Workspace step (the "hashcode" moment):** if the user has no workspaces, the consent screen offers:
   - "Create a new workspace" (1-click)
   - "Join with invite code" (paste 8-char code from teammate)
7. Browser redirects to `http://localhost:<port>/callback?code=...` (Claude Code's loopback listener).
8. Claude Code exchanges code for access + refresh token at `/oauth/token`.
9. Subsequent MCP calls use `Authorization: Bearer <token>`. Tokens carry `user_id`, `workspace_id`, `scopes`.

### Why this and not token-paste

- **No secrets in `mcp.json`** — config is shareable across machines without leaking access.
- **Revocable** — user can kill a single Claude Code install from the web UI.
- **Multi-account ready** — same Claude Code install can connect to multiple Blitzlist workspaces.
- **Spec-aligned** — works with the Claude Code OAuth handler out of the box; no custom client wrapper.

### Sign-in (humans, not OAuth clients)

Email magic-link only for v1. Lower friction than password, no SSO setup overhead. SSO (Google, GitHub) added in v1.1 once we know which providers customers ask for.

### Stakeholder access keys (the AI-mediated stakeholder UX)

A separate, lighter auth path for the third audience: stakeholders who connect their *own* AI assistant (Claude Cowork, claude.ai) to our MCP server.

**The flow:**

1. A workspace owner generates a stakeholder access key from the web UI: defines scope (which lists/items/groups), permissions (read + comment + approve), and expiry.
2. The owner shares the key with the stakeholder via any channel (email, chat, in person).
3. The stakeholder runs `claude mcp add blitzlist <url>` in their AI client, with the key as a header.
4. They ask their AI "show me the roadmap" — Blitzlist returns the data + Mermaid rendering, AI shows the diagram.
5. They give feedback in chat; AI translates to `submit_feedback()`.
6. Builder sees structured feedback live in Blitzlist.

**Why not just OAuth?** OAuth requires browser handoff, accounts, password recovery, multi-account management. Stakeholder access keys are simpler:
- One-step setup (paste key)
- Scope-limited from the start (can't see what they don't have a key for)
- Easy to revoke (single row delete)
- No account state on our side
- Suitable for ad-hoc reviews ("here's a 30-day key to review v1.2 plans")

**Security model:**
- Keys are `blz_` prefixed, 32 random bytes (base32). bcrypt-hashed in storage.
- Per-key rate limit and audit log
- Configurable: per-key permissions, expiry, IP allowlist (enterprise)
- Different from OAuth tokens at the request layer — the Worker resolves either bearer format

This is the **AI-mediated stakeholder UX** in concrete auth terms.

### Share codes (the "anyone with the link" path)

For low-friction, broad sharing — the Google-Drive-style UX where anyone with the URL gets in. **No registration, no auth, no consent screen.** The URL path itself is the authentication; possession of the URL = access.

**The URL pattern:**

```
Web view:    https://blitzlist.ai/s/tiger-painting-jazz
MCP access:  https://mcp.blitzlist.ai/mcp/share/tiger-painting-jazz
```

Same code, two channels. The web URL opens the public view in any browser. The MCP URL drops into any MCP client (Claude Code, Cowork, claude.ai) — pasting it as an MCP server immediately grants the scoped access.

**The code format: three or four words.**

Three-word codes use the [EFF diceware short wordlist](https://www.eff.org/dice) (1,296 short, common, culturally-neutral words). Three words = 2.18 billion combinations; four = 2.8 trillion. With our 100-req/min rate limit per code, brute force a three-word code takes ~414 years.

The owner picks 3 or 4 when minting — three for normal sharing, four for higher-sensitivity content. Codes are case-insensitive and stored lowercase: `tiger-painting-jazz`.

**Not patented**: what3words holds patents on *mapping three-word codes to geographic coordinates*. Generic three-word access codes are widely used (Tailscale device names, Codespaces names, MFA recovery codes) and unencumbered.

**The flow:**

```
1. Builder (in Claude Code):
     "Mint a share code for the Proposals list. View + comment.
      Expires in 30 days."
   → Worker mints "tiger-painting-jazz"
   → Returns both URLs.

2. Builder sends one URL via any channel: email, Slack, sticky note.

3. Stakeholder receives URL. Two paths:
     (a) Click → opens web view immediately. No login.
     (b) Click "Add to Claude" → deep link installs MCP server
         in their Claude. No OAuth.

4. Their AI queries with normal tools: list_items(), view_roadmap(),
   submit_feedback(). Scoped to whatever the code grants.
```

Time from "I want to share" to "stakeholder is using it via their own AI": **under 60 seconds**.

**Permissions:**

| Permission | What it grants |
|---|---|
| `view` | Read items, documents, files in scope |
| `comment` | Append comments (anonymous, IP-logged) |
| `propose` | Create new items in **`pending` state** — visible to members for approval, not to other stakeholders until approved |
| `approve` | Formal approval on items in scope |

`view` is the default; the owner explicitly adds the others. `propose` always lands items as `pending` to prevent spam; a workspace member promotes them to visible.

**Security defaults baked in:**

| Concern | Default |
|---|---|
| Permissions | `view` only — owner adds others explicitly |
| Expiry | 30 days; settable to permanent |
| Rate limit | 100 req/min per code |
| Audit log | Every redemption logs IP, timestamp, tool/route called |
| Workspace cap | 100 active codes per workspace |
| Revocation | Sub-second (KV cache invalidated on revoke); soft-revoke returns 410 Gone |

**Share codes vs. stakeholder access keys — when to use which:**

| | **Share code** | **Stakeholder access key** |
|---|---|---|
| Identity | Anonymous (anyone with link) | Per-stakeholder (Alice gets one, Bob gets another) |
| Distribution | URL paste anywhere | Branded email with deep link |
| Revocation | Kills for all holders | Kills for one person |
| Audit trail | Per-IP only | Per-key, per-action, tied to identity |
| Best for | "Post in team Slack for broad input" | "Send to Alice for formal review and approval" |

Both coexist in any workspace. A Q3 proposals list might have one share code (public input) plus three stakeholder keys (Alice/Bob/Carol — the formal approvers).

### The full sharing matrix

For quick reference — every way Blitzlist exposes data:

| Mechanism | Channel | Audience | Identity | Auth handoff | Use case |
|---|---|---|---|---|---|
| **OAuth 2.1 + DCR** | MCP | Full members | Per-user account | Browser flow | Daily team use |
| **Magic-link sign-in** | Web | Full members | Per-user account | Email link | Web sessions |
| **Invite codes** | MCP/web | New team members | Becomes a per-user account | 8-char paste | Onboarding teammates |
| **Stakeholder access keys** | MCP | Specific stakeholder | Per-key, audit-trail | Branded email + deep link | Formal review/approval |
| **Share codes** | MCP **and** web | Anyone with link | Anonymous + IP-logged | URL paste / click | Broad, low-friction sharing |
| **Public roadmap pages** | Web only | Anyone | Anonymous | None | Marketing surface |

Six mechanisms, each with a clear job. The first four are tied to identity; share codes and public pages are not. Together they cover the full spectrum from "highly governed" to "post the link in any chat."

---

## 6. Web app surface

**The web app is the secondary interface, not the primary one.** Most user interactions happen via MCP — builders use Claude Code, stakeholders use Claude Cowork. The web app exists for tasks that don't fit conversational UX:

- Workspace setup and member management
- Generating stakeholder access keys
- File uploads (drag-drop attachments)
- Bulk edits (multi-select state changes)
- Dense data views when a stakeholder *does* want to browse without their AI
- **Public roadmap pages** at `/r/[workspace]/...` — these are critical, since they're the marketing surface

Hosted on **Cloudflare Pages**. For v1 we have two viable shapes — pick after a small spike:

- **(a) Next.js via `@cloudflare/next-on-pages`** — familiar DX, full Next.js features, slightly rougher on Pages than on Vercel.
- **(b) Hono + JSX server rendering** — simpler stack, perfect for a CRUD/admin UI, no hydration story to debug. Migrate to a real React SPA later when interaction richness justifies it.

If Pages proves too rough at any point, the web app pulls out to Vercel without affecting the Worker (see §16 Migration paths). The data plane and MCP/OAuth surfaces stay on Cloudflare regardless.

Routes (using Next.js App Router naming; same paths apply to the Hono+JSX variant):

- `/` — marketing + signup CTA + "Deploy to Cloudflare" button for self-hosters
- `/login` — magic link
- `/onboarding` — create or join workspace, pick templates
- `/w/[slug]` — workspace home — **the Compass is the hero** (3D animated multi-dimensional priority scene); recent activity + active sprint summary live below the fold. Mobile + accessibility default to the 2D Compass variant.
- `/w/[slug]/l/[list]` — single list view (table / kanban / calendar per list's `default_view`)
- `/w/[slug]/i/[id]` — single item: detail, comments, approvals, timeline, **hierarchical sub-tree with drill-down**, **inline renderable attachments** (square thumbnails for images/designs, icon+title for docs)
- `/w/[slug]/g/[group]` — single group view (e.g. a sprint or milestone, items from many lists)
- `/w/[slug]/groups` — index of sprints, milestones, labels, releases
- `/w/[slug]/docs` — documents index (filter by type, tag, search)
- `/w/[slug]/docs/[slug]` — single document viewer/editor with version history
- `/w/[slug]/files` — file browser (folder tree, drag-drop upload, preview pane)
- `/w/[slug]/files/[path]` — file detail (preview, versions, share)
- `/w/[slug]/keys` — stakeholder access key management (create, scope, revoke)
- `/w/[slug]/settings` — members, invite codes, list templates, MCP install instructions
- `/r/[workspace]` — **public roadmap** (the marketing surface; beautifully designed)
- `/r/[workspace]/release/[slug]` — **public release page** with delivered/promised/slipped breakdown
- `/s/[code]` — **share code view** — anyone with link; three- or four-word code; web channel of `share_codes`. Replaces the legacy `/share/[token]` route.
- `/w/[slug]/share` — owner UI for minting, listing, and revoking share codes

The web app talks to the same Hono API via cookie session. Both surfaces share the same authorization layer; the bearer-token path just resolves the session differently. Live UI updates come from a WebSocket to the workspace's Durable Object (see §15).

### Item view UX: hierarchy + minimal attachments

The single-item view (`/w/[slug]/i/[id]`) is the most-visited page in the product. It renders two patterns that distinguish Blitzlist from a typical PM tool:

**1. Drill-down hierarchy.** When you open an item, the URL "zooms" onto its subtree. Breadcrumbs at the top (`Launch v1.0 › Ship MCP server › Add SSO`) let you zoom out. The view shows:
- The item's body + custom fields up top
- A **collapsed-by-default subtree** below (children + their counts + rollup progress)
- Click any sub-item → URL becomes that item; breadcrumbs grow
- Press Escape (or click a breadcrumb) → zoom out
- Same pattern as Linear sub-issues, but with unlimited depth

**2. Minimal attachment row.** Renderable relations (filtered by the `renderable` flag in `KNOWN_LABELS`) render *prominently above the body* as a compact row:

```
┌──────────────────────────────────────────────────────────┐
│ BL-042 · Add SSO via Google                              │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│  ▢ ▢ ▢   [📄 OAuth Spec]                                 │
│  ↑ square 64×64 thumbnails for images/designs           │
│  ↑ icon + title for docs                                 │
│                                                          │
│ Goal: Add Google Workspace SSO so customers can…         │
│                                                          │
│ ▾ 3 sub-items (1 done, 2 in_progress)                    │
│   ├ BL-044 OAuth handshake (done)                        │
│   ├ BL-045 User mapping (in_progress)                    │
│   └ BL-046 Tests (in_progress)                           │
└──────────────────────────────────────────────────────────┘
```

Design rules:

- Square thumbnails, 64×64, no border, subtle shadow on hover
- Hard cap at 6 visible thumbnails; beyond that shows `+ N more` link to a side panel
- Doc references show icon + title only (no preview text); hover reveals first paragraph
- Loading states are silent — skeleton boxes for ~150ms, never text
- Click an image → lightbox; click a doc → opens the document view in side panel
- Grid layout that wraps naturally on narrow viewports

Non-renderable relations (`blocks`, `verifies`, `source`, etc.) live in a less prominent "Related" section below the body.

---

## 7. Notifications & integrations

**Notifications (v1)**
- Email on: review requested, comment on item you authored, state change on item you assigned.
- In-app notification feed.

**GitHub integration (v1)**
- Optional GitHub App install per workspace.
- Webhook handlers:
  - `pull_request opened` referencing `ACM-142` in title/body → `link_pr` + auto `set_state(in_review)` *if that state exists on the item's list*.
  - `pull_request merged` → auto `set_state(done)` *if that state exists*.
- Conservative: only auto-transition when (a) the item has a clear PR reference and (b) the target state exists in the item's list template. Otherwise just log activity.

**Slack (v1.1, deferred)** — same notifications, plus a `/blitzlist` slash command. Out of scope for first cut.

---

## 8. Deployment shape & self-hosting

All-Cloudflare for v1. One platform, one CLI (`wrangler`), one secret store.

**Self-hosting is a first-class feature, not an afterthought.** Like n8n, every self-hosted instance is a foothold — community contribution, stakeholder exposure to the product, advocacy. We optimize hard for this.

### One-click self-host (the n8n-style moat)

The README has a prominent **"Deploy to Cloudflare" button** that:
1. Forks the repo to the user's GitHub account
2. Triggers a Cloudflare deploy workflow that provisions: Worker, D1 database, KV namespace, R2 bucket, Durable Object class, Pages site
3. Runs first-time D1 migrations
4. Opens a browser to the new instance's `/onboarding`
5. Time to running instance: ~3 minutes; cost: ~$5/month for hobby use, free tier covers solo

The `wrangler.toml`, Terraform modules, and setup script are first-class artifacts maintained alongside the product. CI verifies the deploy flow on every release.

### Hosted vs. self-hosted parity

The hosted instance at `blitzlist.ai` runs the same code as self-hosted forks. Differences:
- Hosted gets first-class support, billing, SLA
- Self-host gets full data control, no SaaS fees, full customization
- Hosted's exclusive features (if any) are clearly documented as such

Self-hosters can sync their `blitzlist/` directory with the official upstream to get updates.

| Layer | Where it lives |
|---|---|
| API + MCP + OAuth AS | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 (SQLite, edge-replicated) |
| Real-time fanout | Cloudflare Durable Objects (one per workspace) |
| Attachments | Cloudflare R2 (zero egress) |
| OAuth ephemeral state | Cloudflare KV |
| Async work | Cloudflare Queues |
| Web app | Cloudflare Pages |
| Email | Resend (vendor-neutral, HTTPS) |
| Secrets | `wrangler secret` for v1; Doppler if the list grows |
| Observability | Workers Logs / Logpush → Axiom; Sentry for errors |

**CI/CD (intentionally minimal):**

- **GitHub Actions** runs typecheck + tests as PR gates.
- **Cloudflare Pages** auto-deploys preview builds per PR.
- **Workers** deploy via `wrangler deploy` from Actions on push to `main`; preview deploys per PR use Cloudflare's preview URLs.
- **D1 migrations** run via `wrangler d1 migrations apply` ordered before the Worker deploys.
- Per-PR preview DBs use D1's clone feature; cleanup on PR close.

That's the whole pipeline. No multi-vendor orchestration, no env-var patching across platforms.

### Migration ordering (production)

The expand → migrate → contract discipline still applies: a "breaking" schema change is three deploys spread over time, not one. Sequence per deploy: **D1 migrations → Worker → Pages**. Each layer must work against the *previous* layer's state, so old code keeps functioning during rolling deploys.

---

## 9. Repository layout (planned)

```
blitzlist/
├── apps/
│   ├── api/                # Hono on Workers: REST + MCP + OAuth + DO classes
│   │   ├── src/
│   │   ├── wrangler.toml   # Worker config, bindings (D1, KV, R2, Queues, DO)
│   │   └── migrations/     # D1 migration SQL (generated by Drizzle)
│   └── web/                # Next.js on Pages (or Hono+JSX variant)
├── packages/
│   ├── db/                 # Drizzle schema + typed client (SQLite dialect)
│   ├── core/               # Domain logic — framework-agnostic, no Cloudflare imports
│   ├── mcp/                # MCP tool definitions, importable by api/
│   └── ui/                 # Shared components (used by web/)
├── ARCHITECTURE.md         # this file
└── package.json            # pnpm workspaces + Turborepo
```

`packages/core` is the thing we protect most carefully — no Cloudflare imports, no framework imports, pure TypeScript domain logic. It's the part that survives any platform migration.

`packages/db` uses Drizzle's SQLite dialect against D1. If we ever switch to Postgres (e.g. for higher row counts or true JSONB needs), Drizzle dialects are swappable with minimal schema edits.

---

## 10. Phased roadmap

**v0.1 — Single-user spike (1 week)**
- Hono on Workers + D1 + 5 MCP tools (`add_item`, `list_items`, `get_item`, `set_state`, `comment`)
- Token-paste auth (not OAuth) — just to feel the tool flow
- No web UI, no Durable Objects yet. Goal: validate the capture-while-coding loop and shake out the wrangler/D1 dev experience.

**v0.5 — Multi-user beta + the commitment-ledger wedge (3–4 weeks)**
- Workspaces, magic-link signup, invite codes
- OAuth 2.1 + DCR for MCP via `@cloudflare/workers-oauth-provider`
- **Stakeholder access keys** (the AI-mediated stakeholder UX) **+ share codes** (anyone-with-the-link sharing for MCP + web)
- **Executor field + routing** (human / agent / self / contractor)
- **Release group type + promise→delivery verification**
- **Public roadmap pages** (`/r/[workspace]/...`) — the marketing surface
- **Visual MCP rendering** (Mermaid Gantt for roadmaps, graph for relations)
- Minimal web UI on Pages: list view + item detail + comments + stakeholder key management
- Sprint assignment + state machine
- Durable Objects for live updates
- Bidirectional repo sync (importer + exporter + conflict detection)
- **Documents primitive** (markdown knowledge layer + 6 MCP tools)
- **Files primitive** (R2 storage + 10 MCP tools + web drag-drop upload)
- **Binary extraction worker** (PPT/PDF/Word/Excel via Queue)
- **"Deploy to Cloudflare" button + self-host docs**

**v1.0 — Production (6–8 weeks)**
- GitHub integration (auto state from PRs)
- `spawn_claude_session` MCP tool (Claude Agent SDK integration)
- Auto release notes generator (delivered vs. promised)
- Email notifications via Resend + Queues
- Approvals workflow with structured stakeholder feedback
- R2 attachment upload from web UI
- Per-workspace billing (Stripe) for hosted tier
- Templates ecosystem (community-contributed list/group templates)
- **Workspace export & re-import** (BL-033) — four formats (blitzlist, backlog-md, json, sqlite); makes the no-lock-in pitch credible to enterprise procurement

**v1.1+**
- Slack, SSO, inline image upload from Claude Code
- Multi-agent routing (Claude + other agents via MCP)
- Stakeholder keys with IP allowlists (enterprise)
- Public roadmap themes and customization
- File versioning UI, FTS5 search across documents+files+items
- **Local-sync agent API spec** published; community builds per-OS sync clients (separate repo)

**v2.0 — Claim the shared-workspace category (9-18 months)**

Once LAND is proven, expand into the surfaces that complete the "shared workspace for hybrid teams" pitch. None of these change the data model materially — they're new views and workflows on top of the three memory primitives.

- **Rich view types** — kanban, calendar, gallery, gantt, timeline. Items already have everything needed; this is presentation.
- **Workflow automation** — declarative rules ("when item enters state X, do Y") triggered by state changes, time, or events. Replaces ad-hoc Zapier/Monday-automation setup.
- **Inline databases in documents** — a document can embed a filtered view of items, like Notion's signature feature. Makes docs live, not static.
- **Wiki-style cross-linking + backlinks** — `[[item:BL-042]]` syntax in documents, with automatic backlinks rendered on the linked item.
- **Forms** — typed intake that creates items. Replaces ad-hoc form tools for customer feedback, bug reports, idea submission.
- **Whiteboard/canvas** — drag items around for planning, group visually. Post-AI version of Miro/FigJam: items on the canvas are live (state changes show in real-time).
- **Unified inbox** — one notification feed across all primitives, with AI-summarized digests for stakeholders.

Order of implementation in v2.0 is open; we ship what users ask for fastest, in whatever order the EXPAND-phase telemetry supports.

---

## 11. The three frictions we erase (marketing pillars)

These are the three problems we keep coming back to in every pitch, demo, and piece of content. Codifying them here so they survive positioning drift.

### Friction 1: Context dies at session boundaries

**Today's experience:** Your Claude Code session ends. The next morning, you re-open Claude Code on the same project. The session-bound todo list is gone. You spend 10 minutes re-explaining what you were working on, what's blocking, what's planned.

**Blitzlist erases it:** `documents` hold the long-form project context. `items` hold the active work. Every Claude Code session that connects to your workspace starts with full memory — `select_default_list("project")` + `get_document("brief")` and you're back where you left off.

**Demo line:** *"After a week away, your AI knows what you promised, what's open, what's blocked, and what's next."*

### Friction 2: Artifacts can't move without humans

**Today's experience:** PM has a PPT. To get Claude to read it, PM uploads to web Claude, downloads the analysis, screenshots, pastes into Slack, designer screenshots back, etc. Files bounce through humans on every hop.

**Blitzlist erases it:** Files live in R2 with zero-egress. Any MCP client — your Claude Code, the designer's Claude Cowork, a stakeholder's claude.ai — can `get_file()` or `get_file_text()` directly. Generated artifacts are pushed back to the same workspace via `upload_file()`. **The file doesn't move; references do.**

**Demo line:** *"Drop a deck in /reviews. Your designer's Claude reads it, writes a one-pager, pushes it back. You see both files in the same folder the next morning. No downloads in between."*

### Friction 3: AI-to-AI handoff drops state

**Today's experience:** Even within one vendor's ecosystem (Cowork → Code, Claude.ai → Claude Code), context doesn't follow you. Cross-vendor handoff (ChatGPT → Claude, Cursor → Claude Code) is even worse — full re-explanation every time.

**Blitzlist erases it:** Every MCP-capable AI client connects to the same Blitzlist MCP server. Items, documents, and files are the same regardless of which client read or wrote them. Bridge by design.

**Demo line:** *"Discuss a plan in Cowork. Implement in Claude Code. Brief a stakeholder in their claude.ai. All three sessions see the same items, docs, and files. No re-explanation."*

These three frictions exist because the existing productivity stack was built for humans typing in browser tabs. AI was retrofitted. Blitzlist is the layer that was missing all along.

---

## 12. The canonical user journey (v0.5 acceptance test)

The eleven-step flow below is **the dog-food story** — what every piece of v0.5 is built to enable, and the integration test that decides whether v0.5 ships. If any step requires manual workarounds, that's the bug to fix before launch.

### The story

> A consulting builder is starting a project with a new client. They had a kickoff call yesterday on Granola. The whole product cycle — from extracting requirements out of that call, through client approval, implementation, deploy, and release notes — happens without leaving Claude Code or copy-pasting between tools.

### The steps

1. **Intake from Granola.** Builder's Claude Code is connected to both Granola MCP and Blitzlist MCP. Builder asks Claude to pull yesterday's call transcript and extract requirements. Claude calls `add_items_from_transcript(transcript, source_url)`. Items land in a "Client X" list. Each item is auto-linked to the transcript with label `source`.

2. **Provision stakeholder access.** Builder asks Claude to "mint a stakeholder key for Client X, scoped to that list, and email it to alice@client.com." Blitzlist mints the key, sends a branded email with a one-click deep link (`claude://add-mcp?url=...&token=...`).

3. **Client onboarding.** Client clicks the deep link. Blitzlist MCP installs in their Claude Cowork. They ask "show me the requirements you captured" → `view_roadmap` returns Mermaid + summary.

4. **Client feedback.** Client says "I'd want the SSO requirement broken into two: one for Google Workspace, one for Microsoft." Their Claude calls `submit_feedback` (and possibly `request_clarification`). Builder sees the structured feedback live via Durable Object push.

5. **Confirmation call.** Builder and client jump on a follow-up Granola call. Decisions are recorded. Builder's Claude pulls the new transcript, calls `record_decision` for each item, which appends comments AND creates a relation to the confirmation transcript with label `discussed_in`. States move to `approved`.

6. **Implementation handoff.** Builder feeds item BL-042 to Claude Code: "implement this." Claude reads `get_item(BL-042)` + `list_relations(BL-042)` — sees the original transcript excerpt, the confirmation excerpt, the approval. Full context loaded.

7. **Decision recording.** During implementation, Claude makes architecture calls. Each significant choice → `record_decision(BL-042, "Chose Lucia for OAuth library because…", rationale)`. The decisions accumulate on the item.

8. **PR opened.** Claude opens a PR; GitHub webhook fires; Blitzlist auto-creates a relation `from=item BL-042, to=external github.com/.../pull/142, label=implemented_by`. State → `in_review`.

9. **Merge to main.** Push webhook fires; auto-relation with label `shipped_in_commit`. State → `done`.

10. **Vercel deploy.** Vercel webhook fires; `link_deploy(BL-042, deploy_url, env=production, commit_sha)`. State → `shipped`.

11. **Release notes.** Builder runs `close_release(release-v1-2)`. `generate_release_notes(release-v1-2)` produces a Markdown artifact where each shipped item links back through the whole provenance chain: original call → confirmation → decisions → PR → push → deploy → release. The client receives the notes via the same stakeholder key.

### Why this matters

Every step is **traceable** because everything is **linked**. The same workspace holds:
- The items (work)
- The transcripts as external sources (provenance)
- The decisions as comments (rationale)
- The PRs, pushes, deploys as external relations (delivery)
- The release notes as a generated document (verification)

No copy-paste. No tool-switching. No context loss. **The relations table is what makes this loop possible** — it's the polymorphic link layer that ties humans, agents, calls, code, and ships together.

This is also the **integration acceptance test for v0.5**: real end-to-end run with one real builder + one real tester before launch. Tracked as item BL-025.

---

## 13. Open questions to resolve before coding

1. **Pricing model** — per-seat? per-workspace? free for solo? Affects data model (do we need seat counting?). *Recommendation: free for solo workspaces + self-host; hosted per-seat above 3 members.*
2. **Hosted vs. self-host** — *Decided: BOTH from v0.5. Self-host is a first-class feature, the moat is the community.*
3. **AI features inside the product** — should Blitzlist itself call Claude API to summarize, dedupe, prioritize? *Recommendation: defer to v1.1; ship the data layer + commitment loop first.*
4. **Hierarchy depth** — items nest via `parent_id` *within a list*, and `epic`-type groups can cluster items *across lists*. *Decided 2026-05-29: render **full depth** with collapse/expand at every level; default state shows top level expanded, deeper levels collapsed. Drill-down zooms onto a subtree via the single-item route; breadcrumbs zoom out. Storage is unlimited; UI now matches.*
5. **Workspace = tenant boundary** or do users have one global backlog? *Recommendation: workspace = tenant. Aligns with how teams actually work.*
6. **MCP client rendering compatibility** — Claude Cowork renders Mermaid natively; Claude Code shows it as a code block; other MCP clients (Cursor, etc.) may not render at all. How aggressive should we be about returning rendering hints? *Recommendation: always return both `mermaid` and `markdown_summary`; let the client pick. Don't over-optimize for one client.*
7. **Stakeholder key UX** — paste a key as MCP header, or browser-based one-click "Add Blitzlist" link? *Recommendation: support both; pasting key is the v0.5 path, one-click link is v1.0.*

---

## 14. Risks & non-goals

**Risks**
- *Yet-another-issue-tracker fatigue.* Differentiation has to come from the commitment-ledger + AI-mediated stakeholder loop being genuinely better than `gh issue create`, Linear's MCP, or ProductBoard. The pitch must lead with the wedge, not the features.
- *Competitors closing the synthesis fast.* Backlog.md adding a server, Plane adding GitOps, or Linear adding markdown sync each compress our 4-month window. Mitigation: ship v0.5 quickly with the unique wedge visible (stakeholder MCP + public roadmap + self-host) — features competitors can't fast-follow without rebuilding their stack.
- *AI-mediated stakeholder UX requires behavior change.* Stakeholders need to install Blitzlist into their Claude. The first one is the hardest; subsequent ones are easier ("oh, I already use Claude, so..."). Mitigation: a great install video, Cowork-specific quick-start, one-click "Add to Claude" links once those become spec-supported.
- *MCP client fragmentation.* Different clients render Mermaid differently; some not at all. Mitigation: always return both diagram and narrative summary; degrade gracefully.
- *Auto-state-update accuracy.* If we wrongly transition states, trust dies fast. Bias toward conservative auto-transitions + clear audit trail.
- *OAuth UX on first install.* Browser handoffs feel heavy. Mitigate with great copy on the consent screen and a 10-second video on the install page.
- *Cloudflare Pages roughness for Next.js.* If we hit limits we can't work around (image optimization, certain middleware patterns, ISR edge cases), the web app pulls out to Vercel without affecting the data plane (see §16). The public roadmap page especially needs to be polished — if Pages can't render it beautifully, that's a wedge problem, not just a tech problem.
- *D1 ceiling.* 10–50GB per DB and SQLite write-throughput limits could bite at scale. Unlikely before 10k+ active workspaces; we'd shard by workspace before then. Migration path to Postgres exists via Drizzle dialect swap.
- *Dependency on Claude Cowork.* If Cowork sunsets or changes auth model, the marquee stakeholder UX degrades. Mitigation: the stakeholder access key works with any MCP client; Cowork is the headline example but not the only one.

**Non-goals (for v1)**
- Heavy PM telemetry: burndowns, velocity, story points — Linear/Jira do this. We compete on commitment-tracking, not PM analytics.
- Real-time multiplayer editing — async comments are enough.
- Mobile app — web is responsive, that's it. Stakeholders use their AI assistant which is already cross-device.
- Custom workflows / state machines beyond what list templates allow — one opinionated flow per template keeps the product tight.
- Live customer feedback boards (Canny-style upvoting) — out of scope for v1; the commitment-ledger is the wedge, not feedback aggregation.

---

## 15. Real-time architecture (Durable Objects)

The "PM watches items move as Claude works" experience is powered by **one Durable Object per workspace**. A DO is a singleton actor with strongly-consistent storage and the ability to hold long-lived connections.

```
Claude Code ──MCP set_state──▶ Worker ──UPDATE──▶ D1
                                  │
                                  │ env.WORKSPACE_DO.get(id).fanout(event)
                                  ▼            (intra-Cloudflare RPC, <1ms)
                       ┌────────────────────────────┐
                       │  WorkspaceDO  (singleton   │
                       │  per workspace_id)         │
                       │                            │
                       │  state: connected sockets  │
                       │  methods:                  │
                       │   - subscribe(ws, user_id) │
                       │   - fanout(event)          │
                       └────────────┬───────────────┘
                                    │ WebSocket frames
                                    ▼
                       ┌───────────────────────────┐
                       │  Web app browsers         │
                       │  subscribed to this       │
                       │  workspace                │
                       └───────────────────────────┘
```

**Event shape** (what gets fanned out):

```ts
type LiveEvent =
  | { kind: "item.created";       item: Item }
  | { kind: "item.updated";       item: Item; changed: string[] }
  | { kind: "item.state_changed"; item_id: string; from: string; to: string }
  | { kind: "item.grouped";       item_id: string; group_id: string }
  | { kind: "comment.created";    comment: Comment }
  | { kind: "approval.created";   approval: Approval }
```

**Subscription auth.** WebSocket upgrade requests carry the same OAuth bearer token (or cookie session for the web app). The DO checks workspace membership before adding the socket to the broadcast set.

**Why DOs over Supabase Realtime in this stack:**
- No second vendor or second connection from the browser
- The DO can also do things Realtime can't: presence ("3 people viewing this item"), scheduled sprint transitions, soft locks during edits — all v1.1+ features that don't require new infrastructure
- Sub-millisecond fanout from Worker → DO (same network)

**The DO is also where sprint timers live.** Each WorkspaceDO holds a scheduled alarm for the active sprint's end date — when it fires, the DO closes the sprint and fans out the state change. No external cron needed.

---

## 16. Migration paths

The architecture is shaped so we can swap parts under pressure without rewriting the rest.

| If we hit pain on… | We pull out… | And keep… |
|---|---|---|
| Cloudflare Pages limitations for the web UI | Web app moves to Vercel | Worker, D1, DOs, R2 stay on Cloudflare; web talks to Worker over HTTPS as before |
| D1 size or write-throughput ceiling | DB moves to Postgres (Neon or Supabase) via Drizzle dialect swap | Everything else; Workers query Postgres via Hyperdrive |
| Need for full-text search beyond SQLite FTS5 | Add a Typesense or Meilisearch tier | Primary store stays D1 |
| Durable Objects pricing or limits | Replace with Supabase Realtime or Ably for fanout | Worker + D1 stay; DOs disappear, write path notifies external pub/sub instead |
| Cloudflare-wide outage / vendor concern | API + DB migrate to AWS / Vercel + Postgres | The Hono code is web-standards; `packages/core` has zero Cloudflare imports |

**The discipline that enables this:**
1. `packages/core` has no platform imports. Domain logic is pure TypeScript.
2. Hono is web-standards. Same handler runs on Workers, Vercel Functions, Node, Deno, Bun.
3. The storage adapter for R2 (and any future swap to S3) lives in one file in `packages/core`.
4. Drizzle dialects are swappable. SQLite ↔ Postgres requires schema edits but not application rewrites.

**Most likely migration in practice:** web UI to Vercel, somewhere between v1.0 and v1.5, if Pages friction adds up. That's the explicit fallback the user signed off on when we picked all-Cloudflare. Everything else stays put.

---

## 17. Community plugin API: local-sync agent

The Dropbox magic comes from the local-folder-that-just-syncs. We don't build this ourselves — we **publish the API** and let the community build per-OS sync clients (macOS menu bar app, Windows tray, Linux daemon, mobile share extensions).

### Why community-built

- Per-OS sync clients are large products (file watchers, conflict resolution, large-file streaming, offline support). Owning 4 native apps would consume the team.
- The community is incentivized — self-hosters want this badly. n8n's community-built nodes are the model.
- We benefit from focus: keep Blitzlist itself MCP- and web-first.
- The API contract is what we own and stabilize.

### What we publish

A small, stable HTTP API the official Worker exposes, designed specifically for sync clients:

```
GET    /sync/v1/manifest                    Long-poll manifest of file states (path, version, hash)
GET    /sync/v1/file/{path}?version={n}     Download a specific version (streaming)
PUT    /sync/v1/file/{path}                 Upload (multipart, resumable for large files)
DELETE /sync/v1/file/{path}                 Remove
POST   /sync/v1/conflict/{path}             Report a local conflict; server stores both versions
GET    /sync/v1/changes?since={cursor}      Server-sent events stream of remote changes
```

Plus a **client conformance suite** (tests that any sync client must pass to be listed in our docs). Authentication via the same stakeholder access keys or OAuth tokens — same auth surface, no new model.

### Community-plugin pattern beyond local sync

Once the plugin API exists, we publish other plugin types the same way:
- Slack bridge (file notifications, item creation from messages)
- Figma extension (push designs as file attachments to items)
- IDE plugins beyond Claude Code (Cursor, Zed, Windsurf)
- Email-in (forward email to workspace, becomes an item)

Each is a community-build, with us providing the API contract + conformance tests + a "verified plugins" directory.

This is the n8n integration ecosystem strategy — make the protocol stable, let the community fan it out.

---

## 18. Bootstrap: dog-fooding via `blitzlist/` directory

Blitzlist's own product backlog lives in this repository under [`blitzlist/`](./blitzlist/) as Markdown + YAML files. We dog-food the product from day one: the backlog exists before the MCP server does, then syncs with the live MCP server once it's running.

**Convention** (also adopted by users self-hosting Blitzlist):

```
your-repo/
├── blitzlist/
│   ├── README.md             # file format + conventions
│   ├── SYNC.md               # bidirectional sync protocol
│   ├── config.yaml           # workspace + sync settings
│   ├── lists/                # list definitions (YAML)
│   ├── groups/               # sprints, epics, milestones, labels (YAML)
│   ├── items/                # one Markdown file per item (front-matter + body)
│   └── .sync/                # sync ledger, committed (not gitignored)
```

**Two phases:**

- **Phase A (pre-MCP):** the repo is the canonical store. PRs are the only path to change items. No sync engine running.
- **Phase B (post-MCP):** the GitHub App (`blitzlist-sync`) syncs bidirectionally. PRs → importer → D1; D1 changes → exporter → auto-PRs back to repo every ~5 min. Conflicts surface as labeled PRs with a 3-way diff for human resolution. Full protocol in [`blitzlist/SYNC.md`](./blitzlist/SYNC.md).

**Why this matters architecturally:**

- The repo serves as a permanent audit log of every requirement — `git log blitzlist/items/BL-042-*.md` shows the full history of a single item.
- Self-hosters get a "GitOps for backlog" pattern for free: their backlog is in their own repo, sync'd to their own MCP instance.
- Contributors can propose requirements via PR without an MCP account, which is critical for an open-source project.

**The sync engine is itself tracked in `blitzlist/`** as items BL-014 (importer), BL-015 (exporter), BL-016 (conflict resolution). It ships in sprint-002-beta, after the MCP server skeleton (BL-005) makes Phase B possible.
