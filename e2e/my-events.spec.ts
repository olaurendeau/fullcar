import type { Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { parisToday } from "@/domain/day-thirty";
import type { NewEvent } from "@/domain/event";
import { addDays, wallClockAsUtc, type WallClock, type WallDate } from "@/domain/wall-clock";
import { formatDate } from "@/i18n/format-date";
import { expect, leaveNoToken, test } from "./fixtures";
import { newAddress } from "./mailbox";

// The page sends the session's token: nothing a failure writes may show it.
leaveNoToken();

/*
 * /mes-evenements (#607, organizer-account OA6.1 to OA6.9, the first half of OA6.8): the
 * events of the session's account, read once the page has loaded with the token of
 * session-token.ts, in the body of `myEvents`. Each test its own account and events, deleted
 * after it. Their dates are counted from today in Paris, as the page counts them.
 */

const FR = {
  title: "Mes événements",
  signedInAs: (email: string) => `Session ouverte avec ${email}`,
  create: "Créer un événement",
  upcoming: (count: number) => `À venir (${count})`,
  past: (count: number) => `Passés (${count})`,
  noUpcoming: "Aucun événement à venir.",
  emptyTitle: "Aucun événement pour l’instant",
  emptyBody: "Créez un événement : il apparaîtra ici.",
  nobody: "Personne ne s’est encore inscrit.",
  one: "1 personne inscrite",
  persons: (count: number) => `${count} personnes inscrites`,
  withoutCar: (leg: string, count: number) => `${leg} : ${count} sans voiture`,
  erasedOn: (date: string) => `Les inscriptions seront effacées le ${date}.`,
  erasedSoon: "Les inscriptions seront effacées sous peu.",
  erased: "Inscriptions effacées",
  more: (count: number) => `Afficher les ${count} autres`,
  loading: "Chargement de vos événements…",
  failedTitle: "Vos événements n’ont pas pu être chargés",
  failedBody: "Vérifiez la connexion, puis réessayez.",
  retry: "Réessayer",
  login: "Se connecter",
  loginLink: "Mes événements",
  account: "Mon compte",
};

const KEY = "fullcar:session";
const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
const isPageAction = (request: Request) => isAction(request) && new URL(request.url()).pathname === "/mes-evenements";

const today = () => parisToday(new Date());
/** A wall-clock time `days` from today in Paris, at `time`. */
const dayFromToday = (days: number, time = "09:00:00"): WallClock => `${addDays(today(), days)} ${time}`;
const shownStart = (locale: string, at: WallClock) =>
  formatDate(locale, wallClockAsUtc(at), { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
const shownDate = (locale: string, date: WallDate) =>
  formatDate(locale, wallClockAsUtc(`${date} 00:00:00`), { dateStyle: "long", timeZone: "UTC" });

let accounts: string[] = [];
let events: string[] = [];
test.afterEach(async ({ db }) => {
  if (events.length > 0) await db.deleteFrom("event").where("id", "in", events).execute();
  // Its sessions go with it, by ON DELETE CASCADE.
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
  events = [];
});

/** An account of the test's own, whose session this browser keeps; `lastVisitAt` in the past ends it. */
async function signIn(page: Page, db: Kysely<Database>, email = newAddress(), lastVisitAt?: Date) {
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const token = await seedSession(db, accountId, lastVisitAt && { createdAt: lastVisitAt, lastVisitAt });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, token]);
  return { accountId, email, token };
}

/** An event confirmed by the account, from `seedEvent`'s fields; anonymised if said. */
async function eventOf(db: Kysely<Database>, accountId: string, fields: Partial<NewEvent>, anonymised = false) {
  const { id } = await seedEvent(db, fields);
  events.push(id);
  await db
    .updateTable("event")
    .set({ account_id: accountId, confirmed_at: new Date() })
    .where("id", "=", id)
    .execute();
  if (anonymised) await anonymiseEvent(db, id);
  return id;
}

/** `count` persons of the event, without a car on `leg`. */
async function withoutCar(db: Kysely<Database>, eventId: string, leg: "aller" | "retour", count: number) {
  for (let n = 0; n < count; n += 1) {
    const person = await seedPerson(db, eventId);
    await seedPlacement(db, { personId: person.id, eventId, leg, rideId: null });
  }
}

/** The id of the `visit` action, which each page load sends with a session: the only action of `/`. */
async function visitActionId(page: Page): Promise<string> {
  const visit = page.waitForRequest((request) => isAction(request) && new URL(request.url()).pathname === "/");
  await page.goto("/");
  return (await visit).headers()["next-action"]!;
}

const rows = (page: Page) => page.getByRole("main").getByRole("listitem");
const rowOf = (page: Page, title: string) => rows(page).filter({ hasText: title });

/**
 * Takes the page's actions (`myEvents`, and the page load's `visit`) to what `mode()` says at
 * the time: hold them until `release()`, abort them as a lost connection, or let them through.
 */
async function actionsOf(page: Page, mode: () => "hold" | "abort" | "pass") {
  const held: Route[] = [];
  await page.route("**/mes-evenements", async (route) => {
    if (!isPageAction(route.request())) return route.fallback();
    const what = mode();
    if (what === "abort") return route.abort("internetdisconnected");
    if (what === "hold") held.push(route);
    else return route.fallback();
  });
  return {
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
  };
}

test.describe("Mes événements", () => {
  test.use({ locale: "fr-FR" });

  test("OA6.1 to OA6.4: the address, « Créer un événement », the upcoming soonest first, then the past latest first", async ({
    page,
    db,
  }) => {
    const { accountId, email, token } = await signIn(page, db);
    const later = await eventOf(db, accountId, {
      title: "Week-end au ski",
      location: "Les Saisies",
      allerAt: dayFromToday(40, "18:30:00"),
      retourAt: null,
    });
    const soon = await eventOf(db, accountId, {
      title: "Tournoi de Rennes",
      location: "Gymnase Colette-Besson, Rennes",
      allerAt: dayFromToday(7, "08:00:00"),
      retourAt: dayFromToday(7, "18:00:00"),
    });
    await withoutCar(db, soon, "aller", 1);
    await withoutCar(db, soon, "retour", 2);
    const past = await eventOf(db, accountId, {
      title: "Match à Vitré",
      location: "Stade municipal, Vitré",
      allerAt: dayFromToday(-2),
      retourAt: dayFromToday(-1),
    });
    await withoutCar(db, past, "retour", 1);
    // #607: day 30 has begun in Paris, and no purge runs here.
    const dayThirty = await eventOf(db, accountId, { title: "Rando d’automne", allerAt: dayFromToday(-30), retourAt: null });
    const erased = await eventOf(
      db,
      accountId,
      { title: "Sortie scouts", location: "Forêt de Paimpont", allerAt: dayFromToday(-60, "07:30:00"), retourAt: null },
      true,
    );

    // Every request of the page, whatever its method or path.
    const sent: Request[] = [];
    page.on("request", (request) => sent.push(request));
    // Their headers as sent, `Cookie` included, which `headers()` leaves out: read once each request
    // has finished, when they are known (`allHeaders()` waits forever on a request cancelled before).
    const headers: Promise<string[]>[] = [];
    page.on("requestfinished", (request) => headers.push(request.allHeaders().then(Object.values)));
    // `myEvents`, told from the load's `visit`, whose body holds the token too, by its action id.
    const visitId = await visitActionId(page);
    const read = page.waitForRequest((request) => isPageAction(request) && request.headers()["next-action"] !== visitId);
    await page.goto("/mes-evenements");
    expect((await read).postData()?.includes(token), "myEvents carries the token in its body").toBe(true);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(FR.title);
    await expect(page.getByText(FR.signedInAs(email), { exact: true })).toBeVisible();
    const create = page.getByRole("link", { name: FR.create });
    await expect(create).toHaveAttribute("href", "/nouveau");
    const sections = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(sections).toHaveText([FR.upcoming(2), FR.past(3), FR.account]);
    expect((await create.boundingBox())!.y).toBeLessThan((await sections.first().boundingBox())!.y);

    // In their order, each row a link to its organiser area, 44 px at least (OA6.2).
    await expect(rows(page).getByRole("link")).toHaveCount(5);
    const hrefs = await rows(page).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs).toEqual([soon, later, past, dayThirty, erased].map((id) => `/e/${id}/admin`));
    for (const link of await rows(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const upcoming = rowOf(page, "Tournoi de Rennes");
    await expect(upcoming).toContainText(shownStart("fr", dayFromToday(7, "08:00:00")));
    await expect(upcoming).toContainText("Gymnase Colette-Besson, Rennes");
    await expect(upcoming).toContainText(FR.persons(3));
    await expect(upcoming.getByText(/sans voiture/)).toHaveText([FR.withoutCar("Aller", 1), FR.withoutCar("Retour", 2)]);
    await expect(rowOf(page, "Week-end au ski")).toContainText(FR.nobody);
    await expect(rowOf(page, "Week-end au ski").getByText(/sans voiture/)).toHaveCount(0);

    // OA6.3: past, the date of day 30 in Paris; from day 30 on, before the purge, « sous peu ».
    const passed = rowOf(page, "Match à Vitré");
    await expect(passed).toContainText(FR.one);
    await expect(passed.getByText(/sans voiture/)).toHaveText([FR.withoutCar("Retour", 1)]);
    await expect(passed).toContainText(FR.erasedOn(shownDate("fr", addDays(today(), 29))));
    await expect(rowOf(page, "Rando d’automne")).toContainText(FR.erasedSoon);
    await expect(rowOf(page, "Rando d’automne")).not.toContainText("effacées le");

    // OA6.4: anonymised, its title, start and place, and neither count nor pill.
    const anonymised = rowOf(page, "Sortie scouts");
    await expect(anonymised).toContainText(shownStart("fr", dayFromToday(-60, "07:30:00")));
    await expect(anonymised).toContainText("Forêt de Paimpont");
    await expect(anonymised).toContainText(FR.erased);
    await expect(anonymised).not.toContainText("inscrit");
    await expect(anonymised.getByText(/sans voiture/)).toHaveCount(0);

    // Checked once the page has sent all it sends: no URL nor header holds the token.
    expect(headers.length).toBeGreaterThan(0);
    const texts = [...sent.map((request) => request.url()), ...(await Promise.all(headers)).flat()];
    expect(texts.filter((text) => text.includes(token)).length, "URLs and headers with the token").toBe(0);
  });

  test("OA6.5: no event, MyEvents.empty and no section title; none upcoming, « À venir (0) »", async ({ page, db }) => {
    const { accountId } = await signIn(page, db);
    await page.goto("/mes-evenements");
    await expect(page.getByRole("heading", { name: FR.emptyTitle })).toBeVisible();
    await expect(page.getByText(FR.emptyBody, { exact: true })).toBeVisible();
    await expect(page.getByText(/^À venir|^Passés/)).toHaveCount(0);

    await eventOf(db, accountId, { title: "Sortie scouts", allerAt: dayFromToday(-60), retourAt: null }, true);
    await page.reload();
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([FR.upcoming(0), FR.past(1), FR.account]);
    await expect(page.getByText(FR.noUpcoming, { exact: true })).toBeVisible();
    await expect(page.getByText(FR.emptyTitle)).toHaveCount(0);
  });

  test("OA6.6: 12 past events, 10 shown, then « Afficher les 2 autres », whose tap shows them", async ({ page, db }) => {
    const { accountId } = await signIn(page, db);
    for (let n = 1; n <= 12; n += 1) {
      await eventOf(db, accountId, { title: `Passé n° ${n}`, allerAt: dayFromToday(-n), retourAt: null });
    }
    await page.goto("/mes-evenements");
    await expect(rows(page).getByRole("link")).toHaveCount(10);
    await expect(rowOf(page, "Passé n° 10")).toBeVisible();
    await expect(rowOf(page, "Passé n° 11")).toHaveCount(0);
    await page.getByRole("button", { name: FR.more(2) }).click();
    await expect(rows(page).getByRole("link")).toHaveCount(12);
    // « Le focus » : the first row that appears.
    await expect(rowOf(page, "Passé n° 11").getByRole("link")).toBeFocused();
    await expect(page.getByRole("button", { name: FR.more(2) })).toHaveCount(0);
  });

  test("OA6.7: while the read is held, the loading line alone under « Créer un événement »", async ({ page, db }) => {
    const { accountId } = await signIn(page, db);
    await eventOf(db, accountId, { title: "Tournoi de Rennes", allerAt: dayFromToday(7), retourAt: null });
    let mode: "hold" | "pass" = "hold";
    const actions = await actionsOf(page, () => mode);
    await page.goto("/mes-evenements");

    const loading = page.getByRole("status").filter({ hasText: FR.loading });
    await expect(loading).toBeVisible();
    expect((await loading.boundingBox())!.y).toBeGreaterThan((await page.getByRole("link", { name: FR.create }).boundingBox())!.y);
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);

    mode = "pass";
    await actions.release();
    await expect(rowOf(page, "Tournoi de Rennes")).toBeVisible();
    await expect(page.getByText(FR.loading)).toHaveCount(0);
  });

  test("OA6.7: a failed read, MyEvents.failed and « Réessayer », which keeps the focus, then reaches « À venir »", async ({
    page,
    db,
  }) => {
    const { accountId } = await signIn(page, db);
    await eventOf(db, accountId, { title: "Tournoi de Rennes", allerAt: dayFromToday(7), retourAt: null });
    let mode: "abort" | "pass" = "abort";
    await actionsOf(page, () => mode);
    await page.goto("/mes-evenements");

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toHaveText(`${FR.failedTitle}${FR.failedBody}`);
    const retry = page.getByRole("button", { name: FR.retry });
    await retry.click();
    // A new failure: the alert again, the focus on the button.
    await expect(alert).toHaveText(`${FR.failedTitle}${FR.failedBody}`);
    await expect(retry).toBeFocused();

    mode = "pass";
    await retry.click();
    await expect(page.getByRole("heading", { name: FR.upcoming(1) })).toBeFocused();
    await expect(page.getByText(FR.failedTitle)).toHaveCount(0);
  });

  test("OA6.5: after « Réessayer », an empty list's title takes the focus", async ({ page, db }) => {
    await signIn(page, db);
    let mode: "abort" | "pass" = "abort";
    await actionsOf(page, () => mode);
    await page.goto("/mes-evenements");
    await expect(page.getByText(FR.failedTitle)).toBeVisible();
    mode = "pass";
    await page.getByRole("button", { name: FR.retry }).click();
    await expect(page.getByRole("heading", { name: FR.emptyTitle })).toBeFocused();
  });

  test("OA6.8: without a session, /mes-evenements leads to /connexion", async ({ page }) => {
    await page.goto("/mes-evenements");
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(FR.login);
  });

  test("OA6.8: with a session ended 91 days ago, to /connexion too", async ({ page, db }) => {
    await signIn(page, db, newAddress(), new Date(Date.now() - 91 * 24 * 60 * 60_000));
    await page.goto("/mes-evenements");
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test("/connexion's « Mes événements » leads to this page", async ({ page, db }) => {
    const { email } = await signIn(page, db);
    await page.goto("/connexion");
    await page.getByRole("link", { name: FR.loginLink }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    await expect(page.getByText(FR.signedInAs(email), { exact: true })).toBeVisible();
  });

  test("OA6.9: a title of 80 characters without a space, a place of 120 and an address of 60 do not overflow at 360 px", async ({
    page,
    db,
  }) => {
    const email = `${"c".repeat(60 - "@mailbox.test".length)}@mailbox.test`;
    const { accountId } = await signIn(page, db, email);
    await eventOf(db, accountId, { title: "T".repeat(80), location: "G".repeat(120), allerAt: dayFromToday(7), retourAt: null });
    await page.goto("/mes-evenements");
    await expect(page.getByText(FR.signedInAs(email), { exact: true })).toBeVisible();
    await expect(rowOf(page, "T".repeat(80))).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const viewport = page.viewportSize()!.width;
    for (const element of [rowOf(page, "T".repeat(80)), page.getByText(FR.signedInAs(email), { exact: true })]) {
      const box = (await element.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport);
    }
  });
});

test.describe("My events, in English", () => {
  test.use({ locale: "en-US" });

  test("the words of the page in English", async ({ page, db }) => {
    const { accountId, email } = await signIn(page, db);
    const soon = await eventOf(db, accountId, {
      title: "Rennes tournament",
      allerAt: dayFromToday(7),
      retourAt: dayFromToday(7, "18:00:00"),
    });
    await withoutCar(db, soon, "retour", 2);
    await eventOf(db, accountId, { title: "Vitré match", allerAt: dayFromToday(-1), retourAt: null });
    await eventOf(db, accountId, { title: "Autumn hike", allerAt: dayFromToday(-31), retourAt: null });
    await eventOf(db, accountId, { title: "Scouts outing", allerAt: dayFromToday(-60), retourAt: null }, true);
    await page.goto("/mes-evenements");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My events");
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an event" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(["Upcoming (1)", "Past (3)", "My account"]);
    await expect(rowOf(page, "Rennes tournament")).toContainText("2 people signed up");
    await expect(rowOf(page, "Rennes tournament")).toContainText("Return: 2 without a car");
    await expect(rowOf(page, "Vitré match")).toContainText("Nobody has signed up yet.");
    await expect(rowOf(page, "Vitré match")).toContainText(`Sign-ups will be erased on ${shownDate("en", addDays(today(), 29))}.`);
    await expect(rowOf(page, "Autumn hike")).toContainText("Sign-ups will be erased shortly.");
    await expect(rowOf(page, "Scouts outing")).toContainText("Sign-ups erased");
  });
});
