import type { Locator, Page, Route } from "@playwright/test";
import { leaveNoToken } from "./fixtures";
import { areaEditButton, expect, isAction, organiserPath, test } from "./organiser";
import { barOf, boxOf, edgesOf } from "./sheet-layout";

leaveNoToken();

// #697 (event-board v4.6, #650): « Modifier l’événement » fills the screen on a phone, its buttons
// and its messages in the bar (rule 1), and the bar's messages stop at 30 % of the visible height,
// a group named « Messages » once they overflow (v4.6-16). The project `e2e` is a Pixel 7.

const WORDS = {
  "fr-FR": { edit: "Modifier l’événement", submit: "Valider", cancel: "Annuler" },
  "en-GB": { edit: "Edit the event", submit: "Confirm", cancel: "Cancel" },
};
const FR = WORDS["fr-FR"];
const SENDING = "Envoi en cours…";
const GONE = ["L’événement n’a pas été modifié.", "Cet événement est introuvable : il a peut-être été supprimé."];

const dialog = (page: Page, title = FR.edit) => page.getByRole("dialog", { name: title, exact: true });
const button = (sheet: Locator, name: string) => sheet.getByRole("button", { name, exact: true });

/** « Modifier l’événement » of the organiser area, its opening over: it slides up from the bottom. */
async function openEdit(page: Page, words: (typeof WORDS)[keyof typeof WORDS] = FR) {
  await areaEditButton(page, words.edit).click();
  const sheet = dialog(page, words.edit);
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  return sheet;
}

/** Holds every change of the event sent from now on: none is answered. */
async function holdEdits(page: Page) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes('"allerDate"') ? void held.push(route) : route.fallback()),
  );
  return () => held.length;
}

/** Whether `element` is in the sheet's bar. */
const inBar = (element: Locator) => element.evaluate((node) => !!node.closest('[data-slot="sheet-footer"]'));

/** The lines of a button's text, and whether it is cut. */
const textOf = (target: Locator) =>
  target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    return { lines: tops.size, cut: element.scrollWidth > element.clientWidth };
  });

test.describe("« Modifier l’événement » fills the screen", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });

  test("K1.1: at 360 × 640, the sheet is (0, 0, 360, 640), « Valider » and « Annuler » in its bar, in view from the start", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    const sheet = await openEdit(page);
    expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
    await expect(button(sheet, FR.submit)).toBeInViewport({ ratio: 1 });
    await expect(button(sheet, FR.cancel)).toBeInViewport({ ratio: 1 });
    expect(await sheet.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(barOf(sheet).getByRole("button")).toHaveText([FR.submit, FR.cancel]);
    // Enter in a field still sends the form, its « Valider » out of it: nothing changed, it closes (M2.5).
    await sheet.getByLabel("Titre", { exact: true }).press("Enter");
    await expect(sheet).toHaveCount(0);
  });

  test("K1.9: while a change is sent, « Envoi en cours… » is in the bar, just above « Valider », which keeps the focus", async ({
    page,
    seededEvent,
  }) => {
    const held = await holdEdits(page);
    await page.goto(organiserPath(seededEvent));
    const sheet = await openEdit(page);
    await sheet.getByLabel("Lieu", { exact: true }).fill("Salle Carrel");
    await button(sheet, FR.submit).click();
    await expect.poll(held).toBe(1);

    const sending = sheet.getByText(SENDING, { exact: true });
    await expect(sending).toBeInViewport({ ratio: 1 });
    await expect(button(sheet, FR.submit)).toBeFocused();
    await expect(button(sheet, FR.submit)).toHaveAccessibleDescription(SENDING);
    expect(await inBar(sending)).toBe(true);
    // Nothing between them: the bar's next thing after « Envoi en cours… » is « Valider ».
    const next = await barOf(sheet).evaluate((bar, text) => {
      const shown = Array.from(bar.querySelectorAll("p, button")).filter((node) => node.getBoundingClientRect().height > 0);
      const at = shown.findIndex((node) => node.textContent === text);
      return shown[at + 1]?.textContent;
    }, SENDING);
    expect(next).toBe(FR.submit);
    const [message, submit] = await Promise.all([edgesOf(sending), edgesOf(button(sheet, FR.submit))]);
    expect(submit.top - message.bottom).toBeGreaterThanOrEqual(0);
    expect(submit.top - message.bottom).toBeLessThanOrEqual(8.5);
    // It fits: the bar's messages are no group.
    await expect(sheet.getByRole("group", { name: "Messages" })).toHaveCount(0);
  });
});

test.describe("the bar's messages", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 500 } });

  test("v4.6-16: overflowing, they stop at 30 % of the visible height, a group « Messages » that takes the focus, and keeps it once they fit", async ({
    page,
    db,
    seededEvent,
    organiserTraffic,
  }) => {
    await page.goto(organiserPath(seededEvent));
    // Large text: the notice of the event gone is taller than 30 % of 500 px.
    await page.addStyleTag({ content: "html { font-size: 150% }" });
    const sheet = await openEdit(page);
    await sheet.getByLabel("Titre", { exact: true }).fill("Tournoi de Rennes U13");
    await organiserTraffic.keepNumbers();
    await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
    await button(sheet, FR.submit).click();
    const notice = sheet.getByRole("alert");
    await expect(notice.locator("p")).toHaveText(GONE);
    expect(await inBar(notice)).toBe(true);

    // The notice is taller than the room it has: the test checks it first.
    const zone = barOf(sheet).locator("[data-bar-messages]");
    expect(await zone.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await zone.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(500 * 0.3 + 0.5);
    const messages = sheet.getByRole("group", { name: "Messages" });
    await expect(messages).toHaveAttribute("tabindex", "0");
    await expect(button(sheet, FR.submit)).toBeInViewport({ ratio: 1 });
    await expect(button(sheet, FR.cancel)).toBeInViewport({ ratio: 1 });
    // « Valider » is disabled for good: from « Annuler », Shift+Tab goes to the messages.
    await expect(button(sheet, FR.cancel)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(messages).toBeFocused();
    await messages.evaluate((zone) => zone.scrollTo({ top: zone.scrollHeight }));
    expect(await messages.evaluate((zone) => zone.scrollTop)).toBeGreaterThan(0);

    // Taller, the window gives them room: they fit, and keep the focus.
    await page.setViewportSize({ width: 360, height: 900 });
    await expect.poll(() => messages.evaluate((zone) => zone.scrollHeight > zone.clientHeight)).toBe(false);
    await expect(messages).toBeFocused();
    await expect(messages).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Tab");
    await expect(button(sheet, FR.cancel)).toBeFocused();
    await expect(sheet.getByRole("group", { name: "Messages" })).toHaveCount(0);
  });
});

for (const locale of ["fr-FR", "en-GB"] as const) {
  test.describe(`« Modifier l’événement » at 360 px, ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 640 } });
    const words = WORDS[locale];

    test("K1.15: at 100 % then 125 %, nothing sideways, no bar button cut, each of its buttons 44 px at least", async ({ page, seededEvent }) => {
      await page.goto(organiserPath(seededEvent));
      for (const size of ["100%", "125%"]) {
        await page.evaluate((size) => (document.documentElement.style.fontSize = size), size);
        const sheet = await openEdit(page, words);
        expect(await boxOf(sheet)).toEqual([0, 0, 360, 640]);
        expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth), `the sheet sideways at ${size}`).toBe(0);
        const buttons = barOf(sheet).getByRole("button");
        await expect(buttons).toHaveText([words.submit, words.cancel]);
        for (const target of await buttons.all()) {
          const name = await target.innerText();
          expect(await textOf(target), `« ${name} » at ${size}`).toEqual({ lines: 1, cut: false });
        }
        for (const target of await sheet.getByRole("button").all()) {
          const name = await target.innerText();
          expect((await target.boundingBox())!.height, `« ${name} » at ${size}`).toBeGreaterThanOrEqual(44);
        }
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
      }
    });
  });
}
