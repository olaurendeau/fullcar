import type { Page } from "@playwright/test";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { expect, test } from "./fixtures";
import { newAddress } from "./mailbox";

/*
 * « Mes événements » on the home page (organizer-account OA10.2, #930): a link under
 * « Créer un événement », to /mes-evenements, 44 px tall at least, with or without a session.
 * Without one, /mes-evenements sends to /connexion by itself.
 */

const KEY = "fullcar:session";

const FR = { create: "Créer un événement", myEvents: "Mes événements" };
const EN = { create: "Create an event", myEvents: "My events" };

/** The link, right after the creation link and before « Comment ça marche ». */
async function expectMyEventsLink(page: Page, words: typeof FR) {
  await page.goto("/");
  const link = page.getByRole("link", { name: words.myEvents, exact: true });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/mes-evenements");
  const order = await page
    .locator("main")
    .evaluate((main) => [...main.querySelectorAll("a, h2")].slice(0, 3).map((element) => element.textContent?.trim()));
  expect(order).toEqual([words.create, words.myEvents, expect.any(String)]);
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  const create = (await page.getByRole("link", { name: words.create, exact: true }).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(create.y + create.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  return link;
}

test.describe("OA10.2 in French", () => {
  test.use({ locale: "fr-FR" });

  test("without a session, « Mes événements » leads to /connexion", async ({ page }) => {
    const link = await expectMyEventsLink(page, FR);
    await link.click();
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test("with a session, « Mes événements » leads to /mes-evenements", async ({ page, db }) => {
    const accountId = await seedAccount(db, { email: newAddress() });
    try {
      const token = await seedSession(db, accountId);
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, token]);
      const link = await expectMyEventsLink(page, FR);
      await link.click();
      await expect(page).toHaveURL(/\/mes-evenements$/);
    } finally {
      await db.deleteFrom("account").where("id", "=", accountId).execute();
    }
  });
});

test.describe("OA10.2 in English", () => {
  test.use({ locale: "en-GB" });

  test("says « My events »", async ({ page }) => {
    await expectMyEventsLink(page, EN);
  });
});
