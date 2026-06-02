/**
 * Stakeholder tool registry — served at /s/mcp.
 *
 * Three tools, scope-restricted by the bearer key. Distinct from the
 * workspace registry (apps/api/src/tools/index.ts) because the context type
 * differs — no user_id, has stakeholder field.
 */

import { createToolRegistry } from '@blitzlist/mcp';
import type { Db } from '../../db.js';
import type { StakeholderToolContext } from '../../stakeholder-context.js';

import { stakeholderListItems } from './list-items.js';
import { stakeholderGetItem } from './get-item.js';
import { stakeholderComment } from './comment.js';

export const stakeholderToolRegistry = createToolRegistry<Db, StakeholderToolContext>([
	stakeholderListItems,
	stakeholderGetItem,
	stakeholderComment,
]);
