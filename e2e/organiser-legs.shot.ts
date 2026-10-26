import type { Page, TestInfo } from "@playwright/test";
import { leaveNoToken } from "./fixtures";
import { expect, legButton, organiserPath, seedCrowd, seedLegsExample, seedWorstSummary, test, unfoldLegs } from "./organiser";

leaveNoToken();

/*
 * #663, O7.2 amended by organizer-view v3.5 (epic #648): the organiser area's legs at WIDTH px
 * (`make shot`, 360 by default, then 1280), without scrolling sideways: folded, on the README's
 * example, an empty event and one without a retour; Aller unfolded; 60 persons, Retour
 * unfolded; and, at 360 px whatever WIDTH, the worst summary with the text at 125 %. The pending
 * event's notice (OA2.1) comes with #581: no capture of it yet. Under `organiserTraffic` (O6.1,
 * O2.10): no file name, title or message holds the token, and the links, the organiser's with
 * the token in it, are masked in every capture, which may be shared in a PR or an issue.
 */

async function shoot(page: Page, testInfo: TestInfo, name: string, width = testInfo.project.use.viewport?.width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({ path: `var/shots/${name}-${width}.png`, fullPage: true, animations: "disabled", mask: [page.getByTestId("link")] });
}

/** The panel shown, its legs as the test left them. */
async function shown(page: Page) {
  await expect(legButton(page, "aller")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.use({ locale: "fr-FR" });

test.describe("the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  test("the legs folded", async ({ page, seededEvent }, testInfo) => {
    await page.goto(organiserPath(seededEvent));
    await shown(page);
    await expect(legButton(page, "retour")).toHaveAccessibleDescription("4 sans voiture Il manque 2 places");
    await shoot(page, testInfo, "legs-replies");
  });

  test("Aller unfolded", async ({ page, seededEvent }, testInfo) => {
    await page.goto(organiserPath(seededEvent));
    await shown(page);
    await unfoldLegs(page, ["aller"]);
    await expect(legButton(page, "retour")).toHaveAttribute("aria-expanded", "false");
    await shoot(page, testInfo, "legs-aller-deplie");
  });
});

test("an empty event, the legs folded", async ({ page, seededEvent }, testInfo) => {
  await page.goto(organiserPath(seededEvent));
  await shown(page);
  await expect(legButton(page, "aller")).toHaveAccessibleDescription("Personne ne s’est encore inscrit.");
  await shoot(page, testInfo, "legs-replies-vide");
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("the leg folded", async ({ page, seededEvent }, testInfo) => {
    await page.goto(organiserPath(seededEvent));
    await shown(page);
    await expect(legButton(page, "retour")).toHaveCount(0);
    await shoot(page, testInfo, "legs-replies-sans-retour");
  });
});

test("60 persons, Retour unfolded", async ({ page, db, seededEvent }, testInfo) => {
  await seedCrowd(db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));
  await shown(page);
  await unfoldLegs(page, ["retour"]);
  await expect(page.getByRole("button", { name: "Afficher les 15 autres", exact: true })).toBeVisible();
  await shoot(page, testInfo, "legs-60-retour-deplie");
});

test("the worst summary, at 360 px with the text at 125 %", async ({ page, db, seededEvent }, testInfo) => {
  await seedWorstSummary(db, seededEvent.id);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(organiserPath(seededEvent));
  await shown(page);
  await page.addStyleTag({ content: "html { font-size: 125% }" });
  await expect(legButton(page, "retour")).toHaveAccessibleDescription("20 sans voiture Il manque 12 places");
  await shoot(page, testInfo, "legs-pire-resume-125", 360);
});
