-- Expression indexes on items.custom_fields_json
--
-- These can't currently be expressed cleanly via Drizzle's SQLite emitter
-- (it backtick-wraps the SQL fragment and breaks the syntax), so they
-- live as a raw-SQL migration. See packages/db/src/schema.ts for the note.
--
-- Per ARCHITECTURE.md §3:
--   - priority: hot for the `backlog` template
--   - due_date: hot for the `todos` template
--   - severity: hot for the `bugs` template
--
-- Workspaces can add more expression indexes for their own custom metrics
-- (the Compass relies on this pattern). Each new index is one more migration.

CREATE INDEX idx_items_priority
  ON items (json_extract(custom_fields_json, '$.priority'));

CREATE INDEX idx_items_due_date
  ON items (json_extract(custom_fields_json, '$.due_date'));

CREATE INDEX idx_items_severity
  ON items (json_extract(custom_fields_json, '$.severity'));
