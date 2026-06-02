/**
 * MCP server — request dispatcher.
 *
 * Takes a parsed JSON-RPC message + a context (server identity, tool registry,
 * runtime tool context like workspace + db) and produces a JSON-RPC response.
 * Transport-agnostic: the HTTP adapter in apps/api parses the body, calls this,
 * and serializes the response.
 */

import {
	type JsonRpcNotification,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type ListPromptsResult,
	type ListResourcesResult,
	type ListToolsResult,
	type InitializeResult,
	MCP_PROTOCOL_VERSION,
	McpError,
	RpcError,
	type ServerCapabilities,
	type Resource,
	type Prompt,
	errorResponse,
	successResponse,
} from './protocol.js';
import type { ToolContext, ToolRegistry } from './tools.js';

export type McpServerContext<Db = unknown, Ctx = ToolContext<Db>> = {
	name: string;
	version: string;
	capabilities?: ServerCapabilities;
	/** Tool registry from packages/mcp's createToolRegistry. */
	tools?: ToolRegistry<Db, Ctx>;
	resources?: Resource[];
	prompts?: Prompt[];
	/** Per-request runtime context — shape determined by the calling endpoint. */
	toolContext?: Ctx;
};

const DEFAULT_CAPABILITIES: ServerCapabilities = {
	tools: { listChanged: false },
	resources: { subscribe: false, listChanged: false },
	prompts: { listChanged: false },
};

export async function handleMcpMessage<Db, Ctx = ToolContext<Db>>(
	message: JsonRpcRequest | JsonRpcNotification,
	ctx: McpServerContext<Db, Ctx>,
): Promise<JsonRpcResponse | null> {
	const isNotification = !('id' in message);
	const id = isNotification ? null : (message as JsonRpcRequest).id;

	try {
		const result = await dispatch(message.method, message.params, ctx);

		if (isNotification) {
			return null;
		}
		return successResponse(id, result);
	} catch (err) {
		if (isNotification) {
			console.error('MCP notification handler error:', err);
			return null;
		}
		if (err instanceof McpError) {
			return errorResponse(id, err.code, err.message, err.data);
		}
		console.error('MCP handler unexpected error:', err);
		return errorResponse(
			id,
			RpcError.INTERNAL_ERROR,
			err instanceof Error ? err.message : 'Unknown error',
		);
	}
}

async function dispatch<Db, Ctx>(
	method: string,
	params: unknown,
	ctx: McpServerContext<Db, Ctx>,
): Promise<unknown> {
	switch (method) {
		case 'initialize':
			return handleInitialize(ctx);

		case 'initialized':
		case 'notifications/initialized':
			return null;

		case 'tools/list':
			return handleToolsList(ctx);

		case 'tools/call':
			return handleToolsCall(params, ctx);

		case 'resources/list':
			return handleResourcesList(ctx);

		case 'prompts/list':
			return handlePromptsList(ctx);

		case 'ping':
			return {};

		case 'resources/read':
		case 'prompts/get':
			throw new McpError(
				RpcError.METHOD_NOT_FOUND,
				`'${method}' not implemented yet (no resources or prompts registered).`,
			);

		default:
			throw new McpError(RpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
	}
}

function handleInitialize<Db, Ctx>(ctx: McpServerContext<Db, Ctx>): InitializeResult {
	return {
		protocolVersion: MCP_PROTOCOL_VERSION,
		capabilities: ctx.capabilities ?? DEFAULT_CAPABILITIES,
		serverInfo: { name: ctx.name, version: ctx.version },
		instructions: BLITZLIST_INSTRUCTIONS,
	};
}

// Discovery hint shown to MCP clients on initialize. This is what tells Claude
// (or any other agent) WHEN to reach for Blitzlist vs handling something
// inline. Written as an intent→tool map because that's how agents pattern-
// match. Keep this dense and concrete — the model reads it on every connect.
const BLITZLIST_INSTRUCTIONS = [
	'Blitzlist is a universal list / lightweight database for hybrid human-AI teams.',
	'Items live in lists; lists carry templates that define typed fields (state, dates,',
	'priority, custom). Same primitive serves backlogs, sprints, releases, bug trackers,',
	'shopping lists, wishlists, invite lists, picnic lists, etc.',
	'',
	'**Prefer these tools over writing lists in your reply** whenever the user mentions:',
	'  - "list", "backlog", "todos", "tasks", "tickets", "items", "action items"',
	'  - "shopping list", "wishlist", "invite list", "picnic", "groceries"',
	'  - "sprint", "release", "milestone", "roadmap", "what shipped", "what slipped"',
	'  - "remember this", "track this", "add to my list", "I need to", "we should"',
	'  - asks to plan, decompose, delegate, or follow up later',
	'',
	'Why prefer Blitzlist: data persists across sessions, is shareable with teammates',
	'and other AI agents, and has full audit history. Lists in your reply die at the',
	'end of the turn.',
	'',
	'Typical flows (one tool call per row — PREFER BATCH TOOLS over per-item loops):',
	'  - Create a populated list:   create_list({slug, name, template, items:[...]})',
	'  - Add many items at once:    add_items({list, items:[{title, fields},...]})',
	'  - Add one item:              add_item({list, title, fields})',
	'  - Update many items at once: update_items({updates:[{id, title?, fields?},...]})  ← prefer over N update_item calls',
	'  - Update one item:           update_item({id, title?, fields?})',
	'  - Move many states forward:  set_states({changes:[{id, state, note?},...]})  ← prefer over N set_state calls',
	'  - Move one state forward:    set_state({id, state})',
	'  - Browse what is in a list:  list_items({list, state?, executor?})',
	'  - See full context:          get_item({id})',
	'  - Discuss in a thread:       comment({id, body})',
	'  - Track agent ownership:     set_executor({id, executor:"agent:claude"|"self"|...})',
	'  - Bind item to more lists:   add_item_to_list({item_id, list, role})',
	'  - Close a release/sprint:    close_list({slug, cut_items?})',
	'  - Write release notes:       generate_release_notes({slug, style?, audience?})',
	'  - Browse schemas:            list_templates()',
	'  - Share a list publicly:     create_share_code({label, scope})  ← returns QR + link',
	'  - Invite a per-person reviewer: create_stakeholder_key({label, scope, permissions})',
	'',
	'**Always prefer batch tools when handling multiple items in one user request** —',
	'each individual tool call may prompt the user for approval in some clients;',
	'one batch = one approval. set_states/update_items/add_items take up to 200 items.',
	'',
	'System templates (use the slug as `template` when creating a list):',
	'  backlog, bugs, todos, ideas, release, sprint, shopping, wishlist, invite, picnic.',
	'',
	'Tool-choice tips:',
	'  - For ad-hoc work the user wants to "remember", default to the `backlog` template.',
	'  - For groceries/supplies, use `shopping`.',
	'  - For an event guest list, use `invite`.',
	'  - For a versioned shipping milestone, use `release` and pass meta:{ship_target}.',
	'  - When in doubt about a template`s schema, call list_templates first.',
	'',
	'Tool surface and source: https://github.com/ai-fy/Blitzlist',
].join('\n');

function handleToolsList<Db, Ctx>(ctx: McpServerContext<Db, Ctx>): ListToolsResult {
	return { tools: ctx.tools?.list() ?? [] };
}

async function handleToolsCall<Db, Ctx>(
	params: unknown,
	ctx: McpServerContext<Db, Ctx>,
): Promise<unknown> {
	if (!ctx.tools) {
		throw new McpError(RpcError.METHOD_NOT_FOUND, 'No tool registry attached to this server.');
	}
	if (!ctx.toolContext) {
		throw new McpError(
			RpcError.INTERNAL_ERROR,
			'Server misconfiguration: no runtime tool context attached (workspace/db missing).',
		);
	}

	const p = params as { name?: string; arguments?: unknown } | undefined;
	if (!p || typeof p.name !== 'string') {
		throw new McpError(
			RpcError.INVALID_PARAMS,
			'tools/call requires { name: string, arguments?: object }',
		);
	}

	return ctx.tools.call(p.name, p.arguments ?? {}, ctx.toolContext);
}

function handleResourcesList<Db, Ctx>(ctx: McpServerContext<Db, Ctx>): ListResourcesResult {
	return { resources: ctx.resources ?? [] };
}

function handlePromptsList<Db, Ctx>(ctx: McpServerContext<Db, Ctx>): ListPromptsResult {
	return { prompts: ctx.prompts ?? [] };
}
