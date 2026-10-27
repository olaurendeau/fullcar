import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { confirmSeededEvent } from "@/db/test-events";
import { creatorTest, expect, leaveNoToken, test } from "./fixtures";
import { digitsOf, keepAdminToken, organiserPath, seedOrganiserScene, test as organiserTest } from "./organiser";

leaveNoToken();

/*
 * #598, organizer-account v4: the organiser area refused, each reason with its own screen, in
 * place of the panel and of the board. OA7.1 (nobody, nothing of the panel in the HTML), OA7.2
 * (another account's session), OA7.7 (pending, outside the creation browser), OA7.9 (without an
 * organiser, for every visitor) and OA8.4 (the organiser of an anonymised event). The seed:
 * « Tournoi de Rennes » at the « Gymnase des Gayeulles », 2026-12-12, 07:30 to 18:00; its day 30
 * is 2027-01-11. Sessions are held as session-token.ts keeps them; no token nor address is
 * ever printed.
 */

const FR = {
  panel: "Espace organisateur",
  login: "Connectez-vous avec l’adresse e-mail de la personne qui organise cet événement.",
  pending: "Adresse pas encore confirmée",
  pendingBody:
    "Cet événement attend que la personne qui l’a créé confirme son adresse e-mail. Si c’est vous, ouvrez le lien de confirmation reçu par e-mail : l’événement rejoindra Mes événements, et l’espace organisateur s’ouvrira dans le navigateur qui l’ouvre.",
  pendingExpired: "Lien expiré ? Ouvrez-le quand même : la page proposera d’en envoyer un nouveau.",
  notYours: "Cet espace organisateur n’est pas le vôtre",
  notYoursBody: (email: string) => `La session est ouverte avec ${email}, qui n’organise pas cet événement.`,
  see: "Voir l’événement",
  switch: "Se connecter avec une autre adresse",
  orphan: "Cet événement n’a plus d’organisateur",
  orphanBody:
    "Le compte qui l’organisait a été supprimé. L’événement reste ouvert aux participants jusqu’à sa suppression, 30 jours après sa date.",
  erased: "Inscriptions effacées",
  failed: "L’espace organisateur n’a pas pu être chargé.",
  retry: "Réessayer",
  erasedBody:
    "Le 11 janvier 2027, 30 jours après l’événement, les prénoms, les numéros, les voitures et les inscriptions ont été effacés. Il reste le titre, le lieu et les dates.",
};

const EN = {
  login: "Sign in with the email address of the person who organises this event.",
  pending: "Email address not confirmed yet",
  notYours: "This organiser area is not yours",
  notYoursBody: (email: string) => `You are signed in as ${email}, who does not organise this event.`,
  see: "See the event",
  switch: "Sign in with another address",
  orphan: "This event no longer has an organiser",
  erased: "Sign-ups erased",
  erasedBody:
    "On January 11, 2027, 30 days after the event, first names, phone numbers, cars and sign-ups were erased. The title, place and dates remain.",
};

const PLACE = "Gymnase des Gayeulles";

/** From the next document on, the browser keeps `token` as its session (session-token.ts). */
async function holdSession(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("fullcar:session", value), token);
}

/** An address of 60 characters with no place to break it but where any character may (OA11.2). */
const longAddress = () => `${randomUUID().replaceAll("-", "")}${"x".repeat(17)}@exemple.fr`;

const main = (page: Page) => page.getByRole("main");
const title = (page: Page) => main(page).getByRole("heading", { level: 1 });

/** Nothing of the panel nor of the board, nor a sign-in form. */
async function expectNothingElse(page: Page) {
  await expect(page.getByRole("region", { name: FR.panel })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(main(page).getByRole("textbox")).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: /Actualiser|Modifier l’événement|Proposer une voiture/ })).toHaveCount(0);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The accounts a test made, deleted after it: their sessions go with them, by cascade. */
let accounts: string[] = [];
test.afterEach(async ({ db }) => {
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
});

async function account(db: Kysely<Database>, email?: string): Promise<string> {
  const id = await seedAccount(db, email === undefined ? {} : { email });
  accounts.push(id);
  return id;
}

async function confirmed(db: Kysely<Database>, eventId: string): Promise<string> {
  const id = await confirmSeededEvent(db, eventId);
  accounts.push(id);
  return id;
}

test.describe("the screens of a refusal, in French", () => {
  test.use({ locale: "fr-FR" });

  for (const withSession of [false, true]) {
    test(`OA7.7: pending, another browser ${withSession ? "with a session" : "without a session"}: « Adresse pas encore confirmée », and nothing else`, async ({
      page,
      db,
      seededEvent,
    }) => {
      if (withSession) await holdSession(page, await seedSession(db, await account(db)));
      await page.goto(organiserPath(seededEvent));
      await expect(title(page)).toHaveText(FR.pending);
      await expect(main(page).getByText(FR.pendingBody, { exact: true })).toBeVisible();
      await expect(main(page).getByText(FR.pendingExpired, { exact: true })).toBeVisible();
      const see = main(page).getByRole("link", { name: FR.see });
      await expect(see).toHaveAttribute("href", `/e/${seededEvent.id}`);
      expect((await see.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // Neither an address, nor « pas le vôtre ».
      expect(await main(page).innerText()).not.toContain("@");
      await expect(main(page).getByText(FR.notYours)).toHaveCount(0);
      await expectNothingElse(page);
      expect(await horizontalOverflow(page)).toBe(0);

      await see.click();
      await expect(page).toHaveURL(`/e/${seededEvent.id}`);
      await expect(title(page)).toHaveText("Tournoi de Rennes");
    });
  }

  test("OA7.2: another account's session: its address, « Voir l’événement » and « Se connecter avec une autre adresse »", async ({
    page,
    db,
    seededEvent,
  }) => {
    await confirmed(db, seededEvent.id);
    const email = longAddress();
    await holdSession(page, await seedSession(db, await account(db, email)));
    await page.goto(organiserPath(seededEvent));
    await expect(title(page)).toHaveText(FR.notYours);
    expect(await main(page).getByText(FR.notYoursBody(email), { exact: true }).isVisible(), "the session's address").toBe(true);
    const see = main(page).getByRole("link", { name: FR.see });
    const other = main(page).getByRole("link", { name: FR.switch });
    await expect(see).toHaveAttribute("href", `/e/${seededEvent.id}`);
    await expect(other).toHaveAttribute("href", "/connexion");
    for (const link of [see, other]) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNothingElse(page);
    // 60 characters with no break point, at 360 px.
    expect(await horizontalOverflow(page)).toBe(0);
  });

  const ORPHAN_VISITORS: [string, (page: Page, db: Kysely<Database>) => Promise<void>][] = [
    ["nobody", async () => {}],
    ["another account's session", async (page, db) => holdSession(page, await seedSession(db, await account(db)))],
  ];
  for (const [who, arrange] of ORPHAN_VISITORS) {
    test(`OA7.9: without an organiser, ${who}: « Cet événement n’a plus d’organisateur »`, async ({ page, db, seededEvent }) => {
      const organiser = await confirmed(db, seededEvent.id);
      await db.deleteFrom("account").where("id", "=", organiser).execute();
      await arrange(page, db);
      await page.goto(organiserPath(seededEvent));
      await expect(title(page)).toHaveText(FR.orphan);
      await expect(main(page).getByText(FR.orphanBody, { exact: true })).toBeVisible();
      await expect(main(page).getByRole("link", { name: FR.see })).toHaveAttribute("href", `/e/${seededEvent.id}`);
      await expect(main(page).getByText(FR.notYours)).toHaveCount(0);
      await expectNothingElse(page);
    });
  }

  test("OA8.4: anonymised, the organiser's session: its title, place, dates and « Inscriptions effacées », and no action", async ({
    page,
    db,
    seededEvent,
  }) => {
    await holdSession(page, await seedSession(db, await confirmed(db, seededEvent.id)));
    await anonymiseEvent(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(title(page)).toHaveText("Tournoi de Rennes");
    await expect(main(page).getByText(PLACE, { exact: true })).toBeVisible();
    await expect(main(page).locator('time[datetime="2026-12-12T07:30"]')).toHaveText("samedi 12 décembre 2026 à 07:30");
    await expect(main(page).locator('time[datetime="2026-12-12T18:00"]')).toHaveText("18:00");
    const note = main(page).getByRole("note");
    await expect(note.getByText(FR.erased, { exact: true })).toBeVisible();
    await expect(note.getByText(FR.erasedBody, { exact: true })).toBeVisible();
    await expectNothingElse(page);
    await expect(main(page).getByRole("link", { name: FR.see })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  // O5.3, O5.8 on the page of an anonymised event: a failure is never read as a refusal.
  test("OA8.4: anonymised, the organiser's first read fails: « Réessayer », then « Inscriptions effacées », the focus on its title", async ({
    page,
    db,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    await holdSession(page, await seedSession(db, await confirmed(db, id)));
    await anonymiseEvent(db, id);
    // The first read of the area fails as offline; the visit, which carries no event id, goes through.
    let reads = 0;
    await page.route(`**/e/${id}/admin`, (route) => {
      const request = route.request();
      const isRead = request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes(`"${id}"`);
      if (isRead && ++reads === 1) return route.abort("internetdisconnected");
      return route.fallback();
    });
    await page.goto(organiserPath(seededEvent));
    await expect(main(page).getByRole("alert").filter({ hasText: /\S/ })).toContainText(FR.failed);
    // Neither refused nor shown: no screen's title, no sign-in sentence.
    await expect(title(page)).toHaveCount(0);
    await expect(main(page).getByText(FR.login)).toHaveCount(0);

    await main(page).getByRole("button", { name: FR.retry }).click();
    await expect(main(page).getByRole("note").getByText(FR.erased, { exact: true })).toBeVisible();
    await expect(title(page)).toHaveText("Tournoi de Rennes");
    await expect(title(page)).toBeFocused();
    expect(reads, "reads of the area").toBe(2);
  });

  test("OA8.4: anonymised, nobody: the area's sign-in screen, and the place in neither the HTML nor the page", async ({
    page,
    db,
    seededEvent,
  }) => {
    await confirmed(db, seededEvent.id);
    await anonymiseEvent(db, seededEvent.id);
    const response = await page.goto(organiserPath(seededEvent));
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect((await response!.text()).includes(PLACE), "the place in the HTML").toBe(false);
    await expect(title(page)).toHaveText(FR.panel);
    await expect(main(page).getByText(FR.login, { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(PLACE);
    await expect(main(page).getByText(FR.erased)).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
  });
});

creatorTest.describe("in the creation browser", () => {
  creatorTest.use({ locale: "fr-FR" });

  // OA7.9, OA9.5: the token the creation browser keeps opens nothing once the account is gone.
  creatorTest("OA7.9: without an organiser, the creation browser too: « Cet événement n’a plus d’organisateur »", async ({
    page,
    db,
    seededEvent,
  }) => {
    const organiser = await confirmSeededEvent(db, seededEvent.id);
    await db.deleteFrom("account").where("id", "=", organiser).execute();
    await page.goto(organiserPath(seededEvent));
    await expect(title(page)).toHaveText(FR.orphan);
    await expectNothingElse(page);
  });
});

organiserTest.describe("OA7.1: nobody, on a confirmed event", () => {
  organiserTest.use({ locale: "fr-FR" });

  let organiser: string | undefined;
  organiserTest.afterEach(async ({ db }) => {
    if (organiser) await db.deleteFrom("account").where("id", "=", organiser).execute();
    organiser = undefined;
  });

  organiserTest("« Espace organisateur » and AdminLogin.body; nothing of the panel, in the HTML or after", async ({
    page,
    db,
    seededEvent,
    organiserTraffic,
  }) => {
    const phones = await seedOrganiserScene(db, seededEvent.id);
    organiser = await confirmSeededEvent(db, seededEvent.id);
    await keepAdminToken(page, seededEvent.id, null);
    await page.goto(organiserPath(seededEvent), { waitUntil: "networkidle" });
    await expect(title(page)).toHaveText(FR.panel);
    await expect(main(page).getByText(FR.login, { exact: true })).toBeVisible();
    await expect(main(page).getByText(FR.notYours)).toHaveCount(0);
    await expect(page.getByRole("region", { name: FR.panel })).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);

    const exchanges = await organiserTraffic.exchanges();
    const html = exchanges.filter((each) => each.html && each.path === `/e/${seededEvent.id}/admin`);
    expect(html.length, "HTML documents of /e/{id}/admin").toBe(1);
    const texts = [...exchanges.map((each) => each.answer), await page.content()];
    const numbers = Object.values(phones).flatMap(digitsOf);
    expect(texts.some((text) => numbers.some((form) => text.includes(form))), "a number of the scene").toBe(false);
    // Not « carsWithoutPhone », a message key too: the messages are in the HTML.
    expect(html[0]!.answer.includes("carCount"), "the panel's answer in the HTML").toBe(false);
  });
});

test.describe("the screens of a refusal, in English", () => {
  test.use({ locale: "en-GB" });

  test("OA7.7, OA7.2, OA7.9, OA8.4, OA7.1: each screen speaks English", async ({ page, db, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(title(page)).toHaveText(EN.pending);
    await expect(main(page).getByRole("link", { name: EN.see })).toBeVisible();

    const organiser = await confirmed(db, seededEvent.id);
    await page.reload();
    await expect(title(page)).toHaveText("Organiser area");
    await expect(main(page).getByText(EN.login, { exact: true })).toBeVisible();

    const email = longAddress();
    const other = await seedSession(db, await account(db, email));
    await holdSession(page, other);
    await page.reload();
    await expect(title(page)).toHaveText(EN.notYours);
    expect(await main(page).getByText(EN.notYoursBody(email), { exact: true }).isVisible(), "the session's address").toBe(true);
    await expect(main(page).getByRole("link", { name: EN.switch })).toBeVisible();

    const own = await seedSession(db, organiser);
    await holdSession(page, own);
    await anonymiseEvent(db, seededEvent.id);
    await page.reload();
    await expect(main(page).getByRole("note").getByText(EN.erased, { exact: true })).toBeVisible();
    await expect(main(page).getByRole("note").getByText(EN.erasedBody, { exact: true })).toBeVisible();

    // Its account deleted, the rule says « no organiser » first, anonymised or not.
    await db.deleteFrom("account").where("id", "=", organiser).execute();
    await page.reload();
    await expect(title(page)).toHaveText(EN.orphan);
  });
});
