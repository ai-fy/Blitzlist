-- BL-023: agent tokens.
--
-- Static bearer credentials for HEADLESS agents (e.g. Hermes) that need
-- create/edit/share access without the interactive OAuth flow.
--
-- Distinct from stakeholder_access_keys:
--   - Stakeholder keys are external + scoped + mostly read (served at /s/mcp).
--   - Agent tokens act AS the workspace (resolve to the minting owner's
--     context) with a create/edit/share tool subset — NO admin tools
--     (can't mint/revoke other keys). Served at /a/mcp.
--
-- Token format:
--   blz_at_<32-char-base32>     ~160 bits of entropy
--
-- Storage: token_hash = sha256(raw) hex. SHA-256 (the token IS the secret;
-- same rationale as stakeholder keys).

CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY,                                            -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,                                -- sha256(raw) hex
  prefix TEXT NOT NULL,                                           -- display: "blz_at_xxxx"

  label TEXT NOT NULL,                                            -- "Hermes agent", etc.

  -- The owner who minted this token. Agent actions resolve to this user's
  -- workspace + identity, so activity is attributed to them.
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  expires_at INTEGER,                                             -- unix seconds, nullable
  revoked_at INTEGER,                                             -- unix seconds, nullable (soft delete)
  last_used_at INTEGER,                                           -- unix seconds, nullable
  use_count INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_agent_tokens_workspace
  ON agent_tokens (workspace_id);

CREATE INDEX idx_agent_tokens_active
  ON agent_tokens (workspace_id, created_at)
  WHERE revoked_at IS NULL;
