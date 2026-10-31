import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import { readAdminTokenHash } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { seedEvent } from "@/db/test-events";
import { adminTokenKey, expect, expectUrl, leaveNoToken, test } from "./fixtures";
import { newAddress } from "./mailbox";
import { areaEditButton, areaRefused } from "./organiser";

// The page sends the session's token and the admin tokens: nothing a failure writes may show them.
leaveNoToken();

/*
 * « Se déconnecter » in « Mon compte », at the bottom of /mes-evenements (#609, organizer-account
 * OA9.1, OA9.2): the session's token and every admin token this browser keeps go in the body of
 * `signOut`, which ends the session and revokes the tokens; the browser forgets them and lands
 * on /connexion with « Session fermée. ». Each test its own account and event, deleted after it.
 */

const SESSION_KEY = "fullcar:session";
const isPageAction = (request: Request) =>
  request.method() === "POST" && request.headers()["next-action"] !== undefined && new URL(request.url()).pathname === "/mes-evenements";

let accounts: string[] = [];
let events: string[] = [];
test.afterEach(async ({ db }) => {
  if (events.length > 0) await db.deleteFrom("event").where("id", "in", events).execute();
  // Its sessions go with it, by ON DELETE CASCADE.
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
  events = [];
});

/**
 * An account with two sessions, the first kept by this browser, which also created a pending
 * event and keeps its admin token. Stored once, on `/`: nothing puts them back afterwards.
 */
async function signedInCreator(page: Page, db: Kysely<Database>) {
  const email = newAddress();
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const session = await seedSession(db, accountId);
  const elsewhere = await seedSession(db, accountId);
  const created = await seedEvent(db);
  events.push(created.id);
  await page.goto("/");
  await page.evaluate(
    ([sessionKey, session, adminKey, admin]) => {
      localStorage.setItem(sessionKey, session);
      localStorage.setItem(adminKey, admin);
    },
    [SESSION_KEY, session, adminTokenKey(created.id), created.token],
  );
  return { email, session, elsewhere, created };
}

/** Whether this browser still keeps the session's token, and the event's admin token. */
const kept = (page: Page, eventId: string) =>
  page.evaluate(
    ([sessionKey, adminKey]) => ({ session: localStorage.getItem(sessionKey) !== null, admin: localStorage.getItem(adminKey) !== null }),
    [SESSION_KEY, adminTokenKey(eventId)],
  );

test.describe("Se déconnecter", () => {
  test.use({ locale: "fr-FR" });

  test("OA9.1: « Mon compte » at the bottom; « Se déconnecter » leads to /connexion, the session closed and the admin tokens revoked", async ({
    page,
    db,
    browser,
  }) => {
    const { email, session, elsewhere, created } = await signedInCreator(page, db);
    await page.goto(`/e/${created.id}/admin`);
    await expect(areaEditButton(page)).toBeVisible();

    await page.goto("/mes-evenements");
    const account = page.getByRole("main").getByRole("region", { name: "Mon compte" });
    await expect(account.getByRole("heading", { level: 2 })).toHaveText("Mon compte");
    await expect(account.getByText(email, { exact: true })).toBeVisible();
    const signOut = account.getByRole("button", { name: "Se déconnecter" });
    // At the bottom of the list, after « Créer un événement » and the sections.
    const empty = page.getByRole("heading", { name: "Aucun événement pour l’instant" });
    expect((await signOut.boundingBox())!.y).toBeGreaterThan((await empty.boundingBox())!.y);

    // Every request from here on, and its headers as sent, `Cookie` included (my-events.spec.ts).
    const sent: Request[] = [];
    page.on("request", (request) => sent.push(request));
    const headers: Promise<string[]>[] = [];
    page.on("requestfinished", (request) => headers.push(request.allHeaders().then(Object.values)));
    const request = page.waitForRequest(isPageAction);
    await signOut.click();
    const body = (await request).postData() ?? "";
    expect(body.includes(session), "signOut carries the session's token in its body").toBe(true);
    expect(body.includes(created.token), "signOut carries the admin token in its body").toBe(true);

    // No confirmation: /connexion, and « Session fermée. » there, which takes the focus (« Le focus »).
    await expectUrl(page, /\/connexion$/, "the sign-out leads to /connexion");
    const signedOut = page.getByRole("status").filter({ hasText: "Session fermée." });
    await expect(signedOut).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter");
    expect(await kept(page, created.id)).toEqual({ session: false, admin: false });
    expect(await findSession(db, session)).toBeUndefined();
    expect(await readAdminTokenHash(db, created.id)).toBeNull();

    expect(headers.length).toBeGreaterThan(0);
    const texts = [...sent.map((each) => each.url()), ...(await Promise.all(headers)).flat()];
    expect(texts.filter((text) => text.includes(session) || text.includes(created.token)).length, "URLs and headers with a token").toBe(0);

    // Once, without a reload (memory is not cleared): to the form and back, /connexion says nothing.
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expectUrl(page, /\/nouveau$/, "the link leads to /nouveau");
    await page.goBack();
    await expectUrl(page, /\/connexion$/, "back leads to /connexion");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter");
    await expect(page.getByText("Session fermée.")).toHaveCount(0);

    // Then: /mes-evenements leads to /connexion, without the line, and the event created here no longer opens its panel.
    await page.goto("/mes-evenements");
    await expectUrl(page, /\/connexion$/, "/mes-evenements leads to /connexion");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter");
    await expect(page.getByText("Session fermée.")).toHaveCount(0);
    // Even with its old token put back, as a copy of the storage would: revoked on the server.
    await page.evaluate(([key, token]) => localStorage.setItem(key, token), [adminTokenKey(created.id), created.token]);
    await page.goto(`/e/${created.id}/admin`);
    await expect(areaRefused(page)).toBeVisible();

    // Another context of the same account keeps its session.
    const other = await browser.newContext({ locale: "fr-FR" });
    try {
      const otherPage = await other.newPage();
      await otherPage.goto("/");
      await otherPage.evaluate(([key, token]) => localStorage.setItem(key, token), [SESSION_KEY, elsewhere]);
      await otherPage.goto("/mes-evenements");
      await expect(otherPage.getByText(`Session ouverte avec ${email}`, { exact: true })).toBeVisible();
      await otherPage.goto("about:blank");
    } finally {
      await other.close();
    }
  });

  test("OA9.2: offline, Account.signOutFailed in the bar, and the session stays open", async ({ page, db }) => {
    const { session, created } = await signedInCreator(page, db);
    let offline = false;
    await page.route("**/mes-evenements", (route) =>
      offline && isPageAction(route.request()) ? route.abort("internetdisconnected") : route.fallback(),
    );
    await page.goto("/mes-evenements");
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    await expect(signOut).toBeVisible();

    offline = true;
    await signOut.click();
    await expect(page.getByRole("alert").filter({ hasText: "La session n’a pas été fermée." })).toHaveText(
      "La session n’a pas été fermée. Vérifiez la connexion, puis réessayez.",
    );
    expect(new URL(page.url()).pathname).toBe("/mes-evenements");
    expect(await kept(page, created.id)).toEqual({ session: true, admin: true });
    expect(await findSession(db, session)).toBeDefined();
    expect(await readAdminTokenHash(db, created.id)).not.toBeNull();

    // « Fermer » takes the bar away; the session is still open on a new load.
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByText("La session n’a pas été fermée.")).toHaveCount(0);
    offline = false;
    await page.reload();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });
});

test.describe("Sign out, in English", () => {
  test.use({ locale: "en-US" });

  test("the words of « Mon compte », its failure, and of /connexion after it", async ({ page, db }) => {
    const { email } = await signedInCreator(page, db);
    let offline = false;
    await page.route("**/mes-evenements", (route) =>
      offline && isPageAction(route.request()) ? route.abort("internetdisconnected") : route.fallback(),
    );
    await page.goto("/mes-evenements");
    const account = page.getByRole("region", { name: "My account" });
    await expect(account.getByText(email, { exact: true })).toBeVisible();
    offline = true;
    await account.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "You were not signed out." })).toHaveText(
      "You were not signed out. Check your connection, then try again.",
    );
    offline = false;
    await account.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Signed out." })).toBeFocused();
  });
});
