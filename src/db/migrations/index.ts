import type { Migration } from "kysely/migration";

/**
 * Every migration, in order. Listed statically rather than read from the folder,
 * so the same list works under tsx, Vitest and a bundled serverless function.
 * Each one must have a `down`: the migration test runs it.
 */
export const migrations: Record<string, Migration> = {};
