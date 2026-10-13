import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "./migrations";

// Migrations run against any schema, past or future: Kysely types them `Kysely<any>`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
}
