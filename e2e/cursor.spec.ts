import { devices, type Locator, type Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdActions, holdToken, newToken } from "./device";
import { cursorOf, cursorsOf } from "./cursor";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #347: the pointer of the language-switch design (v3.3.3), P1.1 to P1.8 and P1.10: the hand
 * (`pointer`) on a button and a `role="button"`, the arrow (`default`) on one that is
 * `disabled` or `aria-disabled`; links, fields, labels and what does not click keep what the
 * browser gives them. Read by `cursorOf` (`e2e/cursor.ts`), whose failures name no number: the
 * scene of P1.4 has a `tel:` link, named here without it.
 */

const contact = (page: Page) => page.getByRole("link", { name: "Nous contacter (s’ouvre dans un nouvel onglet)", exact: true });
const home = (page: Page) => page.getByRole("link", { name: "Accueil", exact: true });
const languageSwitch = (page: Page) => page.getByRole("button", { name: "English", exact: true });
const button = (scope: Page | Locator, name: string) => scope.getByRole("button", { name, exact: true });
const field = (scope: Page | Locator, label: string) => scope.getByLabel(label, { exact: true });
/** The `<label>` that holds a box or a radio button. */
const holder = (control: Locator) => control.locator("xpath=ancestor::label[1]");
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: /^Place libre/ });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });

/** The `<label for>` of a field: its own, not one that holds a control. */
async function labelOf(page: Page, control: Locator) {
  const id = await control.getAttribute("id");
  expect(id, "the field's id").toBeTruthy();
  return page.locator(`label[for="${id}"]`);
}

/** The page, hydrated: the language switch is inactive until then. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(languageSwitch(page)).toBeEnabled();
}

test.describe("the pointer", () => {
  test.use({ locale: "fr-FR" });

  test("P1.1: on /, « Créer un événement », « English » and « Nous contacter » have the hand; the title has auto", async ({ page }) => {
    await open(page, "/");
    expect(
      await cursorsOf({
        "Créer un événement": page.getByRole("link", { name: "Créer un événement", exact: true }),
        English: languageSwitch(page),
        "Nous contacter": contact(page),
        "the title": page.getByRole("heading", { name: "Fullcar", level: 1 }),
      }),
    ).toEqual({ "Créer un événement": "pointer", English: "pointer", "Nous contacter": "pointer", "the title": "auto" });
  });

  test("P1.2: on /nouveau hydrated, the buttons, the boxes and their labels have the hand; « Titre » has text; the date, the time and a field's label have the arrow", async ({
    page,
  }) => {
    await open(page, "/nouveau");
    const create = button(page, "Créer");
    await expect(create).toBeEnabled();
    const retour = page.getByRole("checkbox", { name: "Retour", exact: true });
    const boosters = page.getByRole("checkbox", { name: "Rehausseurs", exact: true });
    const title = field(page, "Titre");
    expect(
      await cursorsOf({
        Créer: create,
        "the box « Retour »": retour,
        "the label of « Retour »": holder(retour),
        "the box « Rehausseurs »": boosters,
        "the label of « Rehausseurs »": holder(boosters),
        Accueil: home(page),
        English: languageSwitch(page),
        Titre: title,
        "Date de début": field(page, "Date de début"),
        "Heure de début": field(page, "Heure de début"),
        "the label « Titre »": await labelOf(page, title),
      }),
    ).toEqual({
      Créer: "pointer",
      "the box « Retour »": "pointer",
      "the label of « Retour »": "pointer",
      "the box « Rehausseurs »": "pointer",
      "the label of « Rehausseurs »": "pointer",
      Accueil: "pointer",
      English: "pointer",
      Titre: "text",
      "Date de début": "default",
      "Heure de début": "default",
      "the label « Titre »": "default",
    });
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("P1.3: on /nouveau, « Créer » and « English », disabled, have the arrow; « Accueil » and « Nous contacter » have the hand", async ({
      page,
    }) => {
      await page.goto("/nouveau");
      await expect(button(page, "Créer")).toBeDisabled();
      await expect(languageSwitch(page)).toBeDisabled();
      expect(
        await cursorsOf({
          Créer: button(page, "Créer"),
          English: languageSwitch(page),
          Accueil: home(page),
          "Nous contacter": contact(page),
        }),
      ).toEqual({ Créer: "default", English: "default", Accueil: "pointer", "Nous contacter": "pointer" });
    });
  });
});

test.describe("the pointer on the event's page", () => {
  test.use({ locale: "fr-FR" });

  test.describe("the scene of F1.3: Claire drives at the aller, Léa, with a number, rides with Marc", () => {
    const token = newToken();

    /** A copy of the scene of `focus-ring-board.spec.ts`, its own: the device holds Claire and Léa. */
    test.beforeEach(async ({ db, page, seededEvent }) => {
      const eventId = seededEvent.id;
      const claire = await seedPerson(db, eventId, { firstName: "Claire", phone: "06 11 22 33 44" }, token);
      const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: "07 22 33 44 55" }, token);
      const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: "07 98 76 54 32" }, newToken());
      await seedRide(db, eventId, claire.id, { departureTime: "07:00:00" });
      const marcsCar = await seedRide(db, eventId, marc.id);
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: marcsCar });
      await seedPlacement(db, { personId: claire.id, eventId, leg: "retour", rideId: null });
      await holdToken(page, eventId, token);
    });

    /** The page, hydrated, and the device's persons known: the free seats are active then. */
    async function openEvent(page: Page, eventId: string) {
      await open(page, `/e/${eventId}`);
      await expect(freeSeats(page, "Claire").first()).toBeEnabled();
    }

    test("P1.4: on the aller, the tabs, the section, the matrix, a free seat, the car's buttons, the tel: link and the footer have the hand; the tab panel and the title have auto", async ({
      page,
      seededEvent,
    }) => {
      await openEvent(page, seededEvent.id);
      const claires = car(page, "Claire");
      expect(
        await cursorsOf({
          "the tab Aller": tab(page, "Aller"),
          "the tab Retour": tab(page, "Retour"),
          "Vos inscriptions": section(page).getByRole("button", { name: /^Vos inscriptions/ }),
          "the first name Claire": button(section(page), "Claire"),
          "the cell of Léa at the aller": button(section(page), "Léa, Aller : Avec Marc"),
          "a free seat of Claire's car": button(claires, "Place libre : prendre une place dans la voiture de Claire").first(),
          Modifier: button(claires, "Modifier"),
          "Retirer la voiture": button(claires, "Retirer la voiture"),
          "the tel: link to Léa": car(page, "Marc").getByRole("link", { name: /^Appeler Léa au/ }),
          "Ajouter une personne": button(panel(page), "Ajouter une personne"),
          "Proposer une voiture": button(panel(page), "Proposer une voiture"),
          Accueil: home(page),
          English: languageSwitch(page),
          "Nous contacter": contact(page),
          "the tab panel": panel(page),
          "the event's title": page.getByRole("heading", { level: 1 }),
        }),
      ).toEqual({
        "the tab Aller": "pointer",
        "the tab Retour": "pointer",
        "Vos inscriptions": "pointer",
        "the first name Claire": "pointer",
        "the cell of Léa at the aller": "pointer",
        "a free seat of Claire's car": "pointer",
        Modifier: "pointer",
        "Retirer la voiture": "pointer",
        "the tel: link to Léa": "pointer",
        "Ajouter une personne": "pointer",
        "Proposer une voiture": "pointer",
        Accueil: "pointer",
        English: "pointer",
        "Nous contacter": "pointer",
        "the tab panel": "auto",
        "the event's title": "auto",
      });
    });

    test("P1.5: while the device's persons are read, « Ajouter une personne », « Proposer une voiture » and each free seat are disabled and have the arrow; read, they have the hand", async ({
      page,
      seededEvent,
    }) => {
      const release = await holdActions(page);
      await open(page, `/e/${seededEvent.id}`);
      const seats = await panel(page).getByRole("button", { name: /^Place libre/ }).all();
      expect(seats.length, "the free seats").toBeGreaterThan(0);
      const actions = [button(panel(page), "Ajouter une personne"), button(panel(page), "Proposer une voiture"), ...seats];
      for (const action of actions) await expect(action).toBeDisabled();
      expect(await Promise.all(actions.map(cursorOf))).toEqual(actions.map(() => "default"));

      release();
      for (const action of actions) await expect(action).toBeEnabled();
      expect(await Promise.all(actions.map(cursorOf))).toEqual(actions.map(() => "pointer"));
    });

    test("P1.6: in « Proposer une voiture », a radio button, its label, « Valider » and « Fermer » have the hand; the place and the note have text; the time has the arrow", async ({
      page,
      seededEvent,
    }) => {
      await openEvent(page, seededEvent.id);
      await button(panel(page), "Proposer une voiture").click();
      const sheet = dialog(page, "Proposer une voiture");
      const lea = sheet.getByRole("radiogroup", { name: "Qui conduit ?" }).getByRole("radio", { name: "Léa", exact: true });
      expect(
        await cursorsOf({
          "the radio button Léa": lea,
          "its label": holder(lea),
          Valider: button(sheet, "Valider"),
          Fermer: button(sheet, "Fermer"),
          "Lieu de départ": field(sheet, "Lieu de départ"),
          "Note (facultatif)": field(sheet, "Note (facultatif)"),
          "Heure de départ": field(sheet, "Heure de départ"),
        }),
      ).toEqual({
        "the radio button Léa": "pointer",
        "its label": "pointer",
        Valider: "pointer",
        Fermer: "pointer",
        "Lieu de départ": "text",
        "Note (facultatif)": "text",
        "Heure de départ": "default",
      });
    });

    test("P1.6: in a person's sheet, « Modifier » has the hand; then « Prénom » has text, « Valider » and « Fermer » the hand", async ({
      page,
      seededEvent,
    }) => {
      await openEvent(page, seededEvent.id);
      await button(section(page), "Claire").click();
      const sheet = dialog(page, "Claire");
      const edit = button(sheet, "Modifier");
      expect(await cursorOf(edit), "Modifier").toBe("pointer");

      await edit.click();
      const form = dialog(page, "Modifier Claire");
      expect(
        await cursorsOf({ Prénom: field(form, "Prénom"), Valider: button(form, "Valider"), Fermer: button(form, "Fermer") }),
      ).toEqual({ Prénom: "text", Valider: "pointer", Fermer: "pointer" });
    });

    test("P1.7: in « Retirer la voiture ? », both buttons have the hand; while the removal is sent, « Retirer la voiture », disabled, has the arrow", async ({
      page,
      seededEvent,
    }) => {
      await openEvent(page, seededEvent.id);
      await button(car(page, "Claire"), "Retirer la voiture").click();
      const confirmation = page.getByRole("alertdialog", { name: "Retirer la voiture ?" });
      const remove = button(confirmation, "Retirer la voiture");
      expect(await cursorsOf({ "Retirer la voiture": remove, Annuler: button(confirmation, "Annuler") })).toEqual({
        "Retirer la voiture": "pointer",
        Annuler: "pointer",
      });

      const release = await holdActions(page);
      await remove.click();
      await expect(remove).toBeDisabled();
      expect(await cursorOf(remove), "Retirer la voiture, sent").toBe("default");
      release();
    });
  });

  test.describe("the scene of F1.9: Tom and Léa without a car, Sophie's car", () => {
    const token = newToken();

    test.beforeEach(async ({ db, page, seededEvent }) => {
      const eventId = seededEvent.id;
      const sophie = await seedPerson(db, eventId, { firstName: "Sophie" });
      await seedRide(db, eventId, sophie.id);
      for (const firstName of ["Tom", "Léa"]) {
        const { id } = await seedPerson(db, eventId, { firstName }, token);
        await seedPlacement(db, { personId: id, eventId, leg: "aller", rideId: null });
      }
      await holdToken(page, eventId, token);
    });

    test("P1.6, P1.8: in the seat sheet, the boxes, their labels and « Fermer » have the hand, « Placer » inactive the arrow; then the bar's « Annuler » and « Fermer » have the hand, its list auto", async ({
      page,
      seededEvent,
    }) => {
      await open(page, `/e/${seededEvent.id}`);
      await freeSeats(page, "Sophie").first().click();
      const sheet = dialog(page, "Qui monte dans la voiture de Sophie ?");
      const boxes = { Tom: sheet.getByRole("checkbox", { name: "Tom", exact: true }), Léa: sheet.getByRole("checkbox", { name: "Léa", exact: true }) };
      for (const box of Object.values(boxes)) await box.uncheck();
      const place = sheet.getByRole("button", { name: /^Placer/ });
      await expect(place).toHaveAttribute("aria-disabled", "true");
      expect(
        await cursorsOf({
          "the box Tom": boxes.Tom,
          "its label": holder(boxes.Tom),
          "the box Léa": boxes.Léa,
          "her label": holder(boxes.Léa),
          Fermer: button(sheet, "Fermer"),
          "Placer, inactive": place,
        }),
      ).toEqual({
        "the box Tom": "pointer",
        "its label": "pointer",
        "the box Léa": "pointer",
        "her label": "pointer",
        Fermer: "pointer",
        "Placer, inactive": "default",
      });

      await boxes.Tom.check();
      await expect(place).not.toHaveAttribute("aria-disabled");
      await expect(place).toHaveText("Placer 1 personne");
      expect(await cursorOf(place), "Placer 1 personne").toBe("pointer");

      // P1.8: the sheet closes, and the bar says it.
      await place.click();
      await expect(sheet).toHaveCount(0);
      const bar = page.locator("[data-message-bar]");
      const list = bar.getByRole("group", { name: "Messages" });
      await expect(list).toHaveText("Tom est dans la voiture de Sophie");
      expect(
        await cursorsOf({ Annuler: button(bar, "Annuler"), Fermer: button(bar, "Fermer"), "the list of messages": list }),
      ).toEqual({ Annuler: "pointer", Fermer: "pointer", "the list of messages": "auto" });
    });
  });
});

test("P1.10: on a desktop, without a touch screen, « Créer un événement » and « English » have the hand", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL, locale: "fr-FR" });
  try {
    const page = await context.newPage();
    await open(page, "/");
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "a fine pointer").toBe(true);
    expect(
      await cursorsOf({
        "Créer un événement": page.getByRole("link", { name: "Créer un événement", exact: true }),
        English: languageSwitch(page),
      }),
    ).toEqual({ "Créer un événement": "pointer", English: "pointer" });
  } finally {
    await context.close();
  }
});
