import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import { findLink } from "@/db/email-links";
import type { Database } from "@/db/schema";
import { seedAccount, seedLink, seedSends } from "@/db/test-accounts";
import { seedEvent, seedPendingSend } from "@/db/test-events";
import { CONFIRMATIONS_PER_EVENT } from "@/domain/send-limits";
import { expect, leaveNoToken, test } from "./fixtures";
import { mailTo, newAddress } from "./mailbox";

// A link's token is in the page's address, and the session's in `localStorage`: nothing a failure writes may show them.
leaveNoToken();

/*
 * /connexion/lien and /connexion/confirmer (#608, organizer-account OA5.1 to OA5.10, OA4.4, OA6.8,
 * and OA2.5 for the links a correction took away). Each test its own account, events and address,
 * deleted after it. The links are seeded with their dates, never with a clock moved forward.
 */

const SESSION_KEY = "fullcar:session";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const FR = {
  loginTitle: "Se connecter à Fullcar",
  loginButton: "Se connecter",
  confirmTitle: "Confirmer votre adresse",
  confirmButton: "Confirmer et se connecter",
  working: "Ouverture de la session…",
  offline: "La session n’a pas été ouverte. Vérifiez la connexion, puis réessayez.",
  failed: "La session n’a pas été ouverte. Une erreur est survenue : réessayez dans quelques minutes.",
  expired: "Ce lien a expiré",
  expiredLogin: "Un lien de connexion est valable 1 heure. Demandez-en un nouveau.",
  expiredConfirm: "Un lien de confirmation est valable 7 jours. Nous pouvons en envoyer un nouveau à la même adresse.",
  newLink: "Recevoir un nouveau lien",
  used: "Ce lien a déjà servi",
  usedLogin: "Un lien ne sert qu’une fois. Si vous venez de l’utiliser, votre session est peut-être déjà ouverte.",
  usedConfirm: "Cette adresse est déjà confirmée, et l’événement est dans Mes événements.",
  invalid: "Ce lien n’est pas valide",
  myEvents: "Mes événements",
  check: "Regardez vos e-mails",
  confirmBody:
    "Nous avons envoyé un nouveau lien de confirmation à l’adresse qui a créé l’événement. Il est valable 7 jours. Ouvrez-le dans le navigateur où vous voulez administrer l’événement.",
  tooMany: "Trop d’envois. Réessayez dans une heure.",
  notSent: "L’e-mail n’a pas été renvoyé. Vérifiez la connexion, puis réessayez.",
  signedInAs: (email: string) => `Session ouverte avec ${email}.`,
  needsJavaScript: "Se connecter nécessite JavaScript : activez-le, puis rechargez la page.",
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
const keptSession = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);

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

async function account(db: Kysely<Database>) {
  const email = newAddress();
  addresses.push(email);
  const id = await seedAccount(db, { email });
  accounts.push(id);
  return { id, email };
}

/** An event waiting for `email`'s confirmation, with a confirmation link created `ago` ms ago. */
async function pendingEvent(db: Kysely<Database>, email: string, ago = 0) {
  const event = await seedEvent(db);
  events.push(event.id);
  await seedPendingSend(db, event.id, { email, status: "sent" });
  const link = await seedLink(db, { kind: "confirmation", eventId: event.id }, { createdAt: new Date(Date.now() - ago) });
  return { ...event, link };
}

const sessionsOf = async (db: Kysely<Database>, accountId: string) =>
  (await db.selectFrom("session").select("account_id").where("account_id", "=", accountId).execute()).length;

test.describe("La page du lien", () => {
  test.use({ locale: "fr-FR" });

  test("OA5.1, OA5.2, OA5.10, OA6.8: opening the page and reloading it uses nothing up; « Se connecter » opens the session, once, and the token is in no URL, header or HTML", async ({
    page,
    db,
  }) => {
    const { id, email } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });

    // OA6.8: without a session, Mes événements leads to /connexion.
    await page.goto("/mes-evenements");
    await expect(page).toHaveURL(/\/connexion$/);

    const requests: Request[] = [];
    const documents: Promise<string>[] = [];
    page.on("request", (request) => requests.push(request));
    page.on("response", (response) => {
      if (response.request().resourceType() === "document") documents.push(response.text());
    });
    const headers: Promise<string[]>[] = [];
    page.on("requestfinished", (request) => headers.push(request.allHeaders().then(Object.values)));

    await page.goto(`/connexion/lien#${token}`);
    await expect(heading(page)).toHaveText(FR.loginTitle);
    await page.reload();
    await page.reload();
    await expect(page.getByRole("button", { name: FR.loginButton })).toBeEnabled();

    // OA5.1: nothing asked of the server, no session, the link still unused.
    expect(requests.filter(isAction)).toHaveLength(0);
    expect((await findLink(db, token))?.usedAt, "the link is not used by opening the page").toBeNull();
    expect(await sessionsOf(db, id), "no session is opened by opening the page").toBe(0);
    expect(await keptSession(page)).toBeNull();

    // Back through the history to know whether the fragment stays in it afterwards (OA5.2).
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    expect(await sessionsOf(db, id)).toBe(1);
    expect((await findLink(db, token))?.usedAt).not.toBeNull();
    expect(await keptSession(page)).not.toBeNull();
    // OA5.2: the focus is on the title, the bar says whose session it is, and the fragment is gone.
    await expect(heading(page)).toHaveText(FR.myEvents);
    await expect(heading(page)).toBeFocused();
    await expect(page.getByRole("status").getByText(FR.signedInAs(email), { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");

    // OA5.10: the token is in the body of the one action that carries it, and nowhere else.
    const carrying = requests.filter((request) => (request.postData() ?? "").includes(token));
    expect(carrying).toHaveLength(1);
    expect(isAction(carrying[0])).toBe(true);
    expect(new URL(carrying[0].url()).pathname).toBe("/connexion/lien");
    expect(requests.some((request) => request.url().includes(token)), "a request's URL carries the token").toBe(false);
    expect((await Promise.all(headers)).flat().some((value) => value.includes(token)), "a header carries the token").toBe(false);
    expect((await Promise.all(documents)).some((html) => html.includes(token)), "a document carries the token").toBe(false);
  });

  test("OA5.2: the fragment is in the history no more: back leaves the link behind", async ({ page, db }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });
    await page.goto("/nouveau");
    await page.goto(`/connexion/lien#${token}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/nouveau$/);
  });

  test("OA4.4: a sign-in asked from an event leads to the admin of that event", async ({ page, db }) => {
    const { id } = await account(db);
    const event = await seedEvent(db);
    events.push(event.id);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: event.id });
    await page.goto(`/connexion/lien#${token}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.id}/admin$`));
    await expect(page.getByRole("status").getByText(FR.signedInAs((await db.selectFrom("account").select("email").where("id", "=", id).executeTakeFirstOrThrow()).email))).toBeVisible();
  });

  test("OA5.3: « Confirmer et se connecter » leads to the admin of the event, with a session, and attaches it to the account", async ({ page, db }) => {
    const email = newAddress();
    addresses.push(email);
    const pending = await pendingEvent(db, email);
    await page.goto(`/connexion/confirmer#${pending.link}`);
    await expect(heading(page)).toHaveText(FR.confirmTitle);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${pending.id}/admin$`));
    const row = await db.selectFrom("event").select(["account_id", "confirmed_at"]).where("id", "=", pending.id).executeTakeFirstOrThrow();
    expect(row.confirmed_at).not.toBeNull();
    const created = await db.selectFrom("account").select("id").where("email", "=", email).executeTakeFirstOrThrow();
    accounts.push(created.id);
    expect(row.account_id).toBe(created.id);
    await expect(page.getByRole("status").getByText(FR.signedInAs(email), { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });

  test("OA5.9: a link of B used in the browser of A makes the session B's", async ({ page, db }) => {
    const a = await account(db);
    const b = await account(db);
    const first = await seedLink(db, { kind: "login", accountId: a.id, returnEventId: null });
    const second = await seedLink(db, { kind: "login", accountId: b.id, returnEventId: null });
    await page.goto(`/connexion/lien#${first}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    const sessionOfA = await keptSession(page);
    await page.goto(`/connexion/lien#${second}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    expect(await keptSession(page)).not.toBe(sessionOfA);
    await expect(page.getByText(`Session ouverte avec ${b.email}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Session ouverte avec ${a.email}`)).toHaveCount(0);
  });

  test("OA5.4: a link used a second time says so, with « Mes événements » (and a new link for a sign-in)", async ({ page, db }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null }, { usedAt: new Date() });
    await page.goto(`/connexion/lien#${token}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(heading(page)).toHaveText(FR.used);
    await expect(heading(page)).toBeFocused();
    await expect(page.getByText(FR.usedLogin, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: FR.myEvents })).toHaveAttribute("href", "/mes-evenements");
    await expect(page.getByRole("link", { name: FR.newLink })).toHaveAttribute("href", "/connexion");
    expect(await keptSession(page)).toBeNull();

    // A confirmation link whose event is already confirmed: one button.
    const email = newAddress();
    addresses.push(email);
    const pending = await pendingEvent(db, email);
    const owner = await account(db);
    await db.updateTable("event").set({ account_id: owner.id, confirmed_at: new Date(), pending_email: null }).where("id", "=", pending.id).execute();
    await page.goto(`/connexion/confirmer#${pending.link}`);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await expect(page.getByText(FR.usedConfirm, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: FR.myEvents })).toBeVisible();
    await expect(page.getByRole("link", { name: FR.newLink })).toHaveCount(0);
  });

  test("OA5.5: a sign-in link created 61 minutes ago has expired; « Recevoir un nouveau lien » leads to /connexion", async ({ page, db }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null }, { createdAt: new Date(Date.now() - 61 * MINUTE) });
    await page.goto(`/connexion/lien#${token}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(heading(page)).toHaveText(FR.expired);
    await expect(page.getByText(FR.expiredLogin, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: FR.newLink }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    expect(await sessionsOf(db, id)).toBe(0);
  });

  test("OA5.6: a confirmation link expired sends a new email to the address of the event, nothing typed, and the new screen names no address", async ({
    page,
    db,
  }) => {
    const email = newAddress();
    addresses.push(email);
    const pending = await pendingEvent(db, email, 7 * DAY + MINUTE);
    await page.goto(`/connexion/confirmer#${pending.link}`);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await expect(heading(page)).toHaveText(FR.expired);
    await expect(page.getByText(FR.expiredConfirm, { exact: true })).toBeVisible();
    expect(await mailTo(email)).toHaveLength(0);

    await page.getByRole("button", { name: FR.newLink }).click();
    await expect(heading(page)).toHaveText(FR.check);
    await expect(heading(page)).toBeFocused();
    await expect(page.getByText(FR.confirmBody, { exact: true })).toBeVisible();
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByText("1 heure")).toHaveCount(0);
    expect(await mailTo(email)).toHaveLength(1);
    // The expired link stays what it was; the event is not confirmed by it.
    expect((await db.selectFrom("event").select("confirmed_at").where("id", "=", pending.id).executeTakeFirstOrThrow()).confirmed_at).toBeNull();
  });

  test("OA5.6: when the limit is reached, « Trop d’envois » is above the button, which stays active", async ({ page, db }) => {
    const email = newAddress();
    addresses.push(email);
    const pending = await pendingEvent(db, email, 7 * DAY + MINUTE);
    await seedSends(db, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: pending.id });
    await page.goto(`/connexion/confirmer#${pending.link}`);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await page.getByRole("button", { name: FR.newLink }).click();
    await expect(page.getByRole("alert").filter({ hasText: FR.tooMany })).toBeVisible();
    await expect(page.getByRole("button", { name: FR.newLink })).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: FR.newLink })).toBeFocused();
    expect(await mailTo(email)).toHaveLength(0);
  });

  test("OA5.6: offline, the resend says the email did not go, and the button is back", async ({ page, db, context }) => {
    const email = newAddress();
    addresses.push(email);
    const pending = await pendingEvent(db, email, 7 * DAY + MINUTE);
    await page.goto(`/connexion/confirmer#${pending.link}`);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await expect(page.getByRole("button", { name: FR.newLink })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: FR.newLink }).click();
    await expect(page.getByRole("alert").filter({ hasText: FR.notSent })).toBeVisible();
    await expect(page.getByRole("button", { name: FR.newLink })).toBeFocused();
  });

  test("OA5.7, OA2.5: no fragment, a fragment cut by a character, or a link taken away says it is not valid", async ({ page, db }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });
    const sent: Request[] = [];
    page.on("request", (request) => isAction(request) && sent.push(request));

    for (const hash of ["", "#", `#${token.slice(1)}`, `#${token.slice(0, -1)}`]) {
      await page.goto(`/connexion/lien${hash}`);
      await expect(heading(page)).toHaveText(FR.invalid);
      await expect(page.getByRole("link", { name: FR.newLink })).toHaveAttribute("href", "/connexion");
    }
    expect(sent, "a fragment that is no token asks the server nothing").toHaveLength(0);

    // Well formed but unknown, or taken away by a correction of the address (OA2.5): the server says so on the press.
    await db.deleteFrom("email_link").where("account_id", "=", id).execute();
    await page.goto(`/connexion/lien#${token}`);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(heading(page)).toHaveText(FR.invalid);
    // The same page for a confirmation link.
    await page.goto(`/connexion/confirmer#${token}`);
    await page.getByRole("button", { name: FR.confirmButton }).click();
    await expect(heading(page)).toHaveText(FR.invalid);
    expect(await sessionsOf(db, id)).toBe(0);
  });

  test("OA5.8: during the request the button says so and is aria-disabled, a second tap sends nothing; a server error is said, with the button and its focus back", async ({
    page,
    db,
  }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });
    await page.goto(`/connexion/lien#${token}`);
    const button = page.getByRole("button", { name: FR.loginButton });
    await expect(button).toBeEnabled();

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let fail = true;
    let sent = 0;
    await page.route("**/connexion/lien", async (route) => {
      if (!isAction(route.request())) return route.continue();
      sent += 1;
      await held;
      if (fail) return route.fulfill({ status: 500, contentType: "text/plain", body: "error" });
      return route.continue();
    });
    await button.click();
    const working = page.getByRole("button", { name: FR.working });
    await expect(working).toHaveAttribute("aria-disabled", "true");
    await working.click({ force: true });
    release();
    await expect(page.getByRole("alert").filter({ hasText: FR.failed })).toBeVisible();
    expect(sent, "a second tap sends nothing").toBe(1);
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    await expect(button).toBeFocused();
    expect(await sessionsOf(db, id)).toBe(0);

    // Then it works: nothing was used up.
    fail = false;
    await button.click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
  });

  test("OA5.8: offline, the page says the session was not opened, and the button is back with the focus", async ({ page, db, context }) => {
    const { id } = await account(db);
    const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });
    await page.goto(`/connexion/lien#${token}`);
    await expect(page.getByRole("button", { name: FR.loginButton })).toBeEnabled();
    await context.setOffline(true);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page.getByRole("alert").filter({ hasText: FR.offline })).toBeVisible();
    await expect(page.getByRole("button", { name: FR.loginButton })).toBeFocused();
    expect(await keptSession(page)).toBeNull();
    await context.setOffline(false);
    await page.getByRole("button", { name: FR.loginButton }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("OA4.7: the page says it needs JavaScript, with no button", async ({ page, db }) => {
      const { id } = await account(db);
      const token = await seedLink(db, { kind: "login", accountId: id, returnEventId: null });
      await page.goto(`/connexion/lien#${token}`);
      await expect(page.getByText(FR.needsJavaScript, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: FR.loginButton })).toHaveCount(0);
      expect((await findLink(db, token))?.usedAt).toBeNull();
    });
  });
});
