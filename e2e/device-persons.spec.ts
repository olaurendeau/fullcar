import { randomBytes } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
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

const PHONES = {
  claire: "06 11 22 33 44",
  marc: "07 98 76 54 32",
  ines: "06 55 44 33 22",
  paul: "06 87 65 43 21",
};

/**
 * The device holds Claire, Léa, Tom and Hugo.
 * Aller: Claire drives Inès; Marc drives Léa; Paul drives Nina, full, and shares nothing with the
 * device; Tom is without a car; Hugo is not concerned.
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
  const paul = await other("Paul", PHONES.paul);
  const nina = await other("Nina");
  const clairesCar = await seedRide(db, eventId, claire, { departureTime: "07:00:00" });
  const marcsCar = await seedRide(db, eventId, marc);
  const zoesCar = await seedRide(db, eventId, zoe, { leg: "retour" });
  const paulsCar = await seedRide(db, eventId, paul, { departureTime: "07:30:00", seats: 1 });
  await place(ines, "aller", clairesCar);
  await place(lea, "aller", marcsCar);
  await place(nina, "aller", paulsCar);
  await place(tom, "aller", null);
  await place(tom, "retour", zoesCar);
  await place(claire, "retour", null);
}

/** Puts the device's token for event `id` in `localStorage` before any script of the page runs. */
async function holdToken(page: Page, id: string, token: string) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`fullcar:personal-token:${id}`, token]);
}

/** Holds back every server action until `release` is called. */
async function holdActions(page: Page) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/e/**", async (route) => {
    if (await route.request().headerValue("next-action")) await released;
    await route.continue();
  });
  return release;
}

/** Answers every server action with a 500 while `failing.on`; the page and its scripts load. */
async function failActions(page: Page) {
  const failing = { on: true };
  await page.route("**/e/**", async (route) =>
    failing.on && (await route.request().headerValue("next-action"))
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  return failing;
}

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

/** The device's persons on the aller, with their state there. */
const ALLER = ["Claire: Conduit", "Léa: Dans la voiture de Marc", "Tom: Sans voiture", "Hugo: Pas concernée"];

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

  test("C2.2: the device's persons, their state on each leg, their own number", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(panel).getByText("Inscrites depuis cet appareil : vous pouvez les modifier.")).toBeVisible();
    expect(await states(section(panel))).toEqual(ALLER);
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

  // A link on the cards the device shares; none elsewhere, nor for a driver without a number.
  test("C10.1, C10.2: tel: links where the device shares a car only", async ({ page, seededEvent }) => {
    const answer = page.waitForResponse(async (response) => !!(await response.request().headerValue("next-action")));
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(panel)).toBeVisible();
    // Paul's car shares nothing with the device: no link, and his number is neither sent nor shown.
    await expect(car(panel, "Paul").getByRole("listitem")).toHaveText(["Nina"]);
    await expect(car(panel, "Paul").getByRole("link")).toHaveCount(0);
    const sent = await (await answer).text();
    expect(sent).toContain(PHONES.marc);
    for (const text of [sent, await page.content()]) {
      expect(text).not.toContain(PHONES.paul);
      expect(text).not.toContain(PHONES.paul.replace(/\D/g, ""));
    }
    await expect(call(car(panel, "Marc"), "Marc")).toHaveAttribute("href", "tel:0798765432");
    await expect(call(car(panel, "Claire"), "Claire")).toHaveText(PHONES.claire);
    await expect(call(car(panel, "Claire"), "Inès")).toHaveText(PHONES.ines);

    await selectTab(page, "Retour");
    await expect(car(panel, "Zoé")).toBeVisible();
    await expect(car(panel, "Zoé").getByRole("link")).toHaveCount(0);
  });

  test("C1.6: another browser sees the persons, no section, no number", async ({ browser, baseURL, seededEvent }) => {
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
    expect(await states(section(page.getByRole("tabpanel")))).toEqual(ALLER);
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

  // The alert and the seats inactive; « Réessayer » from the keyboard keeps the focus, the bar says why.
  test("a failed load, then « Réessayer »", async ({ context, page, seededEvent }) => {
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    const retry = panel.getByRole("button", { name: "Réessayer" });
    await expect(panel.getByRole("alert")).toContainText("Vos inscriptions n’ont pas pu être chargées");
    await expect(panel.getByRole("alert")).toContainText(
      "Rien ne peut être ajouté ni modifié tant qu’elles ne sont pas chargées. Vérifiez la connexion, puis réessayez.",
    );
    await expect(freeSeats(panel).first()).toBeDisabled();

    // From the keyboard, against a server error: the generic message, the focus on the new « Réessayer ».
    await retry.focus();
    await page.keyboard.press("Enter");
    const failed = page.getByRole("alert").filter({ hasText: "Une erreur est survenue et rien n’a changé." });
    await expect(failed).toBeVisible();
    await expect(retry).toBeFocused();
    // Escape with the focus outside the bar: the bar closes, the focus stays.
    await page.keyboard.press("Escape");
    await expect(failed).toHaveCount(0);
    await expect(retry).toBeFocused();

    // Offline: the bar says so, and the page keeps room below it (C11.4).
    await context.setOffline(true);
    await page.keyboard.press("Enter");
    const offline = page.getByRole("alert").filter({ hasText: "Action impossible, vérifiez la connexion" });
    await expect(offline).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("padding-bottom", /^1[2-9]\d(\.\d+)?px$/);
    // Escape with the focus on « Fermer »: the focus goes to the active tab.
    await page.getByRole("button", { name: "Fermer" }).focus();
    await page.keyboard.press("Escape");
    await expect(offline).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /^Aller/ })).toBeFocused();

    // Read at last: the focus on the section's title, the seats active.
    await context.setOffline(false);
    failing.on = false;
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(section(panel).getByRole("heading", { name: "Personnes de l’appareil" })).toBeFocused();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(freeSeats(panel).first()).toBeEnabled();
  });
});

test.describe("device persons, without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("without tabs, « Fermer » gives the focus to the event's title", async ({ db, page, seededEvent }) => {
    const token = newToken();
    await seedPerson(db, seededEvent.id, { firstName: "Claire" }, token);
    await holdToken(page, seededEvent.id, token);
    await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("button", { name: "Réessayer" }).click();
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tournoi de Rennes" })).toBeFocused();
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

  test("the seats are inactive, and a sentence says why", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, newToken());
    await page.goto(`/e/${seededEvent.id}`);
    // getByText skips what a <noscript> holds: its paragraph is reached by CSS. One per leg.
    await expect(page.locator("main noscript > p")).toHaveText(Array(2).fill("S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page."));
    // Both legs, one under the other: Claire's and Marc's cars, then Zoé's.
    await expect(freeSeats(page)).toHaveCount(6);
    for (const seat of await freeSeats(page).all()) await expect(seat).toBeDisabled();
  });
});
