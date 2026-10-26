import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide } from "@/db/test-participants";
import { expect, leaveNoToken, test } from "./fixtures";
import { barOf, boxOf } from "./sheet-layout";

leaveNoToken();

// #693 (event-board v4.6, #650): « Ajouter une personne » takes all its height on a phone, opened
// from a tab (`AddPersonButton`) as from a free seat on a device without a person (`RegisterSheet`),
// its « Valider » and « Fermer » in the bar. The project `e2e` is a Pixel 7.

type Db = Kysely<Database>;

/** Aller: Sophie, of another device, drives nobody, 3 seats. The device holds nobody. */
async function seedScene(db: Db, eventId: string) {
  await seedRide(db, eventId, (await seedPerson(db, eventId, { firstName: "Sophie" })).id);
}

const WORDS = {
  "fr-FR": { title: "Ajouter une personne", submit: "Valider", close: "Fermer", seat: "Place libre : prendre une place dans la voiture de Sophie" },
  "en-GB": { title: "Add a person", submit: "Confirm", close: "Close", seat: "Free seat: take a seat in Sophie’s car" },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

/** Where « Ajouter une personne » opens from: the Aller tab, or a free seat of Sophie's car. */
const FROM = {
  tab: (page: Page) => page.locator('[data-add-person="aller"]'),
  seat: (page: Page, words: Words) => page.getByRole("tabpanel").getByRole("button", { name: words.seat, exact: true }).first(),
} as const;
type From = keyof typeof FROM;

/** The sheet « Ajouter une personne », opened from `from`, the focus on « Prénom », its opening over. */
async function openAdd(page: Page, words: Words, from: From) {
  const opener = from === "tab" ? FROM.tab(page) : FROM.seat(page, words);
  await expect(opener).toBeEnabled();
  await opener.click();
  const sheet = page.getByRole("dialog", { name: words.title, exact: true });
  await expect(sheet.getByRole("textbox").first()).toBeFocused();
  // It slides up from the bottom.
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
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

test.describe("« Ajouter une personne » fills the screen", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });
  const words = WORDS["fr-FR"];

  test.beforeEach(async ({ db, seededEvent }) => {
    await seedScene(db, seededEvent.id);
  });

  for (const from of ["tab", "seat"] as const) {
    test(`K1.1: from ${from === "tab" ? "the Aller tab" : "a free seat (RegisterSheet)"}, (0, 0, 360, 640), « Valider » and « Fermer » in view from the start`, async ({
      page,
      seededEvent,
    }) => {
      await page.goto(`/e/${seededEvent.id}`);
      const sheet = await openAdd(page, words, from);
      expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
      const submit = sheet.getByRole("button", { name: words.submit, exact: true });
      const close = sheet.getByRole("button", { name: words.close, exact: true });
      await expect(submit).toBeInViewport({ ratio: 1 });
      await expect(close).toBeInViewport({ ratio: 1 });
      expect(await sheet.evaluate((element) => element.scrollTop)).toBe(0);
      // Its buttons are the bar's, under the body.
      await expect(barOf(sheet).getByRole("button")).toHaveText([words.submit, words.close]);
    });
  }
});

for (const locale of ["fr-FR", "en-GB"] as const) {
  test.describe(`« Ajouter une personne » at 360 px, ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 640 } });
    const words = WORDS[locale];

    test.beforeEach(async ({ db, seededEvent }) => {
      await seedScene(db, seededEvent.id);
    });

    for (const from of ["tab", "seat"] as const) {
      test(`K1.15: from ${from === "tab" ? "the Aller tab" : "a free seat"}, at 100 % then 125 %, nothing sideways, no bar button cut, each target 44 px at least`, async ({
        page,
        seededEvent,
      }) => {
        await page.goto(`/e/${seededEvent.id}`);
        for (const size of ["100%", "125%"]) {
          await page.evaluate((size) => (document.documentElement.style.fontSize = size), size);
          const sheet = await openAdd(page, words, from);
          expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth), `the sheet sideways at ${size}`).toBe(0);
          const buttons = barOf(sheet).getByRole("button");
          await expect(buttons).toHaveText([words.submit, words.close]);
          for (const button of await buttons.all()) {
            const name = await button.innerText();
            expect(await textOf(button), `« ${name} » at ${size}`).toEqual({ lines: 1, cut: false });
          }
          // The targets are its buttons; its fields keep their 40 px (`h-10`, as on the rest of the page).
          for (const target of await sheet.getByRole("button").all()) {
            const name = await target.innerText();
            expect((await target.boundingBox())!.height, `« ${name} » at ${size}`).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press("Escape");
          await expect(sheet).toHaveCount(0);
        }
      });
    }
  });
}
