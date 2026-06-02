/**
 * @blitzlist/core
 *
 * Pure domain logic — no platform imports, no framework imports.
 * Framework-agnostic TypeScript that survives any platform migration.
 *
 * Modules:
 * - auth.ts          request-context resolution (BL-008+)
 * - executor.ts      who/what is currently executing an item (BL-009)
 *
 * Coming soon:
 * - state machines (per list)
 * - permissions / scoping (BL-011)
 * - relation labels registry (BL-026)
 * - compass scoring + slot/metric bridging (BL-032)
 * - storage adapter interface (R2 → swap to S3 if ever needed)
 */

export * from './auth.js';
export * from './executor.js';
export * from './release.js';
export * from './fields.js';
export * from './stakeholder.js';
export * from './wordlist.js';

export const VERSION = '0.1.0';
