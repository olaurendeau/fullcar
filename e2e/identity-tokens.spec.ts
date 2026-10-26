import type { Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { colour, css, expectColour, gap, ratio, token } from "./colour";
import { contrast } from "./contrast";
import { failActions, holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #681, visual-identity v3 (#651): the petrol in `--primary`, the success bar kept dark by
// `--inverse`, and `--brand-soft` (VI1, VI3.5, VI5.1, VI5.2). Colours read by `./colour`.

const PETROL = "rgb(0, 90, 91)";
const LIGHT = "rgb(250, 250, 250)";
const INVERSE = "rgb(23, 23, 23)";
/** `primary/80` composed on white: the default button under the mouse. */
const PETROL_HOVERED = "rgb(51, 123, 124)";

const createLink = (page: Page) => page.getByRole("link", { name: "Créer un événement", exact: true });

test.describe("the tokens on /", () => {
  test.use({ locale: "fr-FR" });

  test("VI1.1: « Créer un événement » is petrol, its text #fafafa", async ({ page }) => {
    await page.goto("/");
    await expectColour(createLink(page), "background-color", PETROL, "« Créer un événement »");
    await expectColour(createLink(page), "color", LIGHT, "« Créer un événement »");
  });

  test("VI5.1: the text of « Créer un événement » on its petrol is 7.70:1", async ({ page }) => {
    await page.goto("/");
    const measured = await contrast(createLink(page), createLink(page));
    expect(measured).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(measured - 7.7), `${measured.toFixed(2)}:1, not 7.70:1 ±0.05`).toBeLessThanOrEqual(0.05);
  });

  test("VI1.4: --brand-soft reads #e5f8f8 and --inverse #171717", async ({ page }) => {
    await page.goto("/");
    for (const [name, expected] of [["--brand-soft", "rgb(229, 248, 248)"], ["--inverse", INVERSE]] as const) {
      const read = await token(page, name);
      expect(gap(read, expected), `${name}: ${css(read)}, not ${expected} ±1`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("the tokens on / with a mouse, 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("VI5.2: « Créer un événement » hovered, primary/80 on white, keeps its text at 4.72:1", async ({ page }) => {
    await page.goto("/");
    await createLink(page).hover();
    await expectColour(createLink(page), "background-color", PETROL_HOVERED, "« Créer un événement » hovered");
    const measured = ratio(await colour(createLink(page), "color"), await colour(createLink(page), "background-color"));
    expect(measured).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(measured - 4.72), `${measured.toFixed(2)}:1, not 4.72:1 ±0.05`).toBeLessThanOrEqual(0.05);
  });
});

test.describe("the message bar", () => {
  test.use({ locale: "fr-FR" });
  const deviceToken = newToken();

  // The device holds Tom, without a car on both legs; Sophie, of another device, drives nobody at the aller.
  test.beforeEach(async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const tom = (await seedPerson(db, id, { firstName: "Tom" }, deviceToken)).id;
    await seedRide(db, id, (await seedPerson(db, id, { firstName: "Sophie" })).id);
    for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId: tom, eventId: id, leg, rideId: null });
    await holdToken(page, id, deviceToken);
  });

  const bar = (page: Page) => page.locator('[data-message-bar="open"]');
  const seat = (page: Page) =>
    page.getByRole("tabpanel").getByRole("button", { name: "Place libre : prendre une place dans la voiture de Sophie" }).first();

  test("VI1.2: a success alone: the bar is #171717, its text and « Annuler »'s #fafafa", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page).click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
    await expectColour(bar(page), "background-color", INVERSE, "the success bar");
    await expectColour(bar(page), "color", LIGHT, "the success bar");
    await expectColour(bar(page).getByRole("button", { name: "Annuler" }), "color", LIGHT, "« Annuler »");
  });

  test("VI3.5: a failure: the bar stays white, bordered in red", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    // The device's persons are read first: only the tap fails.
    await expect(seat(page)).toBeEnabled();
    await failActions(page);
    await seat(page).click();
    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant."]);
    await expectColour(bar(page), "background-color", "rgb(255, 255, 255)", "the failing bar");
    await expectColour(bar(page), "border-top-color", "rgb(231, 0, 11)", "the failing bar");
  });
});
