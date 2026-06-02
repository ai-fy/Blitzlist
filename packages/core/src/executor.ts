/**
 * Executor — who/what is currently doing the work on an item.
 *
 * Orthogonal to `assignee_id` (the accountable human). The executor moves
 * an item through its states; the assignee owns the outcome. They can be the
 * same person (`assignee_id = "usr-malte"`, `executor = "human:usr-malte"`)
 * or different (`assignee_id = "usr-malte"`, `executor = "agent:claude"` —
 * Malte is accountable; Claude is doing the work right now).
 *
 * Format (free text, validated here):
 *   human:<user_id>        e.g. "human:usr-malte"
 *   agent:claude           the canonical Claude executor
 *   agent:<name>           any other named agent (e.g. "agent:gemini")
 *   self                   the workspace owner / current actor
 *   contractor:<label>     freeform external party (e.g. "contractor:acme")
 *   null                   no executor assigned
 *
 * The validator enforces the prefix + minimal payload rules. The router
 * (`defaultExecutorForList`) suggests an executor from the list template.
 */

export type ExecutorKind = 'human' | 'agent' | 'self' | 'contractor';

export type ParsedExecutor =
	| { kind: 'human'; user_id: string }
	| { kind: 'agent'; name: string }
	| { kind: 'self' }
	| { kind: 'contractor'; label: string };

const NAME_RX = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Parse + validate an executor string. Throws on malformed input.
 * Returns the discriminated shape for downstream branching.
 */
export function parseExecutor(raw: string): ParsedExecutor {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new Error('Executor cannot be empty; pass null to clear it');
	}

	if (trimmed === 'self') {
		return { kind: 'self' };
	}

	const colon = trimmed.indexOf(':');
	if (colon === -1) {
		throw new Error(
			`Invalid executor "${raw}". Expected one of: self, human:<uid>, agent:<name>, contractor:<label>`,
		);
	}
	const prefix = trimmed.slice(0, colon);
	const payload = trimmed.slice(colon + 1);
	if (payload.length === 0) {
		throw new Error(`Executor "${raw}" is missing its payload after the colon`);
	}

	switch (prefix) {
		case 'human':
			if (!NAME_RX.test(payload)) {
				throw new Error(
					`Invalid user_id in "${raw}". Expected human:<id> where id matches /^[a-z0-9][a-z0-9_-]*$/i`,
				);
			}
			return { kind: 'human', user_id: payload };
		case 'agent':
			if (!NAME_RX.test(payload)) {
				throw new Error(
					`Invalid agent name in "${raw}". Expected agent:<name> where name matches /^[a-z0-9][a-z0-9_-]*$/i`,
				);
			}
			return { kind: 'agent', name: payload };
		case 'contractor':
			if (payload.length > 64) {
				throw new Error(`Contractor label too long (max 64 chars) in "${raw}"`);
			}
			return { kind: 'contractor', label: payload };
		default:
			throw new Error(
				`Unknown executor prefix "${prefix}" in "${raw}". Allowed: human, agent, contractor (or bare "self").`,
			);
	}
}

/**
 * True if `raw` is a valid executor string; never throws. Useful in validators
 * that want to compose error messages.
 */
export function isValidExecutor(raw: string): boolean {
	try {
		parseExecutor(raw);
		return true;
	} catch {
		return false;
	}
}

/**
 * Routing default — given the template slug, suggest an executor for new items.
 *
 * Pass the template's `slug` (e.g. "bugs"), NOT its DB id (BL-035 changed templates
 * to be DB rows with uuid IDs and slugs separately).
 *
 * Template defaults:
 *   bugs    → agent:claude   (triage is a great fit for agents)
 *   todos   → self           (personal task lists default to the owner)
 *   ideas   → self           (you write your own ideas down)
 *   backlog → null           (planning lists wait for explicit assignment)
 *   anything else → null
 *
 * Returns null for templates that don't have a useful default. Callers can
 * always override with an explicit `executor` arg.
 */
export function defaultExecutorForTemplate(slug: string | null | undefined): string | null {
	switch (slug) {
		case 'bugs':
			return 'agent:claude';
		case 'todos':
		case 'ideas':
			return 'self';
		default:
			return null;
	}
}

/**
 * Resolve "self" against a concrete user_id. Used at write time to materialize
 * the abstract `self` into a stable `human:<uid>` so the activity log doesn't
 * lose meaning if the executing actor changes later.
 *
 * If `raw` is "self", returns `human:<user_id>`. Otherwise passes through.
 */
export function resolveSelf(raw: string, user_id: string): string {
	if (raw.trim() === 'self') {
		return `human:${user_id}`;
	}
	return raw;
}
