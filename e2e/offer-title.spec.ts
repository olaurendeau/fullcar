import type { Page } from "@playwright/test";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #997, epic #995 (event-board v5.3, RL1.1 to RL1.4): on an event with a retour, the sheet of
// « Proposer une voiture » names the leg of the tab it opens from; without a retour, it does not.
// RL1.3 is in ride-edit.spec.ts, RL1.4 in aller-sheets.spec.ts.

const WORDS = {
  "fr-FR": {
    offer: "Proposer une voiture",
    tabs: { aller: "Aller", retour: "Retour" },
    title: { aller: "Proposer une voiture pour l’aller", retour: "Proposer une voiture pour le retour" },
  },
  "en-US": {
    offer: "Offer a car",
    tabs: { aller: "Outbound", retour: "Return" },
    title: { aller: "Offer a car for the outbound trip", retour: "Offer a car for the return trip" },
  },
} as const;

const panel = (page: Page) => page.getByRole("tabpanel");

async function openFrom(page: Page, eventId: string, locale: keyof typeof WORDS, leg: "aller" | "retour") {
  const words = WORDS[locale];
  await page.goto(`/e/${eventId}`);
  const tab = page.getByRole("tab", { name: new RegExp(`^${words.tabs[leg]}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
  const button = panel(page).getByRole("button", { name: words.offer, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

for (const locale of ["fr-FR", "en-US"] as const) {
  test.describe(`the title of « Proposer une voiture » with a retour, ${locale}`, () => {
    test.use({ locale });

    for (const leg of ["aller", "retour"] as const) {
      test(`RL1.1: from the ${leg} tab, the dialog and its heading name the ${leg}`, async ({ page, seededEvent }) => {
        await openFrom(page, seededEvent.id, locale, leg);
        const title = WORDS[locale].title[leg];
        const sheet = page.getByRole("dialog", { name: title, exact: true });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole("heading", { name: title, exact: true })).toBeVisible();
      });
    }
  });
}

test.describe("without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("RL1.2: the dialog keeps its name, « Proposer une voiture »", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    // No tabs without a retour, so no tab panel either.
    const button = page.getByRole("button", { name: "Proposer une voiture", exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole("dialog", { name: "Proposer une voiture", exact: true })).toBeVisible();
  });
});

test.describe("the longest title, at 360 px", () => {
  test.use({ locale: "en-US", viewport: { width: 360, height: 640 } });

  test("state 8: in English the title wraps, and nothing overflows the sheet sideways", async ({ page, seededEvent }) => {
    await openFrom(page, seededEvent.id, "en-US", "retour");
    const title = WORDS["en-US"].title.retour;
    const sheet = page.getByRole("dialog", { name: title, exact: true });
    await expect(sheet).toBeVisible();
    await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    const heading = sheet.getByRole("heading", { name: title, exact: true });
    expect(await heading.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
