import type { Locator, Page, Route } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { holdToken, newToken } from "./device";
import { editEventInDb, removeRetourInDb } from "./event-db";
import { anchor, around, FLAG, focusableIn, inside, joins, mapName, openMap, points, seedCar, test } from "./event-map-points";
import { leaveNoToken } from "./fixtures";
import { placeOf } from "./ign";
import { expect, isAction, organiserPath, test as organiser } from "./organiser";

/*
 * #482, event-map v18, « Mises à jour et focus »: the map follows each state the page applies,
 * at an action's answer or after « Actualiser » on /admin (the coordinator's decision on #238).
 * Another device's changes are written in the database. On /admin, the reads of « Actualiser »
 * are held while the focus is put in the map, as a Tab during the read would: then the state
 * comes. The project `e2e` is a Pixel 7; no test here sets a tile.
 */

test.use({ locale: "fr-FR" });
// A device's token on /e/{id}, the organiser's on /admin.
leaveNoToken();

/** The organiser's event, at `placeOf` its id, under `organiserTraffic` (O6.1, O2.10). */
const onAdmin = organiser.extend<{ place: Position }>({
  place: [
    async ({ db, seededEvent }, provide) => {
      const place = placeOf(seededEvent.id);
      await editEventInDb(db, seededEvent.id, { locationPosition: place });
      await provide(place);
    },
    { auto: true },
  ],
});
onAdmin.use({ locale: "fr-FR" });

/** The map of `leg`, whatever its name, which counts its cars. */
const region = (page: Page, leg: "aller" | "retour" = "aller") => page.locator(`[id="event-map-${leg}"] [role="region"]`);
const toggle = (scope: Page | Locator) => scope.getByRole("button", { name: "Carte", exact: true });

/**
 * « Actualiser », its reads held while `meanwhile` writes another device's changes and puts
 * the focus where a test wants it; then let through, and the next ones too.
 */
async function refreshWhile(page: Page, { id }: SeededEvent, meanwhile: () => Promise<void>) {
  const held: Route[] = [];
  let holding = true;
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (holding && isAction(route.request()) && (route.request().postData() ?? "").includes(id) ? held.push(route) : route.fallback()),
  );
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await meanwhile();
  holding = false;
  for (const route of held.splice(0)) await route.fallback();
}

test("CA1.7: a car added at an action's answer, then gone at the next: the map stays open, the same points, in the order of the cards", async ({ db, page, placed }) => {
  // The device holds Tom, without a car: a tap on a free seat boards him, « Annuler » takes him out.
  const token = newToken();
  const tom = await seedPerson(db, placed.id, { firstName: "Tom" }, token);
  await seedPlacement(db, { personId: tom.id, eventId: placed.id, leg: "aller", rideId: null });
  await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: 2200 }), location: "Place de la mairie", departureTime: "09:00:00" });
  await holdToken(page, placed.id, token);

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  // Marc's point, marked: drawn again, it would lose the mark.
  await points(map).first().evaluate((button) => button.setAttribute("data-kept", ""));

  // Another device's car, before Marc's in the cards' order, comes with the answer.
  const sophie = await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 1500 }), location: "Gare", departureTime: "08:00:00" });
  const panel = page.getByRole("tabpanel");
  await panel.getByRole("article", { name: "Voiture de Marc", exact: true }).getByRole("button", { name: /^Place libre/ }).first().click();
  await expect(region(page)).toHaveAccessibleName(mapName("aller", "2 voitures"));
  await expect(toggle(panel)).toHaveAttribute("aria-expanded", "true");
  await expect(region(page)).toBeVisible();
  expect(await focusableIn(region(page))).toEqual([
    "Voiture de Sophie, départ : Gare, 3 places libres",
    "Voiture de Marc, départ : Place de la mairie, 2 places libres",
    "Zoom avant",
    "Zoom arrière",
  ]);
  await expect(region(page).locator("[data-kept]")).toHaveAccessibleName("Voiture de Marc, départ : Place de la mairie, 2 places libres");

  // Sophie's car gone, the answer of « Annuler » says so.
  await db.deleteFrom("ride").where("id", "=", sophie).execute();
  await page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" }).click();
  await expect(region(page)).toHaveAccessibleName(mapName("aller", "1 voiture"));
  await expect(points(region(page))).toHaveCount(1);
  await expect(toggle(panel)).toHaveAttribute("aria-expanded", "true");
  await expect(region(page).locator("[data-kept]")).toHaveAccessibleName("Voiture de Marc, départ : Place de la mairie, 3 places libres");
});

onAdmin("CA1.7: after « Actualiser », a point keeps the focus through its free seats and a car added; its car gone, the container has it", async ({ db, page, seededEvent, place }) => {
  const { id } = seededEvent;
  const zoe = await seedCar(db, id, "Zoé", { position: around(place, { north: 700 }), location: "12 rue des Lilas", departureTime: "08:00:00" });
  await seedCar(db, id, "Marc", { position: around(place, { east: 900 }), location: "Place de la mairie", departureTime: "09:00:00" });
  const zoePoint = (seats: string) => region(page).getByRole("button", { name: `Voiture de Zoé, départ : 12 rue des Lilas, ${seats}`, exact: true });
  const ines = "Voiture de Inès, départ : Gare, 3 places libres";
  const marc = "Voiture de Marc, départ : Place de la mairie, 3 places libres";

  await page.goto(organiserPath(seededEvent));
  await openMap(page, mapName("aller", "2 voitures"));

  // « places libres » : the name changes, the focus stays.
  await refreshWhile(page, seededEvent, async () => {
    await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName: "Léo" })).id, eventId: id, leg: "aller", rideId: zoe });
    await zoePoint("3 places libres").focus();
  });
  await expect(zoePoint("2 places libres")).toBeFocused();

  // A car added between the two in the cards' order: its point in its place, the focus stays, Tab goes on to it.
  await refreshWhile(page, seededEvent, async () => {
    await seedCar(db, id, "Inès", { position: around(place, { north: -800 }), location: "Gare", departureTime: "08:30:00" });
    await zoePoint("2 places libres").focus();
  });
  await expect(region(page)).toHaveAccessibleName(mapName("aller", "3 voitures"));
  expect(await focusableIn(region(page))).toEqual(["Voiture de Zoé, départ : 12 rue des Lilas, 2 places libres", ines, marc, "Zoom avant", "Zoom arrière"]);
  await expect(zoePoint("2 places libres")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(region(page).getByRole("button", { name: ines, exact: true })).toBeFocused();

  // Its car gone: to the map's container, never <body>.
  await refreshWhile(page, seededEvent, async () => {
    await db.deleteFrom("ride").where("id", "=", zoe).execute();
    await zoePoint("2 places libres").focus();
  });
  await expect(region(page)).toHaveAccessibleName(mapName("aller", "2 voitures"));
  await expect(region(page)).toBeFocused();
  expect(await focusableIn(region(page))).toEqual([ines, marc, "Zoom avant", "Zoom arrière"]);
});

onAdmin("CA1.7: the open bubble stays through its cars' free seats, the focus on its button; its list changed, it closes, and the focus goes to the point there", async ({ db, page, seededEvent, place }) => {
  const { id } = seededEvent;
  const nina = around(place, { north: 1000 });
  await seedCar(db, id, "Nina", { position: nina, location: "Église", departureTime: "08:00:00" });
  const paul = await seedCar(db, id, "Paul", { position: around(nina, { east: 10 }), location: "Église", departureTime: "08:30:00" });
  const group = (name: string) => region(page).getByRole("button", { name, exact: true });
  const bubble = region(page).getByRole("group");

  await page.goto(organiserPath(seededEvent));
  await openMap(page, mapName("aller", "2 voitures"));

  // Opened again during the read, Paul's button focused.
  await refreshWhile(page, seededEvent, async () => {
    await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName: "Léo" })).id, eventId: id, leg: "aller", rideId: paul });
    await group("2 voitures : Nina, Paul").click();
    await page.keyboard.press("Tab");
    await expect(bubble.getByRole("button", { name: "Voiture de Paul, départ : Église, 3 places libres", exact: true })).toBeFocused();
  });
  await expect(bubble.getByRole("button", { name: "Voiture de Paul, départ : Église, 2 places libres", exact: true })).toBeFocused();
  await expect(group("2 voitures : Nina, Paul")).toHaveAttribute("aria-expanded", "true");

  // Léa, 10 m from Nina: the bubble's list changes, it closes, and the point of the three has the focus.
  await refreshWhile(page, seededEvent, async () => {
    await seedCar(db, id, "Léa", { position: around(nina, { north: 10 }), location: "Église", departureTime: "09:00:00" });
    await group("2 voitures : Nina, Paul").click();
    await expect(bubble).toBeVisible();
  });
  await expect(group("3 voitures : Nina, Paul, Léa")).toBeFocused();
  await expect(bubble).toHaveCount(0);
  await expect(group("3 voitures : Nina, Paul, Léa")).toHaveAttribute("aria-expanded", "false");
});

onAdmin("the event's position changes: the flag and its line move; framed again while nobody touched the map, not once zoomed", async ({ db, page, seededEvent, place }) => {
  await seedCar(db, seededEvent.id, "Marc", { position: around(place, { east: 2000 }), location: "Place de la mairie" });
  await page.goto(organiserPath(seededEvent));
  const map = await openMap(page, mapName("aller", "1 voiture"));
  const flag = map.getByRole("img", { name: FLAG, exact: true });
  const marc = points(map).first();
  const inView = async (marker: Locator) => inside((await marker.boundingBox())!, (await map.boundingBox())!);
  // In the map, whatever the page's scroll: the panel above it may change with « Actualiser ».
  const at = async (marker: Locator) => {
    const [{ x, y }, box] = [await anchor(marker), (await map.boundingBox())!];
    return { x: x - box.x, y: y - box.y };
  };

  // 3 km west: the view frames the flag and Marc again.
  const flagBefore = await at(flag);
  const marcBefore = await at(marc);
  await refreshWhile(page, seededEvent, () => editEventInDb(db, seededEvent.id, { locationPosition: around(place, { east: -3000 }) }));
  await expect.poll(() => at(marc)).not.toEqual(marcBefore);
  expect(await at(flag)).not.toEqual(flagBefore);
  expect(await inView(flag)).toBe(true);
  expect(await inView(marc)).toBe(true);
  expect(await joins(map, await anchor(flag), await anchor(marc))).toBe(true);

  // Zoomed out, then back at its place: the flag moves, the view does not.
  await map.getByRole("button", { name: "Zoom arrière", exact: true }).click();
  const flagZoomed = await at(flag);
  const marcZoomed = await at(marc);
  await refreshWhile(page, seededEvent, () => editEventInDb(db, seededEvent.id, { locationPosition: place }));
  await expect.poll(() => at(flag)).not.toEqual(flagZoomed);
  expect(await at(marc)).toEqual(marcZoomed);
  expect(await joins(map, await anchor(flag), await anchor(marc))).toBe(true);
});

onAdmin("the event's position removed, the focus on a point: the map and its button go, the focus to the active tab; back, the button is folded", async ({ db, page, seededEvent, place }) => {
  await seedCar(db, seededEvent.id, "Marc", { position: around(place, { east: 900 }), location: "Place de la mairie" });
  await page.goto(organiserPath(seededEvent));
  const map = await openMap(page, mapName("aller", "1 voiture"));
  const panel = page.getByRole("tabpanel");

  await refreshWhile(page, seededEvent, async () => {
    await editEventInDb(db, seededEvent.id, { locationPosition: null });
    await points(map).first().focus();
  });
  await expect(toggle(panel)).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();

  await refreshWhile(page, seededEvent, () => editEventInDb(db, seededEvent.id, { locationPosition: place }));
  await expect(toggle(panel)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[id="event-map-aller"]')).toBeHidden();
});

onAdmin("CA2.7: the retour removed, its map open with the focus on a point: the tabs go, the aller's map is open, the focus on the event's title", async ({ db, page, seededEvent, place }) => {
  await seedCar(db, seededEvent.id, "Marc", { position: around(place, { east: 900 }), location: "Place de la mairie" });
  await seedCar(db, seededEvent.id, "Inès", { position: around(place, { north: -600 }), location: "Gare", leg: "retour" });
  await page.goto(organiserPath(seededEvent));
  const retourTab = page.getByRole("tab", { name: "Retour" });
  await expect(async () => {
    await retourTab.click();
    await expect(retourTab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
  const retour = await openMap(page, mapName("retour", "1 voiture"));

  await refreshWhile(page, seededEvent, async () => {
    await removeRetourInDb(db, seededEvent.id);
    await points(retour).first().focus();
  });
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("#event-title")).toBeFocused();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  const aller = page.getByRole("region", { name: mapName("aller", "1 voiture"), exact: true });
  await expect(aller.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(points(aller)).toHaveCount(1);
});

onAdmin.describe("an event without a retour", () => {
  onAdmin.use({ eventFields: { retourAt: null } });

  onAdmin("CA2.9: a retour added, the aller's map open: the Retour tab, once shown, has its map open", async ({ db, page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(async () => {
      if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
    }).toPass();
    await expect(region(page).locator(".leaflet-tile-loaded").first()).toBeVisible();

    await editEventInDb(db, seededEvent.id, { retourAt: "2026-12-12 18:00:00" });
    await page.getByRole("button", { name: "Actualiser", exact: true }).click();
    const retourTab = page.getByRole("tab", { name: "Retour" });
    await expect(async () => {
      await retourTab.click();
      await expect(retourTab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
    }).toPass();
    await expect(toggle(page.getByRole("tabpanel"))).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: mapName("retour", "aucune voiture"), exact: true }).locator(".leaflet-tile-loaded").first()).toBeVisible();
  });
});
