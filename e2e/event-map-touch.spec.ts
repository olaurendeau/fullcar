import type { JSHandle, Locator, Page } from "@playwright/test";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedRide } from "@/db/test-participants";
import type { Position } from "@/domain/place";
import { generatePublicId } from "@/domain/public-id";
import { expect, test as base } from "./fixtures";
import { placeOf } from "./ign";

/*
 * #479, event-map v13 (CA1.10 as amended after #479): the map without animation (CA1.10), and at touch (CA1.11). The project
 * `e2e` is a Pixel 7, touch-enabled (`hasTouch`, `isMobile`): each test checks it first, and the
 * mouse half runs in a context of its own, without touch. The fake IGN answers its default
 * tile: no test here sets one.
 */

/** An event of the test's own, at `placeOf` its id, with three cars to make the page scroll. */
const test = base.extend<{ placed: SeededEvent & { place: Position } }>({
  placed: async ({ db, eventFields }, provide) => {
    const id = generatePublicId();
    const place = placeOf(id);
    const event = await seedEvent(db, { ...eventFields, locationPosition: place }, undefined, () => id);
    for (const firstName of ["Marc", "Zoé", "Inès"]) await seedRide(db, event.id, (await seedPerson(db, event.id, { firstName })).id);
    await provide({ ...event, place });
    await db.deleteFrom("event").where("id", "=", event.id).execute();
  },
});

const ALLER_MAP = "Carte de l’aller : le lieu de l’événement et aucune voiture";
const FLAG = "Lieu de l’événement : Gymnase des Gayeulles";
const TOUCH_HINT = "Deux doigts pour déplacer ou zoomer la carte.";
/** Leaflet 1.9.4's classes for an animation (CA1.10), and the one of an animated pan. */
const ANIMATED = ["leaflet-zoom-anim", "leaflet-zoom-animated", "leaflet-proxy", "leaflet-fade-anim", "leaflet-pan-anim"];
/**
 * Except on a tile container: Leaflet 1.9.4 creates each one with `leaflet-zoom-animated`,
 * whatever `zoomAnimation` says (GridLayer `_updateLevels`). There it only sets a
 * `transform-origin`: its transition applies under `leaflet-zoom-anim` alone. CA1.10 excludes
 * them since event-map v13 (coordinator's decision on #479), and them only: not the lines' SVG
 * renderer (#480), for one.
 */
const TILE_LEVEL = "leaflet-tile-container";

/** Opens the aller's map, clicked again only while it stays folded (a click before hydration), until a tile shows. */
async function openMap(page: Page): Promise<Locator> {
  const button = page.getByRole("tabpanel").getByRole("button", { name: "Carte", exact: true });
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();
  const map = page.getByRole("region", { name: ALLER_MAP });
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  return map;
}

/** Whether the page's primary pointer is a finger, as the map reads it. */
const coarse = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

/**
 * Where the flag is in the map's box: a pan of the page leaves it, a pan of the map moves it.
 * Both read at once, in the page: the page may still be scrolling.
 */
function flagInMap(map: Locator): Promise<{ x: number; y: number }> {
  return map.evaluate((box, name) => {
    const flag = box.querySelector(`[role="img"][aria-label="${name}"]`)!.getBoundingClientRect();
    const { x, y } = box.getBoundingClientRect();
    return { x: Math.round(flag.x - x), y: Math.round(flag.y - y) };
  }, FLAG);
}

/** The middle of `locator`, in the viewport's CSS pixels. */
async function middle(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/**
 * From now on, every class of `ANIMATED` an element of the page takes, however briefly: a
 * zoom animation puts `leaflet-zoom-anim` on the map for 250 ms, an animated pan
 * `leaflet-pan-anim`, and a check of the DOM afterwards would miss them.
 */
function watchAnimations(page: Page): Promise<JSHandle<string[]>> {
  return page.evaluateHandle(([names, level]) => {
    const seen: string[] = [];
    const note = (element: Element) =>
      seen.push(...names.filter((name) => element.classList.contains(name) && !(name === "leaflet-zoom-animated" && element.classList.contains(level))));
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) note(record.target);
        for (const node of record.addedNodes) if (node instanceof Element) [node, ...node.querySelectorAll("*")].forEach(note);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return seen;
  }, [ANIMATED, TILE_LEVEL] as const);
}

/**
 * Leaflet starts an inertia, or an animated zoom, at the frame after the gesture or the click
 * (`requestAnimFrame`): two frames later, it has put its class, or it never will.
 */
const twoFrames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * A real touch, through the browser's input (Playwright's touchscreen only taps): fingers down
 * at `from`, moved in ten steps, the first by `-by` and every other by `by`, then lifted.
 */
async function swipe(page: Page, from: { x: number; y: number }[], by: { x: number; y: number }) {
  const fingers = await page.context().newCDPSession(page);
  const at = (step: number) =>
    from.map((point, index) => {
      const sign = index === 0 && from.length > 1 ? -1 : 1;
      return { x: point.x + (sign * by.x * step) / 10, y: point.y + (sign * by.y * step) / 10 };
    });
  await fingers.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let step = 1; step <= 10; step++) await fingers.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(step) });
  await fingers.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await fingers.detach();
}

/**
 * Whether the map stands still, right after a key: Leaflet animates a pan in JavaScript, frame
 * by frame (PosAnimation), where `getAnimations()` sees nothing. So the map pane's transform,
 * read at once and then at each of five frames, is the same every time, and nothing runs.
 */
function still(map: Locator): Promise<boolean> {
  return map.evaluate(async (box) => {
    const pane = box.querySelector<HTMLElement>(".leaflet-map-pane")!;
    const read = () => ({ transform: pane.style.transform, running: box.getAnimations({ subtree: true }).length });
    const frames = [read()];
    while (frames.length < 6) frames.push(await new Promise<ReturnType<typeof read>>((done) => requestAnimationFrame(() => done(read()))));
    return new Set(frames.map((frame) => frame.transform)).size === 1 && frames.every((frame) => frame.running === 0);
  });
}

/** A mouse drag from the middle of `map`, by 60 px right and 40 down: fast, then let go at once, what inertia would throw on. */
async function drag(page: Page, map: Locator) {
  const { x, y } = await middle(map);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 30 });
  await page.mouse.up();
}

test.describe("the map, at touch", () => {
  test.use({ locale: "fr-FR" });

  test("CA1.10: no animation class, before or after « Zoom avant », and no step in between", async ({ page, placed }) => {
    expect(await coarse(page)).toBe(true);
    await page.goto(`/e/${placed.id}`);
    await expect(page.getByRole("tabpanel")).toBeVisible();
    const seen = await watchAnimations(page);
    const map = await openMap(page);
    // `leaflet-zoom-animated` on tile containers only (the SVG renderer included); never `leaflet-pan-anim`.
    const animated = map.locator(`.leaflet-zoom-anim, .leaflet-zoom-animated:not(.${TILE_LEVEL}), .leaflet-proxy, .leaflet-pan-anim`);
    await expect(animated).toHaveCount(0);
    await expect(map).not.toHaveClass(/leaflet-fade-anim/);

    // Every frame from the click to the first tile of zoom 15: a zoom in steps would run a transition.
    const steps = await map.evaluateHandle((element) => {
      const running: number[] = [];
      const sample = () => {
        running.push(element.getAnimations({ subtree: true }).length);
        if (!element.querySelector('img.leaflet-tile-loaded[src^="/tuiles/15/"]')) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return running;
    });
    await map.getByRole("button", { name: "Zoom avant", exact: true }).click();
    expect(await still(map)).toBe(true);
    await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/15/"]').first()).toBeVisible();
    await twoFrames(page);
    await expect(animated).toHaveCount(0);
    await expect(map).not.toHaveClass(/leaflet-fade-anim/);
    expect(await steps.evaluate((running) => running.filter((count) => count > 0).length)).toBe(0);
    expect(await seen.evaluate((names) => [...new Set(names)])).toEqual([]);
  });

  test("CA1.11: one finger scrolls the page and leaves the map; the two-finger sentence is under it", async ({ page, placed }) => {
    expect(await coarse(page)).toBe(true);
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page);
    await expect(page.getByRole("tabpanel").getByText(TOUCH_HINT, { exact: true })).toBeVisible();
    await map.scrollIntoViewIfNeeded();
    const before = { scroll: await page.evaluate(() => scrollY), flag: await flagInMap(map) };

    const { x, y } = await middle(map);
    await swipe(page, [{ x, y }], { x: 0, y: -100 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before.scroll);
    expect(await flagInMap(map)).toEqual(before.flag);
  });

  test("CA1.11: two fingers spread apart zoom the map in", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page);
    await map.scrollIntoViewIfNeeded();
    const { x, y } = await middle(map);
    // Four times apart: from zoom 14 to 16.
    await swipe(page, [{ x: x - 20, y }, { x: x + 20, y }], { x: 60, y: 0 });
    await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/16/"]').first()).toBeVisible();
  });

  test("CA1.10: the keyboard pans and zooms at once: an arrow, Shift and an arrow, + and −", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    await expect(page.getByRole("tabpanel")).toBeVisible();
    const seen = await watchAnimations(page);
    const map = await openMap(page);
    await map.focus();
    const flag = await flagInMap(map);
    const tiles = (z: number) => map.locator(`img[src^="/tuiles/${z}/"]`);

    // Leaflet's step: `keyboardPanDelta`, 80 px; three times as far with Shift.
    await page.keyboard.press("ArrowRight");
    expect(await still(map)).toBe(true);
    expect(await flagInMap(map)).toEqual({ x: flag.x - 80, y: flag.y });
    await page.keyboard.press("Shift+ArrowRight");
    expect(await still(map)).toBe(true);
    expect(await flagInMap(map)).toEqual({ x: flag.x - 320, y: flag.y });

    // A zoom at once asks for its tiles within the key press: read without waiting.
    await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/14/"]').first()).toBeVisible();
    await page.keyboard.press("+");
    expect(await tiles(15).count()).toBeGreaterThan(0);
    expect(await still(map)).toBe(true);
    await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/15/"]').first()).toBeVisible();
    await expect(tiles(14)).toHaveCount(0);
    await page.keyboard.press("-");
    expect(await tiles(14).count()).toBeGreaterThan(0);
    expect(await still(map)).toBe(true);
    await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/14/"]').first()).toBeVisible();
    expect(await seen.evaluate((names) => [...new Set(names)])).toEqual([]);
  });

  test("CA1.11: the pointer becomes a mouse, the map open: the sentence goes, and a drag moves the map", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page);
    await expect(page.getByRole("tabpanel").getByText(TOUCH_HINT, { exact: true })).toBeVisible();
    await map.scrollIntoViewIfNeeded();
    const flag = await flagInMap(map);

    const browser = await page.context().newCDPSession(page);
    await browser.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await browser.detach();
    await expect.poll(() => coarse(page)).toBe(false);
    await expect(page.getByRole("tabpanel").getByText(TOUCH_HINT, { exact: true })).toHaveCount(0);
    await drag(page, map);
    await expect.poll(() => flagInMap(map)).toEqual({ x: flag.x + 60, y: flag.y + 40 });
  });
});

test.describe("the map, with a mouse", () => {
  test.use({ locale: "fr-FR", hasTouch: false, isMobile: false });

  test("CA1.10, CA1.11: no sentence; a drag moves the map, without inertia; the wheel scrolls the page", async ({ page, placed }) => {
    expect(await coarse(page)).toBe(false);
    await page.goto(`/e/${placed.id}`);
    await expect(page.getByRole("tabpanel")).toBeVisible();
    const seen = await watchAnimations(page);
    const map = await openMap(page);
    await expect(page.getByRole("tabpanel").getByText(TOUCH_HINT, { exact: true })).toHaveCount(0);
    await map.scrollIntoViewIfNeeded();

    const flag = await flagInMap(map);
    await drag(page, map);
    await expect.poll(() => flagInMap(map)).toEqual({ x: flag.x + 60, y: flag.y + 40 });
    await twoFrames(page);
    expect(await seen.evaluate((names) => [...new Set(names)])).toEqual([]);
    expect(await flagInMap(map)).toEqual({ x: flag.x + 60, y: flag.y + 40 });

    const scroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll);
  });
});
