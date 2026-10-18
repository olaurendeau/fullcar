import { randomBytes } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { expect, test } from "./fixtures";

/*
 * #87: the device's persons on the page. The device's token is seeded with its persons,
 * then set in `localStorage` before the page's scripts run, under the event's own key.
 */

type Db = Kysely<Database>;

const newToken = () => personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));

const PHONES = { claire: "06 11 22 33 44", marc: "07 98 76 54 32", ines: "06 55 44 33 22" };

/**
 * The device holds Claire, Léa, Tom and Hugo.
 * Aller: Claire drives Inès; Marc drives Léa; Tom is without a car; Hugo is not concerned.
 * Retour: Zoé, without a number, drives Tom; Claire is without a car; Léa and Hugo are not concerned.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string, phone: string | null = null) =>
    (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const other = async (firstName: string, phone: string | null = null) =>
    (await seedPerson(db, eventId, { firstName, phone })).id;
  const place = (personId: string, leg: Leg, rideId: string | null) =>
    seedPlacement(db, { personId, eventId, leg, rideId });

  const claire = await mine("Claire", PHONES.claire);
  const lea = await mine("Léa");
  const tom = await mine("Tom");
  await mine("Hugo");
  const marc = await other("Marc", PHONES.marc);
  const ines = await other("Inès", PHONES.ines);
  const zoe = await other("Zoé");
  const clairesCar = await seedRide(db, eventId, claire, { departureTime: "07:00:00" });
  const marcsCar = await seedRide(db, eventId, marc);
  const zoesCar = await seedRide(db, eventId, zoe, { leg: "retour" });
  await place(ines, "aller", clairesCar);
  await place(lea, "aller", marcsCar);
  await place(tom, "aller", null);
  await place(tom, "retour", zoesCar);
  await place(claire, "retour", null);
}

/** Puts the device's token for event `id` in `localStorage` before any script of the page runs. */
async function holdToken(page: Page, id: string, token: string) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    `fullcar:personal-token:${id}`,
    token,
  ]);
}

/** Holds back every server action until `release` is called. */
async function holdActions(page: Page, answer: (route: Route) => Promise<void> = (route) => route.continue()) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/e/**", async (route) => {
    if (!(await route.request().headerValue("next-action"))) return route.continue();
    await released;
    await answer(route);
  });
  return release;
}

const failAction = (route: Route) => route.fulfill({ status: 500, body: "" });

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

const section = (scope: Page | Locator) => scope.getByRole("region", { name: "Personnes de l’appareil" });
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Page | Locator) => scope.getByRole("button", { name: /^Place libre : / });
const call = (scope: Page | Locator, firstName: string) => scope.getByRole("link", { name: `Appeler ${firstName} au`, exact: false });

/** Each of the device's persons in the section, as « first name: state ». */
async function states(scope: Locator): Promise<string[]> {
  return scope.getByRole("group").evaluateAll((groups) =>
    groups.map((group) => {
      const name = group.querySelector("[data-slot=name]")?.textContent;
      const state = group.querySelector("[data-slot=state]")?.textContent;
      return `${name}: ${state}`;
    }),
  );
}

test.describe("device persons", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test.beforeEach(async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C2.2: the section lists the device's persons and their state on each leg, with their own number", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(panel).getByText("Inscrites depuis cet appareil : vous pouvez les modifier.")).toBeVisible();
    expect(await states(section(panel))).toEqual([
      "Claire: Conduit",
      "Léa: Dans la voiture de Marc",
      "Tom: Sans voiture",
      "Hugo: Pas concernée",
    ]);
    const own = call(section(panel), "Claire");
    await expect(own).toHaveText(PHONES.claire);
    await expect(own).toHaveAccessibleName(`Appeler Claire au ${PHONES.claire}`);
    await expect(own).toHaveAttribute("href", "tel:0611223344");
    await expect(call(section(panel), "Léa")).toHaveCount(0);

    await selectTab(page, "Retour");
    expect(await states(section(panel))).toEqual([
      "Claire: Sans voiture",
      "Léa: Pas concernée",
      "Tom: Dans la voiture de Zoé",
      "Hugo: Pas concernée",
    ]);
  });

  test("C10.1: a tel: link on the cards the device shares; none for a driver without a number", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(panel)).toBeVisible();
    await expect(call(car(panel, "Marc"), "Marc")).toHaveAttribute("href", "tel:0798765432");
    await expect(call(car(panel, "Claire"), "Claire")).toHaveText(PHONES.claire);
    await expect(call(car(panel, "Claire"), "Inès")).toHaveText(PHONES.ines);

    await selectTab(page, "Retour");
    await expect(car(panel, "Zoé")).toBeVisible();
    await expect(car(panel, "Zoé").getByRole("link")).toHaveCount(0);
  });

  test("C1.6: another browser sees the persons, without the section nor a number", async ({
    browser,
    baseURL,
    seededEvent,
  }) => {
    const other = await browser.newPage({ locale: "fr-FR", baseURL });
    try {
      await other.goto(`/e/${seededEvent.id}`);
      await expect(car(other, "Marc").getByRole("listitem").first()).toHaveText("Léa");
      await expect(freeSeats(other).first()).toBeEnabled();
      await expect(section(other)).toHaveCount(0);
      await expect(other.getByRole("link", { name: /^Appeler/ })).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test("C1.7: nothing on another event", async ({ db, page }) => {
    const other = await seedEvent(db);
    try {
      await seedPerson(db, other.id, { firstName: "Paul" });
      await page.goto(`/e/${other.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
      await expect(page.getByText("Chargement de vos inscriptions…")).toHaveCount(0);
      await expect(section(page)).toHaveCount(0);
    } finally {
      await db.deleteFrom("event").where("id", "=", other.id).execute();
    }
  });

  test("C11.7: the same section on the organiser's page", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}/admin`);
    await expect(section(page.getByRole("tabpanel"))).toBeVisible();
    expect(await states(section(page.getByRole("tabpanel")))).toEqual([
      "Claire: Conduit",
      "Léa: Dans la voiture de Marc",
      "Tom: Sans voiture",
      "Hugo: Pas concernée",
    ]);
  });

  test("C5.9: while the device's persons load, the free seats are inactive", async ({ page, seededEvent }) => {
    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" })).toBeVisible();
    await expect(freeSeats(panel)).toHaveCount(4);
    for (const seat of await freeSeats(panel).all()) await expect(seat).toBeDisabled();

    release();
    await expect(section(panel)).toBeVisible();
    await expect(panel.getByText("Chargement de vos inscriptions…")).toHaveCount(0);
    for (const seat of await freeSeats(panel).all()) await expect(seat).toBeEnabled();
  });

  test("a failed load says so, keeps the seats inactive, and « Réessayer » loads again", async ({
    page,
    seededEvent,
  }) => {
    await page.route("**/e/**", async (route) =>
      (await route.request().headerValue("next-action")) ? failAction(route) : route.continue(),
    );
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    const alert = panel.getByRole("alert");
    await expect(alert).toContainText("Vos inscriptions n’ont pas pu être chargées");
    await expect(alert).toContainText(
      "Rien ne peut être ajouté ni modifié tant qu’elles ne sont pas chargées. Vérifiez la connexion, puis réessayez.",
    );
    await expect(freeSeats(panel).first()).toBeDisabled();

    await page.unroute("**/e/**");
    await alert.getByRole("button", { name: "Réessayer" }).click();
    await expect(section(panel)).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(freeSeats(panel).first()).toBeEnabled();
  });

  test("« Réessayer » offline: the bar says so, and « Fermer » gives the focus back to the tab", async ({
    context,
    page,
    seededEvent,
  }) => {
    const release = await holdActions(page, failAction);
    await page.goto(`/e/${seededEvent.id}`);
    release();
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();

    await context.setOffline(true);
    await retry.click();
    const bar = page.getByRole("alert").filter({ hasText: "Action impossible, vérifiez la connexion" });
    await expect(bar).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("padding-bottom", /^1[2-9]\d(\.\d+)?px$/);
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /^Aller/ })).toBeFocused();
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  test("« Réessayer » against a server error: the generic message, which Escape closes", async ({
    page,
    seededEvent,
  }) => {
    const release = await holdActions(page, failAction);
    await page.goto(`/e/${seededEvent.id}`);
    release();
    await page.getByRole("button", { name: "Réessayer" }).click();
    const bar = page
      .getByRole("alert")
      .filter({ hasText: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant." });
    await expect(bar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
  });
});

test.describe("device persons, a token no person holds", () => {
  test.use({ locale: "fr-FR" });

  test("is a device without a person: no section, the seats active", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, newToken());
    await holdToken(page, seededEvent.id, newToken());
    const loaded = page.waitForResponse(async (response) => !!(await response.request().headerValue("next-action")));
    await page.goto(`/e/${seededEvent.id}`);
    await loaded;
    await expect(freeSeats(page.getByRole("tabpanel")).first()).toBeEnabled();
    await expect(section(page)).toHaveCount(0);
    await expect(page.getByText("Vos inscriptions n’ont pas pu être chargées")).toHaveCount(0);
  });
});

test.describe("device persons, JavaScript disabled", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("nothing is sent: the seats are inactive, and a sentence says why", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, newToken());
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") sent.push(request.url());
    });
    await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
    // getByText skips what a <noscript> holds: its paragraph is reached by CSS. One per leg.
    await expect(page.locator("main noscript > p")).toHaveText([
      "S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page.",
      "S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page.",
    ]);
    // Both legs, one under the other: Claire's and Marc's cars, then Zoé's.
    await expect(freeSeats(page)).toHaveCount(6);
    for (const seat of await freeSeats(page).all()) await expect(seat).toBeDisabled();
    expect(sent).toEqual([]);
  });
});
