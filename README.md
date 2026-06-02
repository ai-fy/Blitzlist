# Blitzlist

> **The list for the AI era.**
> Shared memory for hybrid human–agent teams. AI-first. MCP-native. Open-source. Self-hostable on Cloudflare in three minutes.

---

Lists drive how we work and how we live — in boardrooms, in startups, in family kitchens, in Claude Code sessions, in sprint plans, in grocery shopping. But the AI era arrived without one.

Your Claude Code todos die in 24 hours. Notion was built before AI existed. Linear retrofitted it. The list — humanity's most universal primitive of getting things done — hasn't yet entered the AI age.

**Blitzlist is that list.** AI-first from the foundation. Shared between you, your team, your AI agents, and your customers through MCP. Persistent across sessions. Tracks progress automatically. Draws your attention where it's needed.

---

## Status

**Pre-launch (v0.1 spike in progress).** The architecture, data model, MCP tool surface, and product backlog are all designed and public — see [ARCHITECTURE.md](./ARCHITECTURE.md) and [blitzlist/](./blitzlist/). Code shipping over the coming weeks.

We dog-food our own product: this repo's `blitzlist/` directory IS the canonical backlog for building Blitzlist. PRs against `blitzlist/items/` propose new work; the live MCP server (once running) syncs bidirectionally.

If you want to be among the first to install it, watch this repo or open an issue.

---

## Why a universal list, now

Work is fragmenting differently in the AI era. The same task flows between humans and agents in an hour, across multiple vendors' tools — some finishing in seconds, others running overnight. Decisions are made along the way, and the next step depends on what was decided.

No single tool captures the whole picture. **Linear sees engineering. Notion sees docs. Slack sees messages. Claude sees prompts.** Each gives you a slice. Synthesis falls on the human, who pays the cognitive tax of stitching it together — usually by hand, usually after the fact.

**A universal list isn't a nice-to-have anymore. It's how you steer.**

## Three frictions we erase

| Friction | Today | With Blitzlist |
|---|---|---|
| **Context dies at session boundaries** | Your AI's todo list is gone after 24 hours; you re-explain every morning | Items, docs, files persist across sessions, weeks, releases — your AI starts every session with full memory |
| **Artifacts don't travel** | Screenshot the deck. Copy-paste into Slack. Download the mockup. Re-upload. | Files live in R2; any MCP client reads them by reference. **The file doesn't move; references do.** |
| **AI-to-AI handoff drops state** | Even Cowork → Code loses context. Across vendors is worse. | Every MCP-capable AI client (Claude Code, Cowork, claude.ai, others) connects to the same Blitzlist MCP server. Bridge by design. |

## How it works

Three audiences, each through their preferred interface, all sharing the same source of truth:

```
   Builder (Claude Code)                Stakeholder (Claude Cowork)
         |                                       |
         | "Add a requirement: PR sync"          | "What's in v1.2?"
         |                                       |
         v                                       v
         +----------> Blitzlist MCP <-----------+
                            |
                            | tools return data + visual artifacts
                            | (Mermaid diagrams, rendered summaries)
                            v
                     D1 + Durable Objects
                            |
                            | live updates
                            v
                  Web UI (for humans who prefer one)
```

- **Builders** use MCP from inside Claude Code, Cursor, or any MCP client
- **Executors** (AI agents, contractors, teammates) act on items via MCP or the web app
- **Stakeholders** (customers, OSS users, reviewers) paste a code into their own AI assistant and review the roadmap conversationally — no account, no UI to learn

## What's inside

Two named products on one shared platform:

### Blitzlist — the workspace

The full AI-first shared workspace. Items + sprints + documents + files + workflows + relations + roadmaps. This is what you install first.

### Blitzbox — the AI-native file-sharing module

Inside Blitzlist (and also marketed standalone from v1.5): drop a binary, any MCP client reads it by reference. Like Dropbox, but built for the LLM workflow. Server-side text extraction for PPT, PDF, Word, Excel — your AI gets the content without you re-uploading.

## Signature feature: the Compass

A 3D animated multi-dimensional priority view that **steers both humans and AI agents** toward high-impact work. Items are spheres positioned in priority space, sized by effort, colored by risk, animated by uncertainty.

The same data drives the human visual and `get_focus()` calls from AI agents — **shared situational awareness**. A builder opens the Compass; their Claude Code session calls `get_focus()` in the background; both arrive at the same top-three items independently. No coordination needed.

Per-list configurable: a backlog list shows urgency/importance/risk; a bugs list shows age/severity/customer-impact; an ideas list shows feasibility/novelty/team-excitement. Same engine, different mappings. See [ARCHITECTURE.md §3](./ARCHITECTURE.md) for the full design.

## Quick start

### For end users (live now)

> **Connect once per Claude surface.** MCP servers are per-client, not global. If you start a new Claude session and ask "create a list" but the model doesn't reach for Blitzlist tools, that session never had Blitzlist connected. Add it to every Claude surface you use.

**Claude Desktop:**

1. Customize → Connectors → Add Custom Connector
2. URL: `https://mcp.blitzlist.ai/mcp`
3. Leave auth fields empty — Claude Desktop will auto-discover OAuth, register itself, and walk you through consent in a browser tab

**Claude Code (CLI):**

```bash
claude mcp add blitzlist https://mcp.blitzlist.ai/mcp
```

**claude.ai web:**

Settings → Connectors → Add custom connector → URL `https://mcp.blitzlist.ai/mcp` → authorize.

The v0.5 tool surface (13 tools, all annotated for the official MCP directory): `list_templates`, `create_list` (with optional `items[]` — populate in one call), `close_list`, `add_item`, `add_items` (batch), `get_item`, `list_items`, `update_item`, `set_state`, `set_executor`, `comment`, `add_item_to_list`, `remove_item_from_list`.

Try it:

```
> Create a shopping list with milk, bread, eggs.
> Make a v0.5 release list with these items: build the dashboard, ship the migration, …
> Add a backlog item: redesign the onboarding flow, priority p1.
```

The model should prefer the convenience tools (`create_list({items:[...]})`, `add_items(...)`) — both are single tool calls, so users see one approval prompt instead of N.

### For self-hosters

One click deploys your own Blitzlist instance on Cloudflare in about three minutes for about $5/month:

```
[Deploy to Cloudflare]  (button lands when v0.1 ships)
```

What gets provisioned: a Worker (API + MCP server), D1 database, KV namespace, R2 bucket (attachments), Durable Object class (real-time fanout), Cloudflare Pages site. You get a fully functional Blitzlist on your own domain, fully under your control.

See [ARCHITECTURE.md §8](./ARCHITECTURE.md) for the full deployment shape.

### For contributors

```bash
git clone https://github.com/ai-fy/Blitzlist.git
cd blitzlist
```

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the design. Browse [blitzlist/items/](./blitzlist/items/) for the live backlog. Pick anything labeled `state: draft` or `state: proposed` and open a PR.

## How it's built

All-Cloudflare for v1:

- **Workers** (Hono) — API + MCP server + OAuth authorization server
- **D1** (SQLite at the edge) — primary database; sub-millisecond queries from the Worker, no network hop
- **Durable Objects** — one per workspace for real-time WebSocket fanout
- **R2** — file storage with zero egress fees (the Dropbox-for-MCP economics)
- **KV** — OAuth ephemeral state
- **Queues** — async work (binary extraction, webhook reactions, emails)
- **Pages** — web app

OAuth 2.1 + Dynamic Client Registration via [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider). Drizzle ORM with SQLite dialect. TypeScript end to end. Hono is web-standards, so the API code is portable to any web-standards runtime if we ever need to leave Cloudflare.

Web app on Cloudflare Pages for v1 (Next.js via `@cloudflare/next-on-pages`). If Pages limitations bite, the web app can pull out to Vercel without affecting the Worker, D1, DOs, or R2 — see [ARCHITECTURE.md §16](./ARCHITECTURE.md) for migration paths.

## Contributing

Two paths in, both first-class:

### Propose a requirement (no code required)

Anyone can propose a new requirement, doc, or fix without writing code:

1. Fork this repo
2. Add a file under `blitzlist/items/BW-XXX-your-slug.md` (use `XXX` as a placeholder; the sync engine assigns the real ID on merge)
3. Open a PR
4. Maintainers review like any code change

See [blitzlist/README.md](./blitzlist/README.md) for the file format and conventions.

### Write code

Pick any item in `blitzlist/items/` labeled `state: draft` or `state: proposed` and open a PR implementing it. The item's acceptance criteria are the test plan.

For larger contributions or architectural questions, open a GitHub Discussion first.

### Community plugins

Blitzlist exposes a stable plugin API (see [ARCHITECTURE.md §17](./ARCHITECTURE.md)) for community-built integrations — Dropbox-style local-sync clients, Slack bridges, Figma extensions, IDE plugins. We define the API and conformance tests; you build the integration. n8n's community-nodes model applied to the workspace category.

## Read more

| Document | What's in it |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full technical design — data model, MCP tool surface, auth, deployment, real-time, migration paths |
| [PITCHES.md](./PITCHES.md) | Canonical positioning, three elevator pitches, taglines, hero copy — for landing pages, decks, social |
| [blitzlist/README.md](./blitzlist/README.md) | The bootstrap convention — how the public backlog directory works |
| [blitzlist/SYNC.md](./blitzlist/SYNC.md) | Bidirectional sync protocol between the repo and the live MCP server |
| [blitzlist/items/](./blitzlist/items/) | The live backlog — every requirement, sprint by sprint |

## Roadmap

| Phase | Scope | Timeframe |
|---|---|---|
| **v0.1 — Single-user spike** | Hono Worker + D1 schema + 5 core MCP tools, no auth, no web UI. Validate the capture-while-coding loop. | 1 week |
| **v0.5 — Multi-user beta + the wedge** | OAuth + stakeholder access keys + share codes; documents + files (Blitzbox surface); the Compass; bidirectional repo sync; one-click Cloudflare deploy | 4-5 weeks |
| **v1.0 — Production** | GitHub auto-state, release notes generator, R2 attachment UI, billing, templates ecosystem, Backlog.md interop | 6-8 weeks |
| **v1.5+** | Blitzbox as standalone landing page, Slack/SSO, local-sync community clients, public roadmap themes |
| **v2.0+** | Claim the shared-workspace category: rich view types, workflow automation, inline databases in docs, whiteboard, unified inbox |

## License

Blitzlist is licensed under the [**GNU Affero General Public License v3.0**](./LICENSE) (AGPL-3.0).

What this means in practice:

- **Self-host freely.** Run Blitzlist for yourself, your team, or your company — no fees, no restrictions, full access to the code.
- **Modify and contribute.** Fork it, change it, send PRs. Modifications to the codebase are welcome under AGPL-3.0.
- **If you offer Blitzlist as a hosted service to others**, you must publish your modifications under AGPL-3.0 too. This is the network-copyleft trigger that keeps the ecosystem honest.

### Commercial licensing

If your organization can't use AGPL-3.0 software (some enterprises have blanket policies), a **commercial license** is available — same code, different terms tailored to your compliance needs. Contact us via [GitHub Discussions](https://github.com/ai-fy/Blitzlist/discussions) or once we ship a contact page on blitzlist.ai.

### Contributing

By contributing code, you agree to the terms in our [Contributor License Agreement](./CONTRIBUTING.md#contributor-license-agreement). The CLA is signed once per contributor via [CLA Assistant](https://cla-assistant.io/) when you open your first PR — it takes about 30 seconds. The CLA preserves the project's ability to offer commercial licensing and to evolve the license if the project's needs change in the future.

The bootstrap convention (the `blitzlist/` directory file format) is documented in [`blitzlist/README.md`](./blitzlist/README.md) and is intended as a community convention that any project can adopt freely — independent of Blitzlist's own AGPL-3.0 licensing.

## Project values

- **AI-first, not AI-retrofitted.** Every primitive is designed to be accessed equally by humans and agents through MCP. We don't bolt intelligence onto a UI built for browser tabs.
- **Honest about competitors.** Linear, Notion, Backlog.md, Plane — each is excellent at part of what Blitzlist does. Our wedge is the synthesis plus the AI-first foundation, not a feature war.
- **Open-source + self-hostable.** The community is the moat. Hosted at blitzlist.ai for those who want managed; self-hostable on Cloudflare for those who want control.
- **Standards we build on:** Markdown (CommonMark + GFM), YAML, JSON Schema, Mermaid, MCP, OAuth 2.1 + DCR, OpenAPI, Conventional Commits, Semver, and round-trip interop with [Backlog.md](https://github.com/MrLesk/Backlog.md).

---

The productivity stack was built before AI existed.

Lists drove every era of human work. The AI era was missing theirs.

**But not anymore.**
