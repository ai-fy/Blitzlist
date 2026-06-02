/**
 * @blitzlist/mcp
 *
 * MCP server implementation for Blitzlist. Transport-agnostic core that
 * apps/api wires up to an HTTP route. Tools land here progressively:
 *
 *   v0.1  (now)        empty registry; protocol handshake works
 *   BL-006             add_item, list_items, get_item
 *   BL-007             set_state, comment
 *   BL-009             set_executor
 *   BL-010+            OAuth-aware tools (link_pr, request_review, ...)
 *
 * MCP spec target: 2024-11-05.
 */

export * from './protocol.js';
export * from './server.js';
export * from './tools.js';
