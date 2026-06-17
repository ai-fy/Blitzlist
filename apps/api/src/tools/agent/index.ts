/**
 * Agent tool registry — served at /a/mcp to headless agent tokens (BL-023).
 *
 * Capability: CREATE / EDIT / SHARE. Resolves to the full workspace context
 * (the token acts as the owner who minted it), but exposes a deliberately
 * curated SUBSET of the full toolRegistry:
 *
 *   ✅ included — lists, items, membership, sharing (create_share_code),
 *      templates (read), files. Everything a working agent needs to build,
 *      edit, batch, and share lists.
 *
 *   ❌ excluded — ADMIN tools: minting/revoking stakeholder keys, minting/
 *      revoking agent tokens, revoking share codes. An agent token cannot
 *      escalate or manage access — that stays owner-only on /mcp.
 *
 * Same context type as the full registry (WorkspaceToolCtx) — these are the
 * exact same tool defs, just a narrower set.
 */

import { createToolRegistry } from '@blitzlist/mcp';
import type { Db } from '../../db.js';
import type { WorkspaceToolCtx } from '../../workspace-context.js';

import { listTemplates } from '../list-templates.js';
import { createList } from '../create-list.js';
import { updateList } from '../update-list.js';
import { closeList } from '../close-list.js';
import { generateReleaseNotes } from '../generate-release-notes.js';
import { reorderStateOptions } from '../reorder-state-options.js';
import { addListField } from '../add-list-field.js';
import { addItem } from '../add-item.js';
import { addItems } from '../add-items.js';
import { getItem } from '../get-item.js';
import { listItems } from '../list-items.js';
import { updateItem } from '../update-item.js';
import { updateItems } from '../update-items.js';
import { setState } from '../set-state.js';
import { setStates } from '../set-states.js';
import { setExecutor } from '../set-executor.js';
import { setListDefaultView } from '../set-list-default-view.js';
import { comment } from '../comment.js';
import { addItemToList } from '../add-item-to-list.js';
import { addItemsToList } from '../add-items-to-list.js';
import { removeItemFromList } from '../remove-item-from-list.js';
import { removeItemsFromList } from '../remove-items-from-list.js';
import { createShareCode } from '../create-share-code.js';
import { listShareCodes } from '../list-share-codes.js';
import { uploadFile } from '../upload-file.js';
import { getFile } from '../get-file.js';
import { listFiles } from '../list-files.js';
import { deleteFile } from '../delete-file.js';

export const agentToolRegistry = createToolRegistry<Db, WorkspaceToolCtx>([
	// Templates (read)
	listTemplates,
	// Lists
	createList,
	updateList,
	closeList,
	generateReleaseNotes,
	reorderStateOptions,
	addListField,
	setListDefaultView,
	// Items
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
	// Membership
	addItemToList,
	addItemsToList,
	removeItemFromList,
	removeItemsFromList,
	// Sharing (create only — revoke is owner-admin)
	createShareCode,
	listShareCodes,
	// Files
	uploadFile,
	getFile,
	listFiles,
	deleteFile,
]);
