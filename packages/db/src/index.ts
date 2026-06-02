/**
 * @blitzlist/db
 *
 * Drizzle schema + typed client (SQLite dialect against D1).
 * Schema lives in ./schema.ts; migrations live alongside in apps/api/migrations/.
 *
 * Usage from a Worker:
 *
 *   import { drizzle } from 'drizzle-orm/d1';
 *   import { schema } from '@blitzlist/db';
 *
 *   const db = drizzle(env.DB, { schema });
 *   const items = await db.select().from(schema.items).limit(10);
 */

export * from './schema.js';
export { schema as default } from './schema.js';

export const SCHEMA_VERSION = 1; // bumps with each migration
