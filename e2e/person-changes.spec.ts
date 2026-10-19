import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { bar, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #89: acting from « Vos inscriptions », each cell a button that opens its sheet.

const FAILED = "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.";

type Db = Kysely<Database>;

/**
 * The device holds Claire, Léa, Tom and Hugo.
 * Aller: Claire drives Inès; Marc drives Léa; Tom is without a car; Hugo is not concerned.
 * Retour: Zoé drives Tom; Claire is without a car; Léa and Hugo are not concerned.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const place = (personId: string, leg: Leg, rideId: string | null) =>
    seedPlacement(db, { personId, eventId, leg, rideId });

  const persons = { claire: await mine("Claire"), lea: await mine("Léa"), tom: await mine("Tom"), hugo: await mine("Hugo") };
  const marc = await other("Marc");
  const ines = await other("Inès");
  const zoe = await other("Zoé");
  const cars = {
    claire: await seedRide(db, eventId, persons.claire, { departureTime: "07:00:00" }),
    marc: await seedRide(db, eventId, marc),
    zoe: await seedRide(db, eventId, zoe, { leg: "retour" }),
  };
  await place(ines, "aller", cars.claire);
  await place(persons.lea, "aller", cars.marc);
  await place(persons.tom, "aller", null);
  await place(persons.tom, "retour", cars.zoe);
  await place(persons.claire, "retour", null);
  return { persons, cars };
}

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db
    .selectFrom("placement")
    .select(["leg", "ride_id"])
    .where("event_id", "=", eventId)
    .where("person_id", "=", personId)
    .execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

const section = (scope: Page | Locator) => scope.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Locator) => scope.getByRole("button", { name: /^Place libre : / });
const banner = (page: Page) => page.getByRole("tabpanel").getByRole("status").filter({ hasText: /\S/ });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const withoutCarList = (page: Page) => page.getByRole("tabpanel").getByRole("region", { name: "Sans voiture" });
const alerts = (scope: Page | Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });

/** Every cell's accessible name, row by row. */
async function cellNames(page: Page) {
  return section(page).locator("tbody td button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
}

/** Marks the document: a reload would lose the mark (C9.4). */
async function markDocument(page: Page) {
  await page.evaluate(() => document.documentElement.setAttribute("data-not-reloaded", ""));
}

async function selectTab(page: Page, leg: "Aller" | "Retour") {
  await expect(async () => {
    await tab(page, leg).click();
    await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** A cell, found while a sheet hides the page from role queries. */
const hiddenCell = (page: Page, name: string) => page.locator(`button[aria-label="${name}"]`);
const slowClose = '[role="dialog"][data-state="closed"] { animation-duration: 2s !important; }';

/** The sheet's actions, « Fermer » last. */
async function actions(dialog: Locator) {
  return dialog.getByRole("button").allTextContents();
}

test.describe("person changes", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C3.7: each cell is a button of 44 px, named by its person, its leg and its visible text", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const lea = section(page).getByRole("button", { name: "Léa, Aller : Avec Marc", exact: true });
    await expect(lea).toHaveText("Avec Marc");
    await expect(lea).toHaveAttribute("aria-haspopup", "dialog");
    expect(await cellNames(page)).toEqual([
      "Claire, Aller : Conduit",
      "Claire, Retour : Sans voiture",
      "Léa, Aller : Avec Marc",
      "Léa, Retour : Ne fait pas le retour",
      "Tom, Aller : Sans voiture",
      "Tom, Retour : Avec Zoé",
      "Hugo, Aller : Ne fait pas l’aller",
      "Hugo, Retour : Ne fait pas le retour",
    ]);
    for (const button of await section(page).locator("tbody td button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("C3.1, C3.3, C3.5, C3.9, C9.4: « Ne fait pas l’aller » from « Sans voiture »", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(banner(page)).toHaveText("1 sans voiture · 4 places libres");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 1 sans voiture");
    await expect(toggle(page)).toContainText("4 personnes · 2 sans voiture");
    await expect(withoutCarList(page).getByRole("listitem")).toHaveText(["Tom"]);
    await markDocument(page);

    await cell(page, "Tom", "Aller").click();
    const tom = sheet(page, "Tom · Aller");
    await expect(tom.getByText("Sans voiture", { exact: true })).toBeVisible();
    expect(await actions(tom)).toEqual(["Ne fait pas l’aller", "Fermer"]);
    await tom.getByRole("button", { name: "Ne fait pas l’aller" }).click();

    await expect(tom).toHaveCount(0);
    const updated = section(page).getByRole("button", { name: "Tom, Aller : Ne fait pas l’aller", exact: true });
    await expect(updated).toBeFocused();
    // The other leg, the banner, the pill and the summary, without a reload.
    await expect(cell(page, "Tom", "Retour")).toHaveAccessibleName("Tom, Retour : Avec Zoé");
    await expect(banner(page)).toHaveText("Tout le monde a une place · 4 places libres");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller");
    await expect(toggle(page)).toContainText("4 personnes · 1 sans voiture");
    await expect(withoutCarList(page)).toHaveCount(0);
    await expect(page.locator("html[data-not-reloaded]")).toHaveCount(1);
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ retour: scene.cars.zoe });
  });

  test("C3.2, C3.5, C3.9, C9.4: « Je cherche une place » from « Ne fait pas le retour »", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Retour");
    await expect(banner(page)).toHaveText("1 sans voiture · 2 places libres");
    await markDocument(page);

    await cell(page, "Hugo", "Retour").click();
    const hugo = sheet(page, "Hugo · Retour");
    await expect(hugo.getByText("Ne fait pas le retour", { exact: true })).toBeVisible();
    expect(await actions(hugo)).toEqual(["Je cherche une place", "Fermer"]);
    await hugo.getByRole("button", { name: "Je cherche une place" }).click();

    await expect(hugo).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Hugo, Retour : Sans voiture", exact: true })).toBeFocused();
    await expect(cell(page, "Hugo", "Aller")).toHaveAccessibleName("Hugo, Aller : Ne fait pas l’aller");
    await expect(banner(page)).toHaveText("2 sans voiture · 2 places libres");
    await expect(tab(page, "Retour")).toHaveAccessibleName("Retour 2 sans voiture");
    await expect(toggle(page)).toContainText("4 personnes · 3 sans voiture");
    await expect(withoutCarList(page).getByRole("listitem")).toHaveText(["Claire", "Hugo"]);
    await expect(page.locator("html[data-not-reloaded]")).toHaveCount(1);
    expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ retour: null });
  });

  test("C7.1, C3.5: « Sortir de la voiture »: without a car, and the seat free again", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const marcs = car(page.getByRole("tabpanel"), "Marc");
    await expect(marcs.getByRole("listitem").first()).toHaveText("Léa");
    await expect(freeSeats(marcs)).toHaveCount(2);

    await cell(page, "Léa", "Aller").click();
    const lea = sheet(page, "Léa · Aller");
    await expect(lea.getByText("Dans la voiture de Marc", { exact: true })).toBeVisible();
    expect(await actions(lea)).toEqual(["Voir la voiture", "Sortir de la voiture", "Ne fait pas l’aller", "Fermer"]);
    await lea.getByRole("button", { name: "Sortir de la voiture" }).click();

    await expect(lea).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Léa, Aller : Sans voiture", exact: true })).toBeFocused();
    await expect(freeSeats(marcs)).toHaveCount(3);
    await expect(marcs.getByText("Léa")).toHaveCount(0);
    await expect(withoutCarList(page).getByRole("listitem")).toHaveText(["Tom", "Léa"]);
    await expect(cell(page, "Léa", "Retour")).toHaveAccessibleName("Léa, Retour : Ne fait pas le retour");
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });
  });

  test("C7.2, C3.3, C3.5: « Ne fait pas l’aller » from a passenger: the seat free, and gone from the leg", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await cell(page, "Léa", "Aller").click();
    await sheet(page, "Léa · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();

    await expect(section(page).getByRole("button", { name: "Léa, Aller : Ne fait pas l’aller", exact: true })).toBeFocused();
    await expect(freeSeats(car(panel, "Marc"))).toHaveCount(3);
    await expect(panel.getByText("Léa")).toHaveCount(0);
    await expect(withoutCarList(page).getByRole("listitem")).toHaveText(["Tom"]);
    await expect(cell(page, "Léa", "Retour")).toHaveAccessibleName("Léa, Retour : Ne fait pas le retour");
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({});
  });

  test("« Voir la voiture »: the leg's tab active, the focus on the car's title", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Retour").click();
    await sheet(page, "Tom · Retour").getByRole("button", { name: "Voir la voiture" }).click();
    await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Voiture de Zoé" })).toBeFocused();

    // A driver's cell, from the other tab: « Voir la voiture » alone.
    await cell(page, "Claire", "Aller").click();
    const claire = sheet(page, "Claire · Aller");
    await expect(claire.getByText("Conduit", { exact: true })).toBeVisible();
    expect(await actions(claire)).toEqual(["Voir la voiture", "Fermer"]);
    await claire.getByRole("button", { name: "Voir la voiture" }).click();
    await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Voiture de Claire" })).toBeFocused();
  });

  test("the sheet closes by « Fermer » and by Escape, the focus back on the cell", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Fermer" }).click();
    await expect(sheet(page, "Tom · Aller")).toHaveCount(0);
    await expect(cell(page, "Tom", "Aller")).toBeFocused();

    await cell(page, "Claire", "Retour").focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page, "Claire · Retour")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page, "Claire · Retour")).toHaveCount(0);
    await expect(cell(page, "Claire", "Retour")).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.claire)).toEqual({ retour: null });
  });

  test("C3.6: unfolded still once the last cell « Sans voiture » is gone", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await expect(sheet(page, "Tom · Aller")).toHaveCount(0);
    await cell(page, "Claire", "Retour").click();
    await sheet(page, "Claire · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();

    await expect(toggle(page)).toContainText("4 personnes · tout le monde a une place");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(section(page).getByRole("button", { name: "Claire, Retour : Ne fait pas le retour", exact: true })).toBeFocused();
  });

  test("C7.3: no action on the passengers of another device", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Claire", "Léa", "Tom", "Hugo"]);
    // On Claire's car, Inès is a line and nothing more: its only buttons are its free seats.
    const claires = car(page.getByRole("tabpanel"), "Claire");
    await expect(claires.getByRole("listitem").first()).toHaveText("Inès");
    await expect(claires.getByRole("button")).toHaveCount(2);
    await expect(freeSeats(claires)).toHaveCount(2);
  });

  test("C7.4: out in the meantime, « Sortir de la voiture » succeeds and changes nothing", async ({ browser, baseURL, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(cell(page, "Léa", "Aller")).toHaveAccessibleName("Léa, Aller : Avec Marc");

    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await holdToken(other, seededEvent.id, token);
      await other.goto(`/e/${seededEvent.id}`);
      await cell(other, "Léa", "Aller").click();
      await sheet(other, "Léa · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
      await expect(cell(other, "Léa", "Aller")).toHaveAccessibleName("Léa, Aller : Sans voiture");
    } finally {
      await context.close();
    }
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });

    // This page still shows her in Marc's car.
    await cell(page, "Léa", "Aller").click();
    await sheet(page, "Léa · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(sheet(page, "Léa · Aller")).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Léa, Aller : Sans voiture", exact: true })).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });
  });

  test("a refusal keeps the sheet open with its message, and the page shows the state", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    const tom = sheet(page, "Tom · Aller");
    await expect(tom).toBeVisible();
    // Meanwhile, Tom offers a car on the aller: he drives, and has no Placement there to change.
    await db.deleteFrom("placement").where("person_id", "=", scene.persons.tom).where("leg", "=", "aller").execute();
    await seedRide(db, seededEvent.id, scene.persons.tom);

    await tom.getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await expect(alerts(tom)).toHaveText(FAILED);
    await expect(tom.getByText("Conduit", { exact: true })).toBeVisible();
    // The action that had the focus is gone: the first one has it.
    await expect(tom.getByRole("button", { name: "Voir la voiture" })).toBeFocused();

    // The page shows the state the refusal carried; the message was the sheet's, not the bar's.
    await page.keyboard.press("Escape");
    await expect(tom).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Tom, Aller : Conduit", exact: true })).toBeFocused();
    await expect(car(page.getByRole("tabpanel"), "Tom")).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
  });

  test("offline, the sheet stays open and says so; nothing is written", async ({ context, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    const tom = sheet(page, "Tom · Aller");
    await context.setOffline(true);
    await tom.getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await expect(alerts(tom)).toHaveText("Action impossible, vérifiez la connexion");
    await expect(tom.getByText("Sans voiture", { exact: true })).toBeVisible();
    await context.setOffline(false);
    await tom.getByRole("button", { name: "Fermer" }).click();
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
    await expect(alerts(page)).toHaveCount(0);
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: scene.cars.zoe });
  });

  // Radix keeps a closing sheet mounted until its animation ends: slowed here, the answer comes
  // meanwhile. Reopened, even while the first one closes, the sheet is a new one.
  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the sheet is ${when}: in the bar, once no sheet hides the page`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, scene.persons.tom, true);
      await page.goto(`/e/${seededEvent.id}`);
      const closing = when.endsWith("closing");
      if (closing) await page.addStyleTag({ content: slowClose });
      await cell(page, "Tom", "Aller").click();
      await sheet(page, "Tom · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
      await page.keyboard.press("Escape");
      if (closing) await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
      else await expect(page.getByRole("dialog")).toHaveCount(0);
      const seen = await watchAlerts(page);
      const release = async () => {
        const responded = page.waitForResponse((response) => response.status() === 500);
        answer();
        await responded;
        if (closing) expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(1);
      };
      // Answered while the first sheet closes, then reopened: the new one takes its place in one commit.
      if (when === "reopened while closing") await release();
      const lea = sheet(page, "Léa · Aller");
      if (when.startsWith("reopened")) {
        await hiddenCell(page, "Léa, Aller : Avec Marc").focus();
        await page.keyboard.press("Enter");
        await expect(lea).toBeVisible();
      }
      if (when !== "reopened while closing") await release();
      if (when.startsWith("reopened")) {
        // Léa's change succeeds once Tom's has failed: it neither clears nor replaces that message.
        await expect(async () => {
          const sent = page.waitForRequest((request) => !!request.postData()?.includes(scene.persons.lea), { timeout: 1000 });
          await lea.getByRole("button", { name: "Sortir de la voiture" }).click();
          await sent;
        }).toPass();
        await expect(lea).toHaveCount(0);
      }
      await expect(bar(page)).toHaveText(FAILED);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(alerts(page)).toHaveText([FAILED]);
    });
  }

  // Next sends one server action at a time: the second waits for the first's answer, then goes.
  test("#167: an action in a sheet opened while another's change is on its way is sent after it", async ({
    page,
    seededEvent,
  }) => {
    const answer = await holdFirst(page, scene.persons.tom, false);
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await cell(page, "Léa", "Aller").click();
    await sheet(page, "Léa · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    answer();
    await expect(sheet(page, "Léa · Aller")).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Léa, Aller : Sans voiture", exact: true })).toBeFocused();
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Ne fait pas l’aller");
  });

  // Zed's registration fails while the form closes, then Tom's change, sent from his cell's
  // sheet meanwhile; the form, reopened before it has closed, sends again: that withdraws its
  // own waiting message, not Tom's.
  test("#167: two failures wait for the page together, and sending one again withdraws its own alone", async ({
    page,
    seededEvent,
  }) => {
    const zed = await holdFirst(page, "Zed", true);
    const tom = await holdFirst(page, scene.persons.tom, true);
    await page.goto(`/e/${seededEvent.id}`);
    // Slow enough for all that follows; removed once the form is open again.
    const slow = await page.addStyleTag({ content: slowClose.replace("2s", "30s") });
    await page.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    const form = sheet(page, "Ajouter une personne");
    await form.getByLabel("Prénom").fill("Zed");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(form.getByRole("button", { name: "Valider" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form).toHaveAttribute("data-state", "closed");

    await hiddenCell(page, "Tom, Aller : Sans voiture").focus();
    await page.keyboard.press("Enter");
    const tomsSheet = sheet(page, "Tom · Aller");
    await tomsSheet.getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(tomsSheet).toHaveAttribute("data-state", "closed");
    const seen = await watchAlerts(page);
    for (const answer of [zed, tom]) {
      const responded = page.waitForResponse((response) => response.status() === 500);
      answer();
      await responded;
    }
    expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(2);

    // Reopened while it closes: the same form, sent again, and Zed is registered.
    await page.locator('[role="tabpanel"][data-state="active"] button', { hasText: "Ajouter une personne" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(1);
    // Tom's sheet, opened after the form, hides it from role queries until it has closed.
    await slow.evaluate((style) => style.parentNode?.removeChild(style));
    await expect(form).toHaveAttribute("data-state", "open");
    await expect(form.getByLabel("Prénom")).toHaveValue("Zed");
    // From the keyboard: an overlay of the two sheets may lie over the form for a moment.
    await form.getByLabel("Prénom").press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Claire", "Léa", "Tom", "Hugo", "Zed"]);

    // Tom's failure is not lost: said once the page shows, and Tom is still without a car.
    await expect(bar(page)).toHaveText(FAILED);
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
    await expect(alerts(page)).toHaveText([FAILED]);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
  });

  test("a success from a sheet closed since leaves the sheet opened meanwhile open", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, scene.persons.tom, false);
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await cell(page, "Léa", "Aller").click();
    const lea = sheet(page, "Léa · Aller");
    await expect(lea).toBeVisible();
    answer();

    await expect(hiddenCell(page, "Tom, Aller : Ne fait pas l’aller")).toHaveCount(1);
    await expect(lea).toHaveAttribute("data-state", "open");
    await lea.getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(section(page).getByRole("button", { name: "Léa, Aller : Sans voiture", exact: true })).toBeFocused();
  });
});
