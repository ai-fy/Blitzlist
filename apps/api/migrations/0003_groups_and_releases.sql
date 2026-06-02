-- BL-010: groups + releases.
--
-- `groups` is the many-to-many "bucket" primitive: sprints, milestones, epics,
-- labels, and releases all live in this one table, discriminated by `type`.
-- Items join groups via `item_groups`. Releases are the signature type — they
-- carry `meta_json.version`, `meta_json.ship_target`, and at close time the
-- delivered/slipped/cut breakdown.
--
-- A separate `items.promised_in` column links an item to ONE release group
-- (the commitment column). This is intentionally orthogonal to general group
-- membership: an item can belong to many sprints/epics/labels through
-- item_groups AND have exactly one `promised_in` release. The commitment
-- ledger story (the headline wedge) needs a single first-class promise field,
-- not yet-another tag.

CREATE TABLE groups (
  id TEXT PRIMARY KEY,                              -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                               -- e.g. "v0.5", "sprint-3", "auth-epic"
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('sprint','milestone','epic','label','release')),
  -- For releases: { version, ship_target (ISO date), public_url_slug?, description?,
  --                 closed_at?, breakdown? { delivered: [], slipped: [], cut: [] } }.
  -- For sprints/milestones: { start_date?, end_date? }.
  -- For epics/labels: free-form.
  meta_json TEXT NOT NULL DEFAULT '{}',
  archived INTEGER NOT NULL DEFAULT 0,              -- bool
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(workspace_id, slug)
);

CREATE INDEX idx_groups_workspace_type ON groups (workspace_id, type);
CREATE INDEX idx_groups_workspace_archived ON groups (workspace_id, archived);

CREATE TABLE item_groups (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (item_id, group_id)
);

CREATE INDEX idx_item_groups_group ON item_groups (group_id);

-- The first-class commitment column. Nullable; references a groups.id whose
-- type is 'release'. Enforcement of type='release' happens at the tool layer
-- (the SQL FK alone can't enforce that; an arbitrary group could be referenced).
ALTER TABLE items ADD COLUMN promised_in TEXT REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX idx_items_promised_in
  ON items (workspace_id, promised_in)
  WHERE promised_in IS NOT NULL;
