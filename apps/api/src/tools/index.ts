/**
 * Tool registry — the canonical list of tools the Blitzlist MCP server exposes.
 *
 * v0.5 tool surface (BL-035 Airtable shape):
 *
 *   Templates:
 *     list_templates                                — read templates
 *
 *   Lists:
 *     create_list                                   — create a list (with optional template)
 *     close_list                                    — close + run delivered/slipped/cut audit
 *     generate_release_notes                        — Markdown notes from a list's breakdown
 *
 *   Items:
 *     add_item                                      — create one item in a list
 *     add_items                                     — batch-add many items in one call
 *     get_item                                      — full item + lists + activity
 *     list_items                                    — filtered, with memberships
 *     update_item                                   — patch fields_json (validated)
 *     update_items                                  — batch update_item (validated, fail-fast)
 *     set_state                                     — convenience: patch the state field
 *     set_states                                    — batch state changes (validated, fail-fast)
 *     set_executor                                  — assign/clear executor (BL-009)
 *     comment                                       — append a comment
 *
 *   Membership:
 *     add_item_to_list                              — bind item to list with role + position
 *     remove_item_from_list                         — unbind (refuses closed lists / primary
 *                                                     without force)
 *
 *   Stakeholder keys (admin, BL-011):
 *     create_stakeholder_key                        — mint a key (returns raw_key ONCE)
 *     revoke_stakeholder_key                        — soft-delete a key
 *     list_stakeholder_keys                         — list with metadata
 *
 *   Share codes (admin, BL-030):
 *     create_share_code                             — mint a 4-word URL slug
 *     revoke_share_code                             — soft-delete a code
 *     list_share_codes                              — list (includes code itself)
 *
 * Total: 22 tools. All include MCP annotations (title + readOnlyHint/
 * destructiveHint/idempotentHint/openWorldHint) per Anthropic's MCP-directory
 * submission requirements.
 *
 * Convenience patterns (use these to minimize round-trips for users):
 *   - create_list({items:[...]})                    create list + populate in 1 call
 *   - add_items({list, items:[...]})                batch-add to existing list in 1 call
 *   - set_states({changes:[...]})                   batch state transitions in 1 call
 *   - update_items({updates:[...]})                 batch field/title/body updates in 1 call
 */

import { createToolRegistry } from '@blitzlist/mcp';
import type { Db } from '../db.js';

import { listTemplates } from './list-templates.js';
import { createList } from './create-list.js';
import { closeList } from './close-list.js';
import { generateReleaseNotes } from './generate-release-notes.js';
import { setListDefaultView } from './set-list-default-view.js';
import { addItem } from './add-item.js';
import { addItems } from './add-items.js';
import { getItem } from './get-item.js';
import { listItems } from './list-items.js';
import { updateItem } from './update-item.js';
import { updateItems } from './update-items.js';
import { setState } from './set-state.js';
import { setStates } from './set-states.js';
import { setExecutor } from './set-executor.js';
import { comment } from './comment.js';
import { addItemToList } from './add-item-to-list.js';
import { removeItemFromList } from './remove-item-from-list.js';
import { createStakeholderKey } from './create-stakeholder-key.js';
import { revokeStakeholderKey } from './revoke-stakeholder-key.js';
import { listStakeholderKeys } from './list-stakeholder-keys.js';
import { createShareCode } from './create-share-code.js';
import { revokeShareCode } from './revoke-share-code.js';
import { listShareCodes } from './list-share-codes.js';

export const toolRegistry = createToolRegistry<Db>([
	listTemplates,
	createList,
	closeList,
	generateReleaseNotes,
	setListDefaultView,
	addItem,
	addItems,
	getItem,
	listItems,
	updateItem,
	updateItems,
	setState,
	setStates,
	setExecutor,
	comment,
	addItemToList,
	removeItemFromList,
	createStakeholderKey,
	revokeStakeholderKey,
	listStakeholderKeys,
	createShareCode,
	revokeShareCode,
	listShareCodes,
]);
