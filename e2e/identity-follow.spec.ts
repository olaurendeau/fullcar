import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { colour, css, expectColour, ratio } from "./colour";
import { contrast } from "./contrast";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath, test as organiserTest } from "./organiser";

leaveNoToken();

// #686, visual-identity v3 (#651): where the petrol of `--primary` follows the token with no
// class changed (VI2.6, VI2.7, VI2.9 to VI2.11), where it does not appear (VI3.1 to VI3.4), and
// the contrast it keeps (VI5.8, VI5.13). Colours read by `./colour`, ±1 on each channel.

const PETROL = "rgb(0, 90, 91)";
const WHITE = "rgb(255, 255, 255)";
/** `--muted`, unchanged by the design. */
const MUTED = "rgb(245, 245, 245)";
/** `--muted-foreground`, unchanged by the design. */
const DISCREET = "rgb(115, 115, 115)";

/** A ratio within ±0.05 of the design's, and above its threshold. */
function expectRatio(measured: number, expected: number, threshold: number, what: string) {
  expect(measured, `${what}: ${measured.toFixed(2)}:1, under ${threshold}:1`).toBeGreaterThanOrEqual(threshold);
  expect(Math.abs(measured - expected), `${what}: ${measured.toFixed(2)}:1, not ${expected.toFixed(2)}:1 ±0.05`).toBeLessThanOrEqual(0.05);
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });

/** Clicks a tab until it is selected: a click before hydration does nothing. */
async function selectTab(page: Page, name: "Aller" | "Retour") {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

test.describe("the board, everyone seated at the aller, seats to spare at the retour", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  // The device holds Tom. Aller: Marc drives him, one seat. Retour: Sophie drives nobody, two
  // seats, and Tom is without a car.
  test.beforeEach(async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const tom = (await seedPerson(db, id, { firstName: "Tom" }, token)).id;
    const marc = await seedRide(db, id, (await seedPerson(db, id, { firstName: "Marc" })).id, { seats: 1 });
    await seedRide(db, id, (await seedPerson(db, id, { firstName: "Sophie" })).id, { leg: "retour", seats: 2, departureTime: "18:00:00" });
    await seedPlacement(db, { personId: tom, eventId: id, leg: "aller", rideId: marc });
    await seedPlacement(db, { personId: tom, eventId: id, leg: "retour", rideId: null });
    await holdToken(page, id, token);
  });

  test("VI3.1: « Tout le monde a une place » and « 1 sans voiture · 2 places libres » stay grey", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const banner = panel(page).getByRole("status");
    await expect(banner).toHaveText("Tout le monde a une place");
    await expectColour(banner, "background-color", MUTED, "« Tout le monde a une place »");
    await selectTab(page, "Retour");
    await expect(banner).toHaveText("1 sans voiture · 2 places libres");
    await expectColour(banner, "background-color", MUTED, "« 1 sans voiture · 2 places libres »");
  });

  test("VI3.3: the cell « Avec Marc » and Tom's line in Marc's car stay grey", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(cell(page, "Tom", "Aller")).toHaveText("Avec Marc");
    await expectColour(cell(page, "Tom", "Aller"), "background-color", MUTED, "the cell « Avec Marc »");
    const line = car(panel(page), "Marc").getByRole("listitem").filter({ hasText: "Tom" });
    await expect(line).toHaveCount(1);
    await expectColour(line, "background-color", MUTED, "Tom's line in Marc's car");
  });

  test("VI2.6: « Trouver une place », in the sheet of Tom's cell of the retour, is petrol", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Retour").click();
    const findSeat = page.getByRole("dialog", { name: "Tom · Retour" }).getByRole("button", { name: "Trouver une place" });
    await expect(findSeat).toBeVisible();
    await expectColour(findSeat, "background-color", PETROL, "« Trouver une place »");
  });

  test("VI3.2: the body of /e/{id} is white", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expectColour(page.locator("body"), "background-color", WHITE, "the body of /e/{id}");
  });
});

test.describe("the board, seats missing", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  // The device holds Tom, without a car on both legs, and no car is offered: « il manque 1 place ».
  test.beforeEach(async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const tom = (await seedPerson(db, id, { firstName: "Tom" }, token)).id;
    for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId: tom, eventId: id, leg, rideId: null });
    await holdToken(page, id, token);
  });

  test("VI2.6: « Proposer une voiture », seats missing, is petrol", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(panel(page).getByRole("status")).toHaveText("1 sans voiture · il manque 1 place");
    const offer = panel(page).getByRole("button", { name: "Proposer une voiture", exact: true });
    await expect(offer).toBeEnabled();
    await expectColour(offer, "background-color", PETROL, "« Proposer une voiture »");
  });

  test("VI2.7, VI5.8: in « Ajouter une personne », « Aller et retour » checked is petrol, 8.04:1 against the sheet", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await panel(page).getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Ajouter une personne" });
    const both = sheet.getByLabel("Aller et retour");
    await expect(both).toBeChecked();
    await expectColour(both, "background-color", PETROL, "« Aller et retour », checked");
    await expectColour(sheet, "background-color", WHITE, "the sheet");
    const box = await colour(both, "background-color");
    const behind = await colour(sheet, "background-color");
    expectRatio(ratio(box, behind), 8.04, 3, `the box ${css(box)} against the sheet ${css(behind)}`);
  });
});

test.describe("/nouveau", () => {
  test.use({ locale: "fr-FR" });

  /** The form, once hydrated: « Créer » stays inactive until then (create-event.spec.ts). */
  async function openForm(page: Page) {
    await page.goto("/nouveau");
    await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled({ timeout: 15_000 });
  }

  test("VI2.9, VI5.13: « Créer », hydrated, is petrol, its text at 7.70:1", async ({ page }) => {
    await openForm(page);
    const create = page.getByRole("button", { name: "Créer" });
    await expectColour(create, "background-color", PETROL, "« Créer »");
    expectRatio(await contrast(create, create), 7.7, 4.5, "the text of « Créer »");
  });

  test("VI2.10: « Retour », checked by default, is petrol; unchecked, it is not, nor are the options", async ({ page }) => {
    await openForm(page);
    const retour = page.getByLabel("Retour", { exact: true });
    await expect(retour).toBeChecked();
    await expectColour(retour, "background-color", PETROL, "« Retour », checked");
    await retour.click();
    await expect(retour).not.toBeChecked();
    await expectColour(retour, "background-color", WHITE, "« Retour », unchecked");
    const options = page.getByRole("group", { name: "Options" });
    for (const label of ["Rehausseurs", "Participation aux frais", "Points de RDV"]) {
      const option = options.getByLabel(label, { exact: true });
      await expect(option).not.toBeChecked();
      await expectColour(option, "background-color", WHITE, `« ${label} », unchecked`);
    }
  });

  test("VI3.4: the footer's links and « English » stay #737373", async ({ page }) => {
    await openForm(page);
    const footer = page.locator("footer");
    const names = ["Accueil", "Confidentialité", "Code source sur GitHub (s’ouvre dans un nouvel onglet)", "Nous contacter (s’ouvre dans un nouvel onglet)"];
    await expect(footer.getByRole("link")).toHaveCount(names.length);
    for (const name of names) {
      await expectColour(footer.getByRole("link", { name, exact: true }), "color", DISCREET, `« ${name} »`);
    }
    await expectColour(footer.getByRole("button", { name: "English", exact: true }), "color", DISCREET, "« English »");
  });
});

test.describe("the body", () => {
  test.use({ locale: "fr-FR" });

  for (const path of ["/", "/nouveau"]) {
    test(`VI3.2: the body of ${path} is white`, async ({ page }) => {
      await page.goto(path);
      await expectColour(page.locator("body"), "background-color", WHITE, `the body of ${path}`);
    });
  }
});

organiserTest.describe("the organiser area, with native sharing", () => {
  organiserTest.use({ locale: "fr-FR" });

  const area = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
  const shareGroup = (page: Page) => area(page).getByRole("group", { name: "Lien à partager" });

  organiserTest.beforeEach(async ({ page }) => {
    // Before the page loads: Chromium headless has no native sharing, and « Partager » would be absent.
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} }));
  });

  organiserTest("VI2.11, VI5.13: « Partager » is petrol, its text at 7.70:1; « Copier » stays white", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    const share = shareGroup(page).getByRole("button", { name: "Partager", exact: true });
    const copy = shareGroup(page).getByRole("button", { name: "Copier", exact: true });
    await expect(share).toBeVisible();
    await expectColour(share, "background-color", PETROL, "« Partager »");
    expectRatio(await contrast(share, share), 7.7, 4.5, "the text of « Partager »");
    await expectColour(copy, "background-color", WHITE, "« Copier »");
  });

  organiserTest("VI3.2: the body of /e/{id}/admin is white", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(area(page)).toBeVisible();
    await expectColour(page.locator("body"), "background-color", WHITE, "the body of /e/{id}/admin");
  });
});
