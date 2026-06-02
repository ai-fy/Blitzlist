# Sync protocol: `blitzlist/` ↔ MCP server

This document specifies how the markdown/YAML files in `blitzlist/` stay in sync with the live MCP server's D1 database.

---

## The two phases

### Phase A — Pre-MCP (repo only)

While we're bootstrapping Blitzlist, no MCP server exists yet. The repo IS the backlog. All changes happen via PR. No sync runs.

This phase ends when [BL-005] (MCP server skeleton) ships and a workspace is provisioned for the Blitzlist project itself.

### Phase B — Post-MCP (bidirectional)

Once the MCP server is running, the repo and the MCP database both hold the backlog, with continuous sync:

```
   PR merged to main                 Claude Code calls MCP tool
           │                                    │
           ▼                                    ▼
   GitHub webhook                       Worker writes to D1
           │                                    │
           ▼                                    ▼
   Sync engine pulls,             Periodic exporter notices
   applies to D1                  drift, opens PR with changes
           │                                    │
           ▼                                    ▼
   D1 updated                           PR auto-merges
                                        (or stays open if conflict)
```

The repo is **eventually consistent** with the MCP database. The repo is the canonical store for audit/history; the MCP database is the live cache.

---

## Sync engine components

| Component | Where it runs | Trigger | Responsibility |
|---|---|---|---|
| **Importer** | Cloudflare Worker | GitHub webhook on push to `main` | Apply repo diffs → D1 |
| **Exporter** | Cloudflare Worker (cron-triggered) | Every 5 minutes | Detect D1 changes → open PR with file updates |
| **GitHub App** | github.com | Installed per repo | Authenticates webhook delivery + push access |
| **Conflict detector** | Inside both importer and exporter | Every sync | Compare hashes, flag divergence |

The GitHub App (`blitzlist-sync`) is installed on each repo that wants to sync. It also handles the PR-auto-state webhooks (§7 of ARCHITECTURE.md) — same app, two jobs.

---

## Change detection: hashes and versions

Every item carries two sync-related fields:

```yaml
sync:
  version: 7              # incremented on every edit (either side)
  content_hash: "sha256:abc123…"   # hash of (front-matter without sync block) + body
```

And every workspace has a `.sync/index.json` committed to the repo:

```json
{
  "BL-001": {
    "mcp_id": "uuid-…",                  // server-side primary key
    "last_synced_hash": "sha256:abc123…", // hash at last successful sync
    "last_synced_at": "2026-05-27T14:00:00Z",
    "last_synced_commit": "a1b2c3d…"      // git commit when last synced
  },
  ...
}
```

This ledger lets us compute deltas without re-reading every file.

---

## Importer flow (repo → MCP)

Triggered by GitHub webhook on push to `main` in any branch the GitHub App watches.

```
1. Webhook arrives at Worker with the commit range (before..after).
2. Worker fetches the changed files in blitzlist/ via the GitHub API
   (using the installation token).
3. For each changed item file:
   a. Parse front-matter + body.
   b. Compute current_hash = sha256(canonical_form(item)).
   c. Look up entry in .sync/index.json:
       - If missing → new item. Create in D1. Assign mcp_id. Append to index.
       - If present:
         - Fetch the MCP item by mcp_id.
         - Compare:
             repo_changed = (current_hash ≠ last_synced_hash)
             mcp_changed  = (mcp.version > index.last_synced_version)
           - repo_changed only          → apply repo's version to MCP, update index.
           - mcp_changed only           → no-op (the exporter will catch this).
           - both changed → CONFLICT  → see "Conflict resolution" below.
4. For each deleted file → soft-delete the item in MCP (state="rejected", retain row).
5. Commit updates to .sync/index.json in a follow-up commit:
   "[blitzlist-sync] update sync ledger after a1b2c3d".
```

---

## Exporter flow (MCP → repo)

Cron-triggered every 5 minutes. Also triggerable on demand from the web UI ("Sync now").

```
1. Query D1 for items where updated_at > workspace.last_exported_at.
2. For each modified item:
   a. Render canonical Markdown file with current front-matter + body.
   b. Compute new content_hash.
   c. Compare against .sync/index.json:
       - If repo's last_synced_hash matches MCP's previous hash → safe update.
       - If repo's last_synced_hash differs → repo has unsynced changes.
         Don't overwrite. Mark for conflict.
3. Create a new branch: blitzlist-sync/<timestamp>.
4. Write the safe updates to that branch.
5. Open a PR titled "blitzlist: sync MCP → repo (N items)".
6. CI runs: schema validation, lint, tests.
7. If green AND no conflicts in the PR → auto-merge.
8. If there are conflicts → leave PR open, label `sync-conflict`, notify maintainers.
9. After merge, update workspace.last_exported_at.
```

The Worker has push access via the GitHub App's installation token; no PATs.

---

## Conflict resolution

A conflict means: between the last successful sync and now, the **same item** was edited on **both sides**.

In practice, this should be rare because:
- Claude Code users edit via MCP
- Human contributors edit via PR
- Same item edited from both sides simultaneously is uncommon

When it happens:

### Detection

Both sides changed since `last_synced_hash`. The importer or exporter detects it and refuses to auto-apply.

### Resolution flow

```
1. Sync engine opens (or comments on) a PR titled
     "blitzlist: CONFLICT on BL-NNN (manual resolution needed)"
2. The PR body contains a 3-way merge view:
     - base:    the last synced version (from index ledger)
     - ours:    the current repo version
     - theirs:  the current MCP version
3. The PR shows the diff between ours/theirs with conflict markers
   inside the affected fields.
4. A maintainer:
     a. Picks one side, OR
     b. Hand-merges in the PR.
5. On merge, the importer applies the merged version to MCP and
   updates the ledger. Conflict closed.
```

### Conflict-prone fields

These trigger conflict detection on edit:
- `title`, `body`, `state`, `priority`, `assignee`, `parent`
- Any `fields.*`
- `relations.*` (any change to outgoing relations)
- `groups` membership

These are **last-write-wins**, never conflict:
- `updated_at` (timestamp)
- `sync.version` (counter)
- `attachments` (rarely edited from both sides; treated as union)

### Never overwriting human PR work

If a PR is open against a file when the exporter wants to write to that file, the exporter waits. The PR's merge is the trigger for the next sync attempt.

---

## What stays in git only

- The `blitzlist/` directory itself (file format, conventions)
- `.sync/index.json` (sync ledger)
- This `SYNC.md` and `README.md`

What stays in MCP only (not exported to repo):
- `activity_log` entries (mostly noise for git history)
- `comments` (large volume; could pollute git; **subject to a future decision** — see Open questions below)
- `oauth_*` tables
- Ephemeral state (sessions, KV entries)

---

## CI / pre-commit checks

On every PR touching `blitzlist/`:

```
- blitzlist:schema     → validate item/list/group front-matter against JSON Schema
- blitzlist:integrity  → check that all referenced IDs (groups, parent, relations) exist
- blitzlist:filenames  → check that filenames match BL-NNN-slug.md pattern
- blitzlist:duplicates → no two items share an ID
```

These run on every PR via GitHub Actions and as a local pre-commit hook.

---

## Open questions

1. **Comments**: should comment threads be exported to git? Pros: full audit. Cons: noisy diffs, large files. *Current recommendation: don't export to git for v1. Revisit if community asks.*

2. **Activity log**: same question. *Current recommendation: don't export.*

3. **Sync frequency**: 5 minutes feels right but might want shorter (1 min) for active sprints, longer (1 hour) for archived workspaces. *Make configurable in `config.yaml`.*

4. **Trust model for self-hosters**: should the official `blitzlist.ai` MCP be able to push to user repos? Only via GitHub App with explicit installation. User-controlled.

5. **Initial import**: when a workspace first connects to a repo with existing `blitzlist/` files, do we bulk-import or require a one-time `blitzlist init`? *Recommendation: explicit `blitzlist init` to make the operation clear.*

---

## Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| GitHub webhook delivery fails | Importer misses a push | Cron-based catch-up every hour: scan recent commits for missed work |
| Cloudflare Worker down | Importer/exporter both halt | Resumes from last commit/last_exported_at on recovery |
| GitHub App revoked | Sync stops for that repo | Re-install app; resume from last ledger entry |
| `.sync/index.json` corrupted | Sync engine can't compute deltas | `blitzlist rebuild-ledger` regenerates from scratch by hashing all current files |
| Conflict ignored for weeks | Repo and MCP drift | Sync PR stays open; new conflicts pile on; eventually a maintainer must resolve |

The ledger being committed (not gitignored) means recovery is reliable: any clone of the repo has the full sync state.
