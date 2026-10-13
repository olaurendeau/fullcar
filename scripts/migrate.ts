import { NO_MIGRATIONS } from "kysely/migration";
import { createDb } from "../src/db/client";
import { createMigrator } from "../src/db/migrator";

const [command = "latest"] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
const migrator = createMigrator(db);
const run = {
  latest: () => migrator.migrateToLatest(),
  up: () => migrator.migrateUp(),
  down: () => migrator.migrateDown(),
  reset: () => migrator.migrateTo(NO_MIGRATIONS),
}[command];
if (!run) throw new Error(`Unknown command "${command}": latest, up, down or reset`);

const { error, results = [] } = await run();
for (const r of results) console.log(`${r.status.padEnd(11)} ${r.direction} ${r.migrationName}`);
if (results.length === 0) console.log("Nothing to migrate");
await db.destroy();
if (error) {
  console.error(error);
  process.exit(1);
}
