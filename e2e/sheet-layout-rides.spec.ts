import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor } from "./photon";
import { namedPlace, textOf } from "./place-field";
import { barOf, boxOf, edgesOf, expectClearOfFixedParts, fakeVisualViewport, headerOf, moveVisibleArea } from "./sheet-layout";

leaveNoToken();

// #694 (event-board v4.6, #650): « Proposer une voiture » and « Modifier la voiture » fill the
// visible height on a phone, « Valider » in their bar. The project `e2e` is a Pixel 7.

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  edit: "Modifier la voiture",
  retour: "Au retour",
  driver: "Qui conduit ?",
  passengers: "Qui monte avec vous ?",
  departure: "Lieu de départ",
  dropOff: "Lieu de dépose",
  drive: "Je ramène aussi des personnes",
  time: "Heure de départ",
  note: "Note (facultatif)",
  required: "Champ requis.",
};

const RETOUR_HINT = "Le retour part du lieu de l’événement, Gymnase des Gayeulles, le samedi 12 décembre 2026 à 18:00.";

/** The device holds `names`, each without a car on the aller. */
async function seedWithoutCar(db: Db, eventId: string, token: string, names: readonly string[]) {
  for (const firstName of names) {
    const person = await seedPerson(db, eventId, { firstName }, token);
    await seedPlacement(db, { personId: person.id, eventId, leg: "aller", rideId: null });
  }
}

/** The device holds Claire, who drives on the aller, with a note. */
async function seedCar(db: Db, eventId: string, token: string) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire" }, token);
  await seedRide(db, eventId, claire.id, { note: "Rendez-vous devant la mairie" });
}

const panel = (page: Page) => page.getByRole("tabpanel");
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const submit = (sheet: Locator, name = "Valider") => sheet.getByRole("button", { name, exact: true });
const close = (sheet: Locator, name = "Fermer") => sheet.getByRole("button", { name, exact: true });

/** Once the sheet's opening animation is over: it slides up from the bottom. */
async function settled(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
}

/** « Proposer une voiture » of the Aller, its opening over. */
async function openOffer(page: Page, offer = FR.offer) {
  await panel(page).getByRole("button", { name: offer, exact: true }).click();
  const sheet = dialog(page, offer);
  await settled(sheet);
  return sheet;
}

/** « Modifier la voiture » of Claire's car, its opening over. */
async function openEdit(page: Page, names = { car: "Voiture de Claire", edit: "Modifier", title: FR.edit }) {
  await panel(page).getByRole("article", { name: names.car }).getByRole("button", { name: names.edit, exact: true }).click();
  const sheet = dialog(page, names.title);
  await settled(sheet);
  return sheet;
}

const scrollTop = (sheet: Locator) => sheet.evaluate((element) => element.scrollTop);
const overflows = (sheet: Locator) => sheet.evaluate((element) => element.scrollHeight > element.clientHeight);
const scrollSheet = (sheet: Locator, to: "top" | "bottom") =>
  sheet.evaluate((element, end) => element.scrollTo({ top: end === "top" ? 0 : element.scrollHeight, behavior: "instant" }), to);

test.describe("the car sheets on a phone", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });
  const token = newToken();

  test.beforeEach(async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
  });

  test("K1.1: « Proposer une voiture » fills the screen, « Valider » and « Fermer » in its bar and in view from the start", async ({ db, page, seededEvent }) => {
    await seedWithoutCar(db, seededEvent.id, token, ["Claire", "Léa", "Tom"]);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openOffer(page);
    expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
    await expect(submit(sheet)).toBeInViewport({ ratio: 1 });
    await expect(close(sheet)).toBeInViewport({ ratio: 1 });
    expect(await scrollTop(sheet)).toBe(0);
    await expect(barOf(sheet).getByRole("button")).toHaveText(["Valider", "Fermer"]);
  });

  test("K1.1: « Modifier la voiture » fills the screen, « Valider » and « Fermer » in its bar and in view from the start", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openEdit(page);
    expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
    await expect(submit(sheet)).toBeInViewport({ ratio: 1 });
    await expect(close(sheet)).toBeInViewport({ ratio: 1 });
    expect(await scrollTop(sheet)).toBe(0);
    await expect(barOf(sheet).getByRole("button")).toHaveText(["Valider", "Fermer"]);
  });

  test("K1.2: « Proposer une voiture » scrolls under its title, « Valider » and « Fermer », which do not move", async ({ db, page, seededEvent }) => {
    await seedWithoutCar(db, seededEvent.id, token, ["Claire", "Léa", "Tom"]);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openOffer(page);
    expect(await overflows(sheet)).toBe(true);
    const fixed = [sheet.getByRole("heading", { name: FR.offer }), submit(sheet), close(sheet)];
    const before = await Promise.all(fixed.map(boxOf));

    for (const end of ["bottom", "top"] as const) {
      await scrollSheet(sheet, end);
      expect(await scrollTop(sheet)).toBe(end === "top" ? 0 : await sheet.evaluate((element) => element.scrollHeight - element.clientHeight));
      for (const [index, part] of fixed.entries()) {
        const box = await boxOf(part);
        box.forEach((value, at) => expect(Math.abs(value - before[index]![at]!)).toBeLessThanOrEqual(1));
        await expect(part).toBeInViewport({ ratio: 1 });
      }
    }
    // The group of v4.5 keeps its line (E1.1).
    await expect(sheet.getByRole("radiogroup", { name: FR.retour })).toHaveAccessibleDescription(RETOUR_HINT);
  });

  test("K1.6: « Modifier la voiture » follows a window that shrinks, the note in view above the bar", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openEdit(page);
    const note = sheet.getByLabel(FR.note);
    await note.focus();
    await page.setViewportSize({ width: 360, height: 420 });
    await expect.poll(() => boxOf(sheet)).toEqual([0, 0, 360, 420]);
    await expect(note).toBeFocused();
    await expect.poll(async () => (await edgesOf(barOf(sheet))).top - (await edgesOf(note)).bottom).toBeGreaterThanOrEqual(7.5);
    await expectClearOfFixedParts(sheet, note);
    await expect(submit(sheet)).toBeInViewport({ ratio: 1 });
  });

  test("K1.7: with an iPhone's keyboard, « Modifier la voiture » follows the visible area, the note and « Valider » in it", async ({
    db,
    page,
    seededEvent,
  }) => {
    await fakeVisualViewport(page);
    await seedCar(db, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openEdit(page);
    const note = sheet.getByLabel(FR.note);
    await note.focus();
    const span = async () => {
      const { top, bottom } = await edgesOf(sheet);
      return [Math.round(top), Math.round(bottom)];
    };
    const expectInside = async (top: number, bottom: number) => {
      for (const inside of [note, submit(sheet)]) {
        await expect
          .poll(async () => {
            const box = await edgesOf(inside);
            return box.top >= top - 0.5 && box.bottom <= bottom + 0.5;
          })
          .toBe(true);
      }
    };

    await moveVisibleArea(page, { height: 340, offsetTop: 0 }, "resize");
    await expect.poll(span).toEqual([0, 340]);
    await expectInside(0, 340);
    await expect(note).toBeFocused();

    // Safari moved what it shows, to show the field.
    await moveVisibleArea(page, { offsetTop: 120 }, "scroll");
    await expect.poll(span).toEqual([120, 460]);
    await expectInside(120, 460);

    // The keyboard closed.
    await moveVisibleArea(page, { height: 640, offsetTop: 0 }, "resize");
    await expect.poll(span).toEqual([0, 640]);
    await expectInside(0, 640);
  });

  test("K1.10: the wheel over « Proposer une voiture », its body, header or bar, never scrolls the page; closed, the page is where it was", async ({
    db,
    page,
    seededEvent,
  }) => {
    // The device's persons push the tab down, cars of other devices make the page long enough to stand at 800.
    await seedWithoutCar(db, seededEvent.id, token, ["Claire", "Léa", "Tom", "Nina", "Paul", "Inès", "Hugo", "Lina", "Jade", "Noé"]);
    for (const firstName of ["Marc", "Sophie", "Jules", "Emma", "Louis", "Zoé"]) {
      const driver = await seedPerson(db, seededEvent.id, { firstName });
      await seedRide(db, seededEvent.id, driver.id);
    }
    await page.goto(`/e/${seededEvent.id}`);
    const button = panel(page).getByRole("button", { name: FR.offer, exact: true });
    // Active once the device's persons are read, and « Vos inscriptions » shows them above the tabs.
    await expect(button).toBeEnabled();
    // The button in view with the page at 800: « Fermer » gives it the focus back without a scroll.
    const top = await button.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    expect(top).toBeGreaterThan(800);
    expect(top).toBeLessThan(800 + 640 - 44);
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800);

    await button.click();
    const sheet = dialog(page, FR.offer);
    await settled(sheet);
    const centre = async (part: Locator) => {
      const { top: y, bottom, left, right } = await edgesOf(part);
      return { x: (left + right) / 2, y: (y + bottom) / 2 };
    };
    const body = sheet.getByLabel(FR.time);
    for (const part of [body, headerOf(sheet), submit(sheet)]) {
      const { x, y } = await centre(part);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 2000);
      // Let a scroll the wheel would chain to the page happen.
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.scrollY)).toBe(800);
      expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
    }
    expect(await scrollTop(sheet)).toBeGreaterThan(0);

    await close(sheet).click();
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(800);
  });

  test("K1.16: in « Proposer une voiture » with 8 persons, what takes the focus is clear of the header and the bar", async ({ db, page, seededEvent }) => {
    await seedWithoutCar(db, seededEvent.id, token, ["Claire", "Léa", "Tom", "Nina", "Paul", "Inès", "Hugo", "Lina"]);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openOffer(page);
    const focused = sheet.locator(":focus");
    const drivers = sheet.getByRole("radiogroup", { name: FR.driver });
    const passengers = sheet.getByRole("group", { name: FR.passengers });
    await expect(passengers.getByRole("checkbox")).toHaveCount(8);

    // Tab from « Qui conduit ? » to « Fermer ».
    await drivers.getByRole("radio").first().focus();
    await expectClearOfFixedParts(sheet, focused);
    const reached: string[] = [];
    for (let step = 0; step < 30 && !(await close(sheet).evaluate((node) => node === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
      await expectClearOfFixedParts(sheet, focused);
      reached.push(await focused.evaluate((node) => node.getAttribute("role") ?? node.tagName));
    }
    await expect(close(sheet)).toBeFocused();
    expect(reached.filter((role) => role === "checkbox")).toHaveLength(8);

    // The arrows in « Qui conduit ? », then in « Au retour ».
    for (const group of [drivers, sheet.getByRole("radiogroup", { name: FR.retour })]) {
      const radios = group.getByRole("radio");
      await radios.first().focus();
      await expectClearOfFixedParts(sheet, focused);
      for (let at = 1; at < (await radios.count()); at++) {
        await page.keyboard.press("ArrowDown");
        await expect(radios.nth(at)).toBeFocused();
        await expectClearOfFixedParts(sheet, focused);
      }
    }
  });
});

test.describe("the car sheets in a short window", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 420 } });
  const token = newToken();

  test.beforeEach(async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
  });

  test("K1.8: « Modifier la voiture » at 360 × 420, its place emptied: « Valider » brings it, and « Champ requis. », clear of the header and the bar", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedCar(db, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openEdit(page);
    expect(await overflows(sheet)).toBe(true);
    const departure = sheet.getByRole("combobox", { name: FR.departure, exact: true });
    await departure.fill("");
    await sheet.getByLabel(FR.note).focus();
    await expect.poll(() => scrollTop(sheet)).toBeGreaterThan(0);
    await submit(sheet).click();

    await expect(departure).toBeFocused();
    await expectClearOfFixedParts(sheet, departure);
    await expectClearOfFixedParts(sheet, sheet.getByText(FR.required, { exact: true }));
  });

  test("K1.12: the drop-off's list may cover the bar; once a place is chosen, « Valider » is in view again", async ({ db, page, seededEvent }) => {
    await seedWithoutCar(db, seededEvent.id, token, ["Claire"]);
    const text = textOf("Gare de Br");
    const places = ["Gare", "Mairie", "Stade", "Église", "École"].map((name, at) => namedPlace(name, 45.71 + at / 100, 4.69, "69126", "Brindas"));
    await answerFor(text, { features: places.map(({ feature }) => feature) });
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openOffer(page);
    await sheet.getByRole("radiogroup", { name: FR.retour }).getByRole("radio", { name: FR.drive, exact: true }).check();
    const dropOff = sheet.getByRole("combobox", { name: FR.dropOff, exact: true });
    await dropOff.fill(text);
    const list = sheet.getByRole("listbox", { name: `Propositions pour ${FR.dropOff}`, exact: true });
    await expect(list.getByRole("option")).toHaveCount(5);

    // The list, its options and its footer: the element that holds the listbox.
    const popup = list.locator("..");
    await expect.poll(async () => (await edgesOf(popup)).bottom).toBeLessThanOrEqual(412.5);
    const { left, right, top, bottom } = await edgesOf(submit(sheet));
    const covered = await popup.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x!, y!)), [(left + right) / 2, (top + bottom) / 2]);
    expect(covered).toBe(true);

    await list.getByRole("option").first().click();
    await expect(list).toHaveCount(0);
    await expect(submit(sheet)).toBeInViewport({ ratio: 1 });
  });
});

test.describe("the car sheets in a landscape window", () => {
  test.use({ locale: "fr-FR", viewport: { width: 640, height: 230 } });
  const token = newToken();

  test("K1.13: at 640 × 230, then with a visual viewport of 200 px, « Modifier la voiture » scrolls as one block", async ({ db, page, seededEvent }) => {
    await fakeVisualViewport(page);
    await holdToken(page, seededEvent.id, token);
    await seedCar(db, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openEdit(page);
    const title = sheet.getByRole("heading", { name: FR.edit });
    const time = sheet.getByLabel(FR.time);

    const scrollsWhole = async (bottom: number) => {
      expect(await overflows(sheet)).toBe(true);
      // From the field before it: a field that has the focus already would not scroll into view.
      await sheet.getByRole("combobox", { name: FR.departure, exact: true }).focus();
      await scrollSheet(sheet, "top");
      await time.focus();
      await expect.poll(async () => (await edgesOf(time)).top).toBeGreaterThanOrEqual(0);
      await expect.poll(async () => (await edgesOf(time)).bottom).toBeLessThanOrEqual(bottom + 0.5);
      await scrollSheet(sheet, "bottom");
      await expect(title).not.toBeInViewport();
      expect((await edgesOf(headerOf(sheet))).bottom).toBeLessThanOrEqual(0);
      await scrollSheet(sheet, "top");
      expect((await edgesOf(barOf(sheet))).top).toBeGreaterThanOrEqual(bottom);
    };
    await scrollsWhole(230);

    // The window is taller than 240 px, the visible area is not: a media query would miss it.
    await page.setViewportSize({ width: 640, height: 360 });
    await moveVisibleArea(page, { height: 200, offsetTop: 0 }, "resize");
    await expect.poll(async () => (await edgesOf(sheet)).bottom).toBeCloseTo(200, 0);
    await scrollsWhole(200);
  });
});

test.describe("the car sheets on a computer", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 600 } });
  const token = newToken();

  test("K1.14: at 1280 × 600, « Proposer une voiture » keeps « Valider » and « Fermer » in view, at the top and at the bottom of its scroll", async ({
    db,
    page,
    seededEvent,
  }) => {
    await holdToken(page, seededEvent.id, token);
    await seedWithoutCar(db, seededEvent.id, token, ["Claire", "Léa", "Tom"]);
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openOffer(page);
    const [x, , width] = await boxOf(sheet);
    expect([x, width]).toEqual([416, 448]);
    expect(await overflows(sheet)).toBe(true);
    for (const end of ["top", "bottom"] as const) {
      await scrollSheet(sheet, end);
      await expect(submit(sheet)).toBeInViewport({ ratio: 1 });
      await expect(close(sheet)).toBeInViewport({ ratio: 1 });
    }
  });
});

// K1.15, in French and in English, then with the root's font at 125 %.
for (const { locale, offer, edit } of [
  { locale: "fr-FR", offer: FR.offer, edit: { car: "Voiture de Claire", edit: "Modifier", title: FR.edit } },
  { locale: "en-US", offer: "Offer a car", edit: { car: "Claire’s car", edit: "Edit", title: "Edit the car" } },
]) {
  test.describe(`the car sheets at 360 px, ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 640 } });
    const token = newToken();

    test("K1.15: no car sheet overflows, nor cuts a button of its bar, and each target is 44 px high at least, at 100 % then 125 %", async ({
      db,
      page,
      seededEvent,
    }) => {
      await holdToken(page, seededEvent.id, token);
      await seedWithoutCar(db, seededEvent.id, token, ["Léa", "Tom"]);
      await seedCar(db, seededEvent.id, token);
      const height = async (element: Locator) => {
        const { top, bottom } = await edgesOf(element);
        return bottom - top;
      };
      for (const large of [false, true]) {
        await page.goto(`/e/${seededEvent.id}`);
        if (large) await page.addStyleTag({ content: "html { font-size: 125% }" });
        for (const open of [() => openOffer(page, offer), () => openEdit(page, edit)]) {
          const sheet = await open();
          expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
          const buttons = await barOf(sheet).getByRole("button").all();
          expect(buttons).toHaveLength(2);
          for (const button of buttons) {
            expect(await button.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
            expect(await height(button)).toBeGreaterThanOrEqual(44);
          }
          for (const row of await sheet.locator("label:has([role=radio]), label:has([role=checkbox])").all()) {
            expect(await height(row)).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press("Escape");
          await expect(sheet).toHaveCount(0);
        }
      }
    });
  });
}
