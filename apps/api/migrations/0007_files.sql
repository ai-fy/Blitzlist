-- BL-021: files primitive.
--
-- Binary artifacts (images, PDFs, PPT, audio, video, exports) stored in R2,
-- organized by virtual folder_path (no real folder objects). Each upload
-- creates a new file_versions row; files.current_version_id points at the
-- live version. Soft-delete via revoked_at gives a 30-day restore window.
--
-- R2 keys are sha256-prefixed to deduplicate identical content across uploads;
-- the same bytes uploaded twice land in the same R2 object but get two
-- file_versions rows (provenance preserved).

CREATE TABLE files (
  id TEXT PRIMARY KEY,                                            -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                             -- display name (e.g. "deck.pptx")
  folder_path TEXT NOT NULL DEFAULT '/',                          -- virtual folder, "/" = root
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,                                    -- denormalized from current version
  current_version_id TEXT,                                        -- FK to file_versions; set after first version inserts
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at INTEGER,                                             -- soft delete; restore window 30d
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_files_workspace ON files (workspace_id);
CREATE INDEX idx_files_workspace_folder ON files (workspace_id, folder_path);
CREATE INDEX idx_files_workspace_active ON files (workspace_id, created_at)
  WHERE revoked_at IS NULL;

-- file_versions: append-only history. R2 key includes content sha256 hex so
-- identical content dedups at the storage layer.
CREATE TABLE file_versions (
  id TEXT PRIMARY KEY,                                            -- uuid
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,                                       -- monotonic per file_id (1, 2, 3, ...)
  r2_key TEXT NOT NULL,                                           -- "files/{workspace_id}/{sha256}"
  sha256_hex TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,                                                      -- optional version note
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_file_versions_file ON file_versions (file_id, version DESC);
CREATE UNIQUE INDEX idx_file_versions_file_version ON file_versions (file_id, version);
