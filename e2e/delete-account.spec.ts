import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import { findAccount } from "@/db/accounts";
import { readAdminTokenHash } from "@/db/events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { seedAccount, seedLink, seedSends, seedSession } from "@/db/test-accounts";
import { seedEvent, seedPendingSend } from "@/db/test-events";
import { adminTokenKey, expect, expectUrl, leaveNoToken, test } from "./fixtures";
import { newAddress } from "./mailbox";

// The page sends the session's token and the admin tokens: nothing a failure writes may show them.
leaveNoToken();

// « Supprimer mon compte » (#610, organizer-account OA9.3 to OA9.5). Each test its own account and events, deleted after it.

const SESSION_KEY = "fullcar:session";
const isPageAction = (request: Request) =>
  request.method() === "POST" && request.headers()["next-action"] !== undefined && new URL(request.url()).pathname === "/mes-evenements";

let accounts: string[] = [];
let events: string[] = [];
let addresses: string[] = [];
test.afterEach(async ({ db }) => {
  if (events.length > 0) await db.deleteFrom("event").where("id", "in", events).execute();
  if (addresses.length > 0) await db.deleteFrom("email_send").where("email", "in", addresses).execute();
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
  events = [];
  addresses = [];
});

/** The event confirmed by the account, anonymised if asked, with its admin token kept by no one. */
async function confirmed(db: Kysely<Database>, accountId: string, { anonymised = false } = {}) {
  const created = await seedEvent(db);
  events.push(created.id);
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", created.id).execute();
  if (anonymised) await db.updateTable("event").set({ admin_token_hash: null, anonymised_at: new Date() }).where("id", "=", created.id).execute();
  return created;
}

/**
 * An account with a session in this browser, which also created a pending event and keeps its
 * admin token. Stored once, on `/`: nothing puts them back afterwards.
 */
async function signedIn(page: Page, db: Kysely<Database>) {
  const email = newAddress();
  addresses.push(email);
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const session = await seedSession(db, accountId);
  const pending = await seedEvent(db);
  events.push(pending.id);
  await page.goto("/");
  await page.evaluate(
    ([sessionKey, session, adminKey, admin]) => {
      localStorage.setItem(sessionKey, session);
      localStorage.setItem(adminKey, admin);
    },
    [SESSION_KEY, session, adminTokenKey(pending.id), pending.token],
  );
  return { email, accountId, session, pending };
}

const kept = (page: Page, eventId: string) =>
  page.evaluate(
    ([sessionKey, adminKey]) => ({ session: localStorage.getItem(sessionKey) !== null, admin: localStorage.getItem(adminKey) !== null }),
    [SESSION_KEY, adminTokenKey(eventId)],
  );

test.describe("Supprimer mon compte", () => {
  test.use({ locale: "fr-FR" });

  test("OA9.3: the confirmation says what is erased and what stays open, with the focus on « Annuler »; « Annuler » and Escape change nothing", async ({
    page,
    db,
  }) => {
    const { accountId } = await signedIn(page, db);
    await confirmed(db, accountId);
    await confirmed(db, accountId);
    await confirmed(db, accountId, { anonymised: true });
    await page.goto("/mes-evenements");

    const open = page.getByRole("main").getByRole("button", { name: "Supprimer mon compte" });
    // After « Se déconnecter », in « Mon compte ».
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    expect((await open.boundingBox())!.y).toBeGreaterThan((await signOut.boundingBox())!.y);
    await open.click();

    const dialog = page.getByRole("alertdialog", { name: "Supprimer votre compte ?" });
    await expect(dialog.getByText("Votre adresse e-mail et l’historique de vos événements seront effacés.", { exact: true })).toBeVisible();
    // Two events with sign-ups not erased yet; the anonymised one is not counted.
    await expect(
      dialog.getByText(
        "Les 2 événements dont les inscriptions ne sont pas encore effacées restent ouverts aux participants, sans organisateur, et seront supprimés 30 jours après leur date.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByText("C’est définitif.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused();

    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();

    await open.click();
    await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(new URL(page.url()).pathname).toBe("/mes-evenements");
    expect(await findAccount(db, accountId)).toBeDefined();
  });

  test("OA9.5: deleted, `/` says so once; the address is in no table; the open event is orphan for all, the anonymised one is gone", async ({
    page,
    db,
    browser,
  }) => {
    const { email, accountId, session, pending } = await signedIn(page, db);
    const open = await confirmed(db, accountId);
    const ended = await confirmed(db, accountId, { anonymised: true });
    // The address elsewhere: a sign-in link, sends, and a pending event created by someone else.
    await seedLink(db, { kind: "login", accountId, returnEventId: null });
    await seedSends(db, 2, { kind: "login", email });
    const elsewhere = await seedEvent(db);
    events.push(elsewhere.id);
    await seedPendingSend(db, elsewhere.id, { email, status: "sent" });
    await page.goto("/mes-evenements");

    const sent: Request[] = [];
    page.on("request", (request) => sent.push(request));
    const headers: Promise<string[]>[] = [];
    page.on("requestfinished", (request) => headers.push(request.allHeaders().then(Object.values)));
    await page.getByRole("main").getByRole("button", { name: "Supprimer mon compte" }).click();
    const request = page.waitForRequest(isPageAction);
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer mon compte" }).click();
    const body = (await request).postData() ?? "";
    expect(body.includes(session), "deleteAccount carries the session's token in its body").toBe(true);
    expect(body.includes(pending.token), "deleteAccount carries the admin token in its body").toBe(true);

    await expectUrl(page, /\/$/, "the deletion leads to /");
    const line = page.getByRole("status").filter({ hasText: "Votre compte a été supprimé." });
    await expect(line).toHaveText("Votre compte a été supprimé.");
    await expect(line).toBeFocused();
    expect(await kept(page, pending.id)).toEqual({ session: false, admin: false });

    expect(headers.length).toBeGreaterThan(0);
    const texts = [...sent.map((each) => each.url()), ...(await Promise.all(headers)).flat()];
    expect(texts.filter((text) => text.includes(session) || text.includes(pending.token)).length, "URLs and headers with a token").toBe(0);

    // Once, without a reload (memory is not cleared): to the form and back, `/` says nothing.
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expectUrl(page, /\/nouveau$/, "the link leads to /nouveau");
    await page.goBack();
    await expectUrl(page, /\/$/, "back leads to /");
    await expect(page.getByRole("heading", { level: 1, name: "Fullcar" })).toBeVisible();
    await expect(page.getByText("Votre compte a été supprimé.")).toHaveCount(0);

    // Once: a reload says nothing.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Fullcar" })).toBeVisible();
    await expect(page.getByText("Votre compte a été supprimé.")).toHaveCount(0);

    // The address is in no table; the session is closed; the tokens are revoked.
    expect(await findAccount(db, accountId)).toBeUndefined();
    expect(await findSession(db, session)).toBeUndefined();
    expect(await readAdminTokenHash(db, pending.id)).toBeNull();
    expect(await readAdminTokenHash(db, open.id)).toBeNull();
    for (const table of ["account", "event", "email_send", "email_link", "session"] as const) {
      const rows = await db.selectFrom(table).selectAll().execute();
      expect(JSON.stringify(rows).includes(email), `the address in ${table}`).toBe(false);
    }

    // A visitor with no session, the creation browser's token put back included, sees AdminOrphan.
    const visitor = await browser.newContext({ locale: "fr-FR" });
    try {
      const other = await visitor.newPage();
      await other.goto("/");
      await other.evaluate(([key, token]) => localStorage.setItem(key, token), [adminTokenKey(open.id), open.token]);
      await other.goto(`/e/${open.id}/admin`);
      await expect(other.getByRole("heading", { level: 1 })).toHaveText("Cet événement n’a plus d’organisateur");
      // The event stays open to participants; the anonymised one answers « Événement introuvable ».
      await other.goto(`/e/${open.id}`);
      await expect(other.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
      await other.goto(`/e/${ended.id}`);
      await expect(other).toHaveTitle("Événement introuvable");
      await other.goto("about:blank");
    } finally {
      await visitor.close();
    }
  });

  test("OA9.4: offline, `DeleteAccount.failed` in the confirmation, which stays open, and nothing is erased or forgotten", async ({ page, db }) => {
    const { accountId, session, pending } = await signedIn(page, db);
    let offline = false;
    await page.route("**/mes-evenements", (route) =>
      offline && isPageAction(route.request()) ? route.abort("internetdisconnected") : route.fallback(),
    );
    await page.goto("/mes-evenements");
    await page.getByRole("main").getByRole("button", { name: "Supprimer mon compte" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Supprimer votre compte ?" });
    // No open event here (OA9.3): the sentence about them is absent.
    await expect(dialog.getByText("C’est définitif.", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/ouverts? aux participants/)).toHaveCount(0);

    offline = true;
    await dialog.getByRole("button", { name: "Supprimer mon compte" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Le compte n’a pas été supprimé. Vérifiez la connexion, puis réessayez.");
    await expect(dialog.getByRole("button", { name: "Supprimer mon compte" })).toBeFocused();
    expect(new URL(page.url()).pathname).toBe("/mes-evenements");
    expect(await kept(page, pending.id)).toEqual({ session: true, admin: true });
    expect(await findAccount(db, accountId)).toBeDefined();
    expect(await findSession(db, session)).toBeDefined();
    expect(await readAdminTokenHash(db, pending.id)).not.toBeNull();

    // Back online, the same confirmation deletes it.
    offline = false;
    await dialog.getByRole("button", { name: "Supprimer mon compte" }).click();
    await expectUrl(page, /\/$/, "the deletion leads to /");
    expect(await findAccount(db, accountId)).toBeUndefined();
  });

  // A retry could never succeed: no « Vérifiez la connexion », the way out is /connexion, as after « Se déconnecter ».
  test("a session closed by another tab leads to /connexion, saying « Session fermée. », and erases nothing", async ({ page, db }) => {
    const { accountId, session, pending } = await signedIn(page, db);
    await page.goto("/mes-evenements");
    await page.getByRole("main").getByRole("button", { name: "Supprimer mon compte" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Supprimer votre compte ?" });
    // Closed elsewhere, after the page was loaded.
    await db.deleteFrom("session").where("account_id", "=", accountId).execute();
    await dialog.getByRole("button", { name: "Supprimer mon compte" }).click();

    await expectUrl(page, /\/connexion$/, "a dead session leads to /connexion");
    await expect(page.getByText("Session fermée.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Vérifiez la connexion/)).toHaveCount(0);
    // The dead session's token is forgotten; the admin token, which nothing revoked, is kept.
    expect(await kept(page, pending.id)).toEqual({ session: false, admin: true });
    expect(await findAccount(db, accountId)).toBeDefined();
    expect(await readAdminTokenHash(db, pending.id)).not.toBeNull();
    expect(await findSession(db, session)).toBeUndefined();
  });
});

test.describe("Delete my account, in English", () => {
  test.use({ locale: "en-US" });

  test("the words of the confirmation, its failure, and of `/` after it", async ({ page, db }) => {
    const { accountId } = await signedIn(page, db);
    await confirmed(db, accountId);
    let offline = false;
    await page.route("**/mes-evenements", (route) =>
      offline && isPageAction(route.request()) ? route.abort("internetdisconnected") : route.fallback(),
    );
    await page.goto("/mes-evenements");
    await page.getByRole("region", { name: "My account" }).getByRole("button", { name: "Delete my account" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog.getByText("Your email address and the history of your events will be erased.", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("The event whose sign-ups are not erased yet stays open to participants, with no organiser, and will be deleted 30 days after its date.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.getByText("This cannot be undone.", { exact: true })).toBeVisible();
    // The send fails: the failure's words, the confirmation stays open and the account stays.
    offline = true;
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("The account was not deleted. Check your connection, then try again.");
    expect(await findAccount(db, accountId)).toBeDefined();
    offline = false;
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted." })).toBeFocused();
  });
});
