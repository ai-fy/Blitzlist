/**
 * MCP wire protocol — JSON-RPC 2.0 + MCP-specific message shapes.
 *
 * Targets MCP spec version 2024-11-05. We hand-roll the protocol rather than
 * pulling in @modelcontextprotocol/sdk to keep the Worker bundle small for
 * v0.1 (zero tools, four method handlers). Adopt the SDK in a later item if
 * its Zod schemas and resource subscriptions become worth the bundle weight.
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

export const MCP_PROTOCOL_VERSION = '2024-11-05';

// === JSON-RPC 2.0 ============================================================

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
	jsonrpc: '2.0';
	id: JsonRpcId;
	method: string;
	params?: unknown;
};

export type JsonRpcNotification = {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
	// notifications have no id
};

export type JsonRpcSuccessResponse = {
	jsonrpc: '2.0';
	id: JsonRpcId;
	result: unknown;
};

export type JsonRpcErrorResponse = {
	jsonrpc: '2.0';
	id: JsonRpcId;
	error: {
		code: number;
		message: string;
		data?: unknown;
	};
};

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// Standard JSON-RPC 2.0 error codes (plus MCP-specific extensions if/when needed)
export const RpcError = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
} as const;

export class McpError extends Error {
	constructor(
		public readonly code: number,
		message: string,
		public readonly data?: unknown,
	) {
		super(message);
		this.name = 'McpError';
	}
}

// === MCP messages ============================================================

export type InitializeParams = {
	protocolVersion: string;
	capabilities: ClientCapabilities;
	clientInfo: {
		name: string;
		version: string;
	};
};

export type ClientCapabilities = {
	roots?: { listChanged?: boolean };
	sampling?: Record<string, unknown>;
	experimental?: Record<string, unknown>;
};

export type ServerCapabilities = {
	tools?: { listChanged?: boolean };
	resources?: { subscribe?: boolean; listChanged?: boolean };
	prompts?: { listChanged?: boolean };
	logging?: Record<string, unknown>;
	experimental?: Record<string, unknown>;
};

export type InitializeResult = {
	protocolVersion: string;
	capabilities: ServerCapabilities;
	serverInfo: {
		name: string;
		version: string;
	};
	instructions?: string;
};

/**
 * MCP tool annotations (per spec) — required by Anthropic's MCP directory
 * submission. Each tool should declare:
 *   - title: short human-readable label (sentence case, "Add item")
 *   - readOnlyHint OR destructiveHint: whether the tool modifies state
 *
 * Optional hints (idempotentHint, openWorldHint) are informational.
 *
 * See: https://spec.modelcontextprotocol.io/specification/2024-11-05/server/tools/#annotations
 */
export type ToolAnnotations = {
	/** Short human-readable label for the tool. Required for directory submission. */
	title?: string;
	/** Tool does not modify any state — safe to auto-allow in many clients. */
	readOnlyHint?: boolean;
	/** Tool may perform destructive (irreversible) operations like deleting. */
	destructiveHint?: boolean;
	/** Calling the tool with the same args is safe to retry / has no side-effects beyond the first call. */
	idempotentHint?: boolean;
	/** Tool may interact with external (open-world) systems beyond the server. */
	openWorldHint?: boolean;
};

export type Tool = {
	name: string;
	description?: string;
	inputSchema: {
		type: 'object';
		properties?: Record<string, unknown>;
		required?: string[];
	};
	annotations?: ToolAnnotations;
};

// === Tool-call content blocks (per MCP spec 2024-11-05) =====================
//
// tools/call responses wrap their output in a `content` array. v0.1 only used
// text blocks; v0.5 adds image + resource_link so tools can return visual
// elements (QR codes, embedded screenshots, follow-up links).

export type TextContent = {
	type: 'text';
	text: string;
};

export type ImageContent = {
	type: 'image';
	/** base64-encoded image data. */
	data: string;
	mimeType: string;
};

export type ResourceLinkContent = {
	type: 'resource_link';
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
};

export type ContentBlock = TextContent | ImageContent | ResourceLinkContent;

export type ToolCallResult = {
	content: ContentBlock[];
	/** If true, the call resulted in an error and `content` describes it. */
	isError?: boolean;
};

export type ListToolsResult = {
	tools: Tool[];
	nextCursor?: string;
};

export type Resource = {
	uri: string;
	name: string;
	description?: string;
	mimeType?: string;
};

export type ListResourcesResult = {
	resources: Resource[];
	nextCursor?: string;
};

export type Prompt = {
	name: string;
	description?: string;
	arguments?: Array<{
		name: string;
		description?: string;
		required?: boolean;
	}>;
};

export type ListPromptsResult = {
	prompts: Prompt[];
	nextCursor?: string;
};

// === Helpers =================================================================

export function successResponse(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
	return { jsonrpc: '2.0', id, result };
}

export function errorResponse(
	id: JsonRpcId,
	code: number,
	message: string,
	data?: unknown,
): JsonRpcErrorResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: data === undefined ? { code, message } : { code, message, data },
	};
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
		typeof (value as { method?: unknown }).method === 'string' &&
		'id' in value
	);
}

export function isNotification(value: unknown): value is JsonRpcNotification {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
		typeof (value as { method?: unknown }).method === 'string' &&
		!('id' in value)
	);
}
