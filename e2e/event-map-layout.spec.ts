import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { around, mapName, openMap, points, seedParking, test } from "./event-map-points";
import { expect } from "./fixtures";
import { placeOf } from "./tiles";

/*
 * #484, event-map v18, CA1.8 and CA1.9: the map's layout at 360 px (the project `e2e`, a
 * Pixel 7 at 360 × 780, at touch), at 416 px and at 1280 px, with a mouse (« À 1280 px »);
 * #562, v27: the box edge to edge in le conteneur; #720, v32: open at the arrival, folded by the
 * person, and without a person on the device (CA1.9). The fake tile provider
 * answers its default tile: no test here sets one.
 */

test.use({ locale: "fr-FR" });

/** How far the page scrolls sideways, in CSS pixels. */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The box of the map, around Leaflet's container: 240 or 280 px high, its border included. */
const boxOf = (map: Locator) => map.locator("xpath=..");

/** The smaller side of each of `targets`, in CSS pixels. */
function sides(targets: Locator): Promise<number[]> {
  return targets.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return Math.min(width, height);
    }),
  );
}

/** The font size of every text shown in `map`, labels, bubble, zoom and credits, in CSS pixels. */
function textSizes(map: Locator): Promise<number[]> {
  return map.evaluate((root) => {
    const sizes: number[] = [];
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let text = texts.nextNode(); text; text = texts.nextNode()) {
      const parent = text.parentElement!;
      if (text.textContent!.trim() && parent.checkVisibility()) sizes.push(parseFloat(getComputedStyle(parent).fontSize));
    }
    return sizes;
  });
}

const GROUP = "2 voitures : Nina, Paul, 3 places libres";

/** Le conteneur, whose header is « Carte ». */
const containerOf = (page: Page) => page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true }).locator("xpath=..");

for (const [where, device, height, width] of [
  ["360 px", {}, 240, 326],
  ["416 px", { viewport: { width: 416, height: 780 } }, 240, 382],
  ["1280 px", { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }, 280, 414],
] as const) {
  test.describe(`the map, at ${where}`, () => {
    test.use(device);

    test(`CA1.8: no sideways scroll, folded, open or with its bubble; ${height} px high, ${width} px wide; no text under 12 px; targets of 44 px`, async ({
      db,
      page,
      placed,
    }) => {
      await seedParking(db, placed.id, placed.place);
      await page.goto(`/e/${placed.id}`);
      const panel = page.getByRole("tabpanel");
      await expect(panel.getByRole("button", { name: "Carte", exact: true })).toBeVisible();
      expect(await sideways(page)).toBe(0);

      const map = await openMap(page, mapName("aller", "3 voitures"));
      await expect(points(map)).toHaveCount(2);
      expect(await sideways(page)).toBe(0);
      const box = (await boxOf(map).boundingBox())!;
      expect(box.height).toBe(height);
      // Edge to edge in le conteneur, which has the column's width: its width less its two borders (v24).
      const container = (await containerOf(page).boundingBox())!;
      expect(container.width).toBe((await panel.boundingBox())!.width);
      expect(box.width).toBe(container.width - 2);
      expect(box.width).toBe(width);

      const zoom = map.getByRole("button", { name: /^Zoom (avant|arrière)$/ });
      await expect(zoom).toHaveCount(2);
      for (const side of [...(await sides(points(map))), ...(await sides(zoom))]) expect(side).toBeGreaterThanOrEqual(44);

      await map.getByRole("button", { name: GROUP, exact: true }).click();
      const bubble = map.getByRole("group", { name: "2 voitures, 3 places libres", exact: true });
      await expect(bubble.getByRole("button")).toHaveText(["Voiture de Nina1", "Voiture de Paul2", "Fermer"]);
      for (const side of await sides(bubble.getByRole("button"))) expect(side).toBeGreaterThanOrEqual(44);
      expect(await sideways(page)).toBe(0);

      // Every text of the map, the bubble open: the points' labels, its own, the zoom's and the credits'.
      const sizes = await textSizes(map);
      expect(sizes.length).toBeGreaterThanOrEqual(8);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    });
  });
}

test("CA1.8: 240 px high under a window of 448 px, 280 px from 448 px", async ({ page, placed }) => {
  await page.goto(`/e/${placed.id}`);
  const box = boxOf(await openMap(page, mapName("aller", "aucune voiture")));
  const heightAt = async (width: number) => {
    await page.setViewportSize({ width, height: 780 });
    return (await box.boundingBox())!.height;
  };
  expect([await heightAt(360), await heightAt(447), await heightAt(448), await heightAt(600)]).toEqual([240, 240, 280, 280]);
});

test.describe("at 360 × 780, a title and a place of 30 characters", () => {
  test.use({ eventFields: { title: "W".repeat(30), location: "W".repeat(30) } });

  /**
   * event-board's mixed case (« Page complète à 360 × 780 »): Claire drives the aller and looks
   * for a seat back, Léa rides with her and looks too, Tom only goes. All three on a device of
   * their own, whose token the page holds only when `onTheDevice`.
   */
  async function seedMixedCase(db: Kysely<Database>, page: Page, eventId: string, onTheDevice: boolean) {
    const token = newToken();
    const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
    const [claire, lea, tom] = [await mine("Claire"), await mine("Léa"), await mine("Tom")];
    // At a place with a position: no `notOnMap` line under the map.
    const clairesCar = await seedRide(db, eventId, claire, { position: around(placeOf(eventId), { north: 250 }) });
    await seedPlacement(db, { personId: lea, eventId, leg: "aller", rideId: clairesCar });
    await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
    for (const personId of [claire, lea]) await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
    if (onTheDevice) await holdToken(page, eventId, token);
  }

  test("CA1.9: the banner above the fold; open at the arrival, the container 334 px; folded by the person, 54 px and the first card at 724 px", async ({
    db,
    page,
    placed,
  }) => {
    await seedMixedCase(db, page, placed.id, true);
    await page.goto(`/e/${placed.id}`);
    await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("tabpanel");
    const button = panel.getByRole("button", { name: "Carte", exact: true });
    const banner = panel.getByRole("status").filter({ hasText: /\S/ });
    const firstCard = panel.getByRole("article", { name: "Voiture de Claire" });
    await expect(banner).toBeInViewport({ ratio: 1 });

    // Open at the arrival (#653), its map started: 1 + 4 + 44 + 4 + 240 + 10 + 18 + 12 + 1 px, the
    // two-finger sentence included, then the first card 16 px under it. Measured from the top of the page.
    await expect(panel.locator(".leaflet-container")).toHaveCount(1);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(button).toBeInViewport({ ratio: 1 });
    const open = (await containerOf(page).boundingBox())!;
    const openCard = (await firstCard.boundingBox())!;
    expect(open.height).toBe(334);
    expect(openCard.y - (open.y + open.height)).toBe(16);
    const { y, height } = (await banner.boundingBox())!;

    // Folded by a tap: the container and one gap, 54 + 16 px (#562: the first card at 724 px).
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(banner).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const container = (await containerOf(page).boundingBox())!;
    const card = (await firstCard.boundingBox())!;
    expect(container.height).toBe(54);
    expect(card.y - container.y).toBe(70);
    expect(card.y).toBe(724);
    test.info().annotations.push({
      type: "CA1.9",
      description: `bandeau à ${y}–${y + height} px ; conteneur à ${open.y} px ; dépliée, conteneur de ${open.height} px et première fiche à ${openCard.y} px ; repliée, conteneur de ${container.height} px et première fiche à ${card.y} px`,
    });
  });

  test("CA1.9: no person on the device: the top of the map's box and of the first card, measured and noted", async ({ db, page, placed }) => {
    await seedMixedCase(db, page, placed.id, false);
    await page.goto(`/e/${placed.id}`);
    const panel = page.getByRole("tabpanel");
    const map = panel.getByRole("region", { name: mapName("aller", "1 voiture"), exact: true });
    await expect(map).toHaveClass(/\bleaflet-container\b/);
    await expect(page.getByRole("button", { name: /^Vos inscriptions/ })).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const box = (await boxOf(map).boundingBox())!;
    const card = (await panel.getByRole("article", { name: "Voiture de Claire" }).boundingBox())!;
    // The box, then 10 + 18 + 12 + 1 px of le conteneur under it, then 16 px.
    expect(card.y - box.y).toBe(240 + 41 + 16);
    test.info().annotations.push({ type: "CA1.9", description: `sans personne sur l’appareil : boîte de la carte à ${box.y} px, première fiche à ${card.y} px` });
  });
});
