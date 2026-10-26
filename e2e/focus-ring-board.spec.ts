import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { DRIVER_PHONE } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, noteUnfocused, press, pressUntil, walk, type Ring } from "./focus-ring";
import { withoutNumbers } from "./without-numbers";

leaveNoToken();

/*
 * #322, epic #236: the focus ring of the language-switch design (v3.3.1) on /e/{id}, its
 * sheets, its confirmation, and without JavaScript (F1.3, F1.4, F1.5, F1.16 points 1 and 2,
 * F1.18), measured by `e2e/focus-ring.ts`. Never `focus()`: the keyboard alone moves it.
 */

type Db = Kysely<Database>;

const CLAIRE_PHONE = "06 11 22 33 44";
const LEA_PHONE = "07 22 33 44 55";
const MARC_PHONE = "07 98 76 54 32";
const WHITE = "rgb(255, 255, 255)";
const MUTED = "rgb(245, 245, 245)";

/**
 * A copy of the scene of `person-edit.spec.ts`, its own, where Léa has a number (F1.3, v3.2):
 * the device holds Claire and Léa. Aller: Claire drives; Marc, of another device, drives Léa.
 * Retour: no car, Claire is without a car, Léa is not concerned. `withoutCar` adds persons of
 * the device without a car at the aller: two of them make a free seat open the sheet (#306).
 */
async function seedScene(db: Db, eventId: string, token: string, marcsToken: string, withoutCar: string[] = []) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire", phone: CLAIRE_PHONE }, token);
  const lea = await seedPerson(db, eventId, { firstName: "Léa", phone: LEA_PHONE }, token);
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: MARC_PHONE }, marcsToken);
  await seedRide(db, eventId, claire.id, { departureTime: "07:00:00" });
  const marcsCar = await seedRide(db, eventId, marc.id);
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: marcsCar });
  await seedPlacement(db, { personId: claire.id, eventId, leg: "retour", rideId: null });
  for (const firstName of withoutCar) {
    const { id } = await seedPerson(db, eventId, { firstName }, token);
    await seedPlacement(db, { personId: id, eventId, leg: "aller", rideId: null });
  }
  return { marcsCar };
}

const contact = (page: Page) => page.getByRole("link", { name: "Nous contacter (s’ouvre dans un nouvel onglet)", exact: true });
const home = (page: Page) => page.getByRole("link", { name: "Accueil", exact: true });
const source = (page: Page) =>
  page.getByRole("link", { name: "Code source sur GitHub (s’ouvre dans un nouvel onglet)", exact: true });
const languageSwitch = (page: Page) => page.getByRole("button", { name: "English", exact: true });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const freeSeat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: /^Place libre/ }).first();
const button = (scope: Page | Locator, name: string) => scope.getByRole("button", { name, exact: true });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
/** « Nous contacter » as `walk` names it, its name cut at 40 characters. */
const contactReached = /^<a> "Nous contacter/;
/** « Code source sur GitHub » (#489), as `walk` names it. */
const sourceReached = /^<a> "Code source sur GitHub/;

/** `run`, its failure rethrown with the numbers hidden: a `tel:` link is named by its number. */
async function quiet<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(withoutNumbers(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Tab from where the focus is, through each of `stops` in order, down to `until`: every
 * element reached passes the measure (`walk`). Returns what was reached, its numbers hidden,
 * and each stop's ring.
 */
async function walkThrough(page: Page, stops: Locator[], until: Locator) {
  const reached: string[] = [];
  const rings: Ring[] = [];
  for (const stop of stops) {
    reached.push(...(await quiet(() => walk(page, { until: stop }))));
    rings.push(await quiet(() => expectRing(stop)));
  }
  reached.push(...(await quiet(() => walk(page, { until }))));
  return { reached: reached.map(withoutNumbers), rings: rings.map((ring) => ({ ...ring, element: withoutNumbers(ring.element) })) };
}

/** The page, hydrated, and the device's persons known: the free seats are active then. */
async function open(page: Page, eventId: string) {
  await page.goto(`/e/${eventId}`);
  await expect(languageSwitch(page)).toBeEnabled();
  await expect(freeSeat(page, "Marc")).toBeEnabled();
}

const background = ({ background }: Ring) => background;

/**
 * An arrow in a Radix group, held until `target` has the focus: Radix moves the focus after a
 * `setTimeout`, and a radio button is checked only if the arrow is still down then.
 */
async function arrow(page: Page, key: string, target: Locator) {
  await noteUnfocused(page);
  await page.keyboard.down(key);
  await expect(target).toBeFocused();
  await page.keyboard.up(key);
}

/**
 * The ring of the tab the arrow has just selected. The arrow selects as it focuses, and the
 * active tab has a shadow (`data-active:shadow-sm`) that comes with the selection, not the
 * focus: step 6 compares the tab with itself selected. Left by Tab, reached again by Maj+Tab,
 * the keyboard alone, the state noted unfocused is the selected tab's.
 */
async function selectedTabRing(page: Page, target: Locator) {
  await press(page, "Tab");
  await expect(target).not.toBeFocused();
  await press(page, "Shift+Tab");
  await expect(target).toBeFocused();
  return expectRing(target);
}

test.describe("the focus ring on the event's page", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  const marcsToken = newToken();

  test.describe("the scene of « Modifier » a person, Léa with a number", () => {
    test.beforeEach(async ({ db, page, seededEvent }) => {
      await seedScene(db, seededEvent.id, token, marcsToken);
      await holdToken(page, seededEvent.id, token);
    });

    test("F1.3: one walk per tab, the tabs by the arrows; every element reached shows the ring, on white or on the tabs' grey", async ({
      page,
      seededEvent,
    }) => {
      await open(page, seededEvent.id);

      // 1. The aller's tab active: from the top of the page down to « Nous contacter ».
      const claires = car(page, "Claire");
      const aller = await walkThrough(
        page,
        [
          section(page).getByRole("button", { name: /^Vos inscriptions/ }),
          button(section(page), "Claire"),
          button(section(page), "Claire, Aller : Conduit"),
          tab(page, "Aller"),
          panel(page),
          freeSeat(page, "Claire"),
          button(claires, "Modifier"),
          button(claires, "Retirer la voiture"),
          car(page, "Marc").getByRole("link", { name: /^Appeler Léa au/ }),
        ],
        contact(page),
      );
      expect(aller.rings.map(background)).toEqual([WHITE, WHITE, WHITE, MUTED, WHITE, WHITE, WHITE, WHITE, MUTED]);
      expect(aller.reached).toContain('<a> "Appeler Léa au <numéro>"');
      expect(aller.reached.at(-2)).toMatch(sourceReached);
      expect(aller.reached.at(-1)).toMatch(contactReached);

      // 2. The retour's tab: back to « Aller », then the right arrow selects « Retour ».
      await pressUntil(page, "Shift+Tab", tab(page, "Aller"));
      await arrow(page, "ArrowRight", tab(page, "Retour"));
      await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");
      const retourTab = await selectedTabRing(page, tab(page, "Retour"));
      expect(retourTab.background).toBe(MUTED);
      expect(retourTab.ratio).toBeGreaterThanOrEqual(4.3);
      const retour = await walkThrough(
        page,
        [panel(page), button(panel(page), "Ajouter une personne"), button(panel(page), "Proposer une voiture")],
        contact(page),
      );
      expect(retour.rings.map(background)).toEqual([WHITE, WHITE, WHITE]);
      expect(retour.reached.at(-2)).toMatch(sourceReached);
      expect(retour.reached.at(-1)).toMatch(contactReached);

      // 3. The left arrow from « Retour » gives « Aller » back.
      await pressUntil(page, "Shift+Tab", tab(page, "Retour"));
      await arrow(page, "ArrowLeft", tab(page, "Aller"));
      await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
      expect((await selectedTabRing(page, tab(page, "Aller"))).background).toBe(MUTED);
    });

    test("F1.4: « Proposer une voiture » opened from the keyboard; « Qui conduit ? » by the arrows, the note, the boxes of « Qui monte avec vous ? », « Valider » and « Fermer » show the ring", async ({
      db,
      page,
      seededEvent,
    }) => {
      // Tom, of the device, without a car at the aller: « Qui monte avec vous ? » has his box (#171).
      // Chosen to drive on the way, he has a number (#775).
      const tom = await seedPerson(db, seededEvent.id, { firstName: "Tom", phone: DRIVER_PHONE }, token);
      await seedPlacement(db, { personId: tom.id, eventId: seededEvent.id, leg: "aller", rideId: null });
      await open(page, seededEvent.id);
      await pressUntil(page, "Tab", button(panel(page), "Proposer une voiture"), 60);
      await press(page, "Enter");
      const sheet = dialog(page, "Proposer une voiture");
      await expect(sheet).toBeVisible();

      // Claire drives at the aller: Léa and Tom can, nobody is chosen, and Léa, the first, has the focus as the sheet opens.
      const driver = sheet.getByRole("radiogroup", { name: "Qui conduit ?" });
      const lea = driver.getByRole("radio", { name: "Léa", exact: true });
      const tomDrives = driver.getByRole("radio", { name: "Tom", exact: true });
      const someoneNew = driver.getByRole("radio", { name: "Une nouvelle personne", exact: true });
      await expect(lea).toBeFocused();
      expect((await expectRing(lea)).background).toBe(WHITE);
      await arrow(page, "ArrowDown", tomDrives);
      await arrow(page, "ArrowDown", someoneNew);
      await expect(someoneNew).toBeChecked();
      expect((await expectRing(someoneNew)).background).toBe(WHITE);
      await arrow(page, "ArrowUp", tomDrives);
      await arrow(page, "ArrowUp", lea);
      await expect(lea).toBeChecked();
      expect((await expectRing(lea)).background).toBe(WHITE);

      const { reached, rings } = await walkThrough(
        page,
        [
          sheet.getByLabel("Note (facultatif)", { exact: true }),
          sheet.getByRole("group", { name: "Qui monte avec vous ?" }).getByRole("checkbox", { name: "Tom", exact: true }),
          button(sheet, "Valider"),
        ],
        button(sheet, "Fermer"),
      );
      expect(rings.map(background)).toEqual([WHITE, WHITE, WHITE]);
      // The place, the time and the seats, then the note; « Au retour », its radio buttons, by its
      // chosen one; then Tom's box, a Radix button.
      expect(reached).toEqual(["<input>", "<input>", "<input>", "<textarea>", "<button>", "<button>", '<button> "Valider"', '<button> "Fermer"']);
    });

    test("F1.5: the confirmation « Retirer la voiture ? » opened from the keyboard: the red button and « Annuler » touch the box's white", async ({
      page,
      seededEvent,
    }) => {
      await open(page, seededEvent.id);
      await pressUntil(page, "Tab", button(car(page, "Claire"), "Retirer la voiture"), 60);
      await press(page, "Enter");
      const confirmation = page.getByRole("alertdialog", { name: "Retirer la voiture ?" });
      await expect(confirmation).toBeVisible();

      const cancel = button(confirmation, "Annuler");
      const remove = button(confirmation, "Retirer la voiture");
      await expect(cancel).toBeFocused();
      const cancelRing = await expectRing(cancel);
      await press(page, "Shift+Tab");
      await expect(remove).toBeFocused();
      const removeRing = await expectRing(remove);
      for (const ring of [removeRing, cancelRing]) expect({ background: ring.background, ratio: ring.ratio.toFixed(2) }).toEqual({ background: WHITE, ratio: "4.74" });

      await press(page, "Escape");
      await expect(confirmation).toHaveCount(0);
    });

    test("F1.16: « Voir la voiture », from a cell by the keyboard, focuses the car's title, which shows the ring", async ({
      page,
      seededEvent,
    }) => {
      await open(page, seededEvent.id);
      await pressUntil(page, "Tab", button(section(page), "Léa, Aller : Avec Marc"));
      await press(page, "Enter");
      const sheet = dialog(page, "Léa · Aller");
      await expect(sheet).toBeVisible();
      await pressUntil(page, "Tab", button(sheet, "Voir la voiture"));
      await press(page, "Enter");

      const title = page.getByRole("heading", { name: "Voiture de Marc" });
      await expect(title).toBeFocused();
      expect((await expectRing(title)).background).toBe(WHITE);
    });
  });

  test("F1.16: the car removed while its seat sheet is open, Escape focuses the leg's banner, which shows the ring", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { marcsCar } = await seedScene(db, seededEvent.id, token, marcsToken, ["Tom", "Hugo"]);
    await holdToken(page, seededEvent.id, token);
    await open(page, seededEvent.id);
    await pressUntil(page, "Tab", freeSeat(page, "Marc"), 60);
    await press(page, "Enter");
    const sheet = dialog(page, "Qui monte dans la voiture de Marc ?");
    await expect(sheet).toBeVisible();

    // Another device removes the car; « Placer » learns it, and the page takes the state (C6.8).
    await db.deleteFrom("ride").where("id", "=", marcsCar).execute();
    await pressUntil(page, "Tab", sheet.getByRole("button", { name: /^Placer/ }));
    await press(page, "Enter");
    await expect(sheet.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Cette voiture n’est plus proposée");
    await expect(button(sheet, "Fermer")).toBeFocused();

    await press(page, "Escape");
    await expect(sheet).toHaveCount(0);
    await expect(car(page, "Marc")).toHaveCount(0);
    const banner = page.locator('[data-leg-banner="aller"]');
    await expect(banner).toBeFocused();
    expect((await expectRing(banner)).background).toBe(WHITE);
  });
});

test.describe("the focus ring on the event's page, without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("F1.18: « Accueil », « Code source sur GitHub » and « Nous contacter » reached by Tab show the ring; the inactive language switch is not reached", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id, newToken(), newToken());
    await page.goto(`/e/${seededEvent.id}`);
    await expect(languageSwitch(page)).toBeDisabled();

    await pressUntil(page, "Tab", home(page), 60);
    expect((await expectRing(home(page))).background).toBe(WHITE);
    await press(page, "Tab");
    await expect(source(page)).toBeFocused();
    expect((await expectRing(source(page))).background).toBe(WHITE);
    await press(page, "Tab");
    await expect(contact(page)).toBeFocused();
    expect((await expectRing(contact(page))).background).toBe(WHITE);
  });
});
