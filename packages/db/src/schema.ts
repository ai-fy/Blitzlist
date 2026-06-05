/**
 * Blitzlist schema — v0.5 (BL-035: Airtable-shaped).
 *
 * The universal-list data model:
 *   - Templates own field schemas (state, dates, custom fields)
 *   - Lists are universal containers (any kind of list — backlog, shopping, ...)
 *   - Items carry typed fields validated against their own template
 *   - item_lists is many-to-many with per-list role + position
 *
 * Tables:
 *   workspaces, users, workspace_members, invite_codes  — tenancy / auth
 *   templates                                           — field schemas (BL-035)
 *   lists                                               — universal containers (BL-035)
 *   items                                               — record-shaped, fields_json
 *   item_lists                                          — many-to-many join (BL-035)
 *   comments                                            — append-only comments
 *   activity_log                                        — audit trail
 *
 * Tables added in subsequent migrations as their items ship:
 *   relations                                  — v0.5 (BL-026)
 *   documents, files, attachments              — v0.5 (BL-020, BL-021)
 *   approvals                                  — v0.5
 *   item_scores                                — v0.5 (BL-032 — the Compass)
 *   stakeholder_access_keys                    — v0.5 (BL-011, shipped)
 *   share_codes                                — v0.5 (BL-030, shipped)
 *
 * All JSON columns store as TEXT and use SQLite's json_extract() for queries.
 * Drizzle's $type<T>() captures the TypeScript shape for type safety; runtime
 * validation happens in packages/core via validateFieldValue / validateItemFields.
 */

import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// === Helpers =================================================================

const timestamps = {
	created_at: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updated_at: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
};

// === Workspaces & users ======================================================

export const workspaces = sqliteTable('workspaces', {
	id: text('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	id_prefix: text('id_prefix').notNull(),
	item_counter: integer('item_counter').notNull().default(0),
	...timestamps,
});

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	display_name: text('display_name'),
	avatar_url: text('avatar_url'),
	...timestamps,
});

export const workspace_members = sqliteTable(
	'workspace_members',
	{
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['owner', 'editor', 'reviewer', 'viewer'] }).notNull(),
		joined_at: integer('joined_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [primaryKey({ columns: [t.workspace_id, t.user_id] })],
);

export const invite_codes = sqliteTable('invite_codes', {
	code: text('code').primaryKey(),
	workspace_id: text('workspace_id')
		.notNull()
		.references(() => workspaces.id, { onDelete: 'cascade' }),
	role: text('role', { enum: ['owner', 'editor', 'reviewer', 'viewer'] }).notNull(),
	created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	expires_at: integer('expires_at', { mode: 'timestamp' }),
	max_uses: integer('max_uses'),
	uses: integer('uses').notNull().default(0),
	created_at: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
});

// === Templates (BL-035) ======================================================

// A template owns a field schema. Items reference a template via items.template_id;
// the template's fields_schema_json declares what fields the item carries and
// what types they have. State is just a field (typically single_select with a
// `terminal` flag on its options) — not a special concept.
//
// Lists optionally reference a template via lists.template_id; this is the
// "suggested schema for new items added to this list," but items keep their
// own template_id authoritatively (an item can be in many lists with different
// templates; its own template wins).

export type FieldType =
	| 'text'
	| 'long_text'
	| 'number'
	| 'date'
	| 'single_select'
	| 'multi_select'
	| 'checkbox'
	| 'url'
	| 'user'
	| 'link_to_item'
	| 'attachment'
	| 'formula'; // v1.0

export type FieldDef = {
	key: string; // identifier used in fields_json
	type: FieldType;
	label?: string;
	required?: boolean;
	default?: unknown;
	options?: string[]; // single_select / multi_select
	terminal?: string[]; // single_select with workflow-state semantics
	/**
	 * When true (single_select / multi_select only), values outside `options`
	 * are accepted. The tool layer is responsible for persisting the novel
	 * value somewhere appropriate (e.g. lists.meta_json.extra_state_options
	 * for the canonical state field). Defaults to false (strict enum).
	 */
	open?: boolean;
	min?: number; // number
	max?: number; // number
	multiline?: boolean; // text
	description?: string;
};

export type DefaultView = 'list' | 'kanban' | 'table' | 'todo' | 'calendar' | 'compass';

export const templates = sqliteTable(
	'templates',
	{
		id: text('id').primaryKey(), // uuid
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		fields_schema_json: text('fields_schema_json', { mode: 'json' })
			.$type<FieldDef[]>()
			.notNull()
			.default(sql`'[]'`),
		default_view: text('default_view', {
			enum: ['list', 'kanban', 'table', 'todo', 'calendar', 'compass'],
		})
			.$type<DefaultView>()
			.notNull()
			.default('list'),
		is_system: integer('is_system', { mode: 'boolean' }).notNull().default(false),
		created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		...timestamps,
	},
	(t) => [index('idx_templates_workspace').on(t.workspace_id)],
);

// === Lists (BL-035) ==========================================================

// Universal container. The same primitive holds backlogs, sprints, releases,
// shopping lists, invite lists. Discriminator is the template_id.

export type ListMeta = {
	// release / sprint specific
	target_date?: string;
	ship_target?: string;
	start_date?: string;
	end_date?: string;
	closed_at?: string;
	breakdown?: {
		delivered: string[];
		slipped: string[];
		cut: string[];
	};
	// invite-list specific
	event_date?: string;
	venue?: string;
	// per-list default view override (wins over template.default_view)
	default_view?: DefaultView;
	/**
	 * State values introduced on this list that aren't in the template's
	 * state field options. Appended in order of first appearance. Used by
	 * the renderer (extra kanban columns / state-edit dropdown options) and
	 * the validator (combined with template.options as the allowed set).
	 */
	extra_state_options?: string[];
	/**
	 * Explicit, full state ordering for this list. When set, this is the
	 * canonical column order for the kanban view and the dropdown order in
	 * state-edit selects. Lets the user move "estimating" between "planned"
	 * and "shipping" instead of always at the end. Should contain every
	 * value in (template.state.options ∪ extra_state_options) — missing
	 * values fall back to template order (defensive).
	 */
	state_options_order?: string[];
	/**
	 * Per-list extra field definitions. Merged into the template's
	 * fields_schema_json when validating / rendering items in this list.
	 * Lets users add a "priority" column to a release-template list without
	 * editing the template (which would affect all release lists).
	 *
	 * Field defs use the same FieldDef shape as templates. Set explicitly
	 * via add_list_field, or auto-extended (heuristic type-guess) when
	 * update_item/set_state etc. receive a key not in the template.
	 */
	extra_fields?: FieldDef[];
	// free-form
	[key: string]: unknown;
};

export const lists = sqliteTable(
	'lists',
	{
		id: text('id').primaryKey(),
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		template_id: text('template_id').references(() => templates.id, { onDelete: 'set null' }),
		meta_json: text('meta_json', { mode: 'json' })
			.$type<ListMeta>()
			.notNull()
			.default(sql`'{}'`),
		tags_json: text('tags_json', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		color: text('color'),
		icon: text('icon'),
		created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		...timestamps,
	},
	(t) => [
		index('idx_lists_workspace_slug').on(t.workspace_id, t.slug),
		index('idx_lists_workspace_archived').on(t.workspace_id, t.archived),
		index('idx_lists_template').on(t.template_id),
	],
);

// === Items (BL-035) ==========================================================

// Items carry typed fields validated against their own template. Items live in
// the workspace; membership in lists is via item_lists (many-to-many).
// First-class columns are restricted to identity / hierarchy / immutable audit /
// operational routing (executor). Everything else lives in fields_json.

export const items = sqliteTable(
	'items',
	{
		id: text('id').primaryKey(), // e.g. "BL-042"
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		template_id: text('template_id').references(() => templates.id, { onDelete: 'set null' }),
		fields_json: text('fields_json', { mode: 'json' })
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'`),
		parent_id: text('parent_id'),
		// Who/what is currently doing the work. Format:
		//   human:<uid> | agent:claude | agent:<name> | self | contractor:<label>
		executor: text('executor'),
		author_id: text('author_id').references(() => users.id, { onDelete: 'set null' }),
		...timestamps,
	},
	(t) => [
		index('idx_items_workspace').on(t.workspace_id),
		index('idx_items_template').on(t.template_id),
		index('idx_items_parent').on(t.parent_id),
		// Partial + JSON-extract indexes (state / due_date / priority / executor)
		// live in the raw SQL migration — Drizzle's emitter doesn't generate the
		// right syntax for those.
	],
);

// === item_lists (BL-035) =====================================================

// Many-to-many join. role discriminates how the list relates to the item
// (primary workflow location vs tag vs sprint vs release vs ...). position
// is per-list, so item BL-042 can be 3rd in `backlog` and 7th in `v0.5-release`.

export type ItemListRole =
	| 'primary'
	| 'tag'
	| 'sprint'
	| 'release'
	| 'epic'
	| 'label'
	| 'prd'
	| 'custom';

export const item_lists = sqliteTable(
	'item_lists',
	{
		item_id: text('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		list_id: text('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		role: text('role', {
			enum: ['primary', 'tag', 'sprint', 'release', 'epic', 'label', 'prd', 'custom'],
		})
			.$type<ItemListRole>()
			.notNull()
			.default('tag'),
		position: integer('position').notNull().default(0),
		added_by: text('added_by').references(() => users.id, { onDelete: 'set null' }),
		added_at: integer('added_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		primaryKey({ columns: [t.item_id, t.list_id] }),
		index('idx_item_lists_list').on(t.list_id, t.position),
		index('idx_item_lists_role').on(t.list_id, t.role),
	],
);

// === Comments ================================================================

export const comments = sqliteTable(
	'comments',
	{
		id: text('id').primaryKey(),
		item_id: text('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		author_id: text('author_id').references(() => users.id, { onDelete: 'set null' }),
		author_label: text('author_label'),
		body: text('body').notNull(),
		created_at: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index('idx_comments_item').on(t.item_id, t.created_at)],
);

// === Stakeholder access keys (BL-011) ========================================

// Per-stakeholder bearer keys for the lighter "paste a key into MCP config"
// auth path. Distinct from OAuth (full members). See packages/core/stakeholder.ts
// for resolution + scope evaluation.

export type StakeholderScope =
	| { type: 'workspace' }
	| { type: 'list'; list_slug: string }
	| { type: 'lists'; list_slugs: string[] };

export type StakeholderPermission = 'read' | 'comment' | 'edit' | 'create' | 'approve' | 'vote';

export const stakeholder_access_keys = sqliteTable(
	'stakeholder_access_keys',
	{
		id: text('id').primaryKey(), // uuid
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		key_hash: text('key_hash').notNull().unique(), // sha256(raw_key) hex
		prefix: text('prefix').notNull(), // for display ("blz_sk_xxxx")

		label: text('label').notNull(),
		scope_json: text('scope_json', { mode: 'json' })
			.$type<StakeholderScope>()
			.notNull(),
		permissions_json: text('permissions_json', { mode: 'json' })
			.$type<StakeholderPermission[]>()
			.notNull()
			.default(sql`'["read","comment"]'`),

		created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		expires_at: integer('expires_at', { mode: 'timestamp' }),
		revoked_at: integer('revoked_at', { mode: 'timestamp' }),
		last_used_at: integer('last_used_at', { mode: 'timestamp' }),
		use_count: integer('use_count').notNull().default(0),

		created_at: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index('idx_stakeholder_keys_workspace').on(t.workspace_id)],
);

// === Share codes (BL-030) ====================================================

// "Anyone with the link" — Google-Drive-style. Code is 4 EFF-style diceware
// words, hyphen-separated. URL path is the credential. Same scope shape as
// stakeholder_access_keys; different audience semantics (anonymous, broadcast).

export const share_codes = sqliteTable(
	'share_codes',
	{
		code: text('code').primaryKey(), // "cherry-mountain-pencil-tango"
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),

		label: text('label').notNull(),
		scope_json: text('scope_json', { mode: 'json' })
			.$type<StakeholderScope>()
			.notNull(),
		permissions_json: text('permissions_json', { mode: 'json' })
			.$type<StakeholderPermission[]>()
			.notNull()
			.default(sql`'["read"]'`),

		created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		expires_at: integer('expires_at', { mode: 'timestamp' }),
		revoked_at: integer('revoked_at', { mode: 'timestamp' }),
		last_used_at: integer('last_used_at', { mode: 'timestamp' }),
		use_count: integer('use_count').notNull().default(0),

		created_at: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index('idx_share_codes_workspace').on(t.workspace_id)],
);

// === Files (BL-021) ==========================================================

// Binary artifacts stored in R2. files holds the head; file_versions is the
// append-only history. R2 key includes a content sha256 so identical bytes
// dedup at the storage layer.

export const files = sqliteTable(
	'files',
	{
		id: text('id').primaryKey(),
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		folder_path: text('folder_path').notNull().default('/'),
		mime_type: text('mime_type').notNull(),
		size_bytes: integer('size_bytes').notNull(),
		current_version_id: text('current_version_id'),
		uploaded_by: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
		revoked_at: integer('revoked_at', { mode: 'timestamp' }),
		...timestamps,
	},
	(t) => [
		index('idx_files_workspace').on(t.workspace_id),
		index('idx_files_workspace_folder').on(t.workspace_id, t.folder_path),
	],
);

export const file_versions = sqliteTable(
	'file_versions',
	{
		id: text('id').primaryKey(),
		file_id: text('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		r2_key: text('r2_key').notNull(),
		sha256_hex: text('sha256_hex').notNull(),
		mime_type: text('mime_type').notNull(),
		size_bytes: integer('size_bytes').notNull(),
		uploaded_by: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
		note: text('note'),
		created_at: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index('idx_file_versions_file').on(t.file_id, t.version)],
);

// === Activity log ============================================================

export type ActivityAction =
	| 'item.created'
	| 'item.updated'
	| 'item.field_changed' // BL-035
	| 'item.state_changed' // emitted by set_state (which is a field_changed convenience)
	| 'item.executor_changed' // BL-009
	| 'item.added_to_list' // BL-035 (replaces item.promised)
	| 'item.removed_from_list' // BL-035 (replaces item.unpromised)
	| 'item.deleted'
	| 'comment.created'
	| 'workspace.created'
	| 'list.created'
	| 'list.updated' // BL-022 — rename / re-slug / metadata change
	| 'list.closed' // BL-035 (replaces release.closed; runs audit when applicable)
	| 'list.archived'
	| 'list.state_options_extended' // BL-022 — per-list extra_state_options grew
	| 'list.state_options_reordered' // BL-022 — state_options_order changed
	| 'list.field_added' // BL-022 — extra_fields gained a field def (explicit add_list_field or auto-extend)
	| 'template.created' // BL-035
	| 'template.field_added' // BL-035
	| 'template.field_removed' // BL-035
	| 'template.field_updated' // BL-035
	| 'stakeholder_key.created' // BL-011
	| 'stakeholder_key.revoked' // BL-011
	| 'share_code.created' // BL-030
	| 'share_code.revoked' // BL-030
	| 'file.uploaded' // BL-021
	| 'file.updated' // BL-021 — new version
	| 'file.deleted' // BL-021
	| 'user.joined';

export const activity_log = sqliteTable(
	'activity_log',
	{
		id: text('id').primaryKey(),
		workspace_id: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		item_id: text('item_id'),
		actor_id: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
		action: text('action').$type<ActivityAction>().notNull(),
		details_json: text('details_json', { mode: 'json' })
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'`),
		created_at: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		index('idx_activity_workspace').on(t.workspace_id, t.created_at),
		index('idx_activity_item').on(t.item_id, t.created_at),
	],
);

// === Exports for the ORM =====================================================

export const schema = {
	workspaces,
	users,
	workspace_members,
	invite_codes,
	templates,
	lists,
	items,
	item_lists,
	comments,
	files,
	file_versions,
	stakeholder_access_keys,
	share_codes,
	activity_log,
};

export type Schema = typeof schema;
