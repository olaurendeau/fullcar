import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { contrast } from "./contrast";
import { failActions, failHeld, holdActions, holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { keepAdminToken, organiserPath } from "./organiser";

leaveNoToken();

// #981, event-board v5.2 (« N’importe qui place n’importe qui »), PL1.1, PL1.2, PL3.1 to PL3.4,
// PL3.6, PL3.7, PL1.5, PL1.3b, PL4.2, PL6.1, PL6.3, PL6.4: the persons of a leg's lists are buttons
// that open their sheet, those of the device and those of another.

type Db = Kysely<Database>;

/**
 * The device holds Camille, Tom and Léa. Hugo and Marc are of other devices.
 * Aller: Marc drives, Tom is without a car; Camille, Léa and Hugo are not on it.
 * Retour: Camille drives (3 seats); Tom and then Hugo are without a car; Léa and Marc are not on it.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { camille: await mine("Camille"), tom: await mine("Tom"), lea: await mine("Léa"), hugo: await other("Hugo"), marc: await other("Marc") };
  await seedRide(db, eventId, persons.marc);
  await seedRide(db, eventId, persons.camille, { leg: "retour", departureTime: "17:30:00" });
  for (const [personId, leg] of [[persons.tom, "aller"], [persons.tom, "retour"], [persons.hugo, "retour"]] as const) {
    await seedPlacement(db, { personId, eventId, leg, rideId: null });
  }
  return persons;
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

const panel = (page: Page) => page.getByRole("tabpanel");
const withoutCar = (page: Page) => panel(page).getByRole("region", { name: /^(Sans voiture|Without a car)$/ });
/** The list's items by their CSS: an open sheet hides the page from role queries. */
const listed = (page: Page) => page.locator('[role="tabpanel"][data-state="active"] section[aria-labelledby^="without-car-"] li');
const fold = (page: Page) => panel(page).getByRole("button", { name: /^(Ne font pas|Not on the)/ });
const person = (scope: Locator, firstName: string) => scope.getByRole("button", { name: firstName, exact: true });
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const NOTE = "Seul l’appareil qui a inscrit cette personne peut changer son prénom ou son numéro, ou la retirer.";

/** The names of a sheet's buttons in order, « Fermer » left out. */
async function actionsOf(dialog: Locator) {
  const names = await dialog.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ""));
  return names.filter((name) => name !== "" && name !== "Fermer");
}

/** The page has nothing to say: no line in the bar, nothing written in its live regions. */
async function silent(page: Page, record: Awaited<ReturnType<typeof recordBar>>) {
  await expect(messages(page)).toHaveCount(0);
  const { writes } = await record();
  expect(said(writes, "status")).toEqual([]);
  expect(said(writes, "alert")).toEqual([]);
}

test.describe("the sheet of a person of the lists under the cars", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    // The device's persons are known: a sheet opened before is the one of any person.
    await expect(cell(page, "Tom", "Retour")).toBeVisible();
    await selectTab(page, "Retour");
  });

  test("PL1.1: each first name of « Sans voiture » is a button of 44 px with a dialog, for the device's person and another's", async ({ page }) => {
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo"]);
    for (const name of ["Tom", "Hugo"]) {
      const button = person(withoutCar(page), name);
      await expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("PL1.2: « Ne font pas le retour (2) » is folded, counts those with no Placement who do not drive, and unfolds into buttons", async ({ page }) => {
    await expect(fold(page)).toHaveText("Ne font pas le retour (2)");
    await expect(fold(page)).toHaveAttribute("aria-expanded", "false");
    await expect(person(panel(page), "Marc")).toHaveCount(0);

    await fold(page).click();
    await expect(fold(page)).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Léa", "Marc"]) {
      const button = person(panel(page), name);
      await expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await selectTab(page, "Aller");
    await expect(fold(page)).toHaveText("Ne font pas l’aller (3)");
  });

  test("PL3.1, PL3.2, PL3.4, PL3.6, PL4.2: Hugo, of another device, without a car: « Trouver une place » (#983) and « Ne fait pas le retour », and the sentence; done, it closes and says nothing", async ({ page }) => {
    const record = await recordBar(page);
    await expect(panel(page).getByRole("status")).toHaveText("2 sans voiture · 3 places libres");
    await person(withoutCar(page), "Hugo").click();
    const dialog = sheet(page, "Hugo · Retour");
    await expect(dialog).toContainText("Sans voiture");
    expect(await actionsOf(dialog)).toEqual(["Trouver une place", "Ne fait pas le retour"]);
    await expect(dialog.getByText(NOTE)).toBeVisible();

    await dialog.getByRole("button", { name: "Ne fait pas le retour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom"]);
    await expect(fold(page)).toHaveText("Ne font pas le retour (3)");
    await expect(panel(page).getByRole("status")).toHaveText("1 sans voiture · 3 places libres");
    // The first name moved into the fold, which gets the focus.
    await expect(fold(page)).toBeFocused();
    await silent(page, record);
  });

  test("PL3.1, PL3.2, PL3.4, PL3.6: Marc, of another device, not on the retour: « Passer sans voiture » alone; done, he is without a car", async ({ page }) => {
    const record = await recordBar(page);
    await fold(page).click();
    await person(panel(page), "Marc").click();
    const dialog = sheet(page, "Marc · Retour");
    await expect(dialog).toContainText("Ne fait pas le retour");
    expect(await actionsOf(dialog)).toEqual(["Passer sans voiture"]);
    await expect(dialog.getByText(NOTE)).toBeVisible();

    await dialog.getByRole("button", { name: "Passer sans voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo", "Marc"]);
    await expect(fold(page)).toHaveText("Ne font pas le retour (1)");
    await expect(person(withoutCar(page), "Marc")).toBeFocused();
    await silent(page, record);
  });

  test("PL3.3, PL1.3b: Tom's sheet from the list has the words of his cell, then « Modifier » and « Retirer de l’événement », and not the sentence", async ({ page }) => {
    await cell(page, "Tom", "Retour").click();
    const fromCell = await actionsOf(sheet(page, "Tom · Retour"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(fromCell).toEqual(["Trouver une place", "Ne fait pas le retour"]);

    await person(withoutCar(page), "Tom").click();
    const dialog = sheet(page, "Tom · Retour");
    await expect(dialog).toContainText("Sans voiture");
    expect(await actionsOf(dialog)).toEqual([...fromCell, "Modifier", "Retirer de l’événement"]);
    await expect(dialog.getByText(NOTE)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(person(withoutCar(page), "Tom")).toBeFocused();

    // Not on the retour: « Je cherche une place », as in the cell.
    await fold(page).click();
    await person(panel(page), "Léa").click();
    expect(await actionsOf(sheet(page, "Léa · Retour"))).toEqual(["Je cherche une place", "Modifier", "Retirer de l’événement"]);
  });

  test("PL3.3: « Trouver une place » of Tom, from the list, closes the sheet and puts the focus on the first free seat", async ({ page }) => {
    await person(withoutCar(page), "Tom").click();
    await sheet(page, "Tom · Retour").getByRole("button", { name: "Trouver une place" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel(page).getByRole("article", { name: "Voiture de Camille" }).getByRole("button", { name: /^Place libre/ }).first()).toBeFocused();
  });

  test("PL3.3: « Je cherche une place » of Léa, from the fold, puts her without a car", async ({ page }) => {
    await fold(page).click();
    await person(panel(page), "Léa").click();
    await sheet(page, "Léa · Retour").getByRole("button", { name: "Je cherche une place" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo", "Léa"]);
    await expect(cell(page, "Léa", "Retour")).toHaveAccessibleName(/Sans voiture/);
  });

  test("PL1.3b: « Modifier » from the list opens the form of Tom, and the new first name is read in the lists", async ({ page }) => {
    await person(withoutCar(page), "Tom").click();
    await sheet(page, "Tom · Retour").getByRole("button", { name: "Modifier", exact: true }).click();
    const form = sheet(page, "Modifier Tom");
    await form.getByLabel("Prénom").fill("Thomas");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Thomas", "Hugo"]);
  });

  test("PL1.3b: « Retirer de l’événement » from the list removes Tom, and the focus does not fall on the page", async ({ page }) => {
    await person(withoutCar(page), "Tom").click();
    await sheet(page, "Tom · Retour").getByRole("button", { name: "Retirer de l’événement" }).click();
    await page.getByRole("alertdialog", { name: "Retirer Tom de l’événement ?" }).getByRole("button", { name: "Retirer de l’événement" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Hugo"]);
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("PL3.6: offline, the sheet stays open with « Action impossible… », the focus on the action; back online, it goes through", async ({ context, page }) => {
    const record = await recordBar(page);
    await person(withoutCar(page), "Hugo").click();
    const dialog = sheet(page, "Hugo · Retour");
    const action = dialog.getByRole("button", { name: "Ne fait pas le retour" });
    await context.setOffline(true);
    await action.click();
    await expect(dialog.getByRole("alert")).toHaveText("Action impossible, vérifiez la connexion");
    await expect(action).toBeFocused();
    await expect(listed(page)).toHaveText(["Tom", "Hugo"]);
    await expect(messages(page)).toHaveCount(0);

    await context.setOffline(false);
    await action.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom"]);
    await silent(page, record);
  });

  test("PL3.6: on a server error, the sheet stays open with « Une erreur est survenue… »; nothing changed", async ({ page }) => {
    const failing = await failActions(page);
    await fold(page).click();
    await person(panel(page), "Marc").click();
    const dialog = sheet(page, "Marc · Retour");
    await dialog.getByRole("button", { name: "Passer sans voiture" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Une erreur est survenue et rien n’a changé. Réessayez dans un instant.");
    await expect(listed(page)).toHaveText(["Tom", "Hugo"]);
    await expect(messages(page)).toHaveCount(0);

    failing.on = false;
    await dialog.getByRole("button", { name: "Passer sans voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo", "Marc"]);
  });

  test("PL3.6: a failure after the sheet is closed goes to the bar, whose landmark is the first name of Hugo", async ({ page }) => {
    const answer = await holdFirst(page, scene.hugo, true);
    await person(withoutCar(page), "Hugo").click();
    await sheet(page, "Hugo · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([
      "Hugo · Retour : « Ne fait pas le retour » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.",
    ]);
    await page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" }).click();
    await expect(person(withoutCar(page), "Hugo")).toBeFocused();
  });

  test("PL3.7: « Passer sans voiture » on a person already without a car is a silent success", async ({ db, page, seededEvent }) => {
    const record = await recordBar(page);
    await fold(page).click();
    await person(panel(page), "Marc").click();
    // Meanwhile, another device puts Marc without a car.
    await seedPlacement(db, { personId: scene.marc, eventId: seededEvent.id, leg: "retour", rideId: null });
    await sheet(page, "Marc · Retour").getByRole("button", { name: "Passer sans voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo", "Marc"]);
    await silent(page, record);
  });

  test("PL3.7: « Ne fait pas le retour » on a person already out is a silent success", async ({ db, page }) => {
    const record = await recordBar(page);
    await person(withoutCar(page), "Hugo").click();
    // Meanwhile, another device takes Hugo off the retour.
    await db.deleteFrom("placement").where("person_id", "=", scene.hugo).where("leg", "=", "retour").execute();
    await sheet(page, "Hugo · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom"]);
    await silent(page, record);
  });
});

test.describe("the lists with nobody to say or nobody without a car", () => {
  test.use({ locale: "fr-FR" });

  test("PL1.2: absent at 0; present with nobody without a car, under the empty state", async ({ db, page, seededEvent }) => {
    const hugo = (await seedPerson(db, seededEvent.id, { firstName: "Hugo" })).id;
    await seedPlacement(db, { personId: hugo, eventId: seededEvent.id, leg: "aller", rideId: null });
    await seedPlacement(db, { personId: hugo, eventId: seededEvent.id, leg: "retour", rideId: null });
    await page.goto(`/e/${seededEvent.id}`);
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Hugo"]);
    await expect(fold(page)).toHaveCount(0);
    await selectTab(page, "Retour");
    await expect(fold(page)).toHaveCount(0);

    // Nobody with a place, nobody without a car, one person who is not on the retour: the empty state, and the fold.
    await db.deleteFrom("placement").where("person_id", "=", hugo).where("leg", "=", "retour").execute();
    await page.reload();
    await selectTab(page, "Retour");
    await expect(panel(page).getByRole("heading", { name: "Sans voiture" })).toHaveCount(0);
    await expect(fold(page)).toHaveText("Ne font pas le retour (1)");
    await fold(page).click();
    await expect(person(panel(page), "Hugo")).toBeVisible();
  });

  test("PL1.5: another device moves a person; the page moves her at the next read, with no message and no announcement", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, newToken());
    await keepAdminToken(page, seededEvent.id, seededEvent.token);
    await page.goto(organiserPath(seededEvent));
    await selectTab(page, "Retour");
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Hugo"]);
    const record = await recordBar(page);

    await db.deleteFrom("placement").where("person_id", "=", scene.hugo).where("leg", "=", "retour").execute();
    await seedPlacement(db, { personId: scene.marc, eventId: seededEvent.id, leg: "retour", rideId: null });
    await page.getByRole("button", { name: "Actualiser" }).click();
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Tom", "Marc"]);
    await expect(fold(page)).toHaveText("Ne font pas le retour (2)");
    await silent(page, record);
  });
});

test.describe("360 px", () => {
  test.use({ locale: "fr-FR" });
  const LONG = "MWMWMWMWMW".repeat(4);

  test("PL6.3, PL6.4: a first name of 40 characters without a space wraps in the list and in the sheet; the sentence makes 4,5:1", async ({ db, page, seededEvent }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const long = (await seedPerson(db, seededEvent.id, { firstName: LONG })).id;
    await seedPlacement(db, { personId: long, eventId: seededEvent.id, leg: "retour", rideId: null });
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Retour");
    const button = person(withoutCar(page), LONG);
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    // On two lines: taller than the 44 px of a first name that fits on one.
    expect(box.height).toBeGreaterThan(44);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await button.click();
    const dialog = sheet(page, `${LONG} · Retour`);
    await expect(dialog.getByText(NOTE)).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await contrast(dialog.getByText(NOTE), dialog)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("while the device's persons are not known", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  // C5.9, PL1.3b, PL3.3: before the read answers, or after it failed, board.device is empty: Tom, the device's own,
  // would get the sheet of another device's person. His button, and Hugo's, wait like the seats and « Ajouter une personne ».
  test("C5.9: the name buttons are inactive while the read is pending and after it failed, then Tom has his own sheet", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    const buttons = () => [person(withoutCar(page), "Tom"), person(withoutCar(page), "Hugo")];
    const others = (name: string) => sheet(page, `${name} · Retour`).getByRole("button", { name: "Passer sans voiture" });

    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" })).toBeVisible();
    await selectTab(page, "Retour");
    for (const button of buttons()) await expect(button).toBeDisabled();
    await person(withoutCar(page), "Tom").click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    release();
    await expect(cell(page, "Tom", "Retour")).toBeVisible();
    for (const button of buttons()) await expect(button).toBeEnabled();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    const failing = await failActions(page);
    await page.reload();
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    await selectTab(page, "Retour");
    for (const button of buttons()) await expect(button).toBeDisabled();
    await person(withoutCar(page), "Tom").click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    failing.on = false;
    await retry.click();
    await expect(cell(page, "Tom", "Retour")).toBeVisible();

    // Known, Tom's sheet is his own: « Je cherche une place », « Modifier », « Retirer », and not the sentence of another's.
    await person(withoutCar(page), "Tom").click();
    const dialog = sheet(page, "Tom · Retour");
    await expect(dialog.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(dialog.getByText(NOTE)).toHaveCount(0);
    await expect(others("Tom")).toHaveCount(0);
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-US" });
  const token = newToken();

  test("PL6.1: the fold, the titles, the actions and the sentence are in English", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Return");
    await expect(fold(page)).toHaveText("Not on the return trip (2)");
    await person(withoutCar(page), "Hugo").click();
    const dialog = sheet(page, "Hugo · Return");
    await expect(dialog.getByRole("button", { name: "Not on the return trip" })).toBeVisible();
    await expect(dialog.getByText("Only the device that signed this person up can change their name or number, or remove them.")).toBeVisible();
    await page.keyboard.press("Escape");

    await fold(page).click();
    await person(panel(page), "Marc").click();
    await expect(sheet(page, "Marc · Return").getByRole("button", { name: "Mark as without a car" })).toBeVisible();
  });
});
