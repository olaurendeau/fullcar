import type { Page, TestInfo } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, test } from "./fixtures";

/*
 * #113, #132: the pages of the footer's language button at WIDTH px (360 by default), in
 * French, then in English by the button, without scrolling sideways. Each capture waits for
 * the page to have hydrated: the button active and, on the organiser's page, the panel or
 * the alert in the page's language. A capture of a page that never did would show what
 * nobody sees (#65).
 */

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZa";

const FR = { switch: "English", panel: "Espace organisateur", invalid: "Ce lien d’organisateur n’est pas valide." };
const EN = { switch: "Français", panel: "Organiser area", invalid: "This organiser link is not valid." };
type Words = typeof FR;

/** What the organiser's page shows once the client has had the server's answer. */
type Arrival = "panel" | "alert" | null;

/**
 * The pages of language-switch.spec.ts: which, the capture's name, where, the title that
 * tells it is shown, and what is waited for on the organiser's page.
 * The name is fixed here: the fragment never reaches a file name.
 */
const PAGES: [string, string, (event: SeededEvent) => string, string, Arrival][] = [
  ["the home page", "home", () => "/", "Fullcar", null],
  ["the event not found", "introuvable", () => `/e/${UNKNOWN_ID}`, "Événement introuvable", null],
  ["the event's page", "event", ({ id }) => `/e/${id}`, "Tournoi de Rennes", null],
  ["the organiser's page", "admin", ({ id, token }) => `/e/${id}/admin#${token}`, "Tournoi de Rennes", "panel"],
  [
    "the organiser's page, wrong token",
    "admin-invalide",
    ({ id }) => `/e/${id}/admin#${WRONG_TOKEN}`,
    "Tournoi de Rennes",
    "alert",
  ],
  ["the organiser's page, no token", "admin-sans-jeton", ({ id }) => `/e/${id}/admin`, "Tournoi de Rennes", "alert"],
];

// The organiser's page shows its own link, fragment included: nothing written on failure
// may carry it. Neither a trace, nor the page snapshot Playwright puts in error-context.md
// when the context closes: the page is left before.
test.use({ locale: "fr-FR", trace: "off" });
test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
});

/** Hydrated: the button active, and on the organiser's page the panel or the alert, in that language. */
async function settled(page: Page, words: Words, arrival: Arrival) {
  // Inactive until hydrated (L4.3).
  await expect(page.getByRole("button", { name: words.switch, exact: true })).toBeEnabled({ timeout: 15_000 });
  if (arrival === "panel") await expect(page.getByRole("region", { name: words.panel })).toBeVisible();
  if (arrival === "alert") await expect(page.getByRole("main").getByRole("alert")).toContainText(words.invalid);
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({
    path: `var/shots/language-switch-${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

for (const [where, name, path, heading, arrival] of PAGES) {
  test(`${where}, in French then in English`, async ({ page, seededEvent }, testInfo) => {
    await page.goto(path(seededEvent), { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await settled(page, FR, arrival);
    await shoot(page, testInfo, `${name}-fr`);

    // One click, not retried: a page that has not hydrated stays in French.
    await page.getByRole("button", { name: FR.switch, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await settled(page, EN, arrival);
    await shoot(page, testInfo, `${name}-en`);
  });
}
