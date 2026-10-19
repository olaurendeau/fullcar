import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #91: a free seat opens the sheet that chooses who boards (R6), and its success stays in the bar.

const FAILED = "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.";

type Db = Kysely<Database>;

/**
 * The device holds Claire, Tom, Léa, Hugo and Nina.
 * Aller: Claire drives (2 seats); Sophie drives (3 seats, empty); Marc drives Nina (3 seats);
 * Tom and Léa are without a car; Hugo is not concerned. Retour: Tom alone is without a car.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { claire: await mine("Claire"), tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo"), nina: await mine("Nina") };
  const cars = {
    claire: await seedRide(db, eventId, persons.claire, { departureTime: "07:00:00", seats: 2 }),
    sophie: await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:15:00" }),
    marc: await seedRide(db, eventId, await other("Marc"), { departureTime: "07:30:00" }),
  };
  await seedPlacement(db, { personId: persons.nina, eventId, leg: "aller", rideId: cars.marc });
  for (const personId of [persons.tom, persons.lea]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: persons.tom, eventId, leg: "retour", rideId: null });
  return { persons, cars };
}

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db.selectFrom("placement").select(["leg", "ride_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

/** The id of the person named `firstName`, whom the page registered. */
async function personNamed(db: Db, eventId: string, firstName: string) {
  return (await db.selectFrom("person").select("id").where("event_id", "=", eventId).where("first_name", "=", firstName).executeTakeFirstOrThrow()).id;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seatName = (driver: string) => `Place libre : prendre une place dans la voiture de ${driver}`;
const freeSeats = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: seatName(driver) });
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
const addForm = (page: Page) => page.getByRole("dialog", { name: "Ajouter une personne" });
const placeButton = (dialog: Locator) => dialog.getByRole("button", { name: /^Placer/ });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const banner = (page: Page) => panel(page).getByRole("status").filter({ hasText: /\S/ });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const alerts = (scope: Page | Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });
/** The message bar's status region, where a success goes: found by its CSS, as a sheet hides the page. */
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
/** A free seat, found while a sheet hides the page from role queries. */
const hiddenSeat = (page: Page, driver: string) => page.locator(`button[aria-label="${seatName(driver)}"]`).first();
const slowClose = '[role="dialog"][data-state="closed"] { animation-duration: 2s !important; }';

/** The checkboxes of a sheet, each with its first name, the state under it (its description), and whether it is ticked. */
async function candidates(dialog: Locator) {
  return dialog.getByRole("checkbox").evaluateAll((boxes) =>
    boxes.map((box) => {
      const text = (attribute: string) => document.getElementById(box.getAttribute(attribute) ?? "")?.textContent;
      return { name: text("aria-labelledby"), state: text("aria-describedby"), checked: box.getAttribute("aria-checked") === "true" };
    }),
  );
}

/** The page's `text-destructive`, as the browser computes it: the colour of the sheet's alerts. */
const destructive = (page: Page) =>
  page.evaluate(() => getComputedStyle(Object.assign(document.body.appendChild(document.createElement("p")), { className: "text-destructive" })).color);

async function openSheet(page: Page, driver: string) {
  await freeSeats(page, driver).first().click();
  await expect(sheet(page, driver)).toBeVisible();
  return sheet(page, driver);
}

test.describe("the sheet", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C5.1: each free seat is a button of 44 px, named with its driver", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(freeSeats(page, "Sophie")).toHaveCount(3);
    await expect(freeSeats(page, "Marc")).toHaveCount(2);
    await expect(freeSeats(page, "Claire")).toHaveCount(2);
    for (const seat of await panel(page).getByRole("button", { name: /^Place libre : / }).all()) {
      await expect(seat).toBeEnabled();
      expect((await seat.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("C5.5, C6.1, C6.2: two persons without a car, the tap opens the sheet and places nobody", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });

    await expect(sophie.getByText("Il reste 3 places dans cette voiture", { exact: true })).toBeVisible();
    // Claire drives, Nina is in Marc's car: neither is there.
    expect(await candidates(sophie)).toEqual([
      { name: "Tom", state: "Sans voiture", checked: true },
      { name: "Léa", state: "Sans voiture", checked: true },
      { name: "Hugo", state: "Ne fait pas l’aller", checked: false },
    ]);
    await expect(placeButton(sophie)).toHaveText("Placer 2 personnes");
    await expect(placeButton(sophie)).toBeEnabled();
    expect(await sophie.getByRole("button").allTextContents()).toEqual(["Ajouter une personne", "Placer 2 personnes", "Fermer"]);

    await sophie.getByRole("checkbox", { name: "Tom" }).click();
    await expect(placeButton(sophie)).toHaveText("Placer 1 personne");
    await sophie.getByRole("checkbox", { name: "Léa" }).click();
    await expect(placeButton(sophie)).toHaveText("Placer");
    await expect(placeButton(sophie)).toBeDisabled();
    // The whole line is the box's target.
    await sophie.getByText("Ne fait pas l’aller").click();
    await expect(sophie.getByRole("checkbox", { name: "Hugo" })).toBeChecked();
    await expect(placeButton(sophie)).toHaveText("Placer 1 personne");
  });

  test("C6.3: more ticked than free seats, the button is inactive and the line says so", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const claire = await openSheet(page, "Claire");
    const remaining = claire.getByText("Il reste 2 places dans cette voiture", { exact: true });
    const red = await destructive(page);
    await expect(remaining).not.toHaveCSS("color", red);
    await claire.getByRole("checkbox", { name: "Hugo" }).click();
    await expect(placeButton(claire)).toHaveText("Placer 3 personnes");
    await expect(placeButton(claire)).toBeDisabled();
    await expect(remaining).toHaveCSS("color", red);
    await placeButton(claire).click({ force: true });
    await expect(claire).toBeVisible();
  });

  test("C6.4, C2.2, C9.4, C5.10: the ticked board, the bar says so and stays, the focus on the car's title", async ({ db, page, seededEvent }) => {
    await page.clock.install();
    await page.goto(`/e/${seededEvent.id}`);
    await expect(banner(page)).toHaveText("2 sans voiture · 7 places libres");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 2 sans voiture");
    await expect(toggle(page)).toContainText("5 personnes · 2 sans voiture");
    // A reload would lose the mark (C9.4).
    await page.evaluate(() => document.documentElement.setAttribute("data-not-reloaded", ""));

    const sophie = await openSheet(page, "Sophie");
    await placeButton(sophie).click();
    await expect(sophie).toHaveCount(0);
    await expect(title(page, "Sophie")).toBeFocused();
    const placed = page.getByRole("status").filter({ hasText: "Tom et Léa sont dans la voiture de Sophie" });
    await expect(placed).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);

    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Avec Sophie");
    await expect(cell(page, "Léa", "Aller")).toHaveAccessibleName("Léa, Aller : Avec Sophie");
    await expect(cell(page, "Hugo", "Aller")).toHaveAccessibleName("Hugo, Aller : Ne fait pas l’aller");
    await expect(cell(page, "Tom", "Retour")).toHaveAccessibleName("Tom, Retour : Sans voiture");
    // Placed in one write, both board at the same time: in either order.
    await expect(freeSeats(page, "Sophie")).toHaveCount(1);
    expect((await car(page, "Sophie").getByRole("listitem").allTextContents()).sort()).toEqual(["Léa", "Place libre", "Tom"]);
    await expect(banner(page)).toHaveText("Tout le monde a une place · 5 places libres");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller");
    await expect(toggle(page)).toContainText("5 personnes · 1 sans voiture");
    await expect(page.locator("html[data-not-reloaded]")).toHaveCount(1);
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: scene.cars.sophie, retour: null });
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: scene.cars.sophie });
    expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({});

    // No expiry (v4-7): still there 10 s later.
    await page.clock.fastForward(10_000);
    await expect(placed).toBeVisible();
    // « Fermer » gives the focus to the car's title.
    await tab(page, "Aller").focus();
    await barClose(page).click();
    await expect(placed).toHaveCount(0);
    await expect(title(page, "Sophie")).toBeFocused();

    // One person: Seat.placed. Escape with the focus in the bar closes it the same way.
    const marc = await openSheet(page, "Marc");
    await marc.getByRole("checkbox", { name: "Hugo" }).click();
    await placeButton(marc).click();
    const hugo = page.getByRole("status").filter({ hasText: "Hugo est dans la voiture de Marc" });
    await expect(hugo).toBeVisible();
    await page.clock.fastForward(10_000);
    await expect(hugo).toBeVisible();
    await barClose(page).focus();
    await page.keyboard.press("Escape");
    await expect(hugo).toHaveCount(0);
    await expect(title(page, "Marc")).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ aller: scene.cars.marc });
  });

  test("C6.9: « Fermer » and Escape close the sheet without effect, the focus back on the seat", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    await sophie.getByRole("checkbox", { name: "Hugo" }).click();
    await sophie.getByRole("button", { name: "Fermer" }).click();
    await expect(sophie).toHaveCount(0);
    await expect(freeSeats(page, "Sophie").first()).toBeFocused();
    await freeSeats(page, "Sophie").nth(2).press("Enter");
    await expect(sophie).toBeVisible();
    // Opened again: the default selection.
    await expect(sophie.getByRole("checkbox", { name: "Hugo" })).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(sophie).toHaveCount(0);
    await expect(freeSeats(page, "Sophie").nth(2)).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });
    expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({});
  });

  test("C6.6: a person added from the sheet is ticked, with the focus on her box; closed, she stays without a car", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    await sophie.getByRole("button", { name: "Ajouter une personne" }).click();
    const form = addForm(page);
    await expect(form.getByLabel("Prénom")).toBeFocused();
    // « Annuler » goes back to the list, creating nothing.
    await form.getByRole("button", { name: "Annuler" }).click();
    await expect(sophie.getByRole("button", { name: "Ajouter une personne" })).toBeFocused();
    await expect(sophie.getByRole("checkbox")).toHaveCount(3);

    await sophie.getByRole("button", { name: "Ajouter une personne" }).click();
    await form.getByLabel("Prénom").fill("Zoé");
    await form.getByRole("button", { name: "Valider" }).click();
    const zoe = sophie.getByRole("checkbox", { name: "Zoé" });
    await expect(zoe).toBeFocused();
    await expect(zoe).toBeChecked();
    expect((await candidates(sophie)).at(-1)).toEqual({ name: "Zoé", state: "Sans voiture", checked: true });
    await expect(placeButton(sophie)).toHaveText("Placer 3 personnes");
    await expect(sophie.getByText("Il reste 3 places dans cette voiture", { exact: true })).toBeVisible();

    await sophie.getByRole("button", { name: "Fermer" }).click();
    await expect(sophie).toHaveCount(0);
    await expect(cell(page, "Zoé", "Aller")).toHaveAccessibleName("Zoé, Aller : Sans voiture");
    const zoeId = await personNamed(db, seededEvent.id, "Zoé");
    expect(await placements(db, seededEvent.id, zoeId)).toEqual({ aller: null, retour: null });
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });
  });

  test("C6.5: fewer seats at the write than ticked, nobody is placed and the sheet stays open", async ({ browser, baseURL, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const marc = await openSheet(page, "Marc");
    await expect(marc.getByText("Il reste 2 places dans cette voiture", { exact: true })).toBeVisible();
    await expect(placeButton(marc)).toHaveText("Placer 2 personnes");

    // Another device takes one of the two seats meanwhile.
    const paul = await seedPerson(db, seededEvent.id, { firstName: "Paul" });
    await seedPlacement(db, { personId: paul.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await holdToken(other, seededEvent.id, paul.token);
      await other.goto(`/e/${seededEvent.id}`);
      const theirs = await openSheet(other, "Marc");
      await placeButton(theirs).click();
      await expect(theirs).toHaveCount(0);
    } finally {
      await context.close();
    }
    expect(await placements(db, seededEvent.id, paul.id)).toEqual({ aller: scene.cars.marc });

    await placeButton(marc).click();
    await expect(alerts(marc)).toHaveText("Il n’y a plus assez de places : personne n’a été placé.");
    const remaining = marc.getByText("Il reste 1 place dans cette voiture", { exact: true });
    await expect(remaining).toHaveCSS("color", await destructive(page));
    await expect(marc.getByRole("checkbox", { name: "Tom" })).toBeChecked();
    await expect(marc.getByRole("checkbox", { name: "Léa" })).toBeChecked();
    await expect(placeButton(marc)).toBeDisabled();
    // A refusal in a sheet does not move the focus.
    await expect(placeButton(marc)).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });

    // The page shows the state the refusal carried.
    await page.keyboard.press("Escape");
    await expect(car(page, "Marc").getByRole("listitem").nth(1)).toHaveText("Paul");
    await expect(freeSeats(page, "Marc")).toHaveCount(1);
    await expect(freeSeats(page, "Marc")).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
  });

  test("C6.8: the car removed meanwhile, the sheet says so, nobody is placed, and the page shows the state", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    await db.deleteFrom("ride").where("id", "=", scene.cars.sophie).execute();

    await placeButton(sophie).click();
    await expect(alerts(sophie)).toHaveText("Cette voiture n’est plus proposée");
    // Only « Fermer » is left, and it has the focus that the button gone had.
    expect(await sophie.getByRole("button").allTextContents()).toEqual(["Fermer"]);
    await expect(sophie.getByRole("button", { name: "Fermer" })).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });

    await page.keyboard.press("Escape");
    await expect(car(page, "Sophie")).toHaveCount(0);
    await expect(banner(page)).toHaveText("2 sans voiture · 4 places libres");
    await expect(banner(page)).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
  });

  test("Actions.alreadyInCar: someone ticked boarded elsewhere meanwhile, nothing changes", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    await seedPlacement(db, { personId: scene.persons.tom, eventId: seededEvent.id, leg: "aller", rideId: scene.cars.marc });

    await placeButton(sophie).click();
    await expect(alerts(sophie)).toHaveText("Une de ces personnes est déjà dans une voiture : rien n’a changé.");
    await expect(sophie.getByRole("checkbox", { name: "Tom" })).toHaveCount(0);
    await expect(sophie.getByRole("checkbox", { name: "Léa" })).toBeChecked();
    await expect(placeButton(sophie)).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });
  });

  test("while it is sent, « Placer » keeps the focus, inactive; a failure is said in the sheet", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    const sophie = await openSheet(page, "Sophie");
    await placeButton(sophie).click();
    await expect(placeButton(sophie)).toBeDisabled();
    await expect(placeButton(sophie)).toBeFocused();
    await placeButton(sophie).press("Enter");
    answer();
    await expect(alerts(sophie)).toHaveText(FAILED);
    await expect(placeButton(sophie)).toBeEnabled();
    await expect(placeButton(sophie)).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });
  });

  // Radix keeps a closing sheet mounted until its animation ends: slowed here, the answer comes
  // meanwhile. Reopened, even while the first one closes, the sheet is a new one.
  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the sheet is ${when}: in the bar, once no sheet hides the page`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, scene.cars.sophie, true);
      await page.goto(`/e/${seededEvent.id}`);
      const closing = when.endsWith("closing");
      if (closing) await page.addStyleTag({ content: slowClose });
      await placeButton(await openSheet(page, "Sophie")).click();
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
      if (when === "reopened while closing") await release();
      const marc = sheet(page, "Marc");
      if (when.startsWith("reopened")) {
        await hiddenSeat(page, "Marc").focus();
        await page.keyboard.press("Enter");
        await expect(marc).toBeVisible();
      }
      if (when !== "reopened while closing") await release();
      if (when.startsWith("reopened")) {
        // The new sheet neither shows the first one's failure nor closes.
        await expect(alerts(marc)).toHaveCount(0);
        await expect(marc).toHaveAttribute("data-state", "open");
        await page.keyboard.press("Escape");
        await expect(marc).toHaveCount(0);
      }
      await expect(bar(page)).toHaveText(FAILED);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(alerts(page)).toHaveText([FAILED]);
    });
  }

  // The failure is about the car and the persons sent (#208), not the sheet that sent them. Sent
  // again with them from a reopened sheet, after it comes (the send withdraws it) or before (the
  // answer does, here a refusal said in that sheet), only the new outcome is said.
  for (const when of ["after", "before"] as const) {
    test(`seats sent again from a reopened sheet ${when} the first send fails: no false failure`, async ({ db, page, seededEvent }) => {
      const answer = await holdFirst(page, scene.cars.sophie, true);
      await page.goto(`/e/${seededEvent.id}`);
      await placeButton(await openSheet(page, "Sophie")).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const sophie = await openSheet(page, "Sophie");
      if (when === "after") await failHeld(page, answer);
      else await db.deleteFrom("ride").where("id", "=", scene.cars.sophie).execute();
      await placeButton(sophie).click();
      if (when === "before") {
        await failHeld(page, answer);
        await expect(alerts(sophie)).toHaveText("Cette voiture n’est plus proposée");
        await page.keyboard.press("Escape");
      } else await expect(barStatus(page)).toHaveText("Tom et Léa sont dans la voiture de Sophie");
      await expect(sophie).toHaveCount(0);
      await expect(bar(page)).toBeEmpty();
    });
  }

  test("the car removed while the sheet closes:the bar says so, and the focus goes to the leg's banner", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.cars.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await placeButton(await openSheet(page, "Sophie")).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(freeSeats(page, "Sophie").first()).toBeFocused();
    await db.deleteFrom("ride").where("id", "=", scene.cars.sophie).execute();
    answer();

    await expect(bar(page)).toHaveText("Cette voiture n’est plus proposée");
    await expect(car(page, "Sophie")).toHaveCount(0);
    await expect(banner(page)).toBeFocused();
  });

  test("a success from a sheet closed since: the sheet opened meanwhile stays open, and the bar waits for it", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.cars.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await placeButton(await openSheet(page, "Sophie")).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const marc = await openSheet(page, "Marc");
    const responded = page.waitForResponse((response) => response.request().postData()?.includes(scene.cars.sophie) ?? false);
    answer();
    await responded;
    await expect.poll(() => placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: scene.cars.sophie, retour: null });

    // Behind the sheet, the board has the new state; the sheet has its own, and the bar nothing yet.
    await expect(page.locator(`button[aria-label="${seatName("Sophie")}"]`)).toHaveCount(1);
    await expect(marc).toHaveAttribute("data-state", "open");
    await expect(marc.getByRole("checkbox")).toHaveCount(1);
    await expect(barStatus(page)).toHaveText("");
    await page.keyboard.press("Escape");
    await expect(marc).toHaveCount(0);
    await expect(barStatus(page)).toHaveText("Tom et Léa sont dans la voiture de Sophie");
  });
});

test.describe("the driver's path", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let ride: string;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    const paul = await seedPerson(db, seededEvent.id, { firstName: "Paul" }, token);
    ride = await seedRide(db, seededEvent.id, paul.id);
    await holdToken(page, seededEvent.id, token);
  });

  test("C6.7, C5.6: nobody to place, the sheet says so and offers to add a person, who boards", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const paul = await openSheet(page, "Paul");
    await expect(paul.getByText("Toutes vos personnes sont déjà dans une voiture pour l’aller.", { exact: true })).toBeVisible();
    expect(await paul.getByRole("button").allTextContents()).toEqual(["Ajouter une personne", "Fermer"]);

    await paul.getByRole("button", { name: "Ajouter une personne" }).click();
    await addForm(page).getByLabel("Prénom").fill("Léo");
    await addForm(page).getByRole("button", { name: "Valider" }).click();
    await expect(paul.getByRole("checkbox", { name: "Léo" })).toBeFocused();
    await expect(paul.getByText("Toutes vos personnes sont déjà dans une voiture pour l’aller.")).toHaveCount(0);
    await placeButton(paul).click();
    await expect(page.getByRole("status").filter({ hasText: "Léo est dans la voiture de Paul" })).toBeVisible();
    await expect(title(page, "Paul")).toBeFocused();
    await expect(car(page, "Paul").getByRole("listitem").first()).toHaveText("Léo");
    // Folded at the first read, with nothing to do (v4-3): unfolded to read the cell.
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await toggle(page).click();
    await expect(cell(page, "Léo", "Aller")).toHaveAccessibleName("Léo, Aller : Avec Paul");
    expect(await placements(db, seededEvent.id, await personNamed(db, seededEvent.id, "Léo"))).toEqual({ aller: ride, retour: null });
  });
});
