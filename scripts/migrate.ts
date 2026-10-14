import { NO_MIGRATIONS } from "kysely/migration";
import { createDb } from "../src/db/client";
import { createMigrator } from "../src/db/migrator";
import { planMigration, redactConnection } from "./migration-plan";

// Never print the connection string, nor any part of it but the port and the values of the allowed
// query keys (redactConnection): build logs are not ours to purge.
const [argument = "latest"] = process.argv.slice(2);
const plan = planMigration(argument, process.env);
if (plan.action === "skip") {
  console.log(plan.reason);
  process.exit(0);
}

const url = process.env[plan.variable] as string;
console.log(`Migrating (${plan.command}) through ${plan.variable}`);
const db = createDb(url);
const migrator = createMigrator(db);
const run = {
  latest: () => migrator.migrateToLatest(),
  up: () => migrator.migrateUp(),
  down: () => migrator.migrateDown(),
  reset: () => migrator.migrateTo(NO_MIGRATIONS),
}[plan.command];

let failure: unknown;
try {
  const { error, results = [] } = await run();
  for (const r of results) console.log(`${r.status.padEnd(11)} ${r.direction} ${r.migrationName}`);
  if (results.length === 0 && !error) console.log("Nothing to migrate");
  failure = error;
} catch (error) {
  failure = error;
} finally {
  await db.destroy().catch(() => {});
}
if (failure) {
  const detail = failure instanceof Error ? (failure.stack ?? failure.message) : String(failure);
  console.error(redactConnection(detail, url));
  process.exit(1);
}
