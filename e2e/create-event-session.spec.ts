import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { expect, expectUrl, leaveNoToken, test } from "./fixtures";
import { mailTo, newAddress } from "./mailbox";

// The form sends the session's token in the body of `createEvent` and `signOut`: nothing a failure writes may show it.
leaveNoToken();

/*
 * « Créer un événement » with a session open in the browser (#613, organizer-account OA1.3, OA1.5,
 * OA1.8): no address field, a line that says whose the event will be, « Se déconnecter » that
 * keeps what was typed. Each test its own account, deleted after it with its events.
 */

const SESSION_KEY = "fullcar:session";
const NEW_EVENT = "/nouveau";
const ARRIVAL = /\/e\/([2-9A-HJ-NP-Za-km-z]{8})\/admin$/;
const SIGNED_IN = (email: string) => `Session ouverte avec ${email} : l’événement sera dans Mes événements.`;

// Not « Sortie ski du club »: create-event.spec.ts creates anonymous events with it and never deletes them.
const ENDED_TITLE = "Sortie de la session terminée";

let accounts: string[] = [];
test.afterEach(async ({ db }) => {
  // Its sessions and events go with it: events by `account_id`, below; sessions by ON DELETE CASCADE.
  if (accounts.length > 0) {
    await db.deleteFrom("event").where("account_id", "in", accounts).execute();
    await db.deleteFrom("account").where("id", "in", accounts).execute();
  }
  accounts = [];
});

/** An account with a session, kept by this browser, stored once on `/`. */
async function signedIn(page: Page, db: Kysely<Database>) {
  const email = newAddress();
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const session = await seedSession(db, accountId);
  await page.goto("/");
  await page.evaluate(([key, token]) => localStorage.setItem(key, token), [SESSION_KEY, session]);
  return { email, accountId, session };
}

const HINT = "Pour retrouver vos événements, sans mot de passe. Les participants n’ont jamais à en donner.";
const HINT_EN = "To find your events again, with no password. Participants never have to give one.";

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const createButton = (page: Page) => page.getByRole("button", { name: "Créer", exact: true });
const emailField = (page: Page) => field(page, "Votre adresse e-mail");

/** The creation requests: a server action posted to the form's page, other than the line's (`signedInAs`) and the sign-out's. */
function creations(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    const posted = request.method() === "POST" && new URL(request.url()).pathname === NEW_EVENT && request.headers()["next-action"];
    if (posted && (request.postData() ?? "").includes("allerTime")) sent.push(request);
  });
  return sent;
}

/** Every request that finishes, to check where the token is not: headers and URL, in both directions. */
function finished(page: Page): Request[] {
  const done: Request[] = [];
  page.on("requestfinished", (request) => done.push(request));
  return done;
}

async function inDays(page: Page, days: number): Promise<string> {
  return page.evaluate((days) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  }, days);
}

/** Title, place, start date and time: four actions. */
async function fillAller(page: Page, title = "Sortie ski du club") {
  await field(page, "Titre").fill(title);
  await field(page, "Lieu").fill("Chalet des Écureuils, La Clusaz");
  await field(page, "Date de début").fill(await inDays(page, 7));
  await field(page, "Heure de début").fill("07:30");
}

/** The form, once hydrated and its session line, if any, read. */
async function openForm(page: Page) {
  await page.goto(NEW_EVENT);
  await expect(createButton(page)).toBeEnabled({ timeout: 15_000 });
}

test.describe("Créer avec une session", () => {
  test.use({ locale: "fr-FR" });

  test("OA1.3: no address field, the line with the account's address; seven actions from /, the event is the account's, no email goes", async ({
    page,
    db,
  }) => {
    const { email, accountId, session } = await signedIn(page, db);
    const sent = creations(page);
    const done = finished(page);
    const start = Date.now();
    await page.goto("/");
    await page.getByRole("link", { name: "Créer un événement" }).click(); // 1
    await expect(createButton(page)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer un événement");
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toBeVisible();
    await expect(page.getByText("Ce n’est pas vous ?", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    await expect(emailField(page)).toHaveCount(0);
    // Under the title, before the first field.
    const line = await page.getByText(SIGNED_IN(email), { exact: false }).boundingBox();
    expect(line!.y).toBeGreaterThan((await page.getByRole("heading", { level: 1 }).boundingBox())!.y);
    expect(line!.y).toBeLessThan((await field(page, "Titre").boundingBox())!.y);

    await fillAller(page); // 2 to 5
    await field(page, "Heure de fin").fill("18:00"); // 6
    await createButton(page).click(); // 7

    await expectUrl(page, ARRIVAL, "the organiser's area");
    expect(Date.now() - start).toBeLessThan(30_000);
    expect(sent.length).toBe(1);
    expect(sent[0]!.postData() ?? "", "the session's token goes in the body").toContain(session);
    expect(sent[0]!.url()).not.toContain(session);
    expect(done.length, "requests were seen").toBeGreaterThan(0);
    for (const request of done) {
      expect(request.url(), "no URL carries the token").not.toContain(session);
      expect(JSON.stringify(await request.allHeaders()), `no header of ${request.url()} carries the token`).not.toContain(session);
    }

    const id = ARRIVAL.exec(new URL(page.url()).pathname)![1]!;
    const row = await db.selectFrom("event").select(["account_id", "confirmed_at", "pending_email", "send_status"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.account_id).toBe(accountId);
    expect(row.confirmed_at).not.toBeNull();
    expect(row.pending_email).toBeNull();
    expect(row.send_status).toBeNull();
    expect((await mailTo(email)).length, "no email goes with a session").toBe(0);

    await page.goto("/mes-evenements");
    await expect(page.getByRole("link", { name: /Sortie ski du club/ })).toBeVisible();
  });

  test("OA1.5: the session ended after the display: nothing is created, the address field appears with its words, the rest is kept", async ({
    page,
    db,
  }) => {
    const { email, session, accountId } = await signedIn(page, db);
    await openForm(page);
    // The line is the proof that `signedInAs` has answered: ended before, the form would forget the token.
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toBeVisible();
    await expect(emailField(page)).toHaveCount(0);
    await fillAller(page, ENDED_TITLE);
    await field(page, "Heure de fin").fill("18:00");
    // As if the cookie were deleted: the session ends in the database.
    await db.deleteFrom("session").where("account_id", "=", accountId).execute();
    expect(await findSession(db, session)).toBeUndefined();

    await createButton(page).click();
    await expect(emailField(page)).toBeVisible();
    await expect(emailField(page)).toBeFocused();
    await expect(emailField(page)).toHaveValue("");
    const message = "Votre session a pris fin : saisissez votre adresse e-mail, puis « Créer ».";
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    // The hint of the field, then the words of the ended session (OA1.1, OA1.5).
    await expect(emailField(page)).toHaveAccessibleDescription(`${HINT} ${message}`);
    await expect(field(page, "Titre")).toHaveValue(ENDED_TITLE);
    await expect(field(page, "Heure de fin")).toHaveValue("18:00");
    expect(new URL(page.url()).pathname).toBe(NEW_EVENT);
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toHaveCount(0);
    expect(await db.selectFrom("event").select("id").where("title", "=", ENDED_TITLE).execute()).toEqual([]);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  });

  test("OA1.8: « Se déconnecter » stays on /nouveau, keeps what was typed, says « Session fermée » and puts the focus on the address field", async ({
    page,
    db,
  }) => {
    const { email, session } = await signedIn(page, db);
    await openForm(page);
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toBeVisible();
    await fillAller(page, "Tournoi de Rennes");

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page.getByText("Session fermée. Ce que vous avez saisi est gardé.", { exact: true })).toBeVisible();
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toHaveCount(0);
    await expect(emailField(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue("");
    await expect(emailField(page)).toBeFocused();
    expect(new URL(page.url()).pathname).toBe(NEW_EVENT);
    await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes");
    await expect(field(page, "Heure de début")).toHaveValue("07:30");
    expect(await findSession(db, session)).toBeUndefined();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  });

  test("OA1.8: offline, « La session n’a pas été fermée » under the line, nothing else changes", async ({ page, db }) => {
    const { email, session } = await signedIn(page, db);
    let offline = false;
    await page.route("**/nouveau", (route) =>
      offline && route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback(),
    );
    await openForm(page);
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toBeVisible();
    await fillAller(page, "Tournoi de Rennes");

    offline = true;
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "La session n’a pas été fermée." })).toHaveText(
      "La session n’a pas été fermée. Vérifiez la connexion, puis réessayez.",
    );
    await expect(page.getByText(SIGNED_IN(email), { exact: false })).toBeVisible();
    await expect(emailField(page)).toHaveCount(0);
    await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes");
    expect(await findSession(db, session)).toBeDefined();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBe(session);
  });
});

test.describe("Create with a session, in English", () => {
  test.use({ locale: "en-US" });

  test("the words of the line and of the sign-out", async ({ page, db }) => {
    const { email } = await signedIn(page, db);
    await page.goto(NEW_EVENT);
    await expect(page.getByText(`Signed in as ${email}: the event will be in My events.`, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Signed out. What you typed is kept.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Your email address", { exact: true })).toBeFocused();
  });

  test("the words of the ended session", async ({ page, db }) => {
    const { email, accountId } = await signedIn(page, db);
    await page.goto(NEW_EVENT);
    await expect(page.getByRole("button", { name: "Create", exact: true })).toBeEnabled({ timeout: 15_000 });
    // The line is the proof that `signedInAs` has answered.
    await expect(page.getByText(`Signed in as ${email}: the event will be in My events.`, { exact: false })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill(ENDED_TITLE);
    await page.getByLabel("Place", { exact: true }).fill("Chalet des Écureuils, La Clusaz");
    await page.getByLabel("Start date", { exact: true }).fill(await inDays(page, 7));
    await page.getByLabel("Start time", { exact: true }).fill("07:30");
    await page.getByLabel("End time", { exact: true }).fill("18:00");
    await db.deleteFrom("session").where("account_id", "=", accountId).execute();

    await page.getByRole("button", { name: "Create", exact: true }).click();
    const message = "Your session has ended: enter your email address, then “Create”.";
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Your email address", { exact: true })).toHaveAccessibleDescription(`${HINT_EN} ${message}`);
    await expect(page.getByText(`Signed in as ${email}`, { exact: false })).toHaveCount(0);
  });
});
