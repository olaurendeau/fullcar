import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * #3, C7.2: the pages of an event at WIDTH px (360 by default), without scrolling sideways.
 * `/` empty is home.shot.ts's. Each capture waits for a sign that the page has hydrated:
 * a capture of a page that never did would show what nobody sees (#65).
 */

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

const FIELDS = ["Titre", "Lieu", "Date de l’aller", "Heure de l’aller", "Date du retour", "Heure du retour"];

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  // Transitions finished: a tab just clicked is shown in its final state.
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test.use({ locale: "fr-FR" });

test("home, every error shown", async ({ page }, testInfo) => {
  await page.goto("/");
  // Inactive until hydrated.
  await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Créer" }).click();
  for (const label of FIELDS) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAccessibleDescription("Champ requis.");
  }
  await shoot(page, testInfo, "home-errors");
});

test("organiser's page, with a retour", async ({ page, seededEvent }, testInfo) => {
  await page.goto(`/e/${seededEvent.id}/admin#${seededEvent.token}`);
  // Shown once the client has checked the token with the server.
  await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
  await shoot(page, testInfo, "event-admin");
});

test("event, Aller then Retour tab", async ({ page, seededEvent }, testInfo) => {
  const tab = (name: string) => page.getByRole("tab", { name });
  await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
  await expect(tab("Aller")).toHaveAttribute("aria-selected", "true");

  // One click each, not retried: a page that has not hydrated stays on Aller, and the
  // Aller capture is taken only once Retour has been selected and left.
  await tab("Retour").click();
  await expect(tab("Retour")).toHaveAttribute("aria-selected", "true");
  await tab("Aller").click();
  await expect(tab("Aller")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Aucune voiture proposée pour l’aller");
  await shoot(page, testInfo, "event-aller");

  await tab("Retour").click();
  await expect(tab("Retour")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Aucune voiture proposée pour le retour");
  await shoot(page, testInfo, "event-retour");
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("event, without a retour", async ({ page, seededEvent }, testInfo) => {
    await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
    await expect(page.getByText("Aucune voiture proposée pour l’aller")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await shoot(page, testInfo, "event-sans-retour");
  });
});

test("event not found", async ({ page }, testInfo) => {
  const response = await page.goto(`/e/${UNKNOWN_ID}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(404);
  // The 404's title is streamed after its content: waited for, the page settled (#97 review).
  await expect(page).toHaveTitle("Événement introuvable");
  await shoot(page, testInfo, "event-introuvable");
});

test("organiser's link, not valid", async ({ page, seededEvent }, testInfo) => {
  await page.goto(`/e/${seededEvent.id}/admin#q3Vx9kLmN2pR7sT1uW4yZa`);
  // Shown once the client has had the server's answer.
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })).toContainText("Ce lien d’organisateur n’est pas valide.");
  await shoot(page, testInfo, "event-admin-invalide");
});
