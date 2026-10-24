import type { Page } from "@playwright/test";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { holdToken, newToken } from "./device";
import { anchor, around, centre, FLAG, focusableIn, inside, joins, lines, mapName, openMap, overlap, points, seedCar, test } from "./event-map-points";
import { expect, leaveNoToken } from "./fixtures";

/*
 * #480, event-map v15: the cars on the map, each far enough from the others to have its own
 * point (the groups and their bubble: event-map-groups.spec.ts). The event is seeded at `placeOf` its id, and its
 * cars around it, so that its tiles are its own; the fake tile provider answers its default tile: no
 * test here sets one. The project `e2e` is a Pixel 7, touch-enabled.
 */

test.use({ locale: "fr-FR" });
// One test holds a personal token on the device (« folded while the page takes a new state »).
leaveNoToken();

const TOUCH_HINT = "Deux doigts pour déplacer ou zoomer la carte.";

/** Clicks a tab until it is selected. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** What the leg's folded container holds, in the DOM's order: « map » for the map's box, the text of each line under it. */
function under(page: Page, leg: Leg): Promise<(string | null)[]> {
  return page
    .locator(`[id="event-map-${leg}"]`)
    .evaluate((container) => Array.from(container.children).map((child) => (child.querySelector(".leaflet-container") ? "map" : child.textContent)));
}

test("CA1.3: the flag and a point per car of the leg with a position, each with its line but at the flag; the view holds them all", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 3000 }), location: "Place de la mairie" });
  await seedCar(db, placed.id, "Zoé", { position: around(placed.place, { north: 600 }), location: "12 rue des Lilas" });
  await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 10 }), location: "Parking du gymnase" });
  await seedCar(db, placed.id, "Inès", { position: around(placed.place, { north: -500, east: -500 }), location: "Gare", leg: "retour" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  const flag = map.getByRole("img", { name: FLAG, exact: true });
  await expect(flag).toBeVisible();
  await expect(points(map)).toHaveCount(3);
  await expect(map.getByRole("button", { name: /^Voiture de Inès/ })).toHaveCount(0);
  // Sophie, 10 m from the flag, has none.
  await expect(lines(map)).toHaveCount(2);
  const at = await anchor(flag);
  for (const driver of ["Marc", "Zoé"]) {
    const point = map.getByRole("button", { name: new RegExp(`^Voiture de ${driver}, départ : `) });
    expect(await joins(map, at, await anchor(point))).toBe(true);
  }
  const view = (await map.boundingBox())!;
  for (const marker of [flag, ...(await points(map).all())]) expect(inside((await marker.boundingBox())!, view)).toBe(true);

  // The retour's map: its own cars, at their drop-off places.
  await selectTab(page, "Retour");
  const retour = page.getByRole("region", { name: mapName("retour", "1 voiture"), exact: true });
  await expect(retour.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(retour)).toHaveCount(1);
  const ines = retour.getByRole("button", { name: "Voiture de Inès, dépose : Gare, 3 places libres", exact: true });
  await expect(ines).toBeVisible();
  await expect(lines(retour)).toHaveCount(1);
  expect(await joins(retour, await anchor(retour.getByRole("img", { name: FLAG })), await anchor(ines))).toBe(true);
});

test("CA1.4, CA1.5: points in the order of the cards, between the container and the zoom; each says what its card says, and leads to it", async ({ db, page, placed }) => {
  // Created out of the cards' order, which follows the departure times.
  const marc = await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 900 }), location: "Place de la mairie", departureTime: "09:00:00" });
  const zoe = await seedCar(db, placed.id, "Zoé", { position: around(placed.place, { north: 700 }), location: "12 rue des Lilas", departureTime: "08:00:00", seats: 1 });
  await seedCar(db, placed.id, "Inès", { position: around(placed.place, { north: -600 }), location: "Gare de Cesson", departureTime: "10:00:00" });
  for (const [firstName, rideId] of [["Hugo", zoe], ["Léo", marc]] as const) {
    await seedPlacement(db, { personId: (await seedPerson(db, placed.id, { firstName })).id, eventId: placed.id, leg: "aller", rideId });
  }

  const names = [
    "Voiture de Zoé, départ : 12 rue des Lilas, Complet",
    "Voiture de Marc, départ : Place de la mairie, 2 places libres",
    "Voiture de Inès, départ : Gare de Cesson, 3 places libres",
  ];
  // Short enough for the last card to be out of view under the map.
  await page.setViewportSize({ width: 412, height: 500 });
  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  expect(await focusableIn(map)).toEqual([...names, "Zoom avant", "Zoom arrière"]);

  // CA1.5: the first name, the place and the free seats (or « Complet ») of each name are on its card.
  const panel = page.getByRole("tabpanel");
  for (const [driver, location, seats] of [
    ["Zoé", "12 rue des Lilas", "Complet"],
    ["Marc", "Place de la mairie", 2],
    ["Inès", "Gare de Cesson", 3],
  ] as const) {
    const card = panel.getByRole("article", { name: `Voiture de ${driver}`, exact: true });
    await expect(card.getByText(location, { exact: true })).toBeVisible();
    if (seats === "Complet") await expect(card.getByText("Complet", { exact: true })).toBeVisible();
    else await expect(card.getByRole("button", { name: /^Place libre/ })).toHaveCount(seats);
  }

  // CA1.4: Tab, from the container through the points, to the zoom.
  await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await map.focus();
  for (const name of [...names, "Zoom avant", "Zoom arrière"]) {
    await page.keyboard.press("Tab");
    await expect(map.getByRole("button", { name, exact: true })).toBeFocused();
  }

  // Enter on a point: its card's title, scrolled into view and focused.
  const inesTitle = panel.getByRole("heading", { name: "Voiture de Inès", exact: true });
  await expect(inesTitle).not.toBeInViewport();
  await map.getByRole("button", { name: names[2], exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(inesTitle).toBeFocused();
  await expect(inesTitle).toBeInViewport();

  // Space, too.
  await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(inesTitle).not.toBeInViewport();
  await map.getByRole("button", { name: names[2], exact: true }).focus();
  await page.keyboard.press(" ");
  await expect(inesTitle).toBeFocused();
  await expect(inesTitle).toBeInViewport();

  // And a tap (the design's « Entrée, Espace ou un tap »), the project being touch-enabled.
  await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(inesTitle).not.toBeInViewport();
  await map.getByRole("button", { name: names[2], exact: true }).tap();
  await expect(inesTitle).toBeFocused();
  await expect(inesTitle).toBeInViewport();
});

test("CA1.15: less than 25 m from the flag, no line and its label under the flag, both seen; at 100 m, a line, and the flag on top", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { east: 10 }), location: "Parking du gymnase" });
  await seedCar(db, placed.id, "Claire", { position: around(placed.place, { east: 100 }), location: "Rue du stade" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  const flag = map.getByRole("img", { name: FLAG, exact: true });
  const sophie = map.getByRole("button", { name: /^Voiture de Sophie/ });
  const claire = map.getByRole("button", { name: /^Voiture de Claire/ });
  await expect(lines(map)).toHaveCount(1);
  expect(await joins(map, await anchor(flag), await anchor(claire))).toBe(true);

  // Sophie's label: under the flag, neither covering the other, each on top where it is.
  const flagBox = (await flag.boundingBox())!;
  const sophieBox = (await sophie.boundingBox())!;
  expect(overlap(flagBox, sophieBox)).toBe(false);
  expect(sophieBox.y).toBeGreaterThanOrEqual(flagBox.y + flagBox.height);
  // The label itself, 24 px under the flag's place.
  const label = (await sophie.locator(":scope > span").boundingBox())!;
  expect(Math.abs(label.y - (await anchor(flag)).y - 24)).toBeLessThanOrEqual(1);
  const topAt = (point: { x: number; y: number }) =>
    page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button, [role="img"]')?.getAttribute("aria-label") ?? null, point);
  expect(await topAt(centre(flagBox))).toBe(FLAG);
  expect(await topAt(centre(sophieBox))).toMatch(/^Voiture de Sophie/);

  // Claire's label, at 100 m: zoomed out until it touches the flag, which stays on top.
  const zoomOut = map.getByRole("button", { name: "Zoom arrière", exact: true });
  /** The middle of where the flag and Claire's label meet, or null where they do not. */
  const shared = async () => {
    const [a, b] = [(await flag.boundingBox())!, (await claire.boundingBox())!];
    if (!overlap(a, b)) return null;
    return { x: (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2, y: (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2 };
  };
  await expect(async () => {
    const meet = await shared();
    if (meet === null) await zoomOut.click();
    expect(meet && (await topAt(meet))).toBe(FLAG);
  }).toPass();

  // Also where Leaflet's `z-index` by latitude would put the flag under: its place above the
  // top of the view at its last reset. The view 320 px south, one zoom out, 80 px north again.
  await map.focus();
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("-");
  await page.keyboard.press("ArrowUp");
  await expect(flag).toBeInViewport();
  expect(await flag.evaluate((element) => Number((element.closest(".leaflet-marker-icon") as HTMLElement).style.zIndex))).toBeLessThan(0);
  const meet = await shared();
  expect(meet && (await topAt(meet))).toBe(FLAG);
});

test("CA1.16, CA1.8: a first name of 40 characters, its label cut at 120 px, its name whole; two « Claire », two names", async ({ db, page, placed }) => {
  const long = "Marie-Bérengère-Anne-Charlotte-Hortensia";
  expect(long.length).toBe(40);
  await seedCar(db, placed.id, long, { position: around(placed.place, { north: 500 }), location: "Chemin des Vignes" });
  await seedCar(db, placed.id, "Claire", { position: around(placed.place, { east: 600 }), location: "12 rue des Lilas" });
  await seedCar(db, placed.id, "Claire", { position: around(placed.place, { east: -600 }), location: "Place de la mairie" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  const longPoint = map.getByRole("button", { name: `Voiture de ${long}, départ : Chemin des Vignes, 3 places libres`, exact: true });
  await expect(longPoint).toBeVisible();
  const label = longPoint.getByText(long, { exact: true });
  expect((await label.boundingBox())!.width).toBeLessThanOrEqual(120);
  expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await expect(map.getByRole("button", { name: "Voiture de Claire, départ : 12 rue des Lilas, 3 places libres", exact: true })).toBeVisible();
  await expect(map.getByRole("button", { name: "Voiture de Claire, départ : Place de la mairie, 3 places libres", exact: true })).toBeVisible();
  await expect(map.locator(".leaflet-marker-pane button", { hasText: /^Claire$/ })).toHaveCount(2);

  // CA1.8, the points' part: a text of 12 px at least, a target of 44 × 44 px at least.
  for (const point of await points(map).all()) {
    const box = (await point.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    expect(await point.evaluate((element) => parseFloat(getComputedStyle(element.querySelector("span")!).fontSize))).toBeGreaterThanOrEqual(12);
  }
});

test.describe("an empty leg", () => {
  test("CA2.2: the flag alone, « … et aucune voiture », and the empty state stays", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "aucune voiture"));
    await expect(map.getByRole("img", { name: FLAG, exact: true })).toBeVisible();
    await expect(points(map)).toHaveCount(0);
    await expect(lines(map)).toHaveCount(0);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("Aucune voiture proposée pour l’aller", { exact: true })).toBeVisible();
    await expect(panel.getByText("Personne ne s’est encore inscrit.", { exact: true })).toBeVisible();
    await expect(panel.getByText(/pas sur la carte/)).toHaveCount(0);
  });
});

test("CA2.3, CA1.17: cars without a position are counted under the map, not in its name, before the two-finger sentence; none, no sentence", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Marc", { position: null });
  await seedCar(db, placed.id, "Zoé", { position: around(placed.place, { north: 400 }) });
  await seedCar(db, placed.id, "Inès", { position: null });
  await seedCar(db, placed.id, "Hugo", { position: around(placed.place, { east: 400 }), leg: "retour" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  await expect(points(map)).toHaveCount(1);
  expect(await under(page, "aller")).toEqual(["map", "2 voitures ne sont pas sur la carte : leurs lieux n’ont pas de position.", TOUCH_HINT]);

  await selectTab(page, "Retour");
  await expect(page.getByRole("region", { name: mapName("retour", "1 voiture"), exact: true }).locator(".leaflet-tile-loaded").first()).toBeVisible();
  expect(await under(page, "retour")).toEqual(["map", TOUCH_HINT]);
});

test("CA2.3: one car without a position, in the singular", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Marc", { position: null });

  await page.goto(`/e/${placed.id}`);
  await openMap(page, mapName("aller", "aucune voiture"));
  expect(await under(page, "aller")).toEqual(["map", "1 voiture n’est pas sur la carte : son lieu n’a pas de position.", TOUCH_HINT]);
});

test.describe("the map, folded while the page takes a new state", () => {
  test("CA1.3: updated while folded, the map, opened, holds all its points", async ({ db, page, placed }) => {
    // The device holds Tom, without a car: a tap on a free seat boards him, and the page applies the answer's state.
    const token = newToken();
    const tom = await seedPerson(db, placed.id, { firstName: "Tom" }, token);
    await seedPlacement(db, { personId: tom.id, eventId: placed.id, leg: "aller", rideId: null });
    await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 2200 }), location: "Place de la mairie" });
    await holdToken(page, placed.id, token);

    await page.goto(`/e/${placed.id}`);
    await openMap(page, mapName("aller", "1 voiture"));
    const panel = page.getByRole("tabpanel");
    const button = panel.getByRole("button", { name: "Carte", exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    // Another device's car, 4.4 km from Marc's, comes with the answer: the folded map changes.
    await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { east: -2200 }), location: "Gare" });
    const marc = panel.getByRole("article", { name: "Voiture de Marc", exact: true });
    await marc.getByRole("button", { name: /^Place libre/ }).first().click();
    await expect(panel.getByRole("article", { name: "Voiture de Sophie", exact: true })).toBeVisible();
    await expect(marc.getByText("Tom", { exact: true })).toBeVisible();

    const map = await openMap(page, mapName("aller", "2 voitures"));
    await expect(points(map)).toHaveCount(2);
    const view = (await map.boundingBox())!;
    for (const marker of [map.getByRole("img", { name: FLAG, exact: true }), ...(await points(map).all())]) {
      expect(inside((await marker.boundingBox())!, view)).toBe(true);
    }
  });
});
