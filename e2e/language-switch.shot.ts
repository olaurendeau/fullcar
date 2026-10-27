import type { Page, TestInfo } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test } from "./fixtures";
import { areaRefused, keepAdminToken, organiserPath } from "./organiser";

leaveNoToken();

/*
 * #113, #132: the pages of the footer's language button at WIDTH px (360 by default), in
 * French, then in English by the button, without scrolling sideways. Each capture waits for
 * the page to have hydrated: the button active and, on the organiser's page, the panel or
 * the area's title alone in the page's language. A capture of a page that never did would show what
 * nobody sees (#65).
 */

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZQ";

const FR = { switch: "English", panel: "Espace organisateur" };
const EN = { switch: "Français", panel: "Organiser area" };
type Words = typeof FR;

/** What the organiser's page shows once the client has had the server's answer. */
type Arrival = "panel" | "refused" | null;

/**
 * The pages of the footer (footer.spec.ts): which, the capture's name, where, the title that
 * tells it is shown, what is waited for on the organiser's page, and the admin token the
 * browser keeps there (#597).
 */
const PAGES: [string, string, (event: SeededEvent) => string, string, Arrival, ((event: SeededEvent) => string)?][] = [
  ["the home page", "home", () => "/", "Fullcar", null],
  ["the event not found", "introuvable", () => `/e/${UNKNOWN_ID}`, "Événement introuvable", null],
  ["the event's page", "event", ({ id }) => `/e/${id}`, "Tournoi de Rennes", null],
  ["the organiser's page", "admin", organiserPath, "Tournoi de Rennes", "panel", ({ token }) => token],
  ["the organiser's page, wrong token", "admin-invalide", organiserPath, "Tournoi de Rennes", "refused", () => WRONG_TOKEN],
  ["the organiser's page, no token", "admin-sans-jeton", organiserPath, "Tournoi de Rennes", "refused"],
];

test.use({ locale: "fr-FR" });

/** Hydrated: the button active, and on the organiser's page the panel or the area's title alone, in that language. */
async function settled(page: Page, words: Words, arrival: Arrival) {
  // Inactive until hydrated (L4.3).
  await expect(page.getByRole("button", { name: words.switch, exact: true })).toBeEnabled({ timeout: 15_000 });
  if (arrival === "panel") await expect(page.getByRole("region", { name: words.panel })).toBeVisible();
  if (arrival === "refused") {
    await expect(areaRefused(page, words.panel)).toBeVisible();
  }
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

for (const [where, name, path, heading, arrival, kept] of PAGES) {
  test(`${where}, in French then in English`, async ({ page, seededEvent }, testInfo) => {
    if (kept) await keepAdminToken(page, seededEvent.id, kept(seededEvent));
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
