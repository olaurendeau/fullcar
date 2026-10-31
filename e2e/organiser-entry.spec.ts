import type { Locator, Page, Request } from "@playwright/test";
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
 * (« Espace organisateur » on /e/{id}, after the board, for the browser that keeps the event's
 * admin token, or for a session of the event's account, which the server says; for nobody else,
 * another account's session included). Sessions are held as session-token.ts keeps them.
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

/** Every request the page sent that has finished, for `leaks` once the page is idle. */
function recordRequests(page: Page): Request[] {
  const finished: Request[] = [];
  page.on("requestfinished", (request) => finished.push(request));
  return finished;
}

/**
 * Where `token` went among the finished requests (never printed): in a URL, in a header, in a body.
 * Headers are read with `allHeaders`, the ones the browser added included.
 */
async function whereTokenWent(requests: Request[], token: string) {
  const went = { url: false, headers: false, body: false };
  for (const request of requests) {
    if (request.url().includes(token)) went.url = true;
    const headers = Object.values(await request.allHeaders());
    if (headers.some((value) => value.includes(token))) went.headers = true;
    if (request.postData()?.includes(token)) went.body = true;
  }
  return went;
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

  test("OA7.4: the account's own session, from another browser: « Espace organisateur » on /e/{id}, after the board", async ({ page, db, seededEvent }) => {
    const organiser = await account(db);
    await organisedBy(db, seededEvent.id, organiser);
    const session = await seedSession(db, organiser);
    await holdSession(page, session);
    const requests = recordRequests(page);
    await page.goto(`/e/${seededEvent.id}`);
    const link = main(page).getByRole("link", { name: FR.area, exact: true });
    await expect(link).toHaveAttribute("href", organiserPath(seededEvent));
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // After the board, not only after the title: its 44 px push nothing that was drawn (CA1.19, DS2.9).
    const board = page.getByRole("tabpanel");
    await expect(board).toBeVisible();
    const boardBox = (await board.boundingBox())!;
    expect((await link.boundingBox())!.y).toBeGreaterThanOrEqual(boardBox.y + boardBox.height);
    // The session went in a body, and in no URL nor header.
    await page.waitForLoadState("networkidle");
    expect(await whereTokenWent(requests, session)).toEqual({ url: false, headers: false, body: true });
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

  test("OA7.4: another account's session: no link, the session sent in a body only", async ({ page, db, seededEvent }) => {
    await organisedBy(db, seededEvent.id, await account(db));
    const other = await seedSession(db, await account(db));
    await holdSession(page, other);
    const requests = recordRequests(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tabpanel")).toBeVisible();
    // The server answers after the load: wait for it before saying that no link came.
    await page.waitForLoadState("networkidle");
    await expect(main(page).getByRole("link", { name: FR.area })).toHaveCount(0);
    expect(await whereTokenWent(requests, other)).toEqual({ url: false, headers: false, body: true });
  });

  creatorTest("OA7.4: the creation browser: the link, the event pending, and nothing sent for it", async ({ page, seededEvent }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto(`/e/${seededEvent.id}`);
    await expect(main(page).getByRole("link", { name: FR.area, exact: true })).toHaveAttribute("href", organiserPath(seededEvent));
    await page.waitForLoadState("networkidle");
    expect(posts).toEqual([]);
  });

  creatorTest("OA7.4: the creation browser with another account's session: the link, and still nothing sent", async ({ page, db, seededEvent }) => {
    await holdSession(page, await seedSession(db, await account(db)));
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto(`/e/${seededEvent.id}`);
    await expect(main(page).getByRole("link", { name: FR.area, exact: true })).toHaveAttribute("href", organiserPath(seededEvent));
    await page.waitForLoadState("networkidle");
    expect(posts).toEqual([]);
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
