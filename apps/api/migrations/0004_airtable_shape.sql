-- BL-035: Airtable-shaped data model.
--
-- The current schema is Linear-shaped — items in one list, list owns state.
-- Reshape to: templates own schemas, lists are universal containers,
-- items carry typed fields, items↔lists is many-to-many with per-list position.
--
-- DESTRUCTIVE: drops spike data (items, comments, activity, groups). No
-- production users — safe at this stage. Workspaces + users + invite_codes
-- + members preserved.
--
-- Order of operations matters: D1 wraps the whole file in an implicit
-- transaction-ish unit, but SQLite ALTER TABLE has constraints. We use the
-- 12-step "drop and recreate" approach for items and lists.

-- =============================================================================
-- Step 1: drop dependent data first (FK cascades would handle it, but explicit
-- is cleaner — and we want to start with a known-empty data plane).
-- =============================================================================

DELETE FROM activity_log;
DELETE FROM comments;
DELETE FROM item_groups;
DELETE FROM items;
DELETE FROM groups;
DELETE FROM lists;

-- Reset the item counter so new IDs start at BL-001 again.
UPDATE workspaces SET item_counter = 0;

-- =============================================================================
-- Step 2: drop legacy tables that go away.
-- =============================================================================

DROP INDEX IF EXISTS idx_item_groups_group;
DROP TABLE IF EXISTS item_groups;

DROP INDEX IF EXISTS idx_groups_workspace_type;
DROP INDEX IF EXISTS idx_groups_workspace_archived;
DROP TABLE IF EXISTS groups;

-- =============================================================================
-- Step 3: create templates table — the schema authority.
-- =============================================================================

CREATE TABLE templates (
  id TEXT PRIMARY KEY,                                          -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                                           -- e.g. "backlog", "shopping"
  name TEXT NOT NULL,
  description TEXT,

  -- Array of field definitions. Each field:
  -- { key, type, label?, options?, terminal?, required?, default?, ... }
  -- Field types: text, long_text, number, date, single_select, multi_select,
  --              checkbox, url, user, link_to_item, attachment, formula (v1.0)
  fields_schema_json TEXT NOT NULL DEFAULT '[]',

  default_view TEXT NOT NULL DEFAULT 'table'
    CHECK (default_view IN ('table','kanban','calendar','compass')),

  is_system INTEGER NOT NULL DEFAULT 0,                         -- bool

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(workspace_id, slug)
);

CREATE INDEX idx_templates_workspace ON templates (workspace_id);

-- =============================================================================
-- Step 4: rebuild `lists` table — universal container, optional template_id FK.
-- =============================================================================

DROP INDEX IF EXISTS idx_lists_workspace;
DROP TABLE IF EXISTS lists;

CREATE TABLE lists (
  id TEXT PRIMARY KEY,                                          -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,

  -- List-level free-form metadata: target_date, closed_at, breakdown,
  -- start_date, end_date, picnic_date, etc. Per-list-template convention.
  meta_json TEXT NOT NULL DEFAULT '{}',

  tags_json TEXT NOT NULL DEFAULT '[]',                         -- free-form tags

  archived INTEGER NOT NULL DEFAULT 0,                          -- bool
  color TEXT,
  icon TEXT,

  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(workspace_id, slug)
);

CREATE INDEX idx_lists_workspace_slug ON lists (workspace_id, slug);
CREATE INDEX idx_lists_workspace_archived ON lists (workspace_id, archived);
CREATE INDEX idx_lists_template ON lists (template_id);

-- =============================================================================
-- Step 5: rebuild `items` table — flexible fields, no list_id, no position.
-- =============================================================================

DROP INDEX IF EXISTS idx_items_list;
DROP INDEX IF EXISTS idx_items_workspace;
DROP INDEX IF EXISTS idx_items_state;
DROP INDEX IF EXISTS idx_items_assignee;
DROP INDEX IF EXISTS idx_items_parent;
DROP INDEX IF EXISTS idx_items_priority;
DROP INDEX IF EXISTS idx_items_due_date;
DROP INDEX IF EXISTS idx_items_severity;
DROP INDEX IF EXISTS idx_items_executor;
DROP INDEX IF EXISTS idx_items_promised_in;
DROP TABLE IF EXISTS items;

CREATE TABLE items (
  id TEXT PRIMARY KEY,                                          -- "BL-NNN"
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',

  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,

  -- Typed values keyed by template field keys: state, dates, responsible_id,
  -- accountable_id, custom fields. Validated against the item's template
  -- at the tool layer.
  fields_json TEXT NOT NULL DEFAULT '{}',

  parent_id TEXT,                                               -- hierarchy (BL-031)

  -- First-class operational/routing concept. Format:
  --   human:<uid> | agent:claude | agent:<name> | self | contractor:<label>
  executor TEXT,

  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,       -- immutable audit

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_items_workspace ON items (workspace_id);
CREATE INDEX idx_items_template ON items (template_id);
CREATE INDEX idx_items_parent ON items (parent_id);
CREATE INDEX idx_items_executor ON items (workspace_id, executor) WHERE executor IS NOT NULL;

-- Common field-extraction indexes (replaces idx_items_priority/due_date/severity
-- which were against custom_fields_json). New fields live in fields_json now.
CREATE INDEX idx_items_state ON items (workspace_id, json_extract(fields_json, '$.state'));
CREATE INDEX idx_items_due_date ON items (json_extract(fields_json, '$.due_date'));
CREATE INDEX idx_items_priority ON items (json_extract(fields_json, '$.priority'));

-- =============================================================================
-- Step 6: item_lists join (replaces item_groups + items.list_id).
-- =============================================================================

CREATE TABLE item_lists (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'tag'
    CHECK (role IN ('primary','tag','sprint','release','epic','label','prd','custom')),
  position INTEGER NOT NULL DEFAULT 0,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (item_id, list_id)
);

CREATE INDEX idx_item_lists_list ON item_lists (list_id, position);
CREATE INDEX idx_item_lists_role ON item_lists (list_id, role);

-- =============================================================================
-- Step 7: seed system templates for every existing workspace.
-- =============================================================================

-- backlog
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT
  hex(randomblob(16)),
  w.id,
  'backlog',
  'Backlog',
  'Work items moving through draft → in progress → done. Default for product backlogs.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"draft","options":["draft","in_progress","review","done"],"terminal":["done"]},
    {"key":"priority","type":"single_select","label":"Priority","options":["p0","p1","p2","p3"],"default":"p2"},
    {"key":"estimate","type":"text","label":"Estimate"},
    {"key":"accountable","type":"user","label":"Accountable"}
  ]'),
  1,
  unixepoch(), unixepoch()
FROM workspaces w;

-- bugs
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'bugs', 'Bugs',
  'Defect tracking with triage workflow.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"new","options":["new","triaged","in_progress","fixed","closed","wont_fix"],"terminal":["fixed","closed","wont_fix"]},
    {"key":"severity","type":"single_select","label":"Severity","options":["critical","high","medium","low"],"default":"medium"},
    {"key":"reporter","type":"user","label":"Reporter"},
    {"key":"accountable","type":"user","label":"Accountable"},
    {"key":"repro_steps","type":"long_text","label":"Reproduction steps"},
    {"key":"screenshot","type":"attachment","label":"Screenshot","description":"Optional image illustrating the defect."}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- todos
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'todos', 'Todos',
  'Personal task list with due dates.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"todo","options":["todo","doing","done"],"terminal":["done"]},
    {"key":"due_date","type":"date","label":"Due"},
    {"key":"accountable","type":"user","label":"Accountable"}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- ideas
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'ideas', 'Ideas',
  'Idea capture and exploration.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"seed","options":["seed","exploring","parked","promoted"],"terminal":["promoted","parked"]},
    {"key":"excitement","type":"number","label":"Excitement (1-10)"},
    {"key":"category","type":"single_select","label":"Category","options":["product","tech","business","personal"]}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- release (list-level meta_json carries ship_target, closed_at, breakdown)
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'release', 'Release',
  'A versioned shipping milestone. Items are added with role=release; close_list runs the delivered/slipped/cut audit.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"planned","options":["planned","shipping","shipped"],"terminal":["shipped"]}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- sprint
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'sprint', 'Sprint',
  'A time-boxed work period. List meta_json carries start_date/end_date.',
  json('[
    {"key":"state","type":"single_select","label":"State","required":true,"default":"planned","options":["planned","active","closed"],"terminal":["closed"]}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- shopping
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'shopping', 'Shopping list',
  'Groceries / supplies. No state machine — just a "bought" checkbox.',
  json('[
    {"key":"quantity","type":"number","label":"Quantity","default":1},
    {"key":"category","type":"single_select","label":"Category","options":["produce","dairy","pantry","household","other"]},
    {"key":"bought","type":"checkbox","label":"Bought","default":false}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- wishlist
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'wishlist', 'Wishlist',
  'Things to maybe get.',
  json('[
    {"key":"url","type":"url","label":"Link"},
    {"key":"price","type":"number","label":"Price"},
    {"key":"priority","type":"single_select","label":"Priority","options":["someday","maybe","want","need"]}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- invite
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'invite', 'Invite list',
  'Event guest list with RSVPs.',
  json('[
    {"key":"rsvp","type":"single_select","label":"RSVP","options":["pending","yes","no","maybe"],"default":"pending","terminal":["yes","no"]},
    {"key":"plus_one","type":"checkbox","label":"+1?","default":false},
    {"key":"dietary","type":"text","label":"Dietary"}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- picnic
INSERT INTO templates (id, workspace_id, slug, name, description, fields_schema_json, is_system, created_at, updated_at)
SELECT hex(randomblob(16)), w.id, 'picnic', 'Bring-to-picnic',
  'Who is bringing what.',
  json('[
    {"key":"who_brings","type":"user","label":"Who brings"},
    {"key":"prep_required","type":"checkbox","label":"Needs prep?","default":false},
    {"key":"category","type":"single_select","label":"Category","options":["food","drink","supplies","entertainment"]}
  ]'), 1, unixepoch(), unixepoch()
FROM workspaces w;

-- =============================================================================
-- Step 8: seed a default backlog list for the existing spike workspace
-- so add_item still has a place to drop items by default.
-- =============================================================================

INSERT INTO lists (id, workspace_id, slug, name, description, template_id, created_at, updated_at)
SELECT
  hex(randomblob(16)),
  w.id,
  'backlog',
  'Backlog',
  'Default workspace backlog. Items land here unless you specify a different list.',
  (SELECT id FROM templates WHERE workspace_id = w.id AND slug = 'backlog'),
  unixepoch(), unixepoch()
FROM workspaces w;
