import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { confirmSeededEvent } from "@/db/test-events";
import { expect, test } from "./fixtures";

/*
 * #590, organizer-account OA8.3: the link of an event anonymised at day 30 says « Événement
 * terminé », its title and its start, and leads to /nouveau; neither its place nor the
 * board. 200, in noindex (architecture « La purge »). `/e/{id}/admin` shows the same page until
 * the organiser's screens come. The seed: « Tournoi de Rennes » at the « Gymnase des
 * Gayeulles », on 2026-12-12 at 07:30. No first name is checked for: anonymising deletes every
 * person before the page is read, so none could show (#799). The place stays in the row.
 */

const PATHS = [(id: string) => `/e/${id}`, (id: string) => `/e/${id}/admin`];

/** The seeded event, confirmed by an account, then anonymised as day 30 leaves it. Gives the account's id. */
async function anonymised(db: Kysely<Database>, eventId: string): Promise<string> {
  const accountId = await confirmSeededEvent(db, eventId);
  await anonymiseEvent(db, eventId);
  return accountId;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("OA8.3: an anonymised event, opened by its link", () => {
  test.use({ locale: "fr-FR" });

  let accountId: string | undefined;
  test.beforeEach(async ({ db, seededEvent }) => {
    accountId = await anonymised(db, seededEvent.id);
  });
  test.afterEach(async ({ db }) => {
    if (accountId) await db.deleteFrom("account").where("id", "=", accountId).execute();
  });

  for (const path of PATHS) {
    test(`${path("{id}")} answers 200 with « Événement terminé », the title and the start, and leads to /nouveau`, async ({
      page,
      seededEvent,
    }) => {
      const response = await page.goto(path(seededEvent.id));
      expect(response?.status()).toBe(200);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText("Événement terminé");
      await expect(main.getByText("Tournoi de Rennes", { exact: true })).toBeVisible();
      await expect(main.locator('time[datetime="2026-12-12T07:30"]')).toHaveText("samedi 12 décembre 2026 à 07:30");
      await expect(main.getByText("Les inscriptions ont été effacées 30 jours après l’événement.", { exact: true })).toBeVisible();
      await expect(main.getByRole("link", { name: "Créer un événement" })).toHaveAttribute("href", "/nouveau");
      await expect(page).toHaveTitle("Tournoi de Rennes");
      // In noindex, by its meta and its header.
      expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      expect(await horizontalOverflow(page)).toBe(0);
    });

    test(`${path("{id}")} shows neither the place nor the board`, async ({ page, seededEvent }) => {
      await page.goto(path(seededEvent.id));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement terminé");
      const html = await page.content();
      expect(html).not.toContain("Gymnase des Gayeulles");
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Proposer une voiture" })).toHaveCount(0);
    });
  }

  test("« Créer un événement » leads to the creation form", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expect(page).toHaveURL("/nouveau");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer un événement");
  });
});

test.describe("OA8.3: an anonymised event, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  let accountId: string | undefined;
  test.beforeEach(async ({ db, seededEvent }) => {
    accountId = await anonymised(db, seededEvent.id);
  });
  test.afterEach(async ({ db }) => {
    if (accountId) await db.deleteFrom("account").where("id", "=", accountId).execute();
  });

  test("speaks English", async ({ page, seededEvent }) => {
    const response = await page.goto(`/e/${seededEvent.id}`);
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Event over");
    await expect(main.getByText("Sign-ups were erased 30 days after the event.", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/nouveau");
  });
});
