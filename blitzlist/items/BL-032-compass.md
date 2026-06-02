---
id: BL-032
title: Compass — multi-dimensional 3D focus view with AI scoring
slug: compass
list: backlog
state: draft
groups:
  - sprint-002-beta
  - epic-web-ui
  - epic-commitment-ledger
author: malte
assignee: null
parent: null
fields:
  priority: p0
  estimate: 7d
  pr_url: null
relations:
  - label: relates_to
    target: BL-025
  - label: relates_to
    target: BL-031
attachments:
  - kind: url
    url: ../../ARCHITECTURE.md
    title: ARCHITECTURE.md §3 (The Compass), §4 (Compass tools), §6 (workspace home)
sync:
  version: 1
  content_hash: null
created_at: 2026-05-29T11:00:00Z
updated_at: 2026-05-29T11:00:00Z
---

# Compass — multi-dimensional 3D focus view with AI scoring

## Description

The Compass is the signature view that distinguishes Blitzlist from every
other PM/workspace tool. A 3D animated scene where items are spheres
positioned in priority space (X=urgency, Y=importance, Z=focus_score),
sized by effort, colored by risk, animated by uncertainty.

The same scoring data is exposed via MCP so AI agents calling `get_focus()`
arrive at the same top-N items as the human looking at the screen. **Shared
situational awareness.**

Replaces the "wall of lists" workspace landing with a scene that says
*"these three glowing spheres are what matters."*

## Acceptance criteria

### Data model

- [ ] `item_scores` table with `metrics_json` (free-form metric keys → 0.0-1.0 values)
- [ ] `lists.compass_config_json` column with default per-template mappings
- [ ] Drizzle migration applies cleanly
- [ ] Foreign keys + cascade-delete when items are removed

### Visual slots (fixed in code, with declared types)

- [ ] `VISUAL_SLOTS` registry in `packages/core/compass/slots.ts` with eleven slots: `x_axis`, `y_axis`, `z_axis`, `size`, `color` (dual-mode), `pulse`, `glow`, `rotation` (continuous); `shape`, `pattern`, `border` (discrete)
- [ ] Each slot declares `type` (`continuous` | `discrete` | `either`) and `range` or `options`
- [ ] `shape` options for v0.5: `["sphere", "cube", "cylinder", "star", "cone"]`
- [ ] `pattern` options: `["solid", "dotted", "striped", "wireframe"]`
- [ ] `border` options: `["solid", "dashed", "dotted", "double", "none"]`
- [ ] Slot rendering degrades gracefully if a slot has no metric mapped (uses workspace default)

### Type system for metric → slot bridging

- [ ] Metrics declare `type`: `continuous` | `enum` | `enum_ordered`
- [ ] `set_compass_config` validates every mapping for type compatibility
- [ ] Case 1 (continuous → continuous): direct linear interpolation, no bridge config needed
- [ ] Case 2 (enum → discrete): requires `value_map` covering all enum values; targets must be valid slot options; no duplicate targets unless `allow_overlap: true`
- [ ] Case 3 (enum → continuous): auto-bridge for `enum_ordered` (evenly spaced 0.0-1.0); explicit `value_map` required for unordered enums; explicit `value_map` may override auto-bridge for non-linear positioning
- [ ] Case 4 (continuous → discrete): requires `buckets` covering `[0, 1]` continuously, no gaps or overlaps
- [ ] Validation returns structured errors with a `suggestion` field for common gaps
- [ ] Validation runs at config-save time, not at render time
- [ ] `color` slot operates in either mode: continuous (gradient) OR discrete (palette) based on bound metric's type

### Standard metrics (pre-registered in workspace)

- [ ] Six standard metrics ship registered: `importance`, `urgency`, `effort`, `risk`, `uncertainty`, `change_frequency`
- [ ] Any custom field of type `enum` or `number` is auto-promoted to a metric
- [ ] `list_metrics` MCP tool returns all metrics available for a list

### Per-template compass_config defaults

- [ ] `backlog` template default config (urgency / importance / focus_score / effort / risk / uncertainty)
- [ ] `bugs` template default config (age / severity / customer_impact / report_count / regression_risk / reproducibility)
- [ ] `ideas` template default config (feasibility / potential_value / freshness / team_excitement / novelty)
- [ ] `todos` template default config (urgency / importance / 1-day-rollup / effort / risk / -)

### Scoring engine

- [ ] Three-layer resolution: explicit field → derived → AI-inferred
- [ ] Derived sources implemented for the six standard metrics
- [ ] AI scoring via Claude API (server-side, batched, cached) for metrics without an explicit/derived source
- [ ] Score refresh triggers: item create, item edit (debounced), nightly Cloudflare Cron for workspace-wide refresh
- [ ] `reasoning_json` populated per-metric for AI-scored values
- [ ] Budget guard: configurable Claude API spend cap per workspace

### MCP tools (7)

- [ ] `get_focus({list?, group?, executor?, sort_by?, limit?})` — `sort_by` defaults to list's z_axis metric
- [ ] `score_item({item_id, metrics?})`
- [ ] `get_compass_config({list_id})`
- [ ] `set_compass_config({list_id, config})`
- [ ] `list_metrics({list_id?})`
- [ ] `get_compass_snapshot({format?: "json"|"svg"|"three"})`
- [ ] `explain_score({item_id, metric_key?})`

### Web UI — 3D mode (desktop)

- [ ] Three.js + React Three Fiber renders scene at `/w/[slug]`
- [ ] Renderer reads the active list's `compass_config` to drive visual slots
- [ ] 60 fps for ≤200 items; degrade smoothly to 30 fps at 500+
- [ ] OrbitControls (drag to rotate, scroll to zoom)
- [ ] Postprocessing pipeline: glow/bloom effects
- [ ] Visual slots render per the per-list config (not hardcoded)
- [ ] Slot legend visible on hover (which metric drives which encoding)
- [ ] Click a sphere → open that item (zoom-into-drill-down per BL-031)
- [ ] Hover → tooltip with item title + key fields
- [ ] Filter controls (which lists, which groups, scope)
- [ ] Compass-config editor accessible from the Compass UI (drag-drop metric → slot)

### Web UI — 2D mode (mobile + accessibility)

- [ ] Flat scatter plot with same encodings (no Z, no animation)
- [ ] Default for `prefers-reduced-motion`, mobile viewports, screen readers
- [ ] User can toggle 2D mode in preferences regardless of device

### Public-roadmap integration

- [ ] `/r/[workspace]` optionally renders public release plan as a Compass
      (owner setting); read-only, no filters

### Configuration

- [ ] Workspace owner can adjust dimension weights via UI or MCP tool
- [ ] User can toggle which encodings are active (default: X/Y/size/color;
      optional: pulse, glow, lines)

### Validation + tests

- [ ] Schema validation on dimension scores (must be 0.0-1.0)
- [ ] Unit tests on score derivation logic
- [ ] Integration test: create 50 items, verify focus_score ordering matches
      hand-computed expected order
- [ ] Visual regression test on the 2D Compass rendering

## Notes

**The "screensaver problem" risk.** A beautiful 3D scene that doesn't drive
decisions is a failure. Bar: a builder opens the workspace, looks at the
Compass for 5 seconds, knows which item to work on next. Test this with
real builders before locking the visual design.

**AI scoring cost guardrails.** Claude API calls × items × refreshes can
get expensive. Mitigations:
- Nightly batch (not real-time) for AI dimensions
- Cache aggressively; only re-score when item content changes
- Per-workspace spend cap with admin alerts
- Allow disabling AI dimensions (workspace falls back to derived-only)

## Open questions

- Should the AI scoring also propose dimension *thresholds* (e.g., "items with
  risk > 0.7 need approval")? *v0.5: no. v1.0 if users ask for it.*
- Animation preferences for accessibility — should we ship a "no pulse" mode
  even on desktop? *Yes — `prefers-reduced-motion` always wins.*
- VR mode? *Defer indefinitely; cute but not on the critical path.*
