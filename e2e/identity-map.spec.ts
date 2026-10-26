import type { Locator } from "@playwright/test";
import { colour, expectColour, ratio } from "./colour";
import { contrast } from "./contrast";
import { FLAG, mapName, openMap, points, seedParking, test } from "./event-map-points";
import { expect } from "./fixtures";

// #687, visual-identity v3 (#651): on the open map, the flag and the border of a car point's
// label follow `--primary` with no class changed (VI2.8), and keep their contrast (VI5.9,
// VI5.12). Colours read by `./colour`, ±1 on each channel; ratios ±0.05. The fake tile provider
// answers its default tile: no test here sets one. The project `e2e` is a Pixel 7.

test.use({ locale: "fr-FR" });

const PETROL = "rgb(0, 90, 91)";
const WHITE = "rgb(255, 255, 255)";
const SIDES = ["top", "right", "bottom", "left"] as const;

/** A ratio within ±0.05 of the design's, and above its threshold. */
function expectRatio(measured: number, expected: number, threshold: number, what: string) {
  expect(measured, `${what}: ${measured.toFixed(2)}:1, under ${threshold}:1`).toBeGreaterThanOrEqual(threshold);
  expect(Math.abs(measured - expected), `${what}: ${measured.toFixed(2)}:1, not ${expected.toFixed(2)}:1 ±0.05`).toBeLessThanOrEqual(0.05);
}

/**
 * The label of a point: its button's outer element, the one with the border. Only its own
 * border is read: the seat badge inside it has a rule of `--border` (#655).
 */
const labelOf = (point: Locator) => point.locator(":scope > span");

test.describe("the open map of the aller, Marc's point and the parking's group", () => {
  test.beforeEach(async ({ db, placed }) => {
    await seedParking(db, placed.id, placed.place);
  });

  test("VI2.8: the flag is filled with petrol, and each point's label has a petrol border", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "3 voitures"));

    const flag = map.getByRole("img", { name: FLAG, exact: true });
    await expectColour(flag, "background-color", PETROL, "the flag");

    await expect(points(map)).toHaveCount(2);
    for (const point of await points(map).all()) {
      const name = await point.getAttribute("aria-label");
      const label = labelOf(point);
      await expect(label).toHaveCount(1);
      for (const side of SIDES) await expectColour(label, `border-${side}-color`, PETROL, `the label of « ${name} »`);
    }
  });

  test("VI5.9: the flag's icon, #fafafa on petrol, at 7.70:1", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "3 voitures"));
    const flag = map.getByRole("img", { name: FLAG, exact: true });
    await expectColour(flag, "background-color", PETROL, "the flag");
    expectRatio(await contrast(flag, flag), 7.7, 3, "the flag");
  });

  test("VI5.12: a point's label border, petrol on its white background, at 8.04:1", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "3 voitures"));
    const label = labelOf(points(map).first());
    await expectColour(label, "border-top-color", PETROL, "the label");
    await expectColour(label, "background-color", WHITE, "the label");
    const measured = ratio(await colour(label, "border-top-color"), await colour(label, "background-color"));
    expectRatio(measured, 8.04, 3, "the label's border");
  });
});
