/**
 * Bindings + vars exposed to the Worker. Mirrors wrangler.toml.
 *
 * v0.1 auth is OAuth 2.1 + DCR via @cloudflare/workers-oauth-provider (BL-010).
 * For the spike, every successful consent issues a token bound to the same
 * hardcoded user + workspace from the vars below — real per-user accounts
 * land with BL-009 magic-link sign-in in v0.5.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export type Env = {
	// === Cloudflare resource bindings ===
	DB: D1Database;
	KV: KVNamespace;
	OAUTH_KV: KVNamespace; // dedicated namespace for OAuth state
	ATTACHMENTS: R2Bucket;
	// WORKSPACE_DO: DurableObjectNamespace;  // ships in BL-015
	// FILE_EXTRACTION_QUEUE: Queue;           // ships in BL-022

	// === Auto-bound by OAuthProvider ===
	OAUTH_PROVIDER: OAuthHelpers;

	// === v0.1 single-user spike (BL-010 issues tokens bound to these IDs;
	//      replaced by real users + workspaces in BL-009 / v0.5) ===
	BLITZLIST_SPIKE_USER_ID: string;
	BLITZLIST_SPIKE_WORKSPACE_ID: string;
};

/**
 * Props carried inside an OAuth access token's grant. The OAuthProvider
 * attaches these to ctx.props on every authenticated /mcp request, so
 * tool handlers (BL-006+) read them via the Hono context.
 */
export type OAuthProps = {
	user_id: string;
	workspace_id: string;
};
