import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * - Dialect: SQLite (D1 is SQLite-compatible)
 * - Schema source: this package's src/schema.ts
 * - Output: apps/api/migrations/  (where wrangler looks for D1 migrations)
 *
 * Run from package root:
 *   pnpm db:generate          → produces a new 0NNN_*.sql migration file
 *   pnpm db:check             → verifies the schema is consistent
 *
 * To apply migrations locally:
 *   wrangler d1 migrations apply blitzlist-dev --local        (from apps/api)
 * To apply remotely:
 *   wrangler d1 migrations apply blitzlist-dev --remote       (from apps/api)
 */
export default {
	schema: './src/schema.ts',
	out: '../../apps/api/migrations',
	dialect: 'sqlite',
	strict: true,
	verbose: true,
} satisfies Config;
