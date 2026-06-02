-- BL-030: share codes.
--
-- Google-Drive-style "anyone with the link." 4 EFF-style diceware words in
-- the URL, hyphen-separated (e.g. cherry-mountain-pencil-tango). The URL path
-- IS the credential — no separate bearer header. ~48 bits of entropy from a
-- ~1024-word list (10 bits × 4 + a little bookkeeping).
--
-- Distinct from stakeholder_access_keys: codes are anonymous-by-design and
-- typically broadcast to many viewers; stakeholder keys are per-person with
-- per-call audit. Same scope shape (workspace | list | lists) and same scope
-- enforcement at the tool layer.

CREATE TABLE share_codes (
  code TEXT PRIMARY KEY,                                          -- the 4-word code itself
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  label TEXT NOT NULL,                                            -- "v0.5 public roadmap", etc.

  -- Same scope shape as stakeholder_access_keys.scope_json:
  --   { type: "workspace" }
  --   { type: "list", list_slug: "v0.5" }
  --   { type: "lists", list_slugs: ["v0.5","prd"] }
  scope_json TEXT NOT NULL,

  -- ["read"] default. ["read","comment"] gives anonymous commenters.
  -- "approve"/"vote" deferred until BL-013 web UI.
  permissions_json TEXT NOT NULL DEFAULT '["read"]',

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER,                                             -- unix seconds, nullable (default 30d at create time)
  revoked_at INTEGER,                                             -- unix seconds, nullable (soft delete)
  last_used_at INTEGER,                                           -- unix seconds, nullable
  use_count INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_share_codes_workspace
  ON share_codes (workspace_id);

CREATE INDEX idx_share_codes_active
  ON share_codes (workspace_id, created_at)
  WHERE revoked_at IS NULL;
