import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #595, organizer-account OA9.6 and the visit half of OA9.7: each page load sends the
 * browser's session token, from `localStorage` (`fullcar:session`), to the `visit` action,
 * in its body. The session slides, and the account notes the visit and the page's language.
 * An ended session is not brought back, and the browser forgets its token. Without a
 * token, a page load asks nothing.
 */

const KEY = "fullcar:session";
const DAY = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

/** Keeps `token` under fullcar:session before any script of each page runs. */
async function holdSession(page: Page, token: string) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, token]);
}

const keptToken = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

/** The account's and its one session's dates, and the account's language. */
async function datesOf(db: Kysely<Database>, accountId: string) {
  const account = await db
    .selectFrom("account")
    .select(["locale", "last_visit_at"])
    .where("id", "=", accountId)
    .executeTakeFirstOrThrow();
  const session = await db
    .selectFrom("session")
    .select(["created_at", "last_visit_at"])
    .where("account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  return { account, session };
}

test.describe("the visit of a page load", () => {
  test.use({ locale: "en-US" });

  let accountId: string | undefined;
  test.afterEach(async ({ db }) => {
    // Its sessions go with it, by ON DELETE CASCADE.
    if (accountId) await db.deleteFrom("account").where("id", "=", accountId).execute();
    accountId = undefined;
  });

  for (const [name, path] of [
    ["the home page", () => "/"],
    ["an event's link", (id: string) => `/e/${id}`],
  ] as const) {
    test(`OA9.7: ${name} slides a session opened 3 years ago, in the body only, and notes the visit in English`, async ({
      page,
      db,
      seededEvent,
    }) => {
      accountId = await seedAccount(db, { locale: "fr", last_visit_at: daysAgo(40) });
      const opened = daysAgo(3 * 365);
      const token = await seedSession(db, accountId, { createdAt: opened, lastVisitAt: daysAgo(1) });
      await holdSession(page, token);
      const sent: Request[] = [];
      page.on("request", (request) => {
        if (isAction(request)) sent.push(request);
      });
      const answered = page.waitForResponse((response) => isAction(response.request()));
      const before = Date.now();
      await page.goto(path(seededEvent.id));
      expect((await answered).ok(), "the visit is answered").toBe(true);

      expect(sent.length, "one visit for one page load").toBe(1);
      const [visit] = sent;
      expect(visit!.postData()?.includes(token), "the token is in the body").toBe(true);
      expect(visit!.url().includes(token), "the token is not in the URL").toBe(false);
      const headers = await visit!.allHeaders();
      expect(Object.values(headers).some((value) => value.includes(token)), "the token is in no header").toBe(false);

      const { account, session } = await datesOf(db, accountId);
      expect(session.created_at).toEqual(opened);
      expect(session.last_visit_at.getTime()).toBeGreaterThan(before - 60_000);
      expect(account).toEqual({ locale: "en", last_visit_at: session.last_visit_at });
      expect((await keptToken(page)) === token, "the browser keeps its session").toBe(true);
    });
  }

  test("OA9.6: a session last visited 91 days ago is not brought back, and the browser forgets its token", async ({
    page,
    db,
  }) => {
    accountId = await seedAccount(db, { locale: "fr", last_visit_at: daysAgo(91) });
    const token = await seedSession(db, accountId, { lastVisitAt: daysAgo(91) });
    const seeded = await datesOf(db, accountId);
    await holdSession(page, token);
    const answered = page.waitForResponse((response) => isAction(response.request()));
    await page.goto("/");
    await answered;
    await expect.poll(() => keptToken(page), { message: "the token is forgotten" }).toBeNull();
    expect(await datesOf(db, accountId)).toEqual(seeded);
  });

  test("a visit that fails keeps the token: nothing says the session ended", async ({ page, db }) => {
    accountId = await seedAccount(db);
    const token = await seedSession(db, accountId);
    await holdSession(page, token);
    await page.route("**/*", (route) => (isAction(route.request()) ? route.abort("internetdisconnected") : route.fallback()));
    const failed = page.waitForEvent("requestfailed", (request) => isAction(request));
    await page.goto("/");
    await failed;
    expect((await keptToken(page)) === token, "the browser keeps its session").toBe(true);
  });

  test("without a session, a page load sends nothing", async ({ page, seededEvent }) => {
    const sent: Request[] = [];
    page.on("request", (request) => {
      if (isAction(request)) sent.push(request);
    });
    for (const path of ["/", `/e/${seededEvent.id}`]) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
    expect(sent).toEqual([]);
  });
});
