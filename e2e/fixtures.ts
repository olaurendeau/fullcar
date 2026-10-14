import { test as base } from "@playwright/test";
import type { Kysely } from "kysely";
import { createDb } from "@/db/client";
import type { Database } from "@/db/schema";
import { seedEvent, type SeededEvent } from "@/db/test-events";

export { expect } from "@playwright/test";

const E2E_HOST = "db";
const E2E_DATABASE = "fullcar";

/**
 * The slot's database, the one its app serves, and nothing else: a URL reaching another
 * host or another database is refused before any connection. The message never repeats
 * the URL, which may carry a password.
 */
export function e2eDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("e2e: DATABASE_URL is not set");
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  if (parsed?.hostname !== E2E_HOST || parsed.pathname !== `/${E2E_DATABASE}`) {
    throw new Error(`e2e: DATABASE_URL must reach the database ${E2E_DATABASE} at host ${E2E_HOST}`);
  }
  return url;
}

/**
 * `db`: the slot's database, one connection pool per worker.
 * `seededEvent`: an event of the test's own, stored before it starts and deleted after it
 * (its rows go with it, by ON DELETE CASCADE). The test reaches it by `/e/{id}`, and by
 * its organiser's `token`.
 * Playwright's `use` is named `provide` here: the React hooks lint rule takes `use` for a hook.
 */
export const test = base.extend<{ seededEvent: SeededEvent }, { db: Kysely<Database> }>({
  db: [
    async ({}, provide) => {
      const db = createDb(e2eDatabaseUrl(process.env.DATABASE_URL));
      await provide(db);
      await db.destroy();
    },
    { scope: "worker" },
  ],
  seededEvent: async ({ db }, provide) => {
    const event = await seedEvent(db);
    await provide(event);
    await db.deleteFrom("event").where("id", "=", event.id).execute();
  },
});
