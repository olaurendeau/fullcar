import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { confirmSeededEvent } from "@/db/test-events";
import { creatorTest, expect, leaveNoToken, test } from "./fixtures";
import { mailTo, newAddress } from "./mailbox";
import { organiserPath } from "./organiser";

leaveNoToken();

/*
 * #611, organizer-account v4: the way in and out of the organiser area. OA7.1 (the sign-in form
 * under « Espace organisateur », which brings the link back to the area, OA4.4), OA7.3 and
 * OA8.4 (« Mes événements » above the panel and above « Inscriptions effacées »), OA7.4
 * (« Espace organisateur » on /e/{id}, after the board, for a browser that keeps a session or
 * the event's admin token, for nobody else; the area decides on arrival). Sessions are held as session-token.ts keeps them.
 */

const FR = {
  area: "Espace organisateur",
  myEvents: "Mes événements",
  login: "Connectez-vous avec l’adresse e-mail de la personne qui organise cet événement.",
  email: "Adresse e-mail",
  send: "Recevoir le lien",
  check: "Regardez vos e-mails",
  noAccount: "Pas encore de compte ? Il se crée avec votre premier événement.",
  create: "Créer un événement",
  erased: "Inscriptions effacées",
  notYours: "Cet espace organisateur n’est pas le vôtre",
  orphan: "Cet événement n’a plus d’organisateur",
};

const EN = { area: "Organiser area", myEvents: "My events", email: "Email address", send: "Send me the link" };

const main = (page: Page) => page.getByRole("main");
const titles = (page: Page) => main(page).getByRole("heading", { level: 1 });

/** From the next document on, the browser keeps `token` as its session (session-token.ts). */
async function holdSession(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("fullcar:session", value), token);
}

/** The accounts and sends of a test, deleted after it: links and sessions go with the account, and the hourly cap never meets the sends. */
let accounts: string[] = [];
let addresses: string[] = [];
test.afterEach(async ({ db }) => {
  if (addresses.length > 0) await db.deleteFrom("email_send").where("email", "in", addresses).execute();
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
  addresses = [];
});

async function account(db: Kysely<Database>, email?: string): Promise<string> {
  const id = await seedAccount(db, email === undefined ? {} : { email });
  accounts.push(id);
  return id;
}

/** The event confirmed by `account`, as a used confirmation link leaves it. */
async function organisedBy(db: Kysely<Database>, eventId: string, accountId: string) {
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
}

test.describe("in French", () => {
  test.use({ locale: "fr-FR" });

  test("OA7.3: the organiser's session: « Mes événements » above the panel, towards /mes-evenements", async ({ page, db, seededEvent }) => {
    const organiser = await account(db);
    await organisedBy(db, seededEvent.id, organiser);
    await holdSession(page, await seedSession(db, organiser));
    await page.goto(organiserPath(seededEvent));
    const link = main(page).getByRole("link", { name: FR.myEvents, exact: true });
    await expect(link).toHaveAttribute("href", "/mes-evenements");
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Above the panel, not under it.
    const panel = main(page).getByRole("button", { name: "Actualiser" });
    await expect(panel).toBeVisible();
    expect((await link.boundingBox())!.y).toBeLessThan((await panel.boundingBox())!.y);
    await link.click();
    await expect(page).toHaveURL("/mes-evenements");
  });

  creatorTest("OA7.3: the creation browser, without a session: the panel, and no « Mes événements »", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(main(page).getByRole("button", { name: "Actualiser" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: FR.myEvents })).toHaveCount(0);
  });

  test("OA8.4: anonymised, the organiser's session: « Mes événements » above the title", async ({ page, db, seededEvent }) => {
    const organiser = await account(db);
    await organisedBy(db, seededEvent.id, organiser);
    await holdSession(page, await seedSession(db, organiser));
    await anonymiseEvent(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(main(page).getByText(FR.erased, { exact: true })).toBeVisible();
    const link = main(page).getByRole("link", { name: FR.myEvents, exact: true });
    await expect(link).toHaveAttribute("href", "/mes-evenements");
    expect((await link.boundingBox())!.y).toBeLessThan((await titles(page).boundingBox())!.y);
  });

  test("OA7.1: nobody: the form under « Espace organisateur », and the link asked brings back to the area", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = newAddress();
    addresses.push(email);
    await organisedBy(db, seededEvent.id, await account(db, email));
    await page.goto(organiserPath(seededEvent));
    // One title: the area's, not « Se connecter ».
    await expect(titles(page)).toHaveText(FR.area);
    await expect(main(page).getByText(FR.login, { exact: true })).toBeVisible();
    await expect(main(page).getByText("Pas de mot de passe")).toHaveCount(0);
    await expect(main(page).getByText(FR.noAccount)).toBeVisible();
    await expect(main(page).getByRole("link", { name: FR.create })).toHaveAttribute("href", "/nouveau");
    const button = main(page).getByRole("button", { name: FR.send });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Hydrated.
    await expect(button).toBeEnabled();
    await main(page).getByLabel(FR.email, { exact: true }).fill(email);
    await button.click();
    // The area keeps its title; « Regardez vos e-mails » is a sub-title of it, in place of the form.
    await expect(main(page).getByRole("heading", { level: 2, name: FR.check })).toBeFocused();
    await expect(titles(page)).toHaveText(FR.area);
    // A smaller title than the area's, and the sentence that asks to sign in is gone.
    const size = (heading: Locator) => heading.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(await size(main(page).getByRole("heading", { level: 2, name: FR.check }))).toBeLessThan(await size(titles(page)));
    await expect(main(page).getByText(FR.login, { exact: true })).toHaveCount(0);
    await expect(main(page).getByText(email, { exact: false })).toBeVisible();
    // OA4.4: the link lands on this area (kept for the page of the link).
    const kept = await db
      .selectFrom("email_link")
      .innerJoin("account", "account.id", "email_link.account_id")
      .select("email_link.return_event_id")
      .where("account.email", "=", email)
      .execute();
    expect(kept.map((row) => row.return_event_id)).toEqual([seededEvent.id]);
    expect((await mailTo(email)).length).toBe(1);
  });

  test("OA7.4: a kept session: « Espace organisateur » on /e/{id}, after the board", async ({ page, db, seededEvent }) => {
    const organiser = await account(db);
    await organisedBy(db, seededEvent.id, organiser);
    await holdSession(page, await seedSession(db, organiser));
    await page.goto(`/e/${seededEvent.id}`);
    const link = main(page).getByRole("link", { name: FR.area, exact: true });
    await expect(link).toHaveAttribute("href", organiserPath(seededEvent));
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // After the board: its 44 px push nothing that was drawn (CA1.19, DS2.9).
    expect((await link.boundingBox())!.y).toBeGreaterThan((await titles(page).boundingBox())!.y);
    await link.click();
    await expect(page).toHaveURL(organiserPath(seededEvent));
    await expect(main(page).getByRole("button", { name: "Actualiser" })).toBeVisible();
  });

  test("OA7.4: a participant, a browser keeping nothing: no link, and nothing sent for it", async ({ page, db, seededEvent }) => {
    await organisedBy(db, seededEvent.id, await account(db));
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto(`/e/${seededEvent.id}`);
    await expect(titles(page)).toHaveText("Tournoi de Rennes");
    // Give the page the time to hydrate: the link is read after the load.
    await page.waitForLoadState("networkidle");
    await expect(main(page).getByRole("link", { name: FR.area })).toHaveCount(0);
    expect(posts).toEqual([]);
  });

  test("OA7.4: another account's session is a kept session: the link, and the area says it is not theirs", async ({ page, db, seededEvent }) => {
    await organisedBy(db, seededEvent.id, await account(db));
    await holdSession(page, await seedSession(db, await account(db)));
    await page.goto(`/e/${seededEvent.id}`);
    await main(page).getByRole("link", { name: FR.area, exact: true }).click();
    await expect(titles(page)).toHaveText(FR.notYours);
  });

  creatorTest("OA7.4: the creation browser: the link, the event pending", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(main(page).getByRole("link", { name: FR.area, exact: true })).toHaveAttribute("href", organiserPath(seededEvent));
  });

  creatorTest("OA7.9: without an organiser, the token left behind shows the link, and the area says there is none", async ({ page, db, seededEvent }) => {
    const organiser = await confirmSeededEvent(db, seededEvent.id);
    await db.deleteFrom("account").where("id", "=", organiser).execute();
    await page.goto(`/e/${seededEvent.id}`);
    await main(page).getByRole("link", { name: FR.area, exact: true }).click();
    await expect(titles(page)).toHaveText(FR.orphan);
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-GB" });

  test("OA7.1, OA7.3, OA7.4: each word speaks English", async ({ page, db, seededEvent }) => {
    const organiser = await account(db);
    await organisedBy(db, seededEvent.id, organiser);
    await page.goto(organiserPath(seededEvent));
    await expect(titles(page)).toHaveText(EN.area);
    await expect(main(page).getByLabel(EN.email, { exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: EN.send })).toBeVisible();

    await holdSession(page, await seedSession(db, organiser));
    await page.goto(`/e/${seededEvent.id}`);
    await expect(main(page).getByRole("link", { name: EN.area, exact: true })).toBeVisible();
    await page.goto(organiserPath(seededEvent));
    await expect(main(page).getByRole("link", { name: EN.myEvents, exact: true })).toBeVisible();
  });
});
