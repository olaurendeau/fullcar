import type { Locator, Page, Route } from "@playwright/test";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { placeOf } from "./tiles";
import { areaRefused, expect, holdActionsWith, isAction, keepAdminToken, oneCharOff, organiserPath, test } from "./organiser";
import { answerFor } from "./photon";
import { namedPlace, textOf } from "./place-field";

/*
 * #485, epic #238 (event-map v15, « L’événement sans position … côté organisateur », CA2.1): on
 * `/e/{id}/admin`, the link checked, an event without a position has, in each leg, in place of the
 * « Carte » button, the organiser's sentence and its own « Modifier l’événement ». It opens the
 * sheet even with the organiser area folded; closed, the focus goes back to it, or to « Carte » of
 * its leg once a position is saved; never to `<body>`. The position comes from the slot's fake
 * Photon, at `placeOf` the event's id: the map is never opened, no tile is asked. Each test runs
 * under `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

const FR = {
  hint: "Pour afficher la carte, choisissez le lieu de l’événement parmi les propositions.",
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  panel: "Espace organisateur",
};

const area = (page: Page) => page.getByRole("region", { name: FR.panel });
const fold = (page: Page) => page.getByRole("button", { name: FR.panel, exact: true });
const tabPanel = (page: Page) => page.getByRole("tabpanel");
const hint = (scope: Page | Locator) => scope.getByText(FR.hint, { exact: true });
const hintButton = (scope: Page | Locator) => scope.getByRole("button", { name: FR.edit, exact: true });
const mapButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Carte", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const closeBar = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });

/** What has the focus: never `<body>` (CA2.1). */
const onBody = (page: Page) => page.evaluate(() => document.activeElement === null || document.activeElement === document.body);

/** The organiser's page, its panel shown: the link has been checked. */
async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  await expect(fold(page)).toBeVisible();
}

/** The organiser area folded: its own « Modifier l’événement » is no longer shown. */
async function foldArea(page: Page) {
  await fold(page).click();
  await expect(fold(page)).toHaveAttribute("aria-expanded", "false");
  await expect(hintButton(area(page))).toHaveCount(0);
}

/** Clicks a tab until it is selected. */
async function selectTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The sheet opened from the sentence of the leg shown. */
async function openFromHint(page: Page) {
  await hintButton(tabPanel(page)).click();
  await expect(sheet(page)).toBeVisible();
}

/** A suggestion chosen for the place, at `placeOf` the event's id. */
async function choosePlace(page: Page, eventId: string) {
  const { lat, lng } = placeOf(eventId);
  const salle = namedPlace("Salle des fêtes", lat, lng);
  const text = textOf("Salle des f");
  await answerFor(text, { features: [salle.feature] });
  await field(page, "Lieu").fill(text);
  await sheet(page).getByRole("option").first().click();
  await expect(sheet(page).getByText(`Position : ${salle.label}`, { exact: true })).toBeVisible();
}

/** Holds every change sent from now on (the actions whose body carries the form's fields), until `release`. */
async function holdEdits(page: Page) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes('"allerDate"') ? void held.push(route) : route.fallback()),
  );
  return {
    held: () => held.length,
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
  };
}

/** « Valider », the change saved: the sheet closes and the bar says so. */
async function save(page: Page) {
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
}

test.describe("CA2.1: the organiser's sentence, an event without a position", () => {
  test.use({ locale: "fr-FR" });

  test("on /e/{id}, neither the sentence nor its button", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(tabPanel(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Proposer une voiture" })).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
    await expect(hintButton(page)).toHaveCount(0);
  });

  test("on /admin, the area refused, neither the sentence nor its button", async ({ page, seededEvent }) => {
    await keepAdminToken(page, seededEvent.id, oneCharOff(seededEvent.token));
    await page.goto(organiserPath(seededEvent));
    await expect(page.getByRole("button", { name: "Proposer une voiture" })).toBeVisible();
    await expect(areaRefused(page)).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
    await expect(hintButton(page)).toHaveCount(0);
  });

  test("on /admin, in each leg, the sentence then its button, after the actions, in place of « Carte »", async ({ page, seededEvent }) => {
    await openAdmin(page, organiserPath(seededEvent));
    for (const tab of [/^Aller/, /^Retour/]) {
      await selectTab(page, tab);
      const panel = tabPanel(page);
      await expect(hint(panel)).toBeVisible();
      await expect(hintButton(panel)).toBeVisible();
      await expect(mapButton(panel)).toHaveCount(0);
      const [offer, sentence, button] = await Promise.all(
        [panel.getByRole("button", { name: "Proposer une voiture" }), hint(panel), hintButton(panel)].map(async (each) => (await each.boundingBox())!),
      );
      expect(sentence.y).toBeGreaterThanOrEqual(offer.y + offer.height);
      expect(button.y).toBeGreaterThanOrEqual(sentence.y + sentence.height);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the area folded, the button opens the sheet; « Annuler » gives the focus back to it", async ({ page, seededEvent }) => {
    await openAdmin(page, organiserPath(seededEvent));
    await foldArea(page);
    await openFromHint(page);
    await sheet(page).getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(hintButton(tabPanel(page))).toBeFocused();
  });

  test("« Valider » without a position: « Événement modifié. », the focus on the button, which is the message's landmark", async ({
    page,
    seededEvent,
  }) => {
    await openAdmin(page, organiserPath(seededEvent));
    await foldArea(page);
    await openFromHint(page);
    await field(page, "Titre").fill("Tournoi de Rennes U13");
    await save(page);
    await expect(hintButton(tabPanel(page))).toBeFocused();
    await expect(hint(tabPanel(page))).toBeVisible();

    await closeBar(page).click();
    await expect(messages(page)).toHaveCount(0);
    await expect(hintButton(tabPanel(page))).toBeFocused();
  });

  test("« Valider » with a position chosen, from the retour: the focus on « Carte » of the retour, the message's landmark; the sentence gone", async ({
    page,
    seededEvent,
  }) => {
    await openAdmin(page, organiserPath(seededEvent));
    await foldArea(page);
    await selectTab(page, /^Retour/);
    await openFromHint(page);
    await choosePlace(page, seededEvent.id);
    await save(page);
    const retour = tabPanel(page);
    await expect(mapButton(retour)).toBeFocused();
    await expect(mapButton(retour)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("tab", { name: /^Retour/ })).toHaveAttribute("aria-selected", "true");
    await expect(hint(page)).toHaveCount(0);

    await closeBar(page).click();
    await expect(messages(page)).toHaveCount(0);
    await expect(mapButton(retour)).toBeFocused();
  });

  test("opened from the area's own button, the focus goes back to it, not to the sentence's", async ({ page, seededEvent }) => {
    await openAdmin(page, organiserPath(seededEvent));
    await hintButton(area(page)).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(hintButton(area(page))).toBeFocused();
  });

  test("from the retour's sentence, the retour removed: the focus on the event's title, never on <body>", async ({ page, seededEvent }) => {
    await openAdmin(page, organiserPath(seededEvent));
    await selectTab(page, /^Retour/);
    await openFromHint(page);
    await sheet(page).getByRole("checkbox", { name: "Retour", exact: true }).uncheck();
    await save(page);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    expect(await onBody(page)).toBe(false);

    await closeBar(page).click();
    await expect(messages(page)).toHaveCount(0);
    expect(await onBody(page)).toBe(false);
  });

  test("while a change is sent, the sentence's button is inactive too", async ({ page, seededEvent }) => {
    const edits = await holdEdits(page);
    await openAdmin(page, organiserPath(seededEvent));
    await openFromHint(page);
    await field(page, "Titre").fill("Tournoi de Rennes U13");
    await submit(page).click();
    await expect.poll(edits.held).toBe(1);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(hintButton(tabPanel(page))).toHaveAttribute("aria-disabled", "true");
    await edits.release();
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(hintButton(tabPanel(page))).not.toHaveAttribute("aria-disabled");
  });

  test("closed by Escape while a position is sent, the late `saved` takes the sentence away: the focus on « Carte » of that leg, never on <body>", async ({
    page,
    seededEvent,
  }) => {
    const edits = await holdEdits(page);
    await openAdmin(page, organiserPath(seededEvent));
    await foldArea(page);
    await openFromHint(page);
    await choosePlace(page, seededEvent.id);
    await submit(page).click();
    await expect.poll(edits.held).toBe(1);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(hintButton(tabPanel(page))).toBeFocused();

    await edits.release();
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(hint(page)).toHaveCount(0);
    await expect(mapButton(tabPanel(page))).toBeFocused();
    expect(await onBody(page)).toBe(false);
  });

  test("after a failed check of the link, neither the sentence nor its button", async ({ page, seededEvent }) => {
    const held = await holdActionsWith(page, seededEvent.token);
    await page.goto(organiserPath(seededEvent));
    await expect.poll(held.held).toBe(1);
    await held.fail();
    await expect(page.getByText("L’espace organisateur n’a pas pu être chargé.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Proposer une voiture" })).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
    await expect(hintButton(page)).toHaveCount(0);
  });
});

test.describe("CA2.1 without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("the only section has the sentence and its button", async ({ page, seededEvent }) => {
    await openAdmin(page, organiserPath(seededEvent));
    const section = page.getByRole("region", { name: "Aller", exact: true });
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(hint(section)).toBeVisible();
    await expect(hintButton(section)).toBeVisible();
  });
});

test.describe("CA2.1 in English", () => {
  test.use({ locale: "en-US" });

  test("the sentence and « Edit the event »", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    const panel = tabPanel(page);
    await expect(panel.getByText("To show the map, pick the event’s place from the suggestions.", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Edit the event", exact: true })).toBeVisible();
  });
});
