import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { barOf, boxOf, edgesOf, headerOf } from "./sheet-layout";

leaveNoToken();

// #692 (event-board v4.6, #650): the sheets that hold no field, only choices, keep their content's
// height on a phone (rule 3): the cell « Tom · Aller », the sheet « Claire », and « Qui monte dans
// la voiture de Sophie ? ». The board shows above them, under its veil. The project `e2e` is a Pixel 7.

type Db = Kysely<Database>;

/**
 * The device holds `before`, then Claire (with a number), Léa and Tom. Aller: Sophie, of another
 * device, drives Tom (3 seats, 2 free); Claire, Léa and those of `before` are without a car.
 */
async function seedScene(db: Db, eventId: string, token: string, before: readonly string[] = []) {
  const mine = async (firstName: string, phone: string | null = null) => (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const withoutCar = [];
  for (const firstName of before) withoutCar.push(await mine(firstName));
  withoutCar.push(await mine("Claire", "06 12 34 56 78"), await mine("Léa"));
  const tom = await mine("Tom");
  const car = await seedRide(db, eventId, (await seedPerson(db, eventId, { firstName: "Sophie" })).id);
  await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: car });
  for (const personId of withoutCar) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
}

const WORDS = {
  "fr-FR": {
    section: "Vos inscriptions",
    cell: /^Tom, Aller : /,
    cellTitle: "Tom · Aller",
    seat: "Place libre : prendre une place dans la voiture de Sophie",
    seatTitle: "Qui monte dans la voiture de Sophie ?",
    place: "Placer 2 personnes",
    close: "Fermer",
  },
  "en-GB": {
    section: "Your sign-ups",
    cell: /^Tom, Outbound: /,
    cellTitle: "Tom · Outbound",
    seat: "Free seat: take a seat in Sophie’s car",
    seatTitle: "Who gets in Sophie’s car?",
    place: "Seat 2 people",
    close: "Close",
  },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

/** Once the sheet's opening animation is over: it slides up from the bottom. */
async function settled(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
}

const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const section = (page: Page, words: Words) => page.getByRole("region", { name: words.section });
const cellButton = (page: Page, words: Words) => section(page, words).getByRole("button", { name: words.cell });

/** The three choice sheets, each opened from the board, its opening over: what K1.3 and K1.15 go through. */
const SHEETS = {
  cell: async (page: Page, words: Words) => {
    await cellButton(page, words).click();
    return dialog(page, words.cellTitle);
  },
  person: async (page: Page, words: Words) => {
    await section(page, words).getByRole("button", { name: "Claire", exact: true }).click();
    return dialog(page, "Claire");
  },
  seat: async (page: Page, words: Words) => {
    await page.getByRole("tabpanel").getByRole("button", { name: words.seat, exact: true }).first().click();
    return dialog(page, words.seatTitle);
  },
} as const;

/** What each sheet has in its bar: « Fermer », under « Placer n personnes » for a free seat's. */
const barButtons = (words: Words) => ({ cell: [words.close], person: [words.close], seat: [words.place, words.close] });

async function open(page: Page, words: Words, which: keyof typeof SHEETS) {
  const sheet = await SHEETS[which](page, words);
  await settled(sheet);
  return sheet;
}

/** How many lines `button`'s text takes, and whether it is cut. */
const textOf = (button: Locator) =>
  button.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    return { lines: tops.size, cut: element.scrollWidth > element.clientWidth };
  });

const heightOf = async (element: Locator) => {
  const { top, bottom } = await edgesOf(element);
  return bottom - top;
};

test.describe("the choice sheets on a phone", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });
  const words = WORDS["fr-FR"];
  const token = newToken();

  test.beforeEach(async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
  });

  for (const which of ["cell", "person", "seat"] as const) {
    test(`K1.3: ${which === "cell" ? "the cell « Tom · Aller »" : which === "person" ? "« Claire »" : "« Qui monte dans la voiture de Sophie ? », 2 persons"} keeps its content's height, the board above it, and a tap above closes it`, async ({
      db,
      page,
      seededEvent,
    }) => {
      await seedScene(db, seededEvent.id, token);
      await page.goto(`/e/${seededEvent.id}`);
      const sheet = await open(page, words, which);
      if (which === "seat") await expect(sheet.getByRole("checkbox")).toHaveCount(2);
      const [x, y, width, height] = await boxOf(sheet);
      expect([x, width]).toEqual([0, 360]);
      expect(height).toBeLessThan(640);
      expect(y).toBeGreaterThan(0);
      expect(y + height).toBe(640);
      // Its corners rounded: it is not the full-height sheet of a form (rule 2).
      expect(await sheet.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(0);

      await page.mouse.click(180, 10);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }

  test("K1.10: the wheel over the cell « Tom · Aller », its body, header or bar, never scrolls the page; closed, the page is where it was", async ({
    db,
    page,
    seededEvent,
  }) => {
    // The device's persons push Tom's row down, cars of other devices make the page long enough to stand at 800.
    await seedScene(db, seededEvent.id, token, ["Nina", "Paul", "Inès", "Hugo", "Lina", "Jade", "Noé", "Marc", "Emma", "Louis", "Zoé"]);
    for (const firstName of ["Jules", "Rose", "Léon", "Alice", "Adam"]) {
      await seedRide(db, seededEvent.id, (await seedPerson(db, seededEvent.id, { firstName })).id);
    }
    await page.goto(`/e/${seededEvent.id}`);
    const cell = cellButton(page, words);
    await expect(cell).toBeVisible();
    // The cell in view with the page at 800: « Fermer » gives it the focus back without a scroll.
    const top = await cell.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    expect(top).toBeGreaterThan(800);
    expect(top).toBeLessThan(800 + 640 - 44);
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800);

    await cell.click();
    const sheet = dialog(page, words.cellTitle);
    await settled(sheet);
    const box = await boxOf(sheet);
    expect(box[1]).toBeGreaterThan(0);
    const centre = async (part: Locator) => {
      const { top: y, bottom, left, right } = await edgesOf(part);
      return { x: (left + right) / 2, y: (y + bottom) / 2 };
    };
    const body = sheet.getByRole("button", { name: "Voir la voiture", exact: true });
    for (const part of [body, headerOf(sheet), barOf(sheet).getByRole("button", { name: words.close, exact: true })]) {
      const { x, y } = await centre(part);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 2000);
      // Let a scroll the wheel would chain to the page happen.
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.scrollY)).toBe(800);
      expect(await boxOf(sheet)).toEqual(box);
    }

    await barOf(sheet).getByRole("button", { name: words.close, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(cell).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(800);
  });
});

// K1.15, in French and in English, then with the root's font at 125 %.
for (const locale of ["fr-FR", "en-GB"] as const) {
  test.describe(`the choice sheets at 360 px, ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 640 } });
    const words = WORDS[locale];
    const token = newToken();

    test("K1.15: no choice sheet overflows, nor cuts a button of its bar, and each target is 44 px high at least, at 100 % then 125 %", async ({
      db,
      page,
      seededEvent,
    }) => {
      await holdToken(page, seededEvent.id, token);
      await seedScene(db, seededEvent.id, token);
      for (const size of ["100%", "125%"]) {
        await page.goto(`/e/${seededEvent.id}`);
        await page.addStyleTag({ content: `html { font-size: ${size} }` });
        for (const which of ["cell", "person", "seat"] as const) {
          const sheet = await open(page, words, which);
          const name = `${which} at ${size}`;
          expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth), `${name}, sideways`).toBe(0);
          const buttons = barOf(sheet).getByRole("button");
          await expect(buttons).toHaveText(barButtons(words)[which]);
          for (const button of await buttons.all()) {
            expect(await textOf(button), `« ${await button.innerText()} », ${name}`).toEqual({ lines: 1, cut: false });
          }
          // The targets: its buttons, its links (Claire’s number), and its rows of a checkbox, whose box is not one alone (#650).
          const targets = await sheet.locator("button:not([role=checkbox]), a[href], label:has([role=checkbox])").all();
          if (which === "seat") expect(await sheet.locator("label:has([role=checkbox])").count()).toBe(2);
          if (which === "person") expect(await sheet.locator("a[href^='tel:']").count()).toBe(1);
          for (const target of targets) {
            expect(await heightOf(target), `« ${await target.innerText()} », ${name}`).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press("Escape");
          await expect(sheet).toHaveCount(0);
        }
      }
    });
  });
}
