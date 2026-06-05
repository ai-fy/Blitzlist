/**
 * Workspace tool context — what OAuth-gated `/mcp` tool handlers receive.
 *
 * Extends the base ToolContext from packages/mcp with the Worker's `env`,
 * so tools that need R2 / KV / Queues / etc. can reach them. Tools that
 * only need {user_id, workspace_id, db} (the majority) continue to work
 * because their ToolDef Ctx generic is a subset of this one.
 */

import type { ToolContext } from '@blitzlist/mcp';
import type { Env } from './env.js';
import type { Db } from './db.js';

export type WorkspaceToolCtx = ToolContext<Db> & {
	env: Env;
};
