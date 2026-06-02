/**
 * Scoped request context — built by /s/mcp (stakeholder keys) and /c/<code>/mcp
 * (share codes), then passed to the scope-aware tools.
 *
 * The two endpoints produce structurally similar context — they share the same
 * scope/permissions shape — and differ only in HOW the actor is identified:
 *   - stakeholder: per-person key with label, recoverable identity for the
 *     comment author_label and audit log
 *   - share_code:  anonymous-by-design; the code itself is the identity
 *
 * Same tool set serves both; tools branch on actor.type when attributing
 * activity / labelling comments.
 */

import type { StakeholderScope, StakeholderPermission } from '@blitzlist/core';
import type { Db } from './db.js';

export type ScopedActor =
	| {
			type: 'stakeholder';
			key_id: string;
			prefix: string;
			label: string;
	  }
	| {
			type: 'share_code';
			code: string;
			label: string;
	  };

export type ScopedToolContext = {
	workspace_id: string;
	db: Db;
	actor: ScopedActor;
	scope: StakeholderScope;
	permissions: StakeholderPermission[];
	/** Pre-resolved list IDs in scope. Null = workspace-wide. */
	allowed_list_ids: string[] | null;
};

// Back-compat alias for the older name — the stakeholder endpoint still imports
// StakeholderToolContext from here. Now equivalent to ScopedToolContext.
export type StakeholderToolContext = ScopedToolContext;
