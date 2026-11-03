import type { Page } from "@playwright/test";
import { deleteSeededPerson } from "@/db/test-participants";
import { failHeld, holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { editEventInDb } from "./event-db";
import { around } from "./event-map-points";
import { expect, leaveNoToken, test } from "./fixtures";
import { seedExample } from "./removal-example";
import { placeOf } from "./tiles";

leaveNoToken();

// #670 (docs/design/remove-person/, v2, sections 20 and 21, RP5.1–RP5.3): the other devices see a
// removal at their next read. The coordinator's decision D2: what reads the page again already
// proves it (the device's next action, a reload); « within 20 s » and « back to the foreground »
// are #67's. Another device's removal is written in the database, as `deleteSeededPerson` does.
// And #850's review: a person removed takes her cars with her, and the bar's lines about them.

const REMOVE = "Retirer de l’événement";
const elsewhere = (firstName: string) =>
  `${firstName} ne fait plus partie de vos inscriptions : la personne a été retirée de l’événement depuis un autre appareil.`;

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const names = (page: Page) => section(page).locator("[data-person-name]");
const nameButton = (page: Page, firstName: string) => names(page).filter({ hasText: firstName });
const cellButton = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const sheet = (page: Page, firstName: string) => page.getByRole("dialog", { name: firstName, exact: true });
const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const withoutCar = (page: Page) => panel(page).getByRole("region", { name: "Sans voiture" }).getByRole("listitem");
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
const barUndo = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });

/** Closes every sheet and confirmation, before an answer. */
async function closeAll(page: Page) {
  // By their CSS: a confirmation that closes hides its sheet from role queries until it is gone.
  const open = page.locator('[role="dialog"], [role="alertdialog"]');
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(open).toHaveCount(0, { timeout: 1_000 });
  }).toPass();
}

/** « Ne fait pas {leg} » from `firstName`'s cell, sent; its sheet closed before the answer when `close`. */
async function notConcerned(page: Page, firstName: string, leg: "Aller" | "Retour", close = false) {
  await cellButton(page, firstName, leg).click();
  const option = leg === "Aller" ? "Ne fait pas l’aller" : "Ne fait pas le retour";
  await page.getByRole("dialog", { name: `${firstName} · ${leg}` }).getByRole("button", { name: option }).click();
  if (close) await closeAll(page);
  else await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("a removal seen from the other devices", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  const inesToken = newToken();
  let example: Awaited<ReturnType<typeof seedExample>>;

  test.beforeEach(async ({ db, seededEvent }) => {
    const place = placeOf(seededEvent.id);
    await editEventInDb(db, seededEvent.id, { locationPosition: place });
    example = await seedExample(db, seededEvent.id, token, { inesToken, marcAt: around(place, { north: 250 }) });
  });

  // Section 20: Inès's device, she in Marc's car; Marc removed from another device. The seed has no
  // duplicate Léa: the aller has 4 without a car, not 5, the retour 3.
  test("RP5.1, RP5.2: at the device's next action, Inès is without a car, the pills and the map follow, the bar says nothing", async ({ db, page, seededEvent }) => {
    await holdToken(page, seededEvent.id, inesToken);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(cellButton(page, "Inès", "Aller")).toHaveAccessibleName(/Marc/);
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 1 sans voiture");
    await expect(page.getByRole("region", { name: "Carte de l’aller : le lieu de l’événement et 1 voiture" })).toBeVisible();

    await deleteSeededPerson(db, seededEvent.id, example.device.marc);
    // Her next action: « Modifier » Inès, her number.
    await nameButton(page, "Inès").click();
    await sheet(page, "Inès").getByRole("button", { name: "Modifier", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Modifier Inès" });
    await form.getByLabel("Téléphone (facultatif)").fill("06 55 44 33 22");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(cellButton(page, "Inès", "Aller")).toHaveAccessibleName("Inès, Aller : Sans voiture");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 4 sans voiture");
    await expect(tab(page, "Retour")).toHaveAccessibleName("Retour 3 sans voiture");
    await expect(messages(page)).toHaveCount(0);
    await expect(car(page, "Marc")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Carte de l’aller : le lieu de l’événement et aucune voiture" })).toBeVisible();
    // Tom, and Léa, Inès and Hugo besides, in the order they were placed.
    await expect(withoutCar(page)).toHaveCount(4);
    for (const firstName of ["Tom", "Léa", "Inès", "Hugo"]) await expect(withoutCar(page).filter({ hasText: firstName })).toHaveCount(1);
    await tab(page, "Retour").click();
    await expect(car(page, "Sophie").getByRole("button", { name: /^Place libre/ })).toHaveCount(3);
  });

  // Section 21: Marc's device, his sheet open; Marc removed elsewhere (the organiser's path is #672's).
  test("RP5.3: at the next read, his row and his sheet go, the bar says it once, the focus on the next first name; reloaded, nothing", async ({
    db,
    page,
    seededEvent,
  }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    const record = await recordBar(page);
    // The read: Tom's « Ne fait pas l’aller », answered once Marc's sheet is open and Marc removed.
    const answer = await holdFirst(page, example.device.tom, false);
    await notConcerned(page, "Tom", "Aller", true);
    await nameButton(page, "Marc").click();
    await expect(sheet(page, "Marc")).toBeVisible();
    await deleteSeededPerson(db, seededEvent.id, example.device.marc);
    answer();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(names(page)).toHaveText(["Léa", "Tom"]);
    await expect(messages(page)).toHaveText([elsewhere("Marc")]);
    await expect(barStatus(page)).toHaveText(elsewhere("Marc"));
    await expect(nameButton(page, "Léa")).toBeFocused();

    // Once: the next read says nothing again.
    await notConcerned(page, "Léa", "Retour");
    await expect(cellButton(page, "Léa", "Retour")).toHaveAccessibleName(/Ne fait pas le retour/);
    expect(said((await record()).writes, "status")).toEqual([elsewhere("Marc")]);

    await page.reload();
    await expect(names(page)).toHaveText(["Léa", "Tom"]);
    await expect(messages(page)).toHaveCount(0);
  });

  test("RP5.3: removed elsewhere, no sheet open: « Fermer » gives the focus to the next first name", async ({ db, page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    await deleteSeededPerson(db, seededEvent.id, example.device.marc);
    await notConcerned(page, "Tom", "Aller");
    await expect(names(page)).toHaveText(["Léa", "Tom"]);
    await expect(messages(page)).toHaveText([elsewhere("Marc")]);
    await barClose(page).click();
    await expect(messages(page)).toHaveCount(0);
    await expect(nameButton(page, "Léa")).toBeFocused();
  });

  // The review of #862: Marc removed, then Tom; the refusal of Tom's action names Tom alone, and Marc is news.
  test("RP5.3, RP5.4: two removed elsewhere, an action on one: her refusal names her, the other is said removed elsewhere", async ({
    db,
    page,
    seededEvent,
  }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    await deleteSeededPerson(db, seededEvent.id, example.device.marc);
    await deleteSeededPerson(db, seededEvent.id, example.device.tom);
    await notConcerned(page, "Tom", "Aller");
    await expect(names(page)).toHaveText(["Léa"]);
    await expect(messages(page)).toHaveText([
      "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Tom ne fait plus partie de l’événement.",
      elsewhere("Marc"),
    ]);
  });

  // The last person of the device: the section goes, her sheet closes, the focus on « Ajouter une personne ».
  test("RP5.3: the device's last person removed elsewhere, her sheet open: it closes, the focus on « Ajouter une personne »", async ({
    db,
    page,
    seededEvent,
  }) => {
    await holdToken(page, seededEvent.id, inesToken);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Inès"]);
    // The read: her « Ne fait pas le retour », answered once her sheet is open and she is removed.
    const answer = await holdFirst(page, example.others.ines, false);
    await notConcerned(page, "Inès", "Retour", true);
    await nameButton(page, "Inès").click();
    await expect(sheet(page, "Inès")).toBeVisible();
    await deleteSeededPerson(db, seededEvent.id, example.others.ines);
    answer();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-add-person="aller"]')).toBeFocused();
    await expect(messages(page)).toHaveText(["Inès · Retour : « Ne fait pas le retour » n’a pas été enregistré. Inès ne fait plus partie de l’événement."]);
  });

  test("RP5.3: two pages of one device: A removes Léa, B never says she was removed elsewhere", async ({ context, page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
    const other = await context.newPage();
    await holdToken(other, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await other.goto(`/e/${seededEvent.id}`);
    await expect(names(other)).toHaveText(["Marc", "Léa", "Tom"]);
    const record = await recordBar(other);

    await nameButton(page, "Léa").click();
    await sheet(page, "Léa").getByRole("button", { name: REMOVE, exact: true }).click();
    await page.getByRole("alertdialog", { name: "Retirer Léa de l’événement ?" }).getByRole("button", { name: REMOVE, exact: true }).click();
    await expect(names(page)).toHaveText(["Marc", "Tom"]);

    await notConcerned(other, "Tom", "Aller");
    await expect(names(other)).toHaveText(["Marc", "Tom"]);
    await expect(messages(other)).toHaveCount(0);
    expect(said((await record()).writes, "status")).toEqual([]);
  });

  // #850's review: Claire, of another device, removed; her car goes, and what the bar said about it.
  test("a driver removed elsewhere: the failure of « Annuler » in her car goes, with its « Annuler »", async ({ db, page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    // Tom, alone without a car on the aller: one tap.
    await car(page, "Claire").getByRole("button", { name: /^Place libre/ }).click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Claire"]);
    const undo = await holdFirst(page, example.cars.claire, true);
    await barUndo(page).click();
    await failHeld(page, undo);
    await expect(messages(page)).toHaveCount(2);
    await expect(barUndo(page)).toHaveCount(1);

    await deleteSeededPerson(db, seededEvent.id, example.others.claire);
    await notConcerned(page, "Léa", "Retour");
    await expect(car(page, "Claire")).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    await expect(barUndo(page)).toHaveCount(0);
  });

  test("a driver of the device removed here: the failure of « Retirer la voiture » of his car goes; the removal is said", async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const removal = await holdFirst(page, example.cars.marc, true);
    await car(page, "Marc").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Retirer la voiture ?" }).getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    await closeAll(page);
    await failHeld(page, removal);
    await expect(messages(page)).toHaveCount(1);

    await nameButton(page, "Marc").click();
    await sheet(page, "Marc").getByRole("button", { name: REMOVE, exact: true }).click();
    await page.getByRole("alertdialog", { name: "Retirer Marc de l’événement ?" }).getByRole("button", { name: REMOVE, exact: true }).click();
    await expect(names(page)).toHaveText(["Léa", "Tom"]);
    await expect(messages(page)).toHaveText(["Marc ne fait plus partie de l’événement"]);
  });
});
