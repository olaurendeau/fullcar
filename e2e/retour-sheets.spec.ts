import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { DRIVER_PHONE, fillDriver } from "./driver";
import { removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #265, epic #250 (organizer-view v3.3.6, rule 9, decisions 40 and 41): a sheet opened on the
 * Retour, sent once the organiser has removed it, closes; its failure goes to the bar, what was
 * not done then `Actions.why.noRetour`; and the focus goes to the event's title, never <body>.
 * While a sheet hides the page, the retour stays shown until it is closed. The organiser
 * removes the retour in the database (`removeRetourInDb`), as `updateEvent` does. Nothing here
 * prints a token, the admin link or a number.
 */

type Db = Kysely<Database>;

const WHY = "Il n’y a plus de retour pour cet événement.";
const TEXT = {
  cell: `Tom · Retour : « Je cherche une place » n’a pas été enregistré. ${WHY}`,
  sheet: `Tom et Léa n’ont pas pu monter dans la voiture de Sophie. ${WHY}`,
  tap: `Tom n’a pas pu monter dans la voiture de Sophie. ${WHY}`,
  offer: `La voiture de Marc pour le retour n’a pas été proposée. ${WHY}`,
  person: `Inès n’a pas pu rejoindre vos inscriptions. ${WHY}`,
  edit: `Les changements de la voiture de Sophie pour le retour n’ont pas été enregistrés. ${WHY}`,
};

/**
 * The device holds Tom and Léa, without a car at the aller, which unfolds « Vos inscriptions »;
 * on the retour, without a car when `withoutCar` names them, not concerned otherwise. Sophie, of
 * another device unless `sophieMine`, drives the retour (3 seats).
 */
async function seedScene(db: Db, eventId: string, token: string, withoutCar: ("tom" | "lea")[], sophieMine = false) {
  const persons = {
    tom: (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id,
    lea: (await seedPerson(db, eventId, { firstName: "Léa" }, token)).id,
  };
  const sophie = (await seedPerson(db, eventId, { firstName: "Sophie" }, sophieMine ? token : undefined)).id;
  await seedRide(db, eventId, sophie, { leg: "retour" });
  for (const personId of Object.values(persons)) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  for (const who of withoutCar) await seedPlacement(db, { personId: persons[who], eventId, leg: "retour", rideId: null });
  return persons;
}

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const panel = (page: Page) => page.getByRole("tabpanel");
/** The bar's lines and the tabs, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const tabs = (page: Page) => page.locator('[role="tab"]');
const cell = (page: Page, firstName: string) => page.getByRole("button", { name: new RegExp(`^${firstName}, Retour : `) });

/** The Retour tab selected, the device's persons known: a click before hydration does nothing. */
async function openRetour(page: Page, path: string) {
  await page.goto(path);
  const tab = page.getByRole("tab", { name: /^Retour/ });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
  await expect(panel(page).getByRole("button", { name: "Ajouter une personne", exact: true })).toBeEnabled();
}

/**
 * No sheet, no tabs, the bar says `text` alone, and the event's title has the focus: still once
 * Radix has given back the focus of the sheet closed, in a `setTimeout` of its own.
 */
async function expectClosed(page: Page, text: string) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(0);
  await expect(lines(page)).toHaveText([text]);
  await expect(title(page)).toBeFocused();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  await expect(title(page)).toBeFocused();
}

/** The event's rows of `table`, for « nothing written ». */
const count = async (db: Db, table: "ride" | "person", eventId: string) =>
  (await db.selectFrom(table).select("id").where("event_id", "=", eventId).execute()).length;

test.describe("a sheet of the Retour, the retour removed meanwhile", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test("M7.3: « Je cherche une place » of Tom · Retour closes the sheet, and the bar says why", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, []);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    const seen = await watchAlerts(page);
    await cell(page, "Tom").click();
    await removeRetourInDb(db, seededEvent.id);
    await dialog(page, "Tom · Retour").getByRole("button", { name: "Je cherche une place" }).click();

    await expectClosed(page, TEXT.cell);
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });

  test("M7.7: « Qui monte… ? » for Tom and Léa closes; `noRetour` comes before `rideGone`", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, ["tom", "lea"]);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    await panel(page).getByRole("button", { name: "Place libre : prendre une place dans la voiture de Sophie" }).first().click();
    await removeRetourInDb(db, seededEvent.id);
    await dialog(page, "Qui monte dans la voiture de Sophie ?").getByRole("button", { name: "Placer 2 personnes" }).click();

    await expectClosed(page, TEXT.sheet);
    await expect(page.getByText("Cette voiture n’est plus proposée")).toHaveCount(0);
  });

  test("M7.7: a tap for Tom alone says it in the bar", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, ["tom"]);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    await removeRetourInDb(db, seededEvent.id);
    await panel(page).getByRole("button", { name: "Place libre : prendre une place dans la voiture de Sophie" }).first().click();

    await expectClosed(page, TEXT.tap);
  });

  test("M7.11: « Modifier » Sophie's car of the retour closes the sheet", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, [], true);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    await panel(page).getByRole("button", { name: "Modifier", exact: true }).click();
    await dialog(page, "Modifier la voiture").getByLabel("Heure de départ", { exact: true }).fill("19:30");
    await removeRetourInDb(db, seededEvent.id);
    await dialog(page, "Modifier la voiture").getByRole("button", { name: "Valider" }).click();

    await expectClosed(page, TEXT.edit);
  });

  // The sheet sent, closed, then another opened on the retour before the answer: that answer
  // closes neither, waits for the page to show, and the retour stays behind the sheet until then.
  test("a failure waits for the sheet opened since, which the answer does not close", async ({ page, db, seededEvent }) => {
    const persons = await seedScene(db, seededEvent.id, token, []);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    const seen = await watchAlerts(page);
    const answer = await holdFirst(page, persons.tom, false);
    await cell(page, "Tom").click();
    await dialog(page, "Tom · Retour").getByRole("button", { name: "Je cherche une place" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await cell(page, "Léa").click();
    await removeRetourInDb(db, seededEvent.id);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(persons.tom));
    answer();
    await answered;

    await expect(dialog(page, "Léa · Retour")).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
    await expect(lines(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expectClosed(page, TEXT.cell);
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });

  // Sent again from the cell reopened: the second send covers the first, whose failure is never said.
  test("sent again from the sheet reopened: one failure, from the second send", async ({ page, db, seededEvent }) => {
    const persons = await seedScene(db, seededEvent.id, token, []);
    await holdToken(page, seededEvent.id, token);
    await openRetour(page, `/e/${seededEvent.id}`);
    const answer = await holdFirst(page, persons.tom, false);
    for (const close of [true, false]) {
      await cell(page, "Tom").click();
      await dialog(page, "Tom · Retour").getByRole("button", { name: "Je cherche une place" }).click();
      if (close) await page.keyboard.press("Escape");
    }
    await removeRetourInDb(db, seededEvent.id);
    answer();

    await expectClosed(page, TEXT.cell);
  });
});

// Review of #305: the device's read is shown only when it is a state, and « Réessayer » says a
// read that is not one in the bar. Its answer forged here: the header renamed, the legs kept.
test.describe("the device's read answered without the event's header", () => {
  test.use({ locale: "fr-FR" });

  test("« Vos inscriptions » fails, and « Réessayer » says so in the bar until a read is a state", async ({ page, db, seededEvent }) => {
    const token = newToken();
    await seedScene(db, seededEvent.id, token, []);
    await holdToken(page, seededEvent.id, token);
    const forging = { on: true };
    await page.route("**/e/**", async (route) => {
      if (!forging.on || !(await route.request().headerValue("next-action"))) return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replaceAll('"event":{', '"evenx":{') });
    });
    await page.goto(`/e/${seededEvent.id}`);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await retry.click();

    await expect(lines(page)).toHaveText(["Vos inscriptions n’ont pas pu être chargées. Une erreur est survenue : réessayez dans un instant."]);
    await expect(retry).toBeVisible();
    forging.on = false;
    await retry.click();
    await expect(cell(page, "Tom")).toBeVisible();
    await expect(lines(page)).toHaveCount(0);
  });
});

test.describe("a sheet of the Retour on a new device, the retour removed meanwhile", () => {
  test.use({ locale: "fr-FR" });

  test("M7.5: « Proposer une voiture » from the Retour, Marc driving: closed, and nothing written", async ({ page, db, seededEvent }) => {
    await openRetour(page, `/e/${seededEvent.id}`);
    await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    const form = dialog(page, "Proposer une voiture");
    await fillDriver(form, { firstName: "Marc", phone: DRIVER_PHONE });
    await form.getByLabel("Lieu de dépose").fill("Gare de Rennes");
    await removeRetourInDb(db, seededEvent.id);
    await form.getByRole("button", { name: "Valider" }).click();

    await expectClosed(page, TEXT.offer);
    expect([await count(db, "ride", seededEvent.id), await count(db, "person", seededEvent.id)]).toEqual([0, 0]);
  });

  test("M7.8: « Ajouter une personne » from the Retour, Inès: closed, and nothing written", async ({ page, db, seededEvent }) => {
    await openRetour(page, `/e/${seededEvent.id}`);
    await panel(page).getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    await dialog(page, "Ajouter une personne").getByLabel("Prénom").fill("Inès");
    await removeRetourInDb(db, seededEvent.id);
    await dialog(page, "Ajouter une personne").getByRole("button", { name: "Valider" }).click();

    await expectClosed(page, TEXT.person);
    expect(await count(db, "person", seededEvent.id)).toBe(0);
  });
});
