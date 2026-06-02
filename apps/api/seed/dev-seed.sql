-- Dev seed for v0.1.
--
-- Inserts the Blitzlist workspace itself + a backlog list with the canonical
-- states and fields from the `backlog` template + one test user + one test item
-- with custom JSON fields. Used for local dev / sanity-check round-trip.
--
-- Apply locally:
--   pnpm wrangler d1 execute blitzlist-dev --local --file=seed/dev-seed.sql
--
-- Idempotent: uses INSERT OR REPLACE so re-running is safe.

-- The Blitzlist workspace (dog-fooding ourselves)
INSERT OR REPLACE INTO workspaces (id, slug, name, id_prefix, item_counter, created_at, updated_at)
VALUES (
  'ws-blitzlist',
  'blitzlist',
  'Blitzlist',
  'BL',
  3,
  unixepoch(),
  unixepoch()
);

-- One dev user (Malte)
INSERT OR REPLACE INTO users (id, email, display_name, created_at, updated_at)
VALUES (
  'usr-malte',
  'malte@blitzlist.ai',
  'Malte',
  unixepoch(),
  unixepoch()
);

-- Membership: Malte as owner of Blitzlist workspace
INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role, joined_at)
VALUES ('ws-blitzlist', 'usr-malte', 'owner', unixepoch());

-- The Backlog list (canonical states + fields from the `backlog` template,
-- ARCHITECTURE.md §3)
INSERT OR REPLACE INTO lists (
  id, workspace_id, slug, name, description, template_id,
  states_json, fields_json, default_view, color, icon, archived,
  created_by, created_at, updated_at
) VALUES (
  'list-backlog',
  'ws-blitzlist',
  'backlog',
  'Product backlog',
  'The main backlog for building Blitzlist itself.',
  'backlog',
  '{"states":["draft","proposed","approved","in_progress","in_review","done","shipped","rejected"],"default":"draft","terminal":["done","shipped","rejected"]}',
  '[{"key":"priority","type":"enum","options":["p0","p1","p2","p3"],"required":true},{"key":"estimate","type":"string","required":false},{"key":"pr_url","type":"url","required":false}]',
  'table',
  '#FF6B35',
  'backlog',
  0,
  'usr-malte',
  unixepoch(),
  unixepoch()
);

-- One test item with rich custom_fields JSON — exercises the
-- json_extract() expression indexes (priority on this one).
INSERT OR REPLACE INTO items (
  id, list_id, workspace_id, title, body, state,
  parent_id, position, assignee_id, author_id,
  custom_fields_json, created_at, updated_at
) VALUES (
  'BL-001',
  'list-backlog',
  'ws-blitzlist',
  'Set up the blitzlist/ directory and conventions',
  'Bootstrap step that lets us dog-food Blitzlist from day one.',
  'done',
  NULL,
  0,
  'usr-malte',
  'usr-malte',
  '{"priority":"p0","estimate":"1d","pr_url":null}',
  unixepoch(),
  unixepoch()
);

-- One activity entry to prove the audit log works
INSERT OR REPLACE INTO activity_log (
  id, workspace_id, item_id, actor_id, action, details_json, created_at
) VALUES (
  'act-001',
  'ws-blitzlist',
  'BL-001',
  'usr-malte',
  'item.state_changed',
  '{"from":"in_progress","to":"done"}',
  unixepoch()
);
