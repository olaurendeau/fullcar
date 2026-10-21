import { expect, test as base, type Locator, type Page, type TestInfoError } from "@playwright/test";
import type { Kysely } from "kysely";
import { createDb } from "@/db/client";
import type { Database } from "@/db/schema";
import type { NewEvent } from "@/domain/event";
import { seedEvent, type SeededEvent } from "@/db/test-events";

export { expect };

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

/**
 * The page reaches a URL that `url` matches, checked without printing it (#365): the URL a
 * failure would show may be the organiser's link, which `toHaveURL` prints whole.
 */
export function expectUrl(page: Page, url: RegExp, message: string) {
  return expect.poll(() => url.test(page.url()), { message }).toBe(true);
}

/**
 * The locator shows exactly `text`, compared without printing either (#365): one of the
 * organiser's two links, or a link a regression made one, would show the token.
 */
export function expectText(locator: Locator, text: string, message: string) {
  return expect.poll(async () => (await locator.innerText()) === text, { message }).toBe(true);
}

/**
 * For a file that opens a page with a valid token, the organiser's or a device's personal one,
 * called at its top: nothing Playwright writes when a test fails may carry the token (#158).
 * No trace. No aria snapshot of a failed `expect` on a locator: taken when it fails, it shows
 * the organiser's link. And every page of the test's context leaves for about:blank before
 * the context closes, when Playwright takes the page snapshot it then writes into
 * error-context.md. A page that cannot leave (crashed, stuck) is closed instead: it neither
 * stays where it was nor fails a test that passed.
 * The test's own context only: one the test opens itself, by browser.newContext(), is not
 * cleared, and none opens a page with a valid token today.
 */
export function leaveNoToken() {
  test.use({ trace: "off" });
  test.afterEach(async ({ context }, testInfo) => {
    for (const error of testInfo.errors) {
      for (let each: TestInfoError | undefined = error; each; each = each.cause) delete each.errorContext;
    }
    for (const page of context.pages()) {
      await page.goto("about:blank", { timeout: 5_000 }).catch(() => page.close());
    }
  });
}
