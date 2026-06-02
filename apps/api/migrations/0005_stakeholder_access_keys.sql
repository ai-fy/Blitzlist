-- BL-011: stakeholder access keys.
--
-- Lightweight auth for the third audience — stakeholders connecting their own
-- AI assistant to the MCP server via a pre-issued bearer key. No OAuth, no
-- account. Scoped to a subset of the workspace (typically one or more lists).
--
-- Key format:
--   blz_sk_<32-char-base32>     ~160 bits of entropy
--
-- Storage:
--   key_hash = sha256(raw_key) hex-encoded (64 chars). Lookup-friendly.
--   No bcrypt — keys are server-generated high-entropy tokens, not user
--   passwords. SHA-256 is the right hash for this threat model.

CREATE TABLE stakeholder_access_keys (
  id TEXT PRIMARY KEY,                                            -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,                                  -- sha256(raw_key) hex
  prefix TEXT NOT NULL,                                           -- display: "blz_sk_xxxx"

  label TEXT NOT NULL,                                            -- "ACME Q2 review", etc.

  -- { type: "workspace" }                              -> entire workspace, read-only
  -- { type: "list", list_slug: "v0.5" }                -> items in this list
  -- { type: "lists", list_slugs: ["v0.5", "q3-prd"] }  -> items in any of these lists
  scope_json TEXT NOT NULL,

  -- JSON array of grant strings. v0.5 supports "read" and "comment".
  -- "approve" and "vote" land later.
  permissions_json TEXT NOT NULL DEFAULT '["read","comment"]',

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER,                                             -- unix seconds, nullable
  revoked_at INTEGER,                                             -- unix seconds, nullable (soft delete)
  last_used_at INTEGER,                                           -- unix seconds, nullable
  use_count INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_stakeholder_keys_workspace
  ON stakeholder_access_keys (workspace_id);

CREATE INDEX idx_stakeholder_keys_active
  ON stakeholder_access_keys (workspace_id, created_at)
  WHERE revoked_at IS NULL;
