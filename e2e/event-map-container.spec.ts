import type { Locator, Page, Route } from "@playwright/test";
import type { Leg } from "@/domain/leg";
import { around, points, seedCar, test } from "./event-map-points";
import { expect } from "./fixtures";
import { answerTiles, tileAt } from "./tiles";

/*
 * #562, event-map v27, CA1.18: « le conteneur », the bordered block whose header is « Carte »,
 * with the map's box, the lines under it and Leaflet's notice; and the one ring element, above
 * Leaflet's panes and above the loading text, shown while the region of the map (Leaflet's
 * container) or the loading box has the keyboard focus. On both legs, at 360, 416 and 1280 px,
 * folded, under Leaflet's notice, loading, under a tiles' notice, and loaded; #558: the ring
 * above the credits, and hidden for a click of the mouse. The fake tile
 * provider is set for one tile only, the flag's at the view's zoom.
 */

test.use({ locale: "fr-FR" });

/** A car 100 m north of the flag frames the view at zoom 15, `framing`'s most. */
const FRAMED_ZOOM = 15;
const LOADING = "Chargement de la carte…";
const FAILED = "La carte n’a pas pu se charger.";
const TILES_FAILED = "Le fond de carte n’a pas pu se charger.";
/** `--ring`, #737373, as a screenshot gives it. */
const RING = { r: 115, g: 115, b: 115 };

const panel = (page: Page) => page.getByRole("tabpanel");
const mapButton = (page: Page) => panel(page).getByRole("button", { name: "Carte", exact: true });
/** Le conteneur: the block whose header is « Carte ». */
const theContainer = (page: Page) => mapButton(page).locator("xpath=..");
const region = (page: Page, leg: Leg) => page.getByRole("region", { name: new RegExp(`^Carte ${leg === "aller" ? "de l’aller" : "du retour"} : `) });
const rings = (page: Page) => theContainer(page).locator("[data-map-ring]");
const busyBox = (page: Page) => theContainer(page).locator('[aria-busy="true"]');
const retry = (page: Page, notice: string) =>
  theContainer(page).locator("div", { has: page.getByText(notice, { exact: true }) }).last().getByRole("button", { name: "Réessayer", exact: true });

/** Leaflet's code from now on: refused (404, as an old build's chunk after a deploy), held, or sent on. */
async function controlBuild(page: Page) {
  let mode: "refuse" | "hold" | "pass" = "refuse";
  const held: Route[] = [];
  await page.route("**/_next/static/**", (route) =>
    mode === "refuse" ? route.fulfill({ status: 404 }) : mode === "hold" ? void held.push(route) : route.continue(),
  );
  return {
    hold: () => (mode = "hold"),
    release: async () => {
      await expect.poll(() => held.length).toBeGreaterThan(0);
      mode = "pass";
      await Promise.all(held.splice(0).map((route) => route.continue()));
    },
  };
}

/**
 * The container's form, read from its computed styles, against fixed values: a 1 px border of
 * `--border` on each side, a radius of 14 px, no landmark, « Carte » its first child without a
 * border of its own; and how far its last shown element is from its inner bottom edge.
 */
async function formOf(container: Locator) {
  return container.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("div");
    probe.style.borderColor = "var(--border)";
    element.append(probe);
    const border = getComputedStyle(probe).borderTopColor;
    probe.remove();
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    const button = element.firstElementChild!;
    const shown = [...element.querySelectorAll(":scope > *, :scope > [id] > *")].filter((child) => child.checkVisibility());
    const bottom = Math.max(...shown.map((child) => child.getBoundingClientRect().bottom));
    return {
      borders: sides.map((side) => `${style.getPropertyValue(`border-${side.toLowerCase()}-width`)} ${style.getPropertyValue(`border-${side.toLowerCase()}-style`)}`),
      colours: sides.map((side) => style.getPropertyValue(`border-${side.toLowerCase()}-color`) === border),
      radii: ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => style.getPropertyValue(`border-${corner}-radius`)),
      landmark: element.getAttribute("role") ?? element.tagName.toLowerCase(),
      header: button.tagName.toLowerCase() === "button" && button.hasAttribute("aria-expanded"),
      buttonBorders: sides.map((side) => getComputedStyle(button).getPropertyValue(`border-${side.toLowerCase()}-width`)),
      height: element.getBoundingClientRect().height,
      below: Math.round((element.getBoundingClientRect().bottom - parseFloat(style.borderBottomWidth) - bottom) * 100) / 100,
    };
  });
}

/** CA1.18: the container, folded (54 px, the button alone) or open (12 px under its last element). */
async function expectContainer(page: Page, open: boolean) {
  const form = await formOf(theContainer(page));
  expect(form.borders).toEqual(Array(4).fill("1px solid"));
  expect(form.colours).toEqual([true, true, true, true]);
  expect(form.radii).toEqual(Array(4).fill("14px"));
  expect(form.landmark).toBe("div");
  expect(form.header).toBe(true);
  expect(form.buttonBorders).toEqual(Array(4).fill("0px"));
  if (open) expect(form.below).toBe(12);
  else expect(form.height).toBe(54);
}

/** The map's box, from one inner edge of the container to the other, without a border or a corner of its own but the rule above it. */
async function expectEdgeToEdge(page: Page, box: Locator) {
  const [inner, outer] = [(await box.boundingBox())!, (await theContainer(page).boundingBox())!];
  expect(Math.abs(inner.x - (outer.x + 1))).toBeLessThanOrEqual(1);
  expect(Math.abs(inner.x + inner.width - (outer.x + outer.width - 1))).toBeLessThanOrEqual(1);
  const own = await box.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
    };
  });
  expect(own).toEqual({ borders: ["1px", "0px", "0px", "0px"], radii: ["0px", "0px", "0px", "0px"] });
}

/**
 * The colour of a pixel of `surface` in a screenshot: 1 px inside the middle of its top edge, or
 * 1 px inside its bottom right corner, where the credits are (#558).
 */
async function pixelOf(page: Page, surface: Locator, where: "top" | "bottomRight") {
  const shot = (await surface.screenshot()).toString("base64");
  const { width, height } = (await surface.boundingBox())!;
  const [x, y] = where === "top" ? [width / 2, 1] : [width - 1, height - 1];
  return page.evaluate(
    async ({ shot, width, x, y }) => {
      const bytes = Uint8Array.from(atob(shot), (char) => char.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [image.width, image.height];
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const scale = image.width / width;
      const [r, g, b] = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
      return { r, g, b };
    },
    { shot, width, x, y },
  );
}

/**
 * The one ring element, shown with the keyboard focus on `focused`: above every pane of Leaflet,
 * the bubble and the loading text, an outline inside, and `--ring` 1 px inside the top edge of
 * `surface`, the opaque loading text or the region.
 */
async function expectRing(page: Page, focused: Locator, surface: Locator) {
  await expect(focused).toBeFocused();
  expect(await focused.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(rings(page)).toHaveCount(1);
  await expect(rings(page)).toBeVisible();
  const ring = await rings(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const others = [...element.parentElement!.querySelectorAll("*")]
      .filter((other) => other !== element)
      .map((other) => Number(getComputedStyle(other).zIndex))
      .filter(Number.isFinite);
    const credits = element.parentElement!.querySelector("[data-map-credits]");
    return {
      above: Number(style.zIndex) > Math.max(1001, ...others),
      // The credits are in the box, at 1000: under it (#558).
      aboveCredits: !!credits && Number(style.zIndex) > Number(getComputedStyle(credits).zIndex),
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      inside: parseFloat(style.outlineOffset) < 0,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(ring).toEqual({ above: true, aboveCredits: true, outline: "solid 2px", inside: true, pointerEvents: "none" });
  // At the top, and at the bottom right, on the credits.
  for (const where of ["top", "bottomRight"] as const) {
    const pixel = await pixelOf(page, surface, where);
    for (const channel of ["r", "g", "b"] as const) expect(Math.abs(pixel[channel] - RING[channel]), `${channel} of ${where} ${JSON.stringify(pixel)}`).toBeLessThanOrEqual(3);
  }
}

for (const [where, device] of [
  ["360 px", {}],
  ["416 px", { viewport: { width: 416, height: 780 } }],
  ["1280 px", { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }],
] as const) {
  for (const leg of ["aller", "retour"] as const) {
    test.describe(`le conteneur of the ${leg}, at ${where}`, () => {
      test.use(device);

      test("CA1.18: one bordered container, folded, under Leaflet's notice, loading, under a tiles' notice and loaded; one ring element", async ({
        db,
        page,
        placed,
      }) => {
        await seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 100 }), leg });
        const tile = tileAt(placed.place, FRAMED_ZOOM);
        await answerTiles([tile], { kind: "error" });
        await page.goto(`/e/${placed.id}`);
        await expect(panel(page)).toBeVisible();
        if (leg === "retour") {
          await page.getByRole("tab", { name: "Retour" }).click();
          await expect(page.getByRole("tab", { name: "Retour" })).toHaveAttribute("aria-selected", "true");
        }
        await page.waitForLoadState("networkidle");

        // Folded: the button alone, 54 px.
        await expect(mapButton(page)).toHaveAttribute("aria-expanded", "false");
        await expectContainer(page, false);

        // Leaflet's code refused: its notice, in the container.
        const build = await controlBuild(page);
        await mapButton(page).click();
        await expect(theContainer(page).getByText(FAILED, { exact: true })).toBeVisible();
        await expect(mapButton(page)).toBeFocused();
        await expectContainer(page, true);

        // « Réessayer » from the keyboard: the loading box has the focus, the ring is drawn above its opaque text.
        build.hold();
        await page.keyboard.press("Tab");
        await expect(retry(page, FAILED)).toBeFocused();
        await page.keyboard.press("Enter");
        const text = busyBox(page).getByText(LOADING, { exact: true });
        await expect(text).toBeVisible();
        await expectContainer(page, true);
        await expectEdgeToEdge(page, busyBox(page));
        await expectRing(page, busyBox(page), text);
        await rings(page).evaluate((element) => ((element as unknown as Record<string, boolean>).seenLoading = true));

        // Loaded, under the tiles' notice: the focus on « Carte », the ring hidden.
        await build.release();
        const map = region(page, leg);
        await expect(points(map)).toHaveCount(1);
        await expect(theContainer(page).getByText(TILES_FAILED, { exact: true })).toBeVisible();
        await expect(mapButton(page)).toBeFocused();
        await expect(rings(page)).toHaveCount(1);
        await expect(rings(page)).toBeHidden();
        const box = map.locator("xpath=..");
        await expectContainer(page, true);
        await expectEdgeToEdge(page, box);

        // The region from the keyboard: the same ring element, above Leaflet's panes; gone with the focus.
        await page.keyboard.press("Tab");
        await expectRing(page, map, map);
        expect(await rings(page).evaluate((element) => (element as unknown as Record<string, boolean>).seenLoading)).toBe(true);
        await page.keyboard.press("Tab");
        await expect(map).not.toBeFocused();
        await expect(rings(page)).toBeHidden();

        // The tiles answer again: the notice goes, the focus to the region, and the ring with it.
        await answerTiles([tile], { kind: "tile" });
        await retry(page, TILES_FAILED).focus();
        await page.keyboard.press("Enter");
        await expect(theContainer(page).getByText(TILES_FAILED)).toHaveCount(0);
        await expectRing(page, map, map);
        // Loaded, the box the last element at 1280 px: 12 px under it still.
        await expectContainer(page, true);
        await expectEdgeToEdge(page, box);

        // The region clicked with the mouse, off its points and its zoom: it has the focus, not
        // the keyboard's, and the ring stays hidden (#569's review, #558). The mouse first, on
        // the event's title: Leaflet focuses the region from its own `mousedown`, before the
        // browser counts the press, and right after a key the browser would take it for the keyboard's.
        await page.getByRole("heading", { level: 1 }).click();
        await expect(rings(page)).toBeHidden();
        const { width } = (await map.boundingBox())!;
        await map.click({ position: { x: width - 40, y: 40 } });
        await expect(map).toBeFocused();
        expect(await map.evaluate((element) => element.matches(":focus-visible"))).toBe(false);
        await expect(rings(page)).toBeHidden();
      });
    });
  }
}
