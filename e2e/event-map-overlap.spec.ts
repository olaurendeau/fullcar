import type { Locator, Page } from "@playwright/test";
import { around, centre, FLAG, inside, mapName, openMap, overlap, points, seedCar, test, type Box } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #722, event-map v32 with the coordinator's amendments of 26/10 on #653 and #655: the points
 * stay at their exact positions, and labels may cover one another. The label of a point hovered
 * by a mouse, or whose icon has the focus, is above every other label and under the flag; it
 * stays so while the focus is in its bubble; an open bubble is never under another label nor
 * under the flag. Neither hovered nor focused, the last in the order of the cards is on top.
 * The project `e2e` is a Pixel 7, at touch: the hover is in a context with a mouse (amendment 4).
 * The fake tile provider answers its default tile: no test here sets one.
 */

test.use({ locale: "fr-FR" });

type Spot = { x: number; y: number };

/** The seat badge of a point, or of a bubble's car button. */
const seatsOf = (button: Locator) => button.locator("[data-map-seats]");
/** The label of a point: its outer element, the one with the border. */
const labelOf = (point: Locator) => point.locator(":scope > span");
const pointOf = (map: Locator, driver: string) => map.getByRole("button", { name: new RegExp(`^Voiture de ${driver},`) });

/** What paints on top at `at`: the name of the button or the image there (« Fermer » by its text), whether in a badge, whether in a bubble. */
function topAt(page: Page, at: Spot) {
  return page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    const owner = element?.closest('button, [role="img"]');
    return {
      name: owner?.getAttribute("aria-label") ?? owner?.textContent ?? null,
      seats: !!element?.closest("[data-map-seats]"),
      bubble: !!element?.closest('[role="group"]'),
    };
  }, at);
}

/** The centre of `point`'s badge, as it is now. */
const badgeCentre = async (point: Locator) => centre((await seatsOf(point).boundingBox())!);

/**
 * CA1.23's points of measure: those whose badge's centre is in the map's box, out of the zoom
 * buttons, the credits and the flag's box.
 */
async function measurable(map: Locator, point: Locator): Promise<boolean> {
  const at = await badgeCentre(point);
  const within = (box: Box | null) => !!box && at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height;
  const [mapBox, zoom, credits, flag] = await Promise.all([
    map.boundingBox(),
    map.locator(".leaflet-control-zoom").boundingBox(),
    map.locator("[data-map-credits]").boundingBox(),
    map.getByRole("img", { name: FLAG, exact: true }).boundingBox(),
  ]);
  return within(mapBox) && !within(zoom) && !within(credits) && !within(flag);
}

/**
 * A spot of `point`'s label where `point` is on top, relative to the button's box, for
 * Playwright's `position`: the first from its left end, along its middle.
 */
function visibleSpot(point: Locator): Promise<Spot | null> {
  return point.evaluate((button) => {
    const label = button.firstElementChild!.getBoundingClientRect();
    const own = button.getBoundingClientRect();
    const y = label.y + label.height / 2;
    for (let x = label.x + 2; x < label.x + label.width - 2; x += 2) {
      if (button.contains(document.elementFromPoint(x, y))) return { x: x - own.x, y: y - own.y };
    }
    return null;
  });
}

/** `point` hovered by the mouse, on a part of its label that shows (CA1.23, `position`). */
async function hoverVisible(point: Locator) {
  const position = await visibleSpot(point);
  expect(position, "a part of the label shows").not.toBeNull();
  await point.hover({ position: position! });
}

/** The mouse out of the map, over the page above it (amendment 2: « ailleurs », out of the map). */
async function mouseOut(page: Page, map: Locator) {
  const box = (await map.boundingBox())!;
  const at = { x: box.x + 10, y: Math.max(1, box.y - 30) };
  expect(inside({ ...at, width: 1, height: 1 }, box)).toBe(false);
  await page.mouse.move(at.x, at.y);
}

/**
 * A spot of the map where nothing but the map is (no point, flag, bubble, control or credits),
 * from which a drag by `by` ends in the map too.
 */
function emptySpot(map: Locator, by: { dx: number; dy: number }): Promise<Spot | null> {
  return map.evaluate((container, { dx, dy }) => {
    const box = container.getBoundingClientRect();
    const inMap = (x: number, y: number) => x > box.x + 10 && x < box.x + box.width - 10 && y > box.y + 10 && y < box.y + box.height - 30;
    for (let y = box.y + 20; y < box.y + box.height - 30; y += 10) {
      for (let x = box.x + 20; x < box.x + box.width - 20; x += 10) {
        const element = document.elementFromPoint(x, y);
        const free = !!element && container.contains(element) && !element.closest('button, [role="img"], [role="group"], .leaflet-control, [data-map-credits]');
        if (free && inMap(x + dx, y + dy)) return { x, y };
      }
    }
    return null;
  }, by);
}

/**
 * The map dragged by the mouse until `what`'s centre is at `to`, by steps of 100 px at most, each
 * started on an empty spot of the map. With a mouse only: at touch, one finger scrolls the page.
 */
async function dragTo(page: Page, map: Locator, what: () => Promise<Spot>, to: Spot) {
  for (let step = 0; step < 10; step++) {
    const at = await what();
    const [dx, dy] = [to.x - at.x, to.y - at.y];
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const chunk = { dx: Math.max(-100, Math.min(100, dx)), dy: Math.max(-100, Math.min(100, dy)) };
    const start = await emptySpot(map, chunk);
    expect(start, "an empty spot to drag from").not.toBeNull();
    await page.mouse.move(start!.x, start!.y);
    await page.mouse.down();
    await page.mouse.move(start!.x + chunk.dx, start!.y + chunk.dy, { steps: 10 });
    await page.mouse.up();
  }
  const at = await what();
  expect(Math.abs(at.x - to.x) < 1 && Math.abs(at.y - to.y) < 1, `${JSON.stringify(at)} at ${JSON.stringify(to)}`).toBe(true);
}

/**
 * `group`'s bubble opened from the keyboard, the group focused without scrolling Leaflet's
 * container, which a focus out of its view would: the bubble opens with the focus on its first car.
 */
async function openBubble(page: Page, group: Locator, bubble: Locator) {
  await group.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(bubble).toBeVisible();
}

/** The bubble closed by the focus leaving the map, to « Carte »: its point gets no focus that would scroll Leaflet's container. */
async function closeBubble(page: Page, bubble: Locator) {
  await page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true }).focus();
  await expect(bubble).toHaveCount(0);
}

test.describe("with a mouse", () => {
  // Amendment 4: the hover in a context with a mouse, the project being a touch Pixel 7.
  test.use({ hasTouch: false, isMobile: false });

  test("CA1.23, CA1.21: hovered, then focused by Tab, a covered label's badge is on top; the mouse and the focus out of the map, the cards' order again", async ({
    db,
    page,
    placed,
  }) => {
    // « Beaucoup de voitures »: Hugo, after Inès in the cards, about 120 m east of her, covers
    // her badge; Paul covers Nina's. All in a view at zoom 15, `framing`'s most.
    const north = around(placed.place, { north: 200, east: -150 });
    const south = around(placed.place, { north: -150, east: 0 });
    await seedCar(db, placed.id, "Inès", { position: north, location: "Gare", departureTime: "08:00:00", seats: 1 });
    await seedCar(db, placed.id, "Hugo", { position: around(north, { east: 120 }), location: "Mairie", departureTime: "09:00:00" });
    await seedCar(db, placed.id, "Nina", { position: south, location: "Parking du marché", departureTime: "10:00:00", seats: 1 });
    await seedCar(db, placed.id, "Paul", { position: around(south, { east: 120 }), location: "Stade", departureTime: "11:00:00", seats: 2 });

    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "4 voitures"));
    await expect(points(map)).toHaveCount(4);
    const [ines, hugo, nina, paul] = ["Inès", "Hugo", "Nina", "Paul"].map((driver) => pointOf(map, driver));
    const names = await Promise.all([ines, hugo, nina, paul].map((point) => point.getAttribute("aria-label")));
    await mouseOut(page, map);

    // Neither hovered nor focused: at Inès's and Nina's badges, the last in the cards' order.
    const cardsOrder = async () => {
      expect(await topAt(page, await badgeCentre(ines))).toMatchObject({ name: names[1] });
      expect(await topAt(page, await badgeCentre(nina))).toMatchObject({ name: names[3] });
    };
    await cardsOrder();

    const all = [ines, hugo, nina, paul];
    const measured = [];
    for (const [n, point] of all.entries()) if (await measurable(map, point)) measured.push(n);
    // Inès and Nina, the covered ones, among them: else nothing here would prove a rise.
    expect(measured).toEqual(expect.arrayContaining([0, 2]));

    // Hovered on a part of its label that shows: its badge on top.
    for (const n of measured) {
      await hoverVisible(all[n]);
      expect(await topAt(page, await badgeCentre(all[n])), `${names[n]} hovered`).toEqual({ name: names[n], seats: true, bubble: false });
    }
    // Amendment 1: the mouse out of the map before the focus, so that the focus alone is proved.
    await mouseOut(page, map);
    await cardsOrder();

    // Focused by Tab, from « Carte » through the region: its badge on top.
    const toggle = page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true });
    await toggle.focus();
    await page.keyboard.press("Tab");
    await expect(map).toBeFocused();
    for (const [n, point] of all.entries()) {
      await page.keyboard.press("Tab");
      await expect(point).toBeFocused();
      if (measured.includes(n)) {
        expect(await topAt(page, await badgeCentre(point)), `${names[n]} focused`).toEqual({ name: names[n], seats: true, bubble: false });
      }
    }
    // The focus out of the map (amendment 2): the cards' order again.
    await toggle.focus();
    await cardsOrder();
  });

  test("CA1.23: a group whose badge another label covers stays on top while the focus is in its bubble", async ({ db, page, placed }) => {
    // Léa and Zoé at one parking, Marc after them in the cards, about 120 m east: his label covers the group's badge.
    const parking = around(placed.place, { north: 100, east: -200 });
    await seedCar(db, placed.id, "Léa", { position: parking, location: "Parking du marché", departureTime: "08:00:00", seats: 1 });
    await seedCar(db, placed.id, "Zoé", { position: { ...parking }, location: "Parking du marché", departureTime: "09:00:00", seats: 2 });
    await seedCar(db, placed.id, "Marc", { position: around(parking, { east: 120 }), location: "Gare", departureTime: "10:00:00" });

    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "3 voitures"));
    const name = "2 voitures : Léa, Zoé, 3 places libres";
    const group = map.getByRole("button", { name, exact: true });
    const marc = await pointOf(map, "Marc").getAttribute("aria-label");

    // The group's badge on the left of the map, under the zoom buttons: out of where the bubble opens, top right.
    const box = (await map.boundingBox())!;
    await dragTo(page, map, () => badgeCentre(group), { x: Math.round(box.x + 70), y: Math.round(box.y + 150) });
    await mouseOut(page, map);
    expect(await topAt(page, await badgeCentre(group))).toMatchObject({ name: marc });

    await group.focus();
    await page.keyboard.press("Enter");
    const bubble = map.getByRole("group", { name: "2 voitures, 3 places libres", exact: true });
    await expect(bubble).toBeVisible();
    expect(overlap((await bubble.boundingBox())!, (await seatsOf(group).boundingBox())!)).toBe(false);
    // Amendment 3: on each of its buttons, the group's badge on top.
    for (const button of await bubble.getByRole("button").all()) {
      await expect(button).toBeFocused();
      expect(await topAt(page, await badgeCentre(group))).toEqual({ name, seats: true, bubble: false });
      await page.keyboard.press("Tab");
    }
    // Out of the bubble by Tab, and then of the map: the cards' order again.
    await expect(bubble).toHaveCount(0);
    await page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true }).focus();
    expect(await topAt(page, await badgeCentre(group))).toMatchObject({ name: marc });
  });

  test("CA1.23: an open bubble on top of a hovered label, then of the flag, at the centre of each of its buttons", async ({ db, page, placed }) => {
    const long = "Marie-Bérengère-Anne-Charlotte-Hortensia";
    const parking = around(placed.place, { north: 150, east: -250 });
    await seedCar(db, placed.id, "Léa", { position: parking, location: "Parking du marché", departureTime: "08:00:00" });
    await seedCar(db, placed.id, "Zoé", { position: { ...parking }, location: "Parking du marché", departureTime: "09:00:00" });
    // After the group in the cards: without a rise of the bubble, its label would paint over it.
    await seedCar(db, placed.id, long, { position: around(placed.place, { north: -150, east: 150 }), location: "Chemin des Vignes", departureTime: "10:00:00" });

    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, mapName("aller", "3 voitures"));
    const name = "2 voitures : Léa, Zoé, 6 places libres";
    const group = map.getByRole("button", { name, exact: true });
    const longPoint = pointOf(map, long);
    const flag = map.getByRole("img", { name: FLAG, exact: true });
    const bubble = map.getByRole("group", { name: "2 voitures, 6 places libres", exact: true });

    // Where the bubble's buttons are: it opens at the map's top right corner, whatever the view.
    await openBubble(page, group, bubble);
    const [first, second] = await Promise.all(
      (await bubble.getByRole("button").all()).slice(0, 2).map(async (button) => centre((await button.boundingBox())!)),
    );
    const bubbleBox = (await bubble.boundingBox())!;
    await closeBubble(page, bubble);

    /** Every button of the open bubble on top at its centre. */
    const bubbleOnTop = async (what: string) => {
      for (const button of await bubble.getByRole("button").all()) {
        const label = (await button.getAttribute("aria-label")) ?? (await button.textContent());
        expect(await topAt(page, centre((await button.boundingBox())!)), `${label}, over ${what}`).toMatchObject({ name: label, bubble: true });
      }
    };

    // The long label across the bubble's left edge, at the height of its first button, over its centre.
    const labelBox = async () => (await labelOf(longPoint).boundingBox())!;
    const width = (await labelBox()).width;
    expect(width - 20 > first.x - bubbleBox.x + 20, "the label sticks out of the bubble").toBe(true);
    await dragTo(page, map, async () => centre(await labelBox()), { x: Math.round(first.x + 20 - width / 2), y: Math.round(first.y) });
    await mouseOut(page, map);
    await openBubble(page, group, bubble);
    await hoverVisible(longPoint);
    expect(overlap(await labelBox(), (await bubble.boundingBox())!)).toBe(true);
    await bubbleOnTop("a hovered label");

    // Then the flag, its centre at the second button's.
    await closeBubble(page, bubble);
    await dragTo(page, map, async () => centre((await flag.boundingBox())!), { x: Math.round(second.x), y: Math.round(second.y) });
    await mouseOut(page, map);
    await openBubble(page, group, bubble);
    await bubbleOnTop("the flag");
  });
});

test("CA1.23: zoomed in, the points apart: at zoom 18, no label's box meets another's", async ({ db, page, placed }) => {
  // Eight cars around the flag, 300 m apart at least: at the framing, labels may meet.
  const spots = [-300, 0, 300].flatMap((north) => [-300, 0, 300].map((east) => ({ north, east }))).filter(({ north, east }) => north || east);
  for (const [n, spot] of spots.entries()) {
    await seedCar(db, placed.id, `Voiture${n + 1}`, { position: around(placed.place, spot), location: `Lieu ${n + 1}`, departureTime: `0${n + 1}:00:00` });
  }

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "8 voitures"));
  await expect(points(map)).toHaveCount(8);
  const zoomIn = map.getByRole("button", { name: "Zoom avant", exact: true });
  // Disabled by Leaflet at the map's last zoom, 18.
  await expect(async () => {
    if (!(await zoomIn.getAttribute("class"))?.includes("leaflet-disabled")) await zoomIn.click();
    await expect(zoomIn).toHaveClass(/leaflet-disabled/, { timeout: 500 });
  }).toPass();
  await expect(map.locator('.leaflet-tile-loaded[src^="/tuiles/18/"]').first()).toBeVisible();

  const boxes = await points(map).evaluateAll((buttons) => buttons.map((button) => button.firstElementChild!.getBoundingClientRect().toJSON() as Box));
  expect(boxes).toHaveLength(8);
  for (const [n, a] of boxes.entries()) {
    for (const b of boxes.slice(n + 1)) expect(overlap(a, b), `${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(false);
  }
});
