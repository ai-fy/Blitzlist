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
 *     update_list                                   — rename / re-slug / edit metadata (BL-022)
 *     reorder_state_options                         — set kanban column order (BL-022)
 *     add_list_field                                — per-list field schema extension (BL-022)
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
 *     add_item_to_list                              — bind ONE item to a list with role + position
 *     add_items_to_list                             — BATCH: bind many items to one list (BL-022)
 *     remove_item_from_list                         — unbind ONE (refuses closed lists / primary
 *                                                     without force)
 *     remove_items_from_list                        — BATCH: unbind many items from one list
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
 *   Agent tokens (admin, BL-023):
 *     create_agent_token                            — mint a headless-agent bearer (/a/mcp)
 *     list_agent_tokens                             — list with metadata
 *     revoke_agent_token                            — soft-delete a token
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
 *
 * ⚠️ When asked to operate on MULTIPLE items, ALWAYS prefer the batch
 * variant (add_items / update_items / set_states) over N parallel calls
 * to the singular tool. Batch tools are atomic (fail-fast), use one
 * server round-trip, and one user approval. Keywords for tool search:
 * "batch", "bulk", "multiple", "many", "mass", "multi-item".
 */

import { createToolRegistry } from '@blitzlist/mcp';
import type { Db } from '../db.js';
import type { WorkspaceToolCtx } from '../workspace-context.js';

import { listTemplates } from './list-templates.js';
import { createList } from './create-list.js';
import { updateList } from './update-list.js';
import { closeList } from './close-list.js';
import { reorderStateOptions } from './reorder-state-options.js';
import { addListField } from './add-list-field.js';
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
import { addItemsToList } from './add-items-to-list.js';
import { removeItemFromList } from './remove-item-from-list.js';
import { removeItemsFromList } from './remove-items-from-list.js';
import { createStakeholderKey } from './create-stakeholder-key.js';
import { revokeStakeholderKey } from './revoke-stakeholder-key.js';
import { listStakeholderKeys } from './list-stakeholder-keys.js';
import { createShareCode } from './create-share-code.js';
import { revokeShareCode } from './revoke-share-code.js';
import { listShareCodes } from './list-share-codes.js';
import { createAgentToken } from './create-agent-token.js';
import { listAgentTokens } from './list-agent-tokens.js';
import { revokeAgentToken } from './revoke-agent-token.js';
import { uploadFile } from './upload-file.js';
import { getFile } from './get-file.js';
import { listFiles } from './list-files.js';
import { deleteFile } from './delete-file.js';

export const toolRegistry = createToolRegistry<Db, WorkspaceToolCtx>([
	listTemplates,
	createList,
	updateList,
	reorderStateOptions,
	addListField,
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
	addItemsToList,
	removeItemFromList,
	removeItemsFromList,
	createStakeholderKey,
	revokeStakeholderKey,
	listStakeholderKeys,
	createShareCode,
	revokeShareCode,
	listShareCodes,
	createAgentToken,
	listAgentTokens,
	revokeAgentToken,
	uploadFile,
	getFile,
	listFiles,
	deleteFile,
]);
