import { devices, type Locator, type Page } from "@playwright/test";
import type { Position } from "@/domain/place";
import { contrast } from "./contrast";
import { around, FLAG, mapName, openMap, overlap, points, seedCar, test, type Box } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #558, event-map v27, CA3.7: the credits, our own element on the map, at its bottom right
 * corner (the owner's decision of 24/10 on #549): « Geoapify · © OpenMapTiles.org · » and the
 * link « © OpenStreetMap »; their place, their link, the keyboard, the three gestures, and the
 * framing and the bubble kept off them. The project `e2e` is a Pixel 7 at 360 × 780, at touch;
 * the mouse runs in a context of its own. The fake tile provider answers its default tile, and
 * OpenStreetMap is answered by the test: nothing leaves for it.
 */

test.use({ locale: "fr-FR" });

const CREDITS = "Geoapify · © OpenMapTiles.org · © OpenStreetMap";
const NEW_TAB = "(s’ouvre dans un nouvel onglet)";
const OSM = `© OpenStreetMap ${NEW_TAB}`;
const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";
const ALONE = mapName("aller", "aucune voiture");

/** The map's box, around Leaflet's container. */
const boxOf = (map: Locator) => map.locator("xpath=..");
const creditsOf = (map: Locator) => map.locator("[data-map-credits]");
const osmLink = (map: Locator) => map.getByRole("link", { name: OSM, exact: true });
const ring = (page: Page) => page.locator('[data-map-ring="aller"]');

/** The credits' text as it shows: without what only a screen reader says. */
function shownText(credits: Locator): Promise<string> {
  return credits.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
    return copy.textContent!.replace(/\s+/g, " ").trim();
  });
}

/** The credits in the box's bottom right corner, to half a pixel, and wholly inside it. */
async function expectInCorner(credits: Locator, box: Locator) {
  const [inner, outer] = [(await credits.boundingBox())!, (await box.boundingBox())!];
  expect(Math.abs(inner.x + inner.width - (outer.x + outer.width))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(inner.y + inner.height - (outer.y + outer.height))).toBeLessThanOrEqual(0.5);
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
}

/** OpenStreetMap's page, answered here: a test sends nothing to a third party. */
async function answerOsm(page: Page) {
  await page.context().route("https://www.openstreetmap.org/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>OpenStreetMap</title>" }));
}

/** The middle of `box`. */
const middleOf = (box: Box) => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

/** A spot on the credits' text before the link, `from` px from their left edge: on the credits, not on the link. */
async function onCreditsText(page: Page, map: Locator, from = 20): Promise<{ x: number; y: number }> {
  const box = (await creditsOf(map).boundingBox())!;
  const at = { x: Math.round(box.x + from), y: Math.round(box.y + box.height / 2) };
  const where = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { credits: !!element?.closest("[data-map-credits]"), link: !!element?.closest("a") };
  }, at);
  expect(where).toEqual({ credits: true, link: false });
  return at;
}

/** Where the flag is in the map's box: a pan of the map moves it. */
function flagInMap(map: Locator): Promise<{ x: number; y: number }> {
  return map.evaluate((box, name) => {
    const flag = box.querySelector(`[role="img"][aria-label="${name}"]`)!.getBoundingClientRect();
    const { x, y } = box.getBoundingClientRect();
    return { x: Math.round(flag.x - x), y: Math.round(flag.y - y) };
  }, FLAG);
}

/** A mouse drag from `from`, by 60 px right and 40 down. */
async function drag(page: Page, from: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 20 });
  await page.mouse.up();
}

/**
 * A real touch, through the browser's input: fingers down at `from`, one by one in that order,
 * moved in ten steps, the first by `-by` and the other by `by`, then lifted.
 */
async function swipe(page: Page, from: { x: number; y: number }[], by: { x: number; y: number }) {
  const fingers = await page.context().newCDPSession(page);
  const at = (step: number) =>
    from.map((point, index) => {
      const sign = index === 0 ? -1 : 1;
      return { x: point.x + (sign * by.x * step) / 10, y: point.y + (sign * by.y * step) / 10 };
    });
  await fingers.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let step = 1; step <= 10; step++) await fingers.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(step) });
  await fingers.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await fingers.detach();
}

/** Every point's button and label, and the flag, none of which recoups the credits' box. */
async function expectClearOfCredits(map: Locator) {
  const credits = (await creditsOf(map).boundingBox())!;
  const marks = [...(await points(map).all()), ...(await points(map).locator("span").all()), map.getByRole("img", { name: FLAG, exact: true })];
  expect(marks.length).toBeGreaterThan(1);
  for (const mark of marks) {
    const box = (await mark.boundingBox())!;
    expect(overlap(box, credits), `${JSON.stringify(box)} over the credits ${JSON.stringify(credits)}`).toBe(false);
  }
}

test.describe("the credits, at 360 × 780", () => {
  test("CA3.7: in the map's bottom right corner, one line of 24 px, 12 px #333 on white at 80 %, above the points; the link, 24 × 24 px, to a new tab; 4.5:1", async ({
    page,
    placed,
  }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    const credits = creditsOf(map);
    await expect(credits).toBeVisible();
    expect(await shownText(credits)).toBe(CREDITS);
    expect(
      await credits.evaluate((element) => {
        const style = getComputedStyle(element);
        return { size: style.fontSize, colour: style.color, background: style.backgroundColor, zIndex: style.zIndex, align: style.textAlign };
      }),
    ).toEqual({ size: "12px", colour: "rgb(51, 51, 51)", background: "rgba(255, 255, 255, 0.8)", zIndex: "1000", align: "right" });
    expect((await credits.boundingBox())!.height).toBe(24);
    await expectInCorner(credits, boxOf(map));
    // Ours, not Leaflet's: no attribution control.
    await expect(map.locator(".leaflet-control-attribution")).toHaveCount(0);

    // Only « © OpenStreetMap » is a link.
    await expect(credits.getByRole("link")).toHaveCount(1);
    const link = osmLink(map);
    await expect(link).toHaveAttribute("href", OSM_COPYRIGHT);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link.locator(".sr-only")).toHaveText(NEW_TAB);
    const target = (await link.boundingBox())!;
    expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
    // Its own dark colour, not the one Leaflet gives a link in its container.
    expect(await link.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(10, 10, 10)");
    expect(await contrast(credits, credits)).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(link, credits)).toBeGreaterThanOrEqual(4.5);
  });

  test("CA3.7: Tab, the link last in the map, after « Zoom arrière »; its ring inside it, whole, on white, and not the ring element", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await map.focus();
    for (const name of ["Zoom avant", "Zoom arrière"]) {
      await page.keyboard.press("Tab");
      await expect(map.getByRole("button", { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press("Tab");
    const link = osmLink(map);
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    const ringOf = await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`, inside: parseFloat(style.outlineOffset) < 0, background: style.backgroundColor };
    });
    expect(ringOf).toEqual({ outline: "solid 2px rgb(10, 10, 10)", inside: true, background: "rgb(255, 255, 255)" });
    // Whole: the link, and the ring inside it, within the map's box.
    const [inner, outer] = [(await link.boundingBox())!, (await boxOf(map).boundingBox())!];
    expect(inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height).toBe(true);
    expect(await contrast(link, link)).toBeGreaterThanOrEqual(4.5);
    // The ring element is the region's and the loading box's, never the link's.
    await expect(ring(page)).toBeHidden();

    // The last of the map: Tab leaves it.
    await page.keyboard.press("Tab");
    expect(await map.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  });

  test("CA3.7: a tap with one finger on the link opens it, in a new tab", async ({ context, page, placed }) => {
    await answerOsm(page);
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await map.scrollIntoViewIfNeeded();
    const opened = context.waitForEvent("page");
    await osmLink(map).tap();
    const tab = await opened;
    await tab.waitForLoadState();
    expect(tab.url()).toBe(OSM_COPYRIGHT);
    expect(page.url()).toContain(`/e/${placed.id}`);
  });

  // As on a car's point (#484): whichever finger lands on the credits, the browser putting them down in the order given.
  for (const onCredits of ["first", "second"] as const) {
    test(`CA3.7: two fingers spread apart zoom the map in, the ${onCredits} one on the credits`, async ({ page, placed }) => {
      await page.goto(`/e/${placed.id}`);
      const map = await openMap(page, ALONE);
      await map.scrollIntoViewIfNeeded();
      await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/14/"]').first()).toBeVisible();
      // The left finger down first, as `swipe` spreads them: the credits' one, or the other.
      const at = await onCreditsText(page, map, onCredits === "first" ? 20 : 120);
      // The other finger 80 px aside and 60 px up, on the map, off the credits.
      const aside = { x: at.x + (onCredits === "first" ? 80 : -80), y: at.y - 60 };
      expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-map-credits]"), aside)).toBe(false);
      // From 100 px apart to 209: from zoom 14 to 15.
      await swipe(page, onCredits === "first" ? [at, aside] : [aside, at], { x: 60, y: 0 });
      await expect(map.locator('img.leaflet-tile-loaded[src^="/tuiles/15/"]').first()).toBeVisible();
    });
  }

});

/**
 * The browser's own text size, as a person enlarges it, from 16 px to 20 px (125 %): the
 * credits' 12 px become 15. The session stays attached for the rest of the test.
 */
async function enlargeText(page: Page) {
  const browser = await page.context().newCDPSession(page);
  await browser.send("Page.setFontSizes", { fontSizes: { standard: 20 } });
}

/** The credits' lines, each by its right edge, against their own right edge less its padding. */
function linesOf(credits: Locator): Promise<{ lines: number; ragged: number }> {
  return credits.evaluate((element) => {
    const style = getComputedStyle(element);
    const { top, right: edge } = element.getBoundingClientRect();
    const right = edge - parseFloat(style.paddingRight);
    // Each shown text's boxes, line by line; not the `sr-only` text, which shows nowhere.
    const rects: DOMRect[] = [];
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = texts.nextNode(); text; text = texts.nextNode()) {
      if (text.parentElement!.closest(".sr-only") || !text.textContent!.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      rects.push(...range.getClientRects());
    }
    const ends = new Map<number, number>();
    for (const rect of rects) {
      const line = Math.floor((rect.top + rect.height / 2 - top) / parseFloat(style.lineHeight));
      ends.set(line, Math.max(ends.get(line) ?? 0, rect.right));
    }
    return { lines: ends.size, ragged: Math.max(...[...ends.values()].map((end) => Math.abs(right - end))) };
  });
}

/** The credits, wherever their lines break: in the box's corner, aligned right, not cut; the link 24 × 24 px still. */
async function expectWhole(map: Locator) {
  const credits = creditsOf(map);
  expect(await shownText(credits)).toBe(CREDITS);
  await expectInCorner(credits, boxOf(map));
  expect(await credits.evaluate((element) => ({ align: getComputedStyle(element).textAlign, cut: element.scrollWidth > element.clientWidth }))).toEqual({
    align: "right",
    cut: false,
  });
  // To 4 px: the link has 3 px of its own on each side.
  expect((await linesOf(credits)).ragged).toBeLessThanOrEqual(4);
  const target = (await osmLink(map).boundingBox())!;
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
}

test.describe("the credits, at 320 px", () => {
  test.use({ viewport: { width: 320, height: 780 } });

  test("CA3.7: in the corner, aligned right, not cut", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await expectWhole(map);
    // One line or two, as the font has it: 24 px a line.
    expect([24, 48]).toContain((await creditsOf(map).boundingBox())!.height);
  });

  test("CA3.7: the text enlarged to 125 %, on two lines aligned right, in the corner and not cut", async ({ page, placed }) => {
    await enlargeText(page);
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await expectWhole(map);
    expect((await linesOf(creditsOf(map))).lines).toBe(2);
    // 1.5 times 15 px, twice.
    expect((await creditsOf(map).boundingBox())!.height).toBe(60);
  });
});

/** The zoom the framing tests fit their points at: a few kilometres in the map's height. */
const FIT_ZOOM = 12;

/**
 * Due north (`pixels` < 0) or south of `from`, `pixels` px away at `FIT_ZOOM` on Leaflet's
 * Web Mercator: the framing tests place a car so that the fit is tight.
 */
function mercatorFrom(from: Position, pixels: number): Position {
  const world = 256 * 2 ** FIT_ZOOM;
  const y = (lat: number) => (world / 2) * (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI);
  const target = y(from.lat) + pixels;
  return { lat: (Math.atan(Math.exp(Math.PI * (1 - (2 * target) / world))) * 360) / Math.PI - 90, lng: from.lng };
}

/** The map's height and the credits', the flag alone: what the framing will read. */
async function measured(page: Page, id: string): Promise<{ map: number; credits: number }> {
  await page.goto(`/e/${id}`);
  const map = await openMap(page, ALONE);
  return { map: (await map.boundingBox())!.height, credits: (await creditsOf(map).boundingBox())!.height };
}

// After a framing: the flag the farthest south with its point under it (h + 64), or a car (h + 32);
// on one line, and on two, at 320 px with the text enlarged. Each test seeds a car north or
// south of the flag so that, at the zoom of the fit, they fill 95 % of the room the margins
// leave: the fit is tight, and a margin that forgets `h`, or does not measure it, puts a point
// under the credits. The flag's 64 px are those of its point's button at 16 px a rem (16 + 44,
// v22): with the text enlarged, the button grows and the rule does not follow it, so the flag's
// case is at the default size only.
for (const [where, device, enlarged, height] of [
  ["360 px", {}, false, 24],
  ["320 px, the text enlarged", { viewport: { width: 320, height: 780 } }, true, 60],
] as const) {
  test.describe(`the framing and the bubble, at ${where}`, () => {
    test.use(device);
    test.beforeEach(({ page }) => (enlarged ? enlargeText(page) : undefined));

    if (!enlarged) {
      test("CA3.7: the flag the farthest south with its point under it: no point, label or button over the credits", async ({ db, page, placed }) => {
        const size = await measured(page, placed.id);
        expect(size.credits).toBe(height);
        await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 10 }) });
        // Straight up: the height of the map binds the zoom, not its width.
        await seedCar(db, placed.id, "Marc", { position: mercatorFrom(placed.place, -0.95 * (size.map - 32 - (size.credits + 64))) });
        await page.goto(`/e/${placed.id}`);
        const map = await openMap(page, mapName("aller", "2 voitures"));
        await expect(points(map)).toHaveCount(2);
        await expect(map.locator(`img.leaflet-tile[src^="/tuiles/${FIT_ZOOM}/"]`).first()).toBeAttached();
        await expectClearOfCredits(map);
      });
    }

    test("CA3.7: a car the farthest south: no point, label or button over the credits", async ({ db, page, placed }) => {
      const size = await measured(page, placed.id);
      expect(size.credits).toBe(height);
      await seedCar(db, placed.id, "Marc", { position: mercatorFrom(placed.place, 0.95 * (size.map - 32 - (size.credits + 32))) });
      await page.goto(`/e/${placed.id}`);
      const map = await openMap(page, mapName("aller", "1 voiture"));
      await expect(points(map)).toHaveCount(1);
      await expect(map.locator(`img.leaflet-tile[src^="/tuiles/${FIT_ZOOM}/"]`).first()).toBeAttached();
      await expectClearOfCredits(map);
    });

    test("CA3.7: a bubble of three cars stops above the credits", async ({ db, page, placed }) => {
      const parking = around(placed.place, { east: 350 });
      for (const [firstName, departureTime] of [
        ["Nina", "08:00:00"],
        ["Paul", "09:00:00"],
        ["Lou", "10:00:00"],
      ] as const) {
        await seedCar(db, placed.id, firstName, { position: { ...parking }, departureTime });
      }
      await page.goto(`/e/${placed.id}`);
      const map = await openMap(page, mapName("aller", "3 voitures"));
      const name = "3 voitures : Nina, Paul, Lou";
      await map.getByRole("button", { name, exact: true }).click();
      const bubble = map.getByRole("group", { name, exact: true });
      await expect(bubble.getByRole("button")).toHaveCount(4);
      const [region, credits, shown] = [(await map.boundingBox())!, (await creditsOf(map).boundingBox())!, (await bubble.boundingBox())!];
      expect(credits.height).toBe(height);
      // Taller than the room, it scrolls: its highest is the map's height, less 20 px, less the credits'.
      expect(await bubble.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      expect(shown.height).toBeCloseTo(region.height - 20 - credits.height, 0);
      expect(overlap(shown, credits)).toBe(false);
    });
  });
}

test.describe("the credits, with a mouse", () => {
  test.use({ hasTouch: false, isMobile: false });

  test("CA3.7: a drag that starts on the credits leaves the map; one that starts on the map moves it", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await map.scrollIntoViewIfNeeded();
    const flag = await flagInMap(map);

    await drag(page, await onCreditsText(page, map));
    expect(await flagInMap(map)).toEqual(flag);

    // The same drag from the map's middle: the test sees a pan.
    await drag(page, middleOf((await map.boundingBox())!));
    await expect.poll(() => flagInMap(map)).toEqual({ x: flag.x + 60, y: flag.y + 40 });
  });
});

test.describe("the credits, on an iPhone", () => {
  // Safari's user agent on a phone: Leaflet 1.9.4's `tapHold` listens to `touchstart` on the
  // map and, after 600 ms held, cancels the `touchend` and its click (#542).
  test.use({ userAgent: devices["iPhone 13"].userAgent });

  test("CA3.7: a press of 700 ms with one finger on the link opens it all the same", async ({ context, page, placed }) => {
    await answerOsm(page);
    await page.clock.install();
    await page.goto(`/e/${placed.id}`);
    const map = await openMap(page, ALONE);
    await map.scrollIntoViewIfNeeded();
    const at = middleOf((await osmLink(map).boundingBox())!);
    const opened = context.waitForEvent("page");
    const finger = await page.context().newCDPSession(page);
    await finger.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    await page.clock.runFor(700);
    await finger.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await finger.detach();
    expect((await opened).url()).toBe(OSM_COPYRIGHT);
  });
});

test.describe("the credits, in English", () => {
  test.use({ locale: "en-GB" });

  test("CA3.7: the link's name ends with « (opens in a new tab) »", async ({ page, placed }) => {
    await page.goto(`/e/${placed.id}`);
    const button = page.getByRole("tabpanel").getByRole("button", { name: "Map", exact: true });
    await expect(async () => {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
    }).toPass();
    const map = page.getByRole("region", { name: "Outbound map: the event place and no cars", exact: true });
    await expect(map.getByRole("link", { name: "© OpenStreetMap (opens in a new tab)", exact: true })).toHaveAttribute("href", OSM_COPYRIGHT);
    expect(await shownText(creditsOf(map))).toBe(CREDITS);
  });
});
