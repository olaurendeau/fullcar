import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, holdActions, holdToken, loseFirst, messages, newToken } from "./device";
import { numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath, test as organiserTest, unfoldLegs } from "./organiser";

leaveNoToken();

// #779, epic #766: a car's card asks the device for a number when none of its persons in that car
// has one (event-board v4.8, rules 1 to 3, criteria T1). Marc, of his own device, drives at the
// aller with his number. The numbers are the test's own: an assertion on a card or on a number's
// field goes through `numbersHidden`, a stored one is compared, never printed.

type Db = Kysely<Database>;

const MARC_PHONE = "06 12 34 56 78";
const LEA_PHONE = "06 98 76 54 32";
const TOM_PHONE = "07 11 22 33 44";
const KARIM_PHONE = "07 55 66 77 88";
const CLAIRE_PHONE = "06 55 44 33 22";

const FR = {
  passenger: (driver: string) => `Ajoutez un numéro pour que ${driver} puisse vous joindre.`,
  driver: "Ajoutez un numéro pour que les personnes à bord puissent vous joindre.",
  button: "Ajouter un numéro",
  label: (firstName: string) => `Ajouter un numéro pour ${firstName}`,
  optional: "Téléphone (facultatif)",
  phone: "Téléphone",
  edit: (firstName: string) => `Modifier ${firstName}`,
  offline: "Action impossible, vérifiez la connexion",
  notSaved: (firstName: string) => `Le téléphone de ${firstName} n’a pas été enregistré. Vérifiez la connexion, puis réessayez.`,
  seat: (driver: string) => `Place libre : prendre une place dans la voiture de ${driver}`,
  loading: "Chargement de vos inscriptions…",
};

const EN = {
  passenger: (driver: string) => `Add a number so that ${driver} can reach you.`,
  driver: "Add a number so that the people on board can reach you.",
  button: "Add a number",
  label: (firstName: string) => `Add a number for ${firstName}`,
};

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string, title = `Voiture de ${driver}`) => panel(page).getByRole("article", { name: title });
/** Whatever a card asks, in either language. */
const asks = (scope: Locator) => scope.getByText(/^(Ajoutez un numéro|Add a number so)/);
const askButton = (card: Locator, firstName: string, label = FR.label) => card.getByRole("button", { name: label(firstName), exact: true });
const editSheet = (page: Page, firstName: string) => page.getByRole("dialog", { name: FR.edit(firstName), exact: true });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("no box");
  return found;
}

/** Marc, `driver` by default, of his own device and with his number, drives at the aller: 3 seats. */
async function drives(db: Db, eventId: string, driver = "Marc", phone: string | null = MARC_PHONE) {
  const { id } = await seedPerson(db, eventId, { firstName: driver, phone });
  return seedRide(db, eventId, id);
}

/** The device holds these persons, with their number or none, under one token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, fields: { firstName: string; phone?: string }[], token = newToken()) {
  const ids: Record<string, string> = {};
  for (const person of fields) ids[person.firstName] = (await seedPerson(db, eventId, person, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

/** `personId` at the aller, in `rideId`, or without a car when it is null. */
const aller = (db: Db, eventId: string, personId: string, rideId: string | null) => seedPlacement(db, { personId, eventId, leg: "aller", rideId });

/** Whether `personId`'s number is `phone`: `null` for none. Only the boolean is ever printed. */
async function hasNumber(db: Db, personId: string, phone: string | null) {
  const row = await db.selectFrom("person").select("phone").where("id", "=", personId).executeTakeFirstOrThrow();
  return row.phone === phone;
}

/** The server actions the page sends from now on. */
function actions(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"]) sent.push(request);
  });
  return sent;
}

/** Léa, of the device and without a number, is Marc's passenger at the aller (T1.1). */
async function leaInMarcsCar(db: Db, page: Page, eventId: string) {
  const ride = await drives(db, eventId);
  const { Léa: lea } = await device(db, page, eventId, [{ firstName: "Léa" }]);
  await aller(db, eventId, lea, ride);
  return lea;
}

/** Claire, of the device and without a number, drives at the aller as before v4.8, Léa in her car (T1.6). */
async function claireDrives(db: Db, page: Page, eventId: string) {
  const ids = await device(db, page, eventId, [{ firstName: "Claire" }, { firstName: "Léa" }]);
  await aller(db, eventId, ids.Léa, await seedRide(db, eventId, ids.Claire));
  return ids;
}

test.describe("a car's card asks the device for a number", () => {
  test.use({ locale: "fr-FR" });

  test("T1.1: Léa without a number in Marc's car: the sentence, then « Ajouter un numéro », under the seats, 44 px high", async ({ db, page, seededEvent }) => {
    await leaInMarcsCar(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc");
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    const button = askButton(card, "Léa");
    await expect(button).toHaveText(FR.button);
    await expect(button).toHaveAccessibleDescription(FR.passenger("Marc"));
    const seats = await box(card.getByRole("list", { name: "Places" }).getByRole("listitem").last());
    const own = await box(button);
    expect(own.y).toBeGreaterThanOrEqual(seats.y + seats.height);
    expect(own.height).toBeGreaterThanOrEqual(44);
  });

  test("T1.2: the button opens « Modifier Léa », the focus in her number; saved, the card has her tel: link and its title the focus", async ({ db, page, seededEvent }) => {
    const lea = await leaInMarcsCar(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc");
    await askButton(card, "Léa").click();
    const edit = editSheet(page, "Léa");
    const phone = edit.getByLabel(FR.optional, { exact: true });
    await numbersHidden(() => expect(phone).toBeFocused());
    await numbersHidden(() => expect(phone).toHaveValue(""));
    await phone.fill(LEA_PHONE);
    await edit.getByRole("button", { name: "Valider" }).click();

    await expect(edit).toHaveCount(0);
    await expect(asks(card)).toHaveCount(0);
    await expect(card.getByRole("link", { name: /^Appeler Léa au / })).toHaveCount(1);
    await expect(card.getByRole("heading", { name: "Voiture de Marc", exact: true })).toBeFocused();
    await expect(messages(page)).toHaveCount(0);
    await expect(bar(page)).toBeEmpty();
    expect(await hasNumber(db, lea, LEA_PHONE)).toBe(true);
  });

  test("T1.3: the tap stays one: Léa boards in one click, then the card asks, and the bar says she boarded", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const ride = await drives(db, id);
    const { Léa: lea } = await device(db, page, id, [{ firstName: "Léa" }]);
    await aller(db, id, lea, null);
    await page.goto(`/e/${id}`);
    const card = car(page, "Marc");
    await expect(card.getByRole("button", { name: FR.seat("Marc") }).first()).toBeEnabled();
    await expect(asks(card)).toHaveCount(0);

    await card.getByRole("button", { name: FR.seat("Marc") }).first().click();
    await expect(messages(page)).toHaveText(["Léa est dans la voiture de Marc"]);
    await expect(page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" })).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    await expect(askButton(card, "Léa")).toBeVisible();
    const placed = await db.selectFrom("placement").select("ride_id").where("person_id", "=", lea).where("leg", "=", "aller").executeTakeFirstOrThrow();
    expect(placed).toEqual({ ride_id: ride });
  });

  test("T1.4: Léa and Tom without a number: one sentence, the button for Léa, the first in the card", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const ride = await drives(db, id);
    const ids = await device(db, page, id, [{ firstName: "Léa" }, { firstName: "Tom" }]);
    for (const person of [ids.Léa, ids.Tom]) await aller(db, id, person, ride);
    await page.goto(`/e/${id}`);
    const card = car(page, "Marc");
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toHaveCount(1);
    await expect(askButton(card, "Léa")).toBeVisible();
    await expect(askButton(card, "Tom")).toHaveCount(0);
  });

  test("T1.4: Tom has a number: the card asks nothing", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const ride = await drives(db, id);
    const ids = await device(db, page, id, [{ firstName: "Léa" }, { firstName: "Tom", phone: TOM_PHONE }]);
    for (const person of [ids.Léa, ids.Tom]) await aller(db, id, person, ride);
    await page.goto(`/e/${id}`);
    const card = car(page, "Marc");
    await expect(card.getByRole("link", { name: /^Appeler Tom au / })).toHaveCount(1);
    await expect(asks(card)).toHaveCount(0);
  });

  test("T1.5: only where the device has someone; nothing on another device, nor while its persons are read", async ({ baseURL, browser, db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marcs = await drives(db, id);
    const karims = await drives(db, id, "Karim", KARIM_PHONE);
    await drives(db, id, "Sophie", null);
    const ids = await device(db, page, id, [{ firstName: "Léa" }, { firstName: "Tom" }]);
    await aller(db, id, ids.Léa, marcs);
    await aller(db, id, ids.Tom, karims);

    const release = await holdActions(page);
    await page.goto(`/e/${id}`);
    await expect(page.getByRole("status").filter({ hasText: FR.loading })).toBeVisible();
    await expect(car(page, "Marc")).toBeVisible();
    await expect(asks(panel(page))).toHaveCount(0);
    release();

    await expect(car(page, "Marc").getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    await expect(askButton(car(page, "Marc"), "Léa")).toBeVisible();
    await expect(car(page, "Karim").getByText(FR.passenger("Karim"), { exact: true })).toBeVisible();
    await expect(askButton(car(page, "Karim"), "Tom")).toBeVisible();
    await expect(asks(car(page, "Sophie"))).toHaveCount(0);
    await expect(asks(panel(page))).toHaveCount(2);

    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await other.goto(`/e/${id}`);
      await expect(panel(other).getByRole("button", { name: FR.seat("Sophie") }).first()).toBeEnabled();
      await expect(asks(panel(other))).toHaveCount(0);
    } finally {
      for (const other of context.pages()) await other.goto("about:blank").catch(() => other.close());
      await context.close();
    }
  });

  test("T1.6: Claire drives without a number, as before v4.8: the words for the people on board, above « Modifier »; her form says « Téléphone »", async ({ db, page, seededEvent }) => {
    await claireDrives(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Claire");
    await expect(card.getByText(FR.driver, { exact: true })).toBeVisible();
    const button = askButton(card, "Claire");
    await expect(button).toHaveAccessibleDescription(FR.driver);
    await expect(askButton(card, "Léa")).toHaveCount(0);
    const own = await box(button);
    for (const name of ["Modifier", "Retirer la voiture"]) {
      expect(own.y + own.height).toBeLessThanOrEqual((await box(card.getByRole("button", { name, exact: true }))).y);
    }

    await button.click();
    const phone = editSheet(page, "Claire").getByLabel(FR.phone, { exact: true });
    await numbersHidden(() => expect(phone).toBeFocused());
  });

  test("T1.7: closed with « Fermer », then Escape: nothing sent, the sentence stays, the focus back on the button", async ({ db, page, seededEvent }) => {
    await leaInMarcsCar(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc");
    const button = askButton(card, "Léa");
    await expect(button).toBeVisible();
    const sent = actions(page);

    await button.click();
    await editSheet(page, "Léa").getByRole("button", { name: "Fermer" }).click();
    await expect(editSheet(page, "Léa")).toHaveCount(0);
    await expect(button).toBeFocused();

    await button.click();
    await expect(editSheet(page, "Léa")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editSheet(page, "Léa")).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    expect(sent.length).toBe(0);
  });

  // « Les mots d’aujourd’hui » (rule 2): a failure stays in the open form; the bar says it once
  // the form is closed before its answer (state 8).
  test("T1.8: offline, the form says it, and the card still asks", async ({ context, db, page, seededEvent }) => {
    const lea = await leaInMarcsCar(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc");
    await askButton(card, "Léa").click();
    const edit = editSheet(page, "Léa");
    await edit.getByLabel(FR.optional, { exact: true }).fill(LEA_PHONE);
    await context.setOffline(true);
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit.getByRole("alert")).toHaveText(FR.offline);
    await numbersHidden(() => expect(edit.getByLabel(FR.optional, { exact: true })).toHaveValue(LEA_PHONE));

    await edit.getByRole("button", { name: "Fermer" }).click();
    await expect(edit).toHaveCount(0);
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    expect(await hasNumber(db, lea, null)).toBe(true);
  });

  test("T1.8: offline, the form closed before its answer: the bar says her number was not saved, and the card still asks", async ({ context, db, page, seededEvent }) => {
    const lea = await leaInMarcsCar(db, page, seededEvent.id);
    const lose = await loseFirst(page, lea);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc");
    await askButton(card, "Léa").click();
    const edit = editSheet(page, "Léa");
    await edit.getByLabel(FR.optional, { exact: true }).fill(LEA_PHONE);
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit.getByRole("button", { name: "Valider" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    await context.setOffline(true);
    lose();

    await expect(bar(page)).toHaveText(FR.notSaved("Léa"));
    await expect(card.getByText(FR.passenger("Marc"), { exact: true })).toBeVisible();
    expect(await hasNumber(db, lea, null)).toBe(true);
  });

  test("T1.10: the silence stays: Léa has a number, Sophie of another device none; nothing is said of Sophie", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const ride = await drives(db, id);
    const { Léa: lea } = await device(db, page, id, [{ firstName: "Léa", phone: LEA_PHONE }]);
    const sophie = await seedPerson(db, id, { firstName: "Sophie" });
    await aller(db, id, lea, ride);
    await aller(db, id, sophie.id, ride);
    await page.goto(`/e/${id}`);
    const card = car(page, "Marc");
    await expect(card.getByRole("link", { name: /^Appeler Léa au / })).toHaveCount(1);
    for (const words of ["Pas de numéro", "No number", "Ajoutez un numéro"]) await numbersHidden(() => expect(card).not.toContainText(words));
    await expect(card.getByRole("listitem").filter({ hasText: "Sophie" }).getByRole("link")).toHaveCount(0);

    const toggle = section(page).getByRole("button", { name: /^Vos inscriptions/ });
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await section(page).getByRole("button", { name: "Léa", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Léa", exact: true });
    await expect(sheet.getByRole("link")).toHaveCount(1);
    await expect(sheet.getByRole("link", { name: /^Appeler Léa au / })).toHaveCount(1);
    await expect(sheet.getByRole("button")).toHaveText(["Modifier", "Retirer de l’événement", "Fermer"]);
    await numbersHidden(() => expect(sheet).not.toContainText("Ajoutez un numéro"));
  });

  test("T4.11: a driver from before, without a number: « Modifier la voiture » saved, the card still asks her", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire" }]);
    await seedRide(db, id, claire);
    await page.goto(`/e/${id}`);
    await car(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Modifier la voiture" });
    await edit.getByLabel("Note (facultatif)", { exact: true }).fill("Coffre plein");
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit).toHaveCount(0);
    await expect(car(page, "Claire").getByText("Coffre plein", { exact: true })).toBeVisible();
    await expect(car(page, "Claire").getByText(FR.driver, { exact: true })).toBeVisible();
    await expect(askButton(car(page, "Claire"), "Claire")).toBeVisible();
  });
});

test.describe("a car's card asks, at 360 px, a driver's first name of 40 characters", () => {
  test.use({ viewport: { width: 360, height: 780 } });
  const LONG = "Marc-Alexandre-Emmanuel-Christophe-Jean";

  for (const [locale, words] of [
    ["fr-FR", { title: `Voiture de ${LONG}`, sentence: FR.passenger(LONG), label: FR.label }],
    ["en-GB", { title: `${LONG}’s car`, sentence: EN.passenger(LONG), label: EN.label }],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test(`T1.9: nothing overflows, the sentence wraps, the button holds (${locale})`, async ({ db, page, seededEvent }) => {
        const { id } = seededEvent;
        const ride = await drives(db, id, LONG);
        const { Léa: lea } = await device(db, page, id, [{ firstName: "Léa" }]);
        await aller(db, id, lea, ride);
        await page.goto(`/e/${id}`);
        const card = car(page, LONG, words.title);
        const sentence = card.getByText(words.sentence, { exact: true });
        await expect(sentence).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        const widths = await card.evaluate((article) => ({ scroll: article.scrollWidth, client: article.clientWidth }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        const lines = await sentence.evaluate((p) => p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight));
        expect(lines).toBeGreaterThanOrEqual(2);
        expect((await box(askButton(card, "Léa", words.label))).height).toBeGreaterThanOrEqual(44);
      });
    });
  }
});

test.describe("a car's card asks, in English", () => {
  test.use({ locale: "en-GB" });

  test("T1.11: « Add a number so that Marc can reach you. », « Add a number »; for a driver, the people on board", async ({ db, page, seededEvent }) => {
    await leaInMarcsCar(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Marc", "Marc’s car");
    await expect(card.getByText(EN.passenger("Marc"), { exact: true })).toBeVisible();
    await expect(askButton(card, "Léa", EN.label)).toHaveText(EN.button);
  });

  test("T1.11: Claire drives without a number: « Add a number so that the people on board can reach you. »", async ({ db, page, seededEvent }) => {
    await claireDrives(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const card = car(page, "Claire", "Claire’s car");
    await expect(card.getByText(EN.driver, { exact: true })).toBeVisible();
    await expect(askButton(card, "Claire", EN.label)).toHaveText(EN.button);
  });
});

organiserTest.describe("what the organiser sees does not move", () => {
  organiserTest.use({ locale: "fr-FR" });

  organiserTest("T6.1: Claire's car is in « Voitures sans numéro » until she adds hers from the card, then « Toutes les voitures ont un numéro. »", async ({
    baseURL,
    browser,
    db,
    page,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    const token = newToken();
    const claire = await seedPerson(db, id, { firstName: "Claire" }, token);
    await seedRide(db, id, claire.id);
    await page.goto(organiserPath(seededEvent));
    await unfoldLegs(page);
    const allerSection = page.getByRole("region", { name: "Espace organisateur" }).getByRole("region", { name: "Aller", exact: true });
    const cars = allerSection.getByRole("list", { name: "Voitures sans numéro (1)", exact: true });
    await expect(cars.getByRole("listitem").getByText("Voiture de Claire", { exact: true })).toBeVisible();
    await expect(
      allerSection.getByText("Les personnes à bord ne peuvent pas appeler la personne qui conduit. Demandez-lui d’ajouter son numéro.", { exact: true }),
    ).toBeVisible();

    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await holdToken(other, id, token);
      await other.goto(`/e/${id}`);
      await askButton(car(other, "Claire"), "Claire").click();
      const edit = editSheet(other, "Claire");
      await edit.getByLabel(FR.phone, { exact: true }).fill(CLAIRE_PHONE);
      await edit.getByRole("button", { name: "Valider" }).click();
      await expect(edit).toHaveCount(0);
      await expect(asks(car(other, "Claire"))).toHaveCount(0);
    } finally {
      for (const other of context.pages()) await other.goto("about:blank").catch(() => other.close());
      await context.close();
    }
    expect(await hasNumber(db, claire.id, CLAIRE_PHONE)).toBe(true);

    await page.getByRole("region", { name: "Espace organisateur" }).getByRole("button", { name: "Actualiser" }).click();
    await expect(allerSection.getByText("Toutes les voitures ont un numéro.", { exact: true })).toBeVisible();
  });
});
