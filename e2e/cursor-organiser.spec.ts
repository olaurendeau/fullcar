import type { Page } from "@playwright/test";
import { cursorOf, cursorsOf } from "./cursor";
import { leaveNoToken } from "./fixtures";
import { expect, holdActionsWith, legButton, organiserPath, seedCrowd, test, unfoldLegs } from "./organiser";

/*
 * #347: the pointer of the language-switch design (v3.3.3) in the organiser area, P1.9. The
 * test runs under the fixture `organiserTraffic` (O6.1, O2.10); no assertion names the token,
 * nor a number of the crowd: `cursorOf` hides any number of its failures.
 */

leaveNoToken();

const FR = { panel: "Espace organisateur", refresh: "Actualiser", copy: "Copier", share: "Partager" };

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const refresh = (page: Page) => panel(page).getByRole("button", { name: FR.refresh, exact: true });

test.use({ locale: "fr-FR" });

test("P1.9: on /e/{id}/admin, the fold button, a leg's button, « Copier », « Partager », « Actualiser » and « Afficher les N autres » have the hand; « Actualiser » reading has the arrow", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedCrowd(db, seededEvent.id);
  // Before the page loads: Chromium headless has no native sharing, and « Partager » would be absent.
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} }));
  await page.goto(organiserPath(seededEvent));
  await expect(refresh(page)).toBeVisible();
  await unfoldLegs(page, ["aller"]);
  expect(
    await cursorsOf({
      "the fold button": page.getByRole("button", { name: FR.panel, exact: true }),
      "a leg's button": legButton(page, "aller"),
      Copier: panel(page).getByRole("button", { name: FR.copy, exact: true }).first(),
      Partager: panel(page).getByRole("button", { name: FR.share, exact: true }),
      Actualiser: refresh(page),
      "Afficher les N autres": panel(page).getByRole("button", { name: /^Afficher les \d+ autres$/ }).first(),
    }),
  ).toEqual({
    "the fold button": "pointer",
    "a leg's button": "pointer",
    Copier: "pointer",
    Partager: "pointer",
    Actualiser: "pointer",
    "Afficher les N autres": "pointer",
  });

  // The panel's reads carry the token: held, « Actualiser » reads and is aria-disabled.
  const reads = await holdActionsWith(page, seededEvent.token);
  await refresh(page).click();
  await expect.poll(reads.held).toBe(1);
  await expect(refresh(page)).toHaveAttribute("aria-disabled", "true");
  expect(await cursorOf(refresh(page)), "Actualiser, reading").toBe("default");

  await reads.release();
  await expect(refresh(page)).not.toHaveAttribute("aria-disabled");
  expect(await cursorOf(refresh(page)), "Actualiser, read").toBe("pointer");
});
