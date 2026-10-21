import type { Locator, Page } from "@playwright/test";
import { holdFirst } from "./device";
import { editEventInDb, removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath, test as organiserTest } from "./organiser";

/*
 * #262, epic #250: the state an action answers carries the event's header, and an open page
 * applies it (M7.1, M7.2): title, place, « Début » / « Fin », the tabs, the legs' dates and
 * `document.title`. The organiser changes the event in the database (`editEventInDb`), as
 * `updateEvent` will. Nothing here prints a token, the admin link or a number.
 */

leaveNoToken();

// The seed (src/db/test-events.ts): « Tournoi de Rennes », aller on 2026-12-12 at 07:30, retour at 18:00.
const BEFORE = "Tournoi de Rennes";
const CHANGE = {
  title: "Tournoi de Vannes",
  location: "Salle du Vincin",
  allerAt: "2026-12-13 08:15:00",
  retourAt: "2026-12-13 19:45:00",
};
const FR = {
  dates: ["Début", "Fin"],
  start: /^dimanche 13 décembre 2026 à 08:15$/,
  end: /^19:45$/,
  datetime: ["2026-12-13T08:15", "2026-12-13T19:45"],
  add: "Ajouter une personne",
  offer: "Proposer une voiture",
  both: "Aller et retour",
};

const header = (page: Page) => page.locator("header").first();
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const tabs = (page: Page) => page.getByRole("tab");
const allerAlone = (page: Page) => page.getByRole("region", { name: "Aller", exact: true });
const form = (page: Page, name: string) => page.getByRole("dialog", { name });

/** The header, `document.title` and the board as the change made them. */
async function expectChanged(page: Page) {
  await expect(title(page)).toHaveText(CHANGE.title);
  await expect(page).toHaveTitle(CHANGE.title);
  await expect(header(page)).toContainText(CHANGE.location);
  await expect(header(page).locator("dt")).toHaveText(FR.dates);
  await expect(header(page).locator("dd")).toHaveText([FR.start, FR.end]);
  for (const [n, datetime] of FR.datetime.entries()) {
    await expect(header(page).locator("time").nth(n)).toHaveAttribute("datetime", datetime);
  }
}

/** Clicks a tab until it is selected: a click before hydration does nothing. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The page open, its device known: « Ajouter une personne » waits for it (C5.9). */
async function open(page: Page, path: string, scope: (page: Page) => Locator = (each) => each.getByRole("tabpanel")) {
  await page.goto(path);
  await expect(scope(page).getByRole("button", { name: FR.add, exact: true })).toBeEnabled();
}

/**
 * Registers `firstName` from the aller, for the aller alone, its answer held until the
 * returned `answer()`; the sheet closed meanwhile, as « Fermer » allows. Its trigger, in the
 * aller's panel, has the focus back.
 */
async function sendHeldRegistration(page: Page, scope: Locator, firstName: string, hasRetour: boolean) {
  const answer = await holdFirst(page, firstName, false);
  await scope.getByRole("button", { name: FR.add, exact: true }).click();
  await form(page, FR.add).getByLabel("Prénom").fill(firstName);
  if (hasRetour) await form(page, FR.add).getByLabel(FR.both).uncheck();
  await form(page, FR.add).getByRole("button", { name: "Valider" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return answer;
}

/** `firstName` is shown without a car at the aller: the answer is applied. */
const expectRegistered = (page: Page, firstName: string) =>
  expect(page.getByRole("region", { name: "Sans voiture" }).getByText(firstName)).toBeVisible();

test.describe("an open page applies the event's header", () => {
  test.use({ locale: "fr-FR" });

  test("M7.1: changed, then reloaded: the new values", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expect(title(page)).toHaveText(BEFORE);
    await editEventInDb(db, seededEvent.id, CHANGE);
    await page.reload();
    await expectChanged(page);
  });

  test("M7.2: changed, then an action, without a reload: the new values, and the forms' dates", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await page.evaluate(() => Object.assign(window, { notReloaded: true }));
    await editEventInDb(db, seededEvent.id, CHANGE);
    // Nothing tells the page until its next action.
    await expect(title(page)).toHaveText(BEFORE);

    await page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true }).click();
    await form(page, FR.add).getByLabel("Prénom").fill("Inès");
    await form(page, FR.add).getByRole("button", { name: "Valider" }).click();
    await expect(form(page, FR.add)).toHaveCount(0);
    await expectChanged(page);
    expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);

    // « Proposer une voiture » opened after it: the time of the leg changed.
    await page.getByRole("tabpanel").getByRole("button", { name: FR.offer, exact: true }).click();
    const time = form(page, FR.offer).getByLabel("Heure de départ", { exact: true });
    await expect(time).toHaveValue("08:15");
    await expect(time).toHaveAccessibleDescription("Le dimanche 13 décembre 2026");
  });

  test("the retour removed, then an action: no more tabs, the aller shown, and the focus on the title", async ({
    page,
    db,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}`);
    const answer = await sendHeldRegistration(page, page.getByRole("tabpanel"), "Inès", true);
    await expect(page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true })).toBeFocused();
    await removeRetourInDb(db, seededEvent.id);
    answer();

    await expect(tabs(page)).toHaveCount(0);
    await expectRegistered(page, "Inès");
    await expect(allerAlone(page)).toBeVisible();
    await expect(header(page).locator("dt")).toHaveText(["Début"]);
    // The button that had the focus was in the tabs: never <body>.
    await expect(title(page)).toBeFocused();
  });

  test("the Retour tab that had the focus goes: the aller shown, and the focus on the title", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const answer = await sendHeldRegistration(page, page.getByRole("tabpanel"), "Inès", true);
    await selectTab(page, "Retour");
    await expect(page.getByRole("tab", { name: /^Retour/ })).toBeFocused();
    await removeRetourInDb(db, seededEvent.id);
    answer();

    await expect(tabs(page)).toHaveCount(0);
    await expect(allerAlone(page)).toBeVisible();
    await expectRegistered(page, "Inès");
    await expect(title(page)).toBeFocused();

    // A retour added again: its tabs come back with the aller active, not the tab that went.
    await editEventInDb(db, seededEvent.id, { retourAt: "2026-12-12 18:00:00" });
    const answerAgain = await sendHeldRegistration(page, allerAlone(page), "Hugo", false);
    answerAgain();
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.getByRole("tab", { name: /^Aller/ })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("an open page without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("a retour added, then an action: the tabs, Aller active, and the focus on the title", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`, allerAlone);
    await expect(tabs(page)).toHaveCount(0);
    const answer = await sendHeldRegistration(page, allerAlone(page), "Inès", false);
    await editEventInDb(db, seededEvent.id, { retourAt: "2026-12-12 18:00:00" });
    answer();

    await expect(tabs(page)).toHaveCount(2);
    await expect(page.getByRole("tab", { name: /^Aller/ })).toHaveAttribute("aria-selected", "true");
    await expect(header(page).locator("dt")).toHaveText(FR.dates);
    await expectRegistered(page, "Inès");
    await expect(title(page)).toBeFocused();
  });
});

organiserTest.describe("the organiser's page", () => {
  organiserTest.use({ locale: "fr-FR" });

  organiserTest("after an action, the header and the panel's dates are the new ones", async ({ page, db, seededEvent }) => {
    await open(page, organiserPath(seededEvent));
    const panel = page.getByRole("region", { name: "Espace organisateur" });
    await expect(panel.getByRole("button", { name: "Actualiser" })).toBeVisible();
    await editEventInDb(db, seededEvent.id, CHANGE);

    await page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true }).click();
    await form(page, FR.add).getByLabel("Prénom").fill("Inès");
    await form(page, FR.add).getByRole("button", { name: "Valider" }).click();
    await expect(form(page, FR.add)).toHaveCount(0);

    await expect(title(page)).toHaveText(CHANGE.title);
    await expect(page).toHaveTitle(CHANGE.title);
    const legTime = (leg: string) => panel.getByRole("region", { name: leg, exact: true }).locator("time");
    await expect(legTime("Aller")).toHaveAttribute("datetime", FR.datetime[0]);
    await expect(legTime("Retour")).toHaveAttribute("datetime", FR.datetime[1]);
  });
});
