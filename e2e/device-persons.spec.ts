import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { failActions, holdActions, holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #87, #162: « Vos inscriptions », the device's persons above the tabs, one row each, one cell per leg.

type Db = Kysely<Database>;

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

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

const section = (scope: Page | Locator) => scope.getByRole("region", { name: "Vos inscriptions" });
const toggle = (scope: Page | Locator) => section(scope).getByRole("button", { name: /^Vos inscriptions/ });
const nameButton = (scope: Page | Locator, firstName: string) =>
  section(scope).getByRole("button", { name: firstName, exact: true });
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Page | Locator) => scope.getByRole("button", { name: /^Place libre : / });
const call = (scope: Page | Locator, firstName: string) => scope.getByRole("link", { name: `Appeler ${firstName} au`, exact: false });
const loadingLine = (page: Page) => page.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" });

/** The matrix of the scene: each person's cells, aller then retour. */
const MATRIX = [
  ["Conduit", "Sans voiture"],
  ["Avec Marc", "Ne fait pas le retour"],
  ["Sans voiture", "Avec Zoé"],
  ["Ne fait pas l’aller", "Ne fait pas le retour"],
];

/** Each row's cells, as their text reads. */
async function cells(scope: Page | Locator): Promise<string[][]> {
  return section(scope)
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent ?? "")));
}

async function height(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.height ?? 0;
}

function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("device persons", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test.beforeEach(async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  // No tab is clicked: both legs are read from the matrix, above the tabs.
  test("C2.2, C3.7: each person's state on both legs, in a table", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page).getByRole("columnheader")).toHaveText(["Prénom", "Aller", "Retour"]);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Claire", "Léa", "Tom", "Hugo"]);
    expect(await cells(page)).toEqual(MATRIX);
    for (const firstName of ["Claire", "Léa", "Tom", "Hugo"]) {
      await expect(nameButton(page, firstName)).toHaveAttribute("aria-haspopup", "dialog");
      expect(await height(nameButton(page, firstName))).toBeGreaterThanOrEqual(44);
    }
    // Above the tabs, and the Aller tab still the active one.
    const tab = page.getByRole("tab", { name: /^Aller/ });
    expect((await section(page).boundingBox())!.y).toBeLessThan((await tab.boundingBox())!.y);
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });

  test("C3.3: a person not concerned shows in the matrix alone", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page)).toBeVisible();
    // Both legs are in the DOM, the inactive one hidden: Hugo is in no car and no list of either.
    await expect(page.getByRole("main").getByText("Hugo", { exact: true })).toHaveCount(1);
    await expect(section(page).getByText("Hugo", { exact: true })).toHaveCount(1);
  });

  test("C3.6: unfolded with a cell « Sans voiture », folded and unfolded by its button", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const button = toggle(page);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toContainText("4 personnes · 2 sans voiture");
    expect(await height(button)).toBeGreaterThanOrEqual(44);
    const table = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(table).toBeVisible();
    expect(await overflow(page)).toBe(0);

    // From the keyboard: the focus stays on the button.
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(table).toBeHidden();
    await expect(button).toBeFocused();
    expect(await overflow(page)).toBe(0);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(table).toBeVisible();
  });

  test("C10.1: a person's sheet shows their own number, as a tel: link", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await nameButton(page, "Claire").click();
    const claire = page.getByRole("dialog", { name: "Claire" });
    const own = call(claire, "Claire");
    await expect(own).toHaveText(PHONES.claire);
    await expect(own).toHaveAccessibleName(`Appeler Claire au ${PHONES.claire}`);
    await expect(own).toHaveAttribute("href", "tel:0611223344");
    expect(await height(own)).toBeGreaterThanOrEqual(44);
    // « Fermer » gives the focus back to the first name.
    await claire.getByRole("button", { name: "Fermer" }).click();
    await expect(claire).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();

    // Without a number, no link; Escape closes it as well.
    await nameButton(page, "Léa").click();
    const lea = page.getByRole("dialog", { name: "Léa" });
    await expect(lea.getByRole("button", { name: "Fermer" })).toBeVisible();
    await expect(lea.getByRole("link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(lea).toHaveCount(0);
    await expect(nameButton(page, "Léa")).toBeFocused();
  });

  // A link on the cards the device shares; none elsewhere, nor for a driver without a number.
  test("C10.1, C10.2: tel: links where the device shares a car only", async ({ page, seededEvent }) => {
    // loadEventState's answer, read through the route: Chromium may discard a streamed body it has delivered.
    let sent = "";
    await page.route("**/e/**", async (route) => {
      const response = await route.fetch();
      if (route.request().method() === "POST") sent = await response.text();
      await route.fulfill({ response });
    });
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(page)).toBeVisible();
    // Paul's car shares nothing with the device: no link, and his number is neither sent nor shown.
    await expect(car(panel, "Paul").getByRole("listitem")).toHaveText(["Nina"]);
    await expect(car(panel, "Paul").getByRole("link")).toHaveCount(0);
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
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    expect(await cells(page)).toEqual(MATRIX);
  });

  test("C5.9: while the device's persons load, the free seats are inactive", async ({ page, seededEvent }) => {
    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(loadingLine(page)).toBeVisible();
    await expect(freeSeats(panel)).toHaveCount(4);
    for (const seat of await freeSeats(panel).all()) await expect(seat).toBeDisabled();

    release();
    await expect(section(page)).toBeVisible();
    await expect(page.getByText("Chargement de vos inscriptions…")).toHaveCount(0);
    for (const seat of await freeSeats(panel).all()) await expect(seat).toBeEnabled();
  });

  // The alert and the seats inactive; « Réessayer » from the keyboard keeps the focus, the bar says why.
  test("a failed load, then « Réessayer »", async ({ context, page, seededEvent }) => {
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    const retry = page.getByRole("button", { name: "Réessayer" });
    const alert = page.getByRole("alert").filter({ hasText: "Vos inscriptions n’ont pas pu être chargées" });
    await expect(alert).toContainText(
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

    // Read at last: the focus on the loading line meanwhile, then on the section's button.
    await context.setOffline(false);
    failing.on = false;
    const release = await holdActions(page);
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(loadingLine(page)).toBeFocused();
    release();
    await expect(toggle(page)).toBeFocused();
    await expect(alert).toHaveCount(0);
    await expect(freeSeats(panel).first()).toBeEnabled();
  });

  test("a focus moved away during the read stays where it was put", async ({ page, seededEvent }) => {
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    failing.on = false;
    const release = await holdActions(page);
    await retry.click();
    await expect(loadingLine(page)).toBeFocused();
    const tab = page.getByRole("tab", { name: /^Aller/ });
    await tab.focus();
    release();
    await expect(toggle(page)).toBeVisible();
    await expect(tab).toBeFocused();
  });
});

test.describe("device persons, nobody without a car", () => {
  test.use({ locale: "fr-FR" });

  test("C3.6: folded into its summary", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const lea = await seedPerson(db, seededEvent.id, { firstName: "Léa" }, token);
    const marc = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, seededEvent.id, marc.id);
    await seedPlacement(db, { personId: lea.id, eventId: seededEvent.id, leg: "aller", rideId: marcsCar });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const button = toggle(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toContainText("1 personne · tout le monde a une place");
    await expect(page.locator(`#${await button.getAttribute("aria-controls")}`)).toBeHidden();
    expect(await overflow(page)).toBe(0);
    await button.click();
    expect(await cells(page)).toEqual([["Avec Marc", "Ne fait pas le retour"]]);
  });
});

test.describe("device persons, a first name of 40 characters", () => {
  test.use({ locale: "fr-FR" });

  test("C11.3: wraps inside its column, nothing scrolls sideways", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const firstName = "Marie".repeat(8);
    const marie = await seedPerson(db, seededEvent.id, { firstName }, token);
    await seedPlacement(db, { personId: marie.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const header = section(page).getByRole("rowheader");
    await expect(header).toHaveText(firstName);
    expect(await overflow(page)).toBe(0);
    const column = (await header.boundingBox())!;
    const name = (await nameButton(page, firstName).boundingBox())!;
    expect(name.x + name.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
  });
});

test.describe("device persons, without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("C2.2: a single column of leg", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const paul = await seedPerson(db, seededEvent.id, { firstName: "Paul" }, token);
    await seedPlacement(db, { personId: paul.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page).getByRole("columnheader")).toHaveText(["Prénom", "Aller"]);
    expect(await cells(page)).toEqual([["Sans voiture"]]);
  });

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

  // Read after a failure: with no section to take it, the focus of « Réessayer » goes to the active tab.
  test("is a device without a person: no section, the seats active", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, newToken());
    await holdToken(page, seededEvent.id, newToken());
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("button", { name: "Réessayer" }).focus();
    failing.on = false;
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: /^Aller/ })).toBeFocused();
    await expect(freeSeats(page.getByRole("tabpanel")).first()).toBeEnabled();
    await expect(section(page)).toHaveCount(0);
    await expect(page.getByText("Vos inscriptions n’ont pas pu être chargées")).toHaveCount(0);
  });
});

test.describe("device persons, JavaScript disabled", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("no section, the seats inactive, and a sentence says why", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, newToken());
    await page.goto(`/e/${seededEvent.id}`);
    // getByText skips what a <noscript> holds: its paragraph is reached by CSS. One per leg.
    await expect(page.locator("main noscript > p")).toHaveText(Array(2).fill("S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page."));
    await expect(section(page)).toHaveCount(0);
    // Both legs, one under the other: Claire's and Marc's cars, then Zoé's.
    await expect(freeSeats(page)).toHaveCount(6);
    for (const seat of await freeSeats(page).all()) await expect(seat).toBeDisabled();
  });
});
