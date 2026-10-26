import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { colour, css, gap } from "./colour";
import { contrast } from "./contrast";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #685, visual-identity v3 (#651): the selected tab's name in petrol, on its own `span`, so that
// the trigger's `hover:text-foreground` cannot turn it black (VI2.2, VI2.2b, VI2.3, VI5.3).

const PETROL = "rgb(0, 90, 91)";

const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
/** The name's own `span`, not the pill under it. */
const tabName = (page: Page, name: string) => tab(page, name).getByText(name, { exact: true });

/** How far the name's colour is from the petrol, the largest gap on a channel: polled, as a transition may run. */
const fromPetrol = (name: Locator) => async () => gap(await colour(name, "color"), PETROL);

/** Taps or clicks a tab until it is selected: one before hydration does nothing. The pointer stays on it. */
async function select(page: Page, name: string, how: "tap" | "click") {
  await expect(async () => {
    await tab(page, name)[how]();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The device holds nobody: Tom is without a car at the aller and at the retour, under both pills. */
test.beforeEach(async ({ db, seededEvent }) => {
  const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" })).id;
  for (const leg of ["aller", "retour"] as const) {
    await seedPlacement(db, { personId: tom, eventId: seededEvent.id, leg, rideId: null });
  }
});

test.describe("the selected tab, Pixel 7", () => {
  test.use({ locale: "fr-FR" });

  test("VI2.2: the selected tab's name is petrol, the other's not; they swap on a tap", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect.poll(fromPetrol(tabName(page, "Aller")), "« Aller », selected").toBeLessThanOrEqual(1);
    await expect.poll(fromPetrol(tabName(page, "Retour")), "« Retour », not selected").toBeGreaterThan(1);

    await select(page, "Retour", "tap");
    await expect.poll(fromPetrol(tabName(page, "Retour")), "« Retour », selected").toBeLessThanOrEqual(1);
    await expect.poll(fromPetrol(tabName(page, "Aller")), "« Aller », not selected").toBeGreaterThan(1);
  });

  test("VI2.3: the pill under the selected tab keeps the amber of C9.3", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const banner = page.getByRole("tabpanel").getByRole("status");
    await expect(banner).toHaveText("1 sans voiture · il manque 1 place");
    for (const leg of ["Aller", "Retour"]) {
      if (leg === "Retour") await select(page, leg, "tap");
      await expect(tab(page, leg)).toHaveAccessibleName(`${leg} 1 sans voiture`);
      const pill = tab(page, leg).getByText("1 sans voiture", { exact: true });
      for (const property of ["background-color", "color"]) {
        const amber = await banner.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
        await expect(pill, `the pill under « ${leg} », ${property}`).toHaveCSS(property, amber);
      }
    }
  });

  test("VI5.3: the selected tab's name on its tab is 8.04:1", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect.poll(fromPetrol(tabName(page, "Aller"))).toBeLessThanOrEqual(1);
    const measured = await contrast(tabName(page, "Aller"), tab(page, "Aller"));
    expect(measured).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(measured - 8.04), `${measured.toFixed(2)}:1, not 8.04:1 ±0.05`).toBeLessThanOrEqual(0.05);
  });
});

test.describe("the selected tab with a mouse, 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("VI2.2b: under the mouse, the selected name stays petrol; hovering the other leaves it so", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await select(page, "Retour", "click");
    await expect
      .poll(fromPetrol(tabName(page, "Retour")), "« Retour », selected and hovered")
      .toBeLessThanOrEqual(1);

    await tab(page, "Aller").hover();
    await expect.poll(fromPetrol(tabName(page, "Aller")), "« Aller », hovered, not selected").toBeGreaterThan(1);
    await expect.poll(fromPetrol(tabName(page, "Retour")), "« Retour », selected").toBeLessThanOrEqual(1);
    const retour = await colour(tabName(page, "Retour"), "color");
    expect(gap(retour, PETROL), `« Retour »: ${css(retour)}, not ${PETROL} ±1`).toBeLessThanOrEqual(1);
  });
});
