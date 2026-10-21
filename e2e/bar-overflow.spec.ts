import type { BrowserContext, Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, press, pressUntil, rgba } from "./focus-ring";
import { organiserPath } from "./organiser";

leaveNoToken();

// #227: the bar's list stops at 40 % of the viewport and scrolls; the page keeps room for the
// bar as measured; and the focus never falls on <body> (« À 360 px », rule 8, v4.2.3; C11.4, C11.10).

type Db = Kysely<Database>;

/** A first name of 40 characters without a space, that takes two lines by itself (« À 360 px »). */
const LONG = "Maximilienne".repeat(4).slice(0, 40);
const HUGO_PLACED = "Hugo est dans la voiture de Marc";
const NINA_FAILED = "Nina · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";

/**
 * The device holds Tom, Léa, Hugo, Nina and the long first name, in that order. Aller: Sophie
 * (5 seats) and Marc (3 seats) drive nobody, all five are without a car. Retour: Tom and Léa
 * are without a car.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo"), nina: await mine("Nina"), long: await mine(LONG) };
  const cars = { sophie: await seedRide(db, eventId, await other("Sophie"), { seats: 5 }), marc: await seedRide(db, eventId, await other("Marc")) };
  for (const personId of Object.values(persons)) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  for (const personId of [persons.tom, persons.lea]) await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
  return { persons, cars };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const board = (page: Page) => page.locator("[data-message-bar]");
const list = (page: Page) => page.getByRole("group", { name: "Messages" });
const barClose = (page: Page) => board(page).getByRole("button", { name: "Fermer" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });

/**
 * Holds every action about the scene while the gate is shut, then fails it (500), unless it
 * places someone in Marc's car or `fails` is turned off. The page's reads go through: they
 * carry no id of the scene.
 */
async function gate(page: Page, scene: { persons: Record<string, string>; cars: { marc: string } }) {
  const ids = [...Object.values(scene.persons), ...Object.values(scene.cars)];
  let open = Promise.resolve();
  let release = () => {};
  const actions = {
    fails: true,
    shut: () => void (open = new Promise((resolve) => (release = resolve))),
    release: () => release(),
  };
  await page.route("**/e/**", async (route) => {
    const body = route.request().postData() ?? "";
    if (!ids.some((id) => body.includes(id))) return route.fallback();
    await open;
    return !actions.fails || body.includes(scene.cars.marc) ? route.continue() : route.fulfill({ status: 500, body: "" });
  });
  return actions;
}

/** Opens the cell of `firstName` on `leg`, touches `button`, and closes the sheet before the answer. */
async function cellThenClose(page: Page, firstName: string, leg: "Aller" | "Retour", button: string) {
  await cell(page, firstName, leg).click();
  await page.getByRole("dialog", { name: `${firstName} · ${leg}` }).getByRole("button", { name: button }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Opens `driver`'s sheet, ticks exactly `names`, sends them, and closes the sheet before the answer. */
async function seatsThenClose(page: Page, driver: string, names: string[]) {
  await page.getByRole("tabpanel").getByRole("article", { name: `Voiture de ${driver}` }).getByRole("button", { name: /^Place libre/ }).first().click();
  const sheet = page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
  for (const name of ["Tom", "Léa", "Hugo", "Nina", LONG]) await sheet.getByRole("checkbox", { name, exact: true }).setChecked(names.includes(name));
  await sheet.getByRole("button", { name: /^Placer/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Four failures, then a success, written in that order: « Tom, Léa et 2 autres… », the long first name, Tom · Retour, Léa · Retour, then Hugo. */
async function fourFailuresThenASuccess(page: Page, scene: Scene) {
  const actions = await gate(page, scene);
  actions.shut();
  await seatsThenClose(page, "Sophie", ["Tom", "Léa", "Hugo", "Nina"]);
  await cellThenClose(page, LONG, "Aller", "Ne fait pas l’aller");
  await cellThenClose(page, "Tom", "Retour", "Ne fait pas le retour");
  await cellThenClose(page, "Léa", "Retour", "Ne fait pas le retour");
  await seatsThenClose(page, "Marc", ["Hugo"]);
  const scrolled = await page.evaluate(() => window.scrollY);
  actions.release();
  await expect(messages(page)).toHaveCount(5);
  await expect(messages(page).last()).toHaveText(HUGO_PLACED);
  return { actions, scrolled };
}

/**
 * The window loses the focus, as by Alt+Tab, which Playwright's page never does: the element
 * that has the focus gets `blur` and `focusout` without `relatedTarget` while
 * `document.hasFocus()` is false, and stays the document's active element.
 */
async function leaveWindow(focused: Locator) {
  await focused.evaluate((element) => {
    const hasFocus = document.hasFocus;
    document.hasFocus = () => false;
    element.dispatchEvent(new FocusEvent("blur"));
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    document.hasFocus = hasFocus;
  });
  await expect(focused).toBeFocused();
}

/**
 * Whether `inner` is entirely inside `outer`, as shown, from its top to its bottom. With
 * `ring`, on every side, `inner` grown by its outline of `ring` px stays `ring` px at least
 * inside `outer` less its border: `ring` px of `outer`'s background between the outline and
 * the border (F1.6). The boxes are in sub-pixels: 0.5 px is tolerated.
 */
async function within(inner: Locator, outer: Locator, { ring = 0 } = {}) {
  const [a, b] = [(await inner.boundingBox())!, (await outer.boundingBox())!];
  const [top, right, bottom, left] = ring
    ? await outer.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat);
      })
    : [0, 0, 0, 0];
  const gaps = [a.y - ring - (b.y + top), b.y + b.height - bottom - (a.y + a.height + ring)];
  if (ring) gaps.push(a.x - ring - (b.x + left), b.x + b.width - right - (a.x + a.width + ring));
  return gaps.every((gap) => gap >= ring - 0.5);
}

test.describe("a bar of many lines", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C11.4: four failures and a success at 360 × 780: the list stops at 40dvh, scrolls, and can take the focus; nothing overflows", async ({ page, seededEvent }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    await page.goto(`/e/${seededEvent.id}`);
    const { scrolled } = await fourFailuresThenASuccess(page, scene);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const sizes = await list(page).evaluate((element) => [element.clientHeight, element.scrollHeight]);
    expect(sizes[0]).toBeLessThanOrEqual(312);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    // It scrolls: the last line written, the success, is in view, at the bottom; the page stays.
    expect(await list(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await within(messages(page).last(), list(page))).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

    // « Fermer » stays in view, at the bar's top right.
    const [shown, close] = [(await board(page).boundingBox())!, (await barClose(page).boundingBox())!];
    expect(close.y - shown.y).toBeLessThan(12);
    expect(shown.x + shown.width - (close.x + close.width)).toBeLessThan(12);

    // Overflowing, it takes the focus from the keyboard, before the success's « Annuler » (#170) and « Fermer ».
    await expect(list(page)).toHaveAttribute("tabindex", "0");
    await barClose(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(list(page).getByRole("button", { name: "Annuler" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(list(page)).toBeFocused();
  });

  test("C11.4: a new failure brings the list back to its top, where it shows", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const { actions } = await fourFailuresThenASuccess(page, scene);
    expect(await within(messages(page).first(), list(page))).toBe(false);

    actions.shut();
    await cellThenClose(page, "Nina", "Aller", "Ne fait pas l’aller");
    actions.release();
    await expect(messages(page)).toHaveCount(6);
    await expect(messages(page).first()).toHaveText(NINA_FAILED);
    expect(await list(page).evaluate((element) => element.scrollTop)).toBe(0);
    expect(await within(messages(page).first(), list(page))).toBe(true);
  });

  // F1.6, epic #236: in the bar, the ring is at 0 px, and 2 px of the bar's background stay
  // between it and the bar's border, red with a failure (language-switch design, v3.3.1).
  for (const failing of [false, true]) {
    test(`F1.6: with ${failing ? "a failure, the bar white and bordered in red" : "a success alone, the bar dark"}, « Fermer » reached from the keyboard shows the ring at 0 px, 2 px inside the border`, async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      const actions = await gate(page, scene);
      if (failing) {
        actions.shut();
        await cellThenClose(page, "Nina", "Aller", "Ne fait pas l’aller");
        actions.release();
        await expect(messages(page)).toHaveText([NINA_FAILED]);
        expect(await rgba(board(page), "border-top-color")).toEqual({ r: 231, g: 0, b: 11, a: 1 });
      } else {
        await seatsThenClose(page, "Marc", ["Tom"]);
        await expect(messages(page)).toHaveText(["Tom est dans la voiture de Marc"]);
      }

      await pressUntil(page, "Shift+Tab", barClose(page));
      const ring = await expectRing(barClose(page), { offset: 0 });
      expect(ring.background).toBe(failing ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)");
      if (!failing) expect(ring.ratio).toBeGreaterThanOrEqual(3.7);
      expect(await within(barClose(page), board(page), { ring: 2 }), "1.5 px at least between the ring and the border").toBe(true);
    });
  }

  test("F1.6: four failures and a success at 360 × 780: the list that scrolls, reached from the keyboard, shows the ring at 0 px, 2 px inside the red border", async ({ page, seededEvent }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    await page.goto(`/e/${seededEvent.id}`);
    await fourFailuresThenASuccess(page, scene);
    await expect(list(page)).toHaveAttribute("tabindex", "0");

    await pressUntil(page, "Shift+Tab", list(page));
    const ring = await expectRing(list(page), { offset: 0 });
    expect(ring.background).toBe("rgb(255, 255, 255)");
    expect(await within(list(page), board(page), { ring: 2 }), "1.5 px at least between the ring and the border").toBe(true);
  });

  for (const where of ["/e/{id}", "/e/{id}/admin"] as const) {
    test(`C11.4, ${where}: the room kept below the page is 1rem + the bar + 12 px, and « Nous contacter » scrolls entirely above the bar`, async ({ page, seededEvent }) => {
      await page.goto(where === "/e/{id}" ? `/e/${seededEvent.id}` : organiserPath(seededEvent));
      await fourFailuresThenASuccess(page, scene);

      const [room, height] = await page.evaluate(() => [
        parseFloat(getComputedStyle(document.querySelector("main")!).paddingBottom),
        document.querySelector("[data-message-bar]")!.getBoundingClientRect().height,
      ]);
      expect(height).toBeGreaterThan(300);
      expect(room).toBeCloseTo(16 + height + 12, 0);

      // Scrolled to the bottom and measured at once: the organiser's area, read again after an
      // action, can change the page's height meanwhile (#292).
      await expect
        .poll(() =>
          page.evaluate(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
            const contact = [...document.querySelectorAll("a")].find((link) => link.textContent?.startsWith("Nous contacter"))!;
            return contact.getBoundingClientRect().bottom - document.querySelector("[data-message-bar]")!.getBoundingClientRect().top;
          }),
        )
        .toBeLessThanOrEqual(0);
    });
  }

  for (const away of [false, true]) {
    test(`rule 8: the list keeps its tabIndex while it has the focus, even once it no longer overflows${away ? ", the window left meanwhile" : ""}`, async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await fourFailuresThenASuccess(page, scene);
      await list(page).focus();
      await expect(list(page)).toBeFocused();

      // 40dvh is 800 px now: the list no longer overflows. Two frames: for its ResizeObserver, and
      // the render after it, lest an attribute not yet removed pass for one kept.
      await page.setViewportSize({ width: 360, height: 2000 });
      await expect.poll(() => list(page).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(false);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (away) await leaveWindow(list(page));
      await expect(list(page)).toHaveAttribute("tabindex", "0");
      await expect(list(page)).toBeFocused();

      // Once the focus is elsewhere, it no longer takes it.
      await barClose(page).focus();
      await expect(list(page)).not.toHaveAttribute("tabindex");
    });
  }

  // #255's review: an action without words empties the bar while « Fermer » has the focus. A
  // focus put on nothing since, as a tap on the page's text does on a phone, stays there; the
  // window left meanwhile (Alt+Tab), the focus is still « Fermer »'s (#311's review).
  const WHAT = {
    kept: "has the focus: the focus goes to the landmark of the line gone",
    blurred: "had the focus, then the focus put on nothing: it stays there",
    away: "has the focus, the window left meanwhile: the focus goes to the landmark of the line gone",
  };
  for (const [how, what] of Object.entries(WHAT)) {
    const blurred = how === "blurred";
    test(`rule 8, C11.10: an action without words empties the bar while « Fermer » ${what}`, async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      const actions = await gate(page, scene);
      await seatsThenClose(page, "Marc", ["Tom"]);
      await expect(messages(page)).toHaveText(["Tom est dans la voiture de Marc"]);

      // « Sortir de la voiture », held: its success has no words, and takes the bar's only line.
      actions.shut();
      await cell(page, "Tom", "Aller").click();
      await page.getByRole("dialog", { name: "Tom · Aller" }).getByRole("button", { name: "Sortir de la voiture" }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await barClose(page).focus();
      if (blurred) await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      if (how === "away") await leaveWindow(barClose(page));
      const scrolled = await page.evaluate(() => window.scrollY);
      actions.fails = false;
      actions.release();

      await expect(messages(page)).toHaveCount(0);
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName(/Sans voiture/);
      if (blurred) expect(await page.evaluate(() => [document.activeElement === document.body, window.scrollY])).toEqual([true, scrolled]);
      else {
        await expect(page.locator("body")).not.toBeFocused();
        await expect(title(page, "Marc")).toBeFocused();
      }
    });
  }
});

// F1.19, #350: « Annuler », in the bar's list that clips what overflows it, shows its ring at
// 0 px whole on its four sides: its row keeps 2 px on its right (`pr-0.5`), and a scroll from
// the keyboard keeps 4 px above or below it (`scroll-my-1`) (language-switch design, v3.3.4).

const PLACED = "Tom est dans la voiture de Sophie";
const UNDO_OFFLINE = "Tom n’a pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ».";

/**
 * The device holds Tom, without a car at the aller, the only one there: a tap on a seat places
 * him. Léa, Hugo and Nina do not do the aller, and are without a car at the retour. Aller:
 * Sophie and Marc drive nobody.
 */
async function seedUndoScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo"), nina: await mine("Nina") };
  const cars = { sophie: await seedRide(db, eventId, await other("Sophie")), marc: await seedRide(db, eventId, await other("Marc")) };
  await seedPlacement(db, { personId: persons.tom, eventId, leg: "aller", rideId: null });
  for (const personId of [persons.lea, persons.hugo, persons.nina]) await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
  return { persons, cars };
}

const undo = (page: Page) => list(page).getByRole("button", { name: "Annuler" });

/** Scene 1: Tom placed by a tap in Sophie's car, the success with its « Annuler ». */
async function placeTom(page: Page) {
  await page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Sophie" }).getByRole("button", { name: /^Place libre/ }).first().click();
  await expect(messages(page).last()).toHaveText(PLACED);
}

/** Scene 2: « Annuler » offline. Its failure takes an « Annuler », which the success loses; back online after. */
async function undoOffline(page: Page, context: BrowserContext) {
  await context.setOffline(true);
  await undo(page).click();
  await expect(messages(page).first()).toHaveText(UNDO_OFFLINE);
  await expect(undo(page)).toHaveCount(1);
  await expect(undo(page)).toHaveAccessibleDescription(UNDO_OFFLINE);
  await context.setOffline(false);
}

/** Three failures more, of Léa's, Hugo's and Nina's retour, each sheet closed before its answer (500). */
async function threeFailures(page: Page, scene: Awaited<ReturnType<typeof seedUndoScene>>) {
  const before = await messages(page).count();
  const actions = await gate(page, scene);
  actions.shut();
  for (const name of ["Léa", "Hugo", "Nina"]) await cellThenClose(page, name, "Retour", "Ne fait pas le retour");
  actions.release();
  await expect(messages(page)).toHaveCount(before + 3);
  await page.unroute("**/e/**");
}

/** From each side of `inner` to the same side of `outer`, inward, in CSS px: negative, `inner` passes it. */
async function gaps(inner: Locator, outer: Locator) {
  const [a, b] = [(await inner.boundingBox())!, (await outer.boundingBox())!];
  return { top: a.y - b.y, right: b.x + b.width - (a.x + a.width), bottom: b.y + b.height - (a.y + a.height), left: a.x - b.x };
}

/** The ring holds in the list: « Annuler »'s box grown by its outline of 2 px is inside the list's, which has no border. 0.5 px is tolerated. */
async function expectRingInList(page: Page) {
  const found = await gaps(undo(page), list(page));
  for (const [side, gap] of Object.entries(found)) expect(gap, `the ring inside the list, ${side}`).toBeGreaterThanOrEqual(2 - 0.5);
}

/**
 * The area Playwright crops an element's screenshot to: its box in the document, grown to whole
 * CSS px (`enclosingIntRect`: floor of the start, ceil of the end, 0.001 px tolerated), given
 * back in the viewport's coordinates, as `boundingBox` gives the box.
 */
async function shotArea(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const [left, top] = [Math.floor(box.x + scroll.x + 1e-3), Math.floor(box.y + scroll.y + 1e-3)];
  const [right, bottom] = [Math.ceil(box.x + box.width + scroll.x - 1e-3), Math.ceil(box.y + box.height + scroll.y - 1e-3)];
  return { x: left - scroll.x, y: top - scroll.y, width: right - left, height: bottom - top };
}

/**
 * The bar shot (`locator.screenshot`), read at the device's scale: the pixel 1 CSS px outside the
 * middle of each side of « Annuler », in the middle of its outline's width.
 */
async function ringPixels(page: Page) {
  const shot = (await board(page).screenshot()).toString("base64");
  const [button, origin] = [(await undo(page).boundingBox())!, await shotArea(page, (await board(page).boundingBox())!)];
  const middle = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  const points = {
    top: [middle.x, button.y - 1],
    right: [button.x + button.width + 1, middle.y],
    bottom: [middle.x, button.y + button.height + 1],
    left: [button.x - 1, middle.y],
  };
  return page.evaluate(
    async ({ shot, points, origin }) => {
      const bytes = Uint8Array.from(atob(shot), (char) => char.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [image.width, image.height];
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const scale = image.width / origin.width;
      return Object.fromEntries(
        Object.entries(points).map(([side, [x, y]]) => {
          const [r, g, b] = context.getImageData(Math.floor((x - origin.x) * scale), Math.floor((y - origin.y) * scale), 1, 1).data;
          return [side, { r, g, b }];
        }),
      );
    },
    { shot, points, origin },
  );
}

/** Each of the four pixels is the ring's rgb(115, 115, 115), within 4 a channel. */
async function expectRingPixels(page: Page) {
  for (const [side, { r, g, b }] of Object.entries(await ringPixels(page))) {
    for (const channel of [r, g, b]) expect(Math.abs(channel - 115), `the ring's pixel, ${side}: rgb(${r}, ${g}, ${b})`).toBeLessThanOrEqual(4);
  }
}

/** Scrolls the list by script, which leaves the focus where it is, until « Annuler » is cut by `edge` by 20 px; checks it is. */
async function cut(page: Page, edge: "top" | "bottom") {
  await list(page).evaluate((element, edge) => {
    const [button, shown] = [element.querySelector("button")!.getBoundingClientRect(), element.getBoundingClientRect()];
    element.scrollTop += edge === "bottom" ? button.bottom - shown.bottom - 20 : button.top - shown.top + 20;
  }, edge);
  const gap = (await gaps(undo(page), list(page)))[edge];
  expect(gap, `« Annuler » cut by the list's ${edge} edge`).toBeLessThanOrEqual(-16);
  expect(gap, `« Annuler » cut by the list's ${edge} edge`).toBeGreaterThanOrEqual(-24);
}

test.describe("F1.19: « Annuler » in the bar, reached from the keyboard at 360 × 780", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedUndoScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    scene = await seedUndoScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  for (const failing of [false, true]) {
    test(`F1.19: ${failing ? "with a failure, the bar white and bordered in red" : "a success alone, the bar dark"}: the ring at 0 px, whole on its four sides`, async ({ context, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await placeTom(page);
      if (failing) {
        await undoOffline(page, context);
        await expect(messages(page)).toHaveText([UNDO_OFFLINE, PLACED]);
      } else await expect(messages(page)).toHaveText([PLACED]);

      await pressUntil(page, "Shift+Tab", undo(page));
      const ring = await expectRing(undo(page), { offset: 0 });
      expect(ring.background).toBe(failing ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)");
      if (!failing) expect(ring.ratio).toBeGreaterThanOrEqual(3.7);
      await expectRingPixels(page);
      await expectRingInList(page);
      if (failing) expect(await within(undo(page), board(page), { ring: 2 }), "1.5 px at least between the ring and the border").toBe(true);
    });
  }

  test("F1.19, scene 3a: the list that scrolls, « Annuler » cut by its bottom edge, then Tab: brought into view 4 px from the edge, the ring whole", async ({ context, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await placeTom(page);
    await undoOffline(page, context);
    await threeFailures(page, scene);
    // Tom's failure, the only one with « Annuler », under the three written after it; the success last.
    await expect(messages(page).nth(3)).toHaveText(UNDO_OFFLINE);
    await expect(messages(page).last()).toHaveText(PLACED);
    await expect(list(page)).toHaveAttribute("tabindex", "0");

    await pressUntil(page, "Tab", list(page));
    await cut(page, "bottom");
    await expect(list(page)).toBeFocused();
    await press(page, "Tab");
    await expect(undo(page)).toBeFocused();

    const ring = await expectRing(undo(page), { offset: 0 });
    expect(ring.background).toBe("rgb(255, 255, 255)");
    expect((await gaps(undo(page), list(page))).bottom, "4 px between « Annuler » and the list's bottom edge").toBeGreaterThanOrEqual(3.5);
    await expectRingInList(page);
  });

  test("F1.19, scene 3b: the list that scrolls, « Annuler » cut by its top edge, then Shift+Tab from « Fermer »: brought into view 4 px from the edge, the ring whole", async ({ context, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await threeFailures(page, scene);
    await placeTom(page);
    await undoOffline(page, context);
    // Tom's failure, the most recent, on top of the three others; the success last.
    await expect(messages(page)).toHaveCount(5);
    await expect(messages(page).last()).toHaveText(PLACED);
    await expect(list(page)).toHaveAttribute("tabindex", "0");

    // From the element after the bar in the order of Tab: « Fermer » is the bar's last.
    await pressUntil(page, "Shift+Tab", barClose(page));
    await cut(page, "top");
    await expect(barClose(page)).toBeFocused();
    await press(page, "Shift+Tab");
    await expect(undo(page)).toBeFocused();

    const ring = await expectRing(undo(page), { offset: 0 });
    expect(ring.background).toBe("rgb(255, 255, 255)");
    expect((await gaps(undo(page), list(page))).top, "4 px between « Annuler » and the list's top edge").toBeGreaterThanOrEqual(3.5);
    await expectRingInList(page);
  });
});
