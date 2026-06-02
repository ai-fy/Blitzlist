/**
 * Auth — `RequestContext` abstraction.
 *
 * Tool handlers (BL-006+) consume a `RequestContext` regardless of how the
 * caller authenticated. v0.1 sources it from OAuth grants (single-user
 * spike). Future auth methods (stakeholder keys, share codes) will produce
 * the same shape with a different `actor` discriminator and a scoped
 * `scope`.
 *
 * Bearer-token validation itself lives in @cloudflare/workers-oauth-provider
 * (BL-010); this file just defines the shape that flows into the application
 * layer.
 */

/**
 * The context every authenticated request carries. Drizzle queries in
 * apps/api filter by `workspace_id` and (where relevant) `scope` against this.
 */
export type RequestContext = {
	workspace_id: string;
	actor:
		| { kind: 'user'; user_id: string }
		// future:
		// | { kind: 'stakeholder'; key_hash: string; label: string }
		// | { kind: 'anonymous'; share_code: string; ip: string }
		;
	scope: {
		// v0.1: full workspace access. Stakeholder keys and share codes will
		// populate these with subsets when those ship in v0.5.
		all: boolean;
	};
	permissions: Array<'read' | 'comment' | 'propose' | 'approve' | 'edit' | 'admin'>;
	auth_method: 'oauth' | 'stakeholder-key' | 'share-code';
};
