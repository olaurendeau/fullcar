import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, pressUntil, rgba } from "./focus-ring";
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
async function gate(page: Page, scene: Scene) {
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

    // Overflowing, it takes the focus from the keyboard, before « Fermer ».
    await expect(list(page)).toHaveAttribute("tabindex", "0");
    await barClose(page).focus();
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
