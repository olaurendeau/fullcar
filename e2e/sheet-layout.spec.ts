import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { barOf, boxOf, edgesOf, expectClearOfFixedParts, fakeVisualViewport, headerOf, moveVisibleArea } from "./sheet-layout";

leaveNoToken();

// #691 (event-board v4.6, #650): the sheet's header and bar stay, the sheet follows the visible
// area, and « Modifier {prénom} » takes all its height on a phone. The project `e2e` is a Pixel 7.

type Db = Kysely<Database>;

const OFFLINE = "Action impossible, vérifiez la connexion";

/** The device holds Claire and Tom. Aller: Claire is without a car; Sophie, of another device, drives Tom. */
async function seedScene(db: Db, eventId: string, token: string) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire" }, token);
  const tom = await seedPerson(db, eventId, { firstName: "Tom" }, token);
  const sophie = await seedPerson(db, eventId, { firstName: "Sophie" });
  const car = await seedRide(db, eventId, sophie.id);
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: car });
  await seedPlacement(db, { personId: claire.id, eventId, leg: "aller", rideId: null });
  return { claire: claire.id };
}

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const submit = (sheet: Locator) => sheet.getByRole("button", { name: "Valider", exact: true });
const close = (sheet: Locator) => sheet.getByRole("button", { name: "Fermer", exact: true });

/** The sheet of Claire's first name, at its opening's end. */
async function openClaire(page: Page) {
  await section(page).getByRole("button", { name: "Claire", exact: true }).click();
  const sheet = dialog(page, "Claire");
  await settled(sheet);
  return sheet;
}

/** « Modifier Claire », the focus on « Prénom », its opening over. */
async function openEdit(page: Page) {
  const sheet = await openClaire(page);
  await sheet.getByRole("button", { name: "Modifier", exact: true }).click();
  const form = dialog(page, "Modifier Claire");
  await expect(form.getByLabel("Prénom")).toBeFocused();
  await settled(form);
  return form;
}

/** Once the sheet's opening animation is over: it slides up from the bottom. */
async function settled(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
}

/** Whether `sheet`, the element that scrolls, has scrolled, and how far. */
const scrollTop = (sheet: Locator) => sheet.evaluate((element) => element.scrollTop);

test.describe("sheet layout", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("K1.1: « Modifier Claire » fills the screen, « Valider » and « Fermer » in view from the start", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    expect(await boxOf(form)).toEqual([0, 0, 360, 640]);
    await expect(submit(form)).toBeInViewport({ ratio: 1 });
    await expect(close(form)).toBeInViewport({ ratio: 1 });
    expect(await scrollTop(form)).toBe(0);
    // Its buttons are the bar's, under the body.
    await expect(barOf(form).getByRole("button")).toHaveText(["Valider", "Fermer"]);
  });

  test("K1.5: the person's sheet, at its content's height, fills the screen once « Modifier » shows the form", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sheet = await openClaire(page);
    const [x, y, width, height] = await boxOf(sheet);
    expect([x, width]).toEqual([0, 360]);
    expect(height).toBeLessThan(640);
    expect(y).toBeGreaterThan(0);
    expect(y + height).toBe(640);

    await sheet.getByRole("button", { name: "Modifier", exact: true }).click();
    await expect(dialog(page, "Modifier Claire").getByLabel("Prénom")).toBeFocused();
    await expect.poll(() => boxOf(dialog(page, "Modifier Claire"))).toEqual([0, 0, 360, 640]);
  });

  test("K1.7: with an iPhone's keyboard, the sheet follows the visible area", async ({ page, seededEvent }) => {
    await fakeVisualViewport(page);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const firstName = form.getByLabel("Prénom");
    const span = async () => {
      const { top, bottom } = await edgesOf(form);
      return [Math.round(top), Math.round(bottom)];
    };

    await moveVisibleArea(page, { height: 340, offsetTop: 0 }, "resize");
    await expect.poll(span).toEqual([0, 340]);
    expect((await edgesOf(close(form))).bottom).toBeLessThanOrEqual(340.5);
    await expect(firstName).toBeFocused();

    // Safari moved what it shows, to show the field.
    await moveVisibleArea(page, { offsetTop: 120 }, "scroll");
    await expect.poll(span).toEqual([120, 460]);
    for (const inside of [firstName, submit(form), close(form)]) {
      const { top, bottom } = await edgesOf(inside);
      expect(top).toBeGreaterThanOrEqual(120);
      expect(bottom).toBeLessThanOrEqual(460.5);
    }

    // The keyboard closed.
    await moveVisibleArea(page, { height: 640, offsetTop: 0 }, "resize");
    await expect.poll(span).toEqual([0, 640]);
  });

  test("K1.9: offline, the failure is in the bar, just above « Valider », which keeps the focus", async ({ context, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await form.getByLabel("Prénom").fill("Clara");
    await context.setOffline(true);
    await submit(form).click();

    const failure = form.getByRole("alert").filter({ hasText: OFFLINE });
    await expect(failure).toBeInViewport({ ratio: 1 });
    await expect(submit(form)).toBeFocused();
    expect(await failure.evaluate((node) => !!node.closest('[data-slot="sheet-footer"]'))).toBe(true);
    // Nothing between them: the bar's next thing after the failure is « Valider ».
    const next = await barOf(form).evaluate((bar, text) => {
      const shown = Array.from(bar.querySelectorAll("p, button")).filter((node) => node.getBoundingClientRect().height > 0);
      const at = shown.findIndex((node) => node.textContent === text);
      return shown[at + 1]?.textContent;
    }, OFFLINE);
    expect(next).toBe("Valider");
    const [message, button] = await Promise.all([edgesOf(failure), edgesOf(submit(form))]);
    expect(button.top - message.bottom).toBeGreaterThanOrEqual(0);
    expect(button.top - message.bottom).toBeLessThanOrEqual(8.5);
  });

  test("K1.11: the focus order holds, and Enter in a field still sends the form", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await form.getByLabel("Téléphone (facultatif)").focus();
    await page.keyboard.press("Tab");
    await expect(submit(form)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close(form)).toBeFocused();

    await form.getByLabel("Prénom").fill("Clara");
    await form.getByLabel("Prénom").press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Clara", exact: true })).toBeFocused();
    const row = await db.selectFrom("person").select("first_name").where("id", "=", scene.claire).executeTakeFirstOrThrow();
    expect(row.first_name).toBe("Clara");
  });

  test("K1.16: Tab on each action of the cell « Tom · Aller », at 360 × 300, keeps it clear of the header and the bar", async ({ page, seededEvent }) => {
    await page.setViewportSize({ width: 360, height: 300 });
    await page.goto(`/e/${seededEvent.id}`);
    await section(page).getByRole("button", { name: /^Tom, Aller : / }).click();
    const sheet = dialog(page, "Tom · Aller");
    await settled(sheet);
    expect(await sheet.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const actions = ["Voir la voiture", "Sortir de la voiture", "Ne fait pas l’aller"].map((name) => sheet.getByRole("button", { name }));
    await expect(actions[0]).toBeFocused();
    await expectClearOfFixedParts(sheet, actions[0]);
    for (const action of [...actions.slice(1), close(sheet)]) {
      await page.keyboard.press("Tab");
      await expect(action).toBeFocused();
      await expectClearOfFixedParts(sheet, action);
    }
    for (const action of actions.toReversed()) {
      await page.keyboard.press("Shift+Tab");
      await expect(action).toBeFocused();
      await expectClearOfFixedParts(sheet, action);
    }
  });

  test("rule 8: at 640 × 230, header and bar scroll with the body; with a visual viewport of 200 px too", async ({ page, seededEvent }) => {
    await fakeVisualViewport(page);
    await page.setViewportSize({ width: 640, height: 230 });
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const title = form.getByRole("heading", { name: "Modifier Claire" });
    const phone = form.getByLabel("Téléphone (facultatif)");

    const scrollsWhole = async (bottom: number) => {
      expect(await form.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await phone.focus();
      const { top, bottom: phoneBottom } = await edgesOf(phone);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(phoneBottom).toBeLessThanOrEqual(bottom);
      await form.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect(title).not.toBeInViewport();
      expect((await edgesOf(headerOf(form))).bottom).toBeLessThanOrEqual(0);
      await form.evaluate((element) => element.scrollTo({ top: 0 }));
      expect((await edgesOf(barOf(form))).top).toBeGreaterThanOrEqual(bottom);
    };
    await scrollsWhole(230);

    // The window is taller than 240 px, the visible area is not: a media query would miss it.
    await page.setViewportSize({ width: 640, height: 360 });
    await moveVisibleArea(page, { height: 200, offsetTop: 0 }, "resize");
    await expect.poll(async () => (await edgesOf(form)).bottom).toBeCloseTo(200, 0);
    await scrollsWhole(200);
  });
});

test.describe("sheet layout on a computer", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });
  const token = newToken();

  test("K1.14: at 1280 × 800, « Modifier Claire » is 448 px wide, centred, at its content's height, its top corners rounded", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const [x, y, width, height] = await boxOf(form);
    expect([x, width]).toEqual([416, 448]);
    expect(y).toBeGreaterThan(0);
    expect(y + height).toBe(800);
    const corners = await form.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopLeftRadius, style.borderTopRightRadius].map(parseFloat);
    });
    expect(corners.every((radius) => radius > 0)).toBe(true);
  });
});
