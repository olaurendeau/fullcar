import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { around, mapName, openMap, points, seedCar, test, type Box } from "./event-map-points";
import { expect, leaveNoToken } from "./fixtures";

leaveNoToken();

/*
 * #579: the map's box keeps its z-indexes to itself. Leaflet's panes (200 to 700), the credits
 * (1000) and the ring element (1002) are compared inside it only: nothing of the map paints
 * above the rest of the page, the message bar (z-40) as the page scrolls under it, or a sheet
 * and its overlay (z-49, z-50). The project `e2e` is a Pixel 7, at touch.
 */

test.use({ locale: "fr-FR" });

const ONE_CAR = mapName("aller", "1 voiture");

const panel = (page: Page) => page.getByRole("tabpanel");
const ring = (page: Page) => page.locator('[data-map-ring="aller"]');
/** The map's box, around Leaflet's container. */
const boxOf = (map: Locator) => map.locator("xpath=..");
const credits = (map: Locator) => map.locator("[data-map-credits]");
const messageBar = (page: Page) => page.locator('[data-message-bar="open"]');

/** The middle of `box`. */
const middleOf = (box: Box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

/**
 * What paints on top at `at`, in the viewport, whatever takes the pointer: Radix makes the page
 * under a sheet inert to it, and the ring takes none, so every element takes it for the reading.
 */
function topAt(page: Page, at: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) throw new Error(`(${x}, ${y}) is outside the viewport`);
    const style = document.createElement("style");
    style.textContent = "* { pointer-events: auto !important; }";
    document.head.append(style);
    const element = document.elementFromPoint(x, y);
    style.remove();
    const box = document.querySelector('[data-map-ring="aller"]')!.parentElement!;
    return {
      map: !!element && box.contains(element),
      sheet: !!element?.closest('[data-slot="sheet-overlay"], [data-slot="sheet-content"]'),
      bar: !!element?.closest("[data-message-bar]"),
    };
  }, at);
}

/** The points where both boxes are, `columns` × `rows` of them, 2 px inside their common edges. */
function across(one: Box, other: Box, columns = 5, rows = 3): { x: number; y: number }[] {
  const left = Math.max(one.x, other.x) + 2;
  const top = Math.max(one.y, other.y) + 2;
  const right = Math.min(one.x + one.width, other.x + other.width) - 2;
  const bottom = Math.min(one.y + one.height, other.y + other.height) - 2;
  expect(right > left && bottom > top, `${JSON.stringify(one)} meets ${JSON.stringify(other)}`).toBe(true);
  const spots: { x: number; y: number }[] = [];
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      spots.push({ x: Math.round(left + ((right - left) * column) / (columns - 1)), y: Math.round(top + ((bottom - top) * row) / (rows - 1)) });
    }
  }
  return spots;
}

test.describe("the map under the rest of the page", () => {
  // Short enough that the map's box reaches the bar's place once the page scrolls.
  test.use({ viewport: { width: 360, height: 560 } });

  test("#579: the page scrolled until the map is under the message bar: the bar above its tiles, its credits and its ring", async ({ db, page, placed }) => {
    const token = newToken();
    const tom = await seedPerson(db, placed.id, { firstName: "Tom" }, token);
    await seedPlacement(db, { personId: tom.id, eventId: placed.id, leg: "aller", rideId: null });
    await seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 100 }) });
    await holdToken(page, placed.id, token);
    await page.goto(`/e/${placed.id}`);

    // Tom alone is without a car: one tap boards him, and the bar says so (C5.2).
    const seat = panel(page).getByRole("article", { name: "Voiture de Marc" }).getByRole("button", { name: /^Place libre/ }).first();
    await expect(async () => {
      await seat.click();
      await expect(messageBar(page)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    const map = await openMap(page, ONE_CAR);
    await expect(points(map)).toHaveCount(1);

    // The region from the keyboard: the ring element shows, at z-index 1002.
    await panel(page).getByRole("button", { name: "Carte", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(map).toBeFocused();
    await expect(ring(page)).toBeVisible();

    // The map's bottom edge on the bar's: the credits in the bar's place.
    const [bar, box] = [(await messageBar(page).boundingBox())!, (await boxOf(map).boundingBox())!];
    await page.evaluate((by) => window.scrollBy(0, by), Math.round(box.y + box.height - (bar.y + bar.height)));
    const [barNow, boxNow, creditsNow] = [(await messageBar(page).boundingBox())!, (await boxOf(map).boundingBox())!, (await credits(map).boundingBox())!];
    expect(Math.abs(boxNow.y + boxNow.height - (barNow.y + barNow.height))).toBeLessThanOrEqual(1);

    for (const at of [...across(barNow, boxNow), ...across(barNow, creditsNow, 3, 2)]) {
      expect(await topAt(page, at), `at (${at.x}, ${at.y})`).toEqual({ map: false, sheet: false, bar: true });
    }
    await expect(ring(page)).toBeVisible();
  });

  test("#579: a sheet open over the map: its overlay above its tiles, its point, its controls and its credits", async ({ db, page, placed }) => {
    await seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 100 }) });
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ONE_CAR);
    await expect(points(map)).toHaveCount(1);
    await map.scrollIntoViewIfNeeded();

    // Read before the sheet: under it, Radix hides the page from the accessibility tree.
    const spots = [
      middleOf((await map.boundingBox())!),
      middleOf((await points(map).first().boundingBox())!),
      middleOf((await map.getByRole("button", { name: "Zoom avant", exact: true }).boundingBox())!),
      middleOf((await credits(map).boundingBox())!),
    ];
    for (const at of spots) expect(await topAt(page, at), `at (${at.x}, ${at.y})`).toEqual({ map: true, sheet: false, bar: false });

    // Opened where it is, without scrolling the page: the map stays where it was, under the sheet.
    const add = panel(page).getByRole("button", { name: "Ajouter une personne", exact: true });
    await expect(add).toBeEnabled();
    await add.dispatchEvent("click");
    await expect(page.getByRole("dialog", { name: "Ajouter une personne" })).toBeVisible();
    for (const at of spots) {
      expect(await topAt(page, at), `at (${at.x}, ${at.y})`).toEqual({ map: false, sheet: true, bar: false });
    }
  });
});
