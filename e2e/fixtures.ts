import { test as base } from "@playwright/test";
import type { Kysely } from "kysely";
import { createDb } from "@/db/client";
import type { Database } from "@/db/schema";
import type { NewEvent } from "@/domain/event";
import { seedEvent, type SeededEvent } from "@/db/test-events";

export { expect } from "@playwright/test";

/**
 * The only shape accepted, from end to end: `postgres[ql]://[credentials@]db[:port]/fullcar`,
 * that is `postgres` or `postgresql`, optional credentials, host `db`, optional port,
 * database `fullcar`, and nothing after.
 * pg takes a host, a port or a socket from more than the URL's host part (`?host=`,
 * `?port=`, `socket://`, a leading `/`, a `%2F` host): rather than list those, anything
 * else (a query string, a fragment, another host or scheme) is refused.
 */
const SLOT_DATABASE_URL = /^postgres(?:ql)?:\/\/(?:[^@/?#\\\s]+@)?db(?::\d+)?\/fullcar$/;

/**
 * The slot's database, the one its app serves, and nothing else: refused before any
 * connection otherwise. The message never repeats the URL, which may carry a password.
 */
export function e2eDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("e2e: DATABASE_URL is not set");
  if (!SLOT_DATABASE_URL.test(url)) {
    throw new Error("e2e: DATABASE_URL must reach the database fullcar at host db");
  }
  return url;
}

/**
 * `db`: the slot's database, one connection pool per worker.
 * `seededEvent`: an event of the test's own, stored before it starts and deleted after it
 * (its rows go with it, by ON DELETE CASCADE). The test reaches it by `/e/{id}`, and by
 * its organiser's `token`.
 * `eventFields`: what the seeded event changes from the seed, set by `test.use()`.
 * Playwright's `use` is named `provide` here: the React hooks lint rule takes `use` for a hook.
 */
export const test = base.extend<
  { eventFields: Partial<NewEvent>; seededEvent: SeededEvent },
  { db: Kysely<Database> }
>({
  eventFields: [{}, { option: true }],
  db: [
    async ({}, provide) => {
      const db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL));
      await provide(db);
      await db.destroy();
    },
    { scope: "worker" },
  ],
  seededEvent: async ({ db, eventFields }, provide) => {
    const event = await seedEvent(db, eventFields);
    await provide(event);
    await db.deleteFrom("event").where("id", "=", event.id).execute();
  },
});
