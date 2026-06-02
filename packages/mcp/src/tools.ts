/**
 * Tool registry — adapter between the protocol layer and tool implementations.
 *
 * `packages/mcp` defines the SHAPE of tools (name, schema, handler signature).
 * `apps/api` defines the CONTENT (which tools exist; what they do). This
 * lets the protocol stay framework-agnostic while tools live where they
 * can talk to Drizzle + the workspace context.
 */

import {
	McpError,
	RpcError,
	type ContentBlock,
	type Tool,
	type ToolAnnotations,
	type ToolCallResult,
} from './protocol.js';

/**
 * A tool handler may return either:
 *   - Any value (will be JSON-stringified into a single text content block)
 *   - A ToolCallResult (multi-content: text + image + resource_link)
 *
 * The registry detects the shape and dispatches accordingly. The
 * isToolCallResult helper guards on the canonical {content: [...]} shape.
 */
export function isToolCallResult(v: unknown): v is ToolCallResult {
	return (
		typeof v === 'object' &&
		v !== null &&
		Array.isArray((v as { content?: unknown }).content) &&
		(v as { content: unknown[] }).content.every(
			(c) =>
				typeof c === 'object' &&
				c !== null &&
				typeof (c as { type?: unknown }).type === 'string',
		)
	);
}

/**
 * Context handed to every tool handler. Concrete types (workspace_id,
 * user_id, db client) are filled in by apps/api at registry creation —
 * packages/mcp doesn't know what a "db" is.
 *
 * The shape is parameterized over Ctx so different endpoints (OAuth vs
 * stakeholder bearer) can pass different context shapes without crossover.
 */
export type ToolContext<Db = unknown> = {
	user_id: string;
	workspace_id: string;
	db: Db;
};

export type ToolDef<Args = unknown, Result = unknown, Db = unknown, Ctx = ToolContext<Db>> = {
	name: string;
	description: string;
	/** JSON Schema for the tool's input arguments. */
	inputSchema: Tool['inputSchema'];
	/** MCP annotations (title, readOnlyHint, destructiveHint). Required for Anthropic directory submission. */
	annotations?: ToolAnnotations;
	/** Optional runtime validator. If provided, runs before handler. */
	validate?: (args: unknown) => Args;
	handler: (args: Args, ctx: Ctx) => Promise<Result>;
};

export type ToolRegistry<Db = unknown, Ctx = ToolContext<Db>> = {
	list(): Tool[];
	call(name: string, args: unknown, ctx: Ctx): Promise<ToolCallResult>;
};

export function createToolRegistry<Db, Ctx = ToolContext<Db>>(
	tools: Array<ToolDef<any, any, Db, Ctx>>,
): ToolRegistry<Db, Ctx> {
	const byName = new Map(tools.map((t) => [t.name, t]));

	return {
		list(): Tool[] {
			return tools.map(({ name, description, inputSchema, annotations }) => ({
				name,
				description,
				inputSchema,
				...(annotations && { annotations }),
			}));
		},

		async call(name, args, ctx) {
			const tool = byName.get(name);
			if (!tool) {
				throw new McpError(RpcError.METHOD_NOT_FOUND, `Tool not found: ${name}`);
			}

			let parsedArgs: unknown = args;
			if (tool.validate) {
				try {
					parsedArgs = tool.validate(args);
				} catch (err) {
					throw new McpError(
						RpcError.INVALID_PARAMS,
						err instanceof Error ? err.message : 'Invalid arguments',
					);
				}
			}

			const result = await tool.handler(parsedArgs, ctx);

			// If the handler returned a full ToolCallResult shape, pass it through.
			// Otherwise wrap the value as a single text content block.
			if (isToolCallResult(result)) {
				return result;
			}
			const text =
				typeof result === 'string' ? result : JSON.stringify(result, null, 2);
			const content: ContentBlock[] = [{ type: 'text', text }];
			return { content };
		},
	};
}
