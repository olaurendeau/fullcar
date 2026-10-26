import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, press, pressUntil, rgba, walk } from "./focus-ring";

leaveNoToken();

/*
 * #320, epic #236: the focus ring of the language-switch design (v3.3.1), a 2 px outline of
 * #737373 at 2 px, reached from the keyboard on every page, measured by `e2e/focus-ring.ts`.
 */

const contact = (page: Page) => page.getByRole("link", { name: "Nous contacter (s’ouvre dans un nouvel onglet)", exact: true });
const languageSwitch = (page: Page) => page.getByRole("button", { name: "English", exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
/** « Nous contacter » as `walk` names it, its name cut at 40 characters. */
const contactReached = expect.stringMatching(/^<a> "Nous contacter/);
/** « Code source sur GitHub » (#489), as `walk` names it. */
const sourceReached = expect.stringMatching(/^<a> "Code source sur GitHub/);

/** The page, hydrated: the language switch is inactive until then. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(languageSwitch(page)).toBeEnabled();
}

/** The product of the element's opacity and its ancestors', once the finite animations have ended. */
const opacity = (locator: Locator) =>
  locator.evaluate(async (element) => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
    let product = 1;
    for (let at: Element | null = element; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
    return product;
  });

/** The visible layers of the element's boxShadow: a colour not transparent, one length not 0. */
const shadowLayers = (locator: Locator) =>
  locator.evaluate((element) => {
    const shadow = getComputedStyle(element).boxShadow;
    if (shadow === "none") return [];
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    return shadow
      .split(/,(?![^(]*\))/)
      .map((layer) => {
        const color = layer.match(/[a-z-]+\([^)]*\)|#[0-9a-f]+/i)?.[0] ?? "currentcolor";
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        const lengths = (layer.replace(color, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
        return { r, g, b, a: a / 255, spread: lengths[3] ?? 0, lengths };
      })
      .filter(({ a, lengths }) => a > 0 && lengths.some((length) => length !== 0))
      .map(({ r, g, b, spread }) => ({ r, g, b, spread }));
  });

test.describe("the focus ring", () => {
  test.use({ locale: "fr-FR" });

  test("F1.1, F1.13: on /nouveau, every element Tab reaches down to « Nous contacter » shows the ring", async ({ page }) => {
    await open(page, "/nouveau");
    const reached = await walk(page, { until: contact(page) });
    expect(reached.slice(-5)).toEqual(['<button> "Créer"', '<a> "Accueil"', '<button> "English"', sourceReached, contactReached]);
    // The title, the place, the dates and times; « Retour » and the three options, by their box.
    expect(reached.filter((element) => element === "<input>").length, "the fields").toBeGreaterThanOrEqual(4);
    expect(reached.filter((element) => element === "<button>").length, "the boxes").toBe(4);
  });

  test("F1.2: on /, every element Tab reaches down to « Nous contacter » shows the ring, « Créer un événement » too", async ({
    page,
  }) => {
    await open(page, "/");
    const reached = await walk(page, { until: contact(page) });
    expect(reached).toEqual(['<a> "Créer un événement"', '<button> "English"', sourceReached, contactReached]);
  });

  test("F1.8: « Lieu », in error and focused by « Créer », shows the ring and no halo; the halo comes back once it is left", async ({
    page,
  }) => {
    await open(page, "/nouveau");
    await field(page, "Titre").fill("Tournoi de Rennes");
    const create = page.getByRole("button", { name: "Créer", exact: true });
    await pressUntil(page, "Tab", create);
    // The unfocused state is noted before Enter, while « Lieu » is not in error yet.
    await press(page, "Enter");
    const place = field(page, "Lieu");
    await expect(place).toBeFocused();
    await expect(place).toHaveAttribute("aria-invalid", "true");
    await expectRing(place);
    expect(await shadowLayers(place)).toEqual([]);
    expect(await rgba(place, "border-top-color")).toEqual({ r: 231, g: 0, b: 11, a: 1 });
    await expect(page.getByText("Champ requis.", { exact: true }).first()).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(place).not.toBeFocused();
    await expect
      .poll(async () => (await shadowLayers(place)).map(({ r, g, b, spread }) => ({ red: r > 200 && g < 40 && b < 40, spread })))
      .toEqual([{ red: true, spread: 3 }]);
    await expect(page.getByText("Champ requis.", { exact: true }).first()).toBeVisible();
  });

  test("F1.11: in forced colours, the language switch reached by Tab keeps a solid outline of 2 px", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, "/");
    await pressUntil(page, "Tab", languageSwitch(page));
    const outline = await languageSwitch(page).evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline).toEqual({ style: "solid", width: "2px" });
  });
});

test.describe("the focus ring on the event's page", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  /** The device holds Tom and Léa, both without a car at the aller; Sophie drives, 3 seats. */
  test.beforeEach(async ({ db, page, seededEvent }) => {
    const eventId = seededEvent.id;
    const sophie = await seedPerson(db, eventId, { firstName: "Sophie" });
    await seedRide(db, eventId, sophie.id);
    for (const firstName of ["Tom", "Léa"]) {
      const { id } = await seedPerson(db, eventId, { firstName }, token);
      await seedPlacement(db, { personId: id, eventId, leg: "aller", rideId: null });
    }
    await holdToken(page, eventId, token);
  });

  test("F1.9: « Placer » inactive is opaque, grey on grey, and shows the ring; one box ticked, it is petrol again (--primary, #651)", async ({
    page,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}`);
    await page.getByRole("button", { name: /^Place libre : prendre une place dans la voiture de Sophie/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Sophie ?" });
    await expect(sheet).toBeVisible();
    for (const box of await sheet.getByRole("checkbox").all()) await box.uncheck();
    const place = sheet.getByRole("button", { name: /^Placer/ });
    await expect(place).toHaveAttribute("aria-disabled", "true");

    expect(await opacity(place), "unfocused").toBe(1);
    await expect.poll(() => rgba(place, "background-color")).toEqual({ r: 245, g: 245, b: 245, a: 1 });
    await expect.poll(() => rgba(place, "color")).toEqual({ r: 115, g: 115, b: 115, a: 1 });

    await pressUntil(page, "Tab", place);
    const ring = await expectRing(place);
    expect(ring.background).toBe("rgb(255, 255, 255)");
    expect(await opacity(place), "focused").toBe(1);
    await expect.poll(() => rgba(place, "background-color")).toEqual({ r: 245, g: 245, b: 245, a: 1 });

    await sheet.getByRole("checkbox").first().check();
    await expect(place).not.toHaveAttribute("aria-disabled");
    await expect.poll(() => rgba(place, "background-color")).toEqual({ r: 0, g: 90, b: 91, a: 1 });
  });

  test("F1.10: a click on the button of « Vos inscriptions » keeps the focus there without the ring", async ({
    page,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}`);
    const toggle = page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Vos inscriptions/ });
    const expanded = await toggle.getAttribute("aria-expanded");
    await toggle.click();
    await expect(toggle).not.toHaveAttribute("aria-expanded", expanded!);
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  });
});
