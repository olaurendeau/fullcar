import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #93: « Modifier » on the device's car, and « Qui sort de la voiture ? » (C8.1 to C8.5).

type Db = Kysely<Database>;

const GARE = "Gare de Cesson";
const FAILED = "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.";
const CHANGED = "Quelqu’un a pris ou libéré une place entre-temps : rien n’a changé. Choisissez à nouveau parmi les personnes à bord.";
const SEATS = "Places, sans compter qui conduit";
const slowClose = '[role="dialog"][data-state="closed"] { animation-duration: 2s !important; }';

/**
 * The device holds Claire. Aller: she drives Nina then Paul (3 seats), Marc drives nobody, Tom
 * is without a car. Retour: Claire drives Nina. Nina, Paul, Tom and Marc are of other devices.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire" }, token);
  const [nina, paul, tom, marc] = await Promise.all(["Nina", "Paul", "Tom", "Marc"].map((firstName) => seedPerson(db, eventId, { firstName })));
  const car = await seedRide(db, eventId, claire.id, { departureTime: "07:00:00" });
  await seedRide(db, eventId, marc.id);
  const retour = await seedRide(db, eventId, claire.id, { leg: "retour" });
  await seedPlacement(db, { personId: nina.id, eventId, leg: "aller", rideId: car });
  await seedPlacement(db, { personId: paul.id, eventId, leg: "aller", rideId: car });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: nina.id, eventId, leg: "retour", rideId: retour });
  return { car, paul: paul.id, tom: tom.id };
}

const panel = (page: Page) => page.getByRole("tabpanel");
const card = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const editButton = (page: Page) => card(page, "Claire").getByRole("button", { name: "Modifier", exact: true });
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const valider = (page: Page, title: string) => dialog(page, title).getByRole("button", { name: "Valider" });
const STEP = "Qui sort de la voiture ?";

async function openForm(page: Page) {
  await editButton(page).click();
  const form = dialog(page, "Modifier la voiture");
  await expect(form.getByLabel("Lieu de départ")).toHaveValue("Mairie de Cesson");
  return form;
}

/** Every Ride and Placement of the event: a write that should not happen shows. */
async function rowsOf(db: Db, eventId: string) {
  const rides = await db.selectFrom("ride").select(["id", "location", "departure_time", "seats", "note"]).where("event_id", "=", eventId).orderBy("id").execute();
  const placements = await db.selectFrom("placement").select(["person_id", "leg", "ride_id"]).where("event_id", "=", eventId).orderBy("person_id").orderBy("leg").execute();
  return { rides, placements };
}

async function rideOf(db: Db, id: string) {
  return db.selectFrom("ride").select(["location", "departure_time", "seats", "note"]).where("id", "=", id).executeTakeFirstOrThrow();
}

/** Opens the step: the seats down to `seats`, below the two passengers. Its first box has the focus. */
async function openStep(page: Page, seats: string) {
  const form = await openForm(page);
  await form.getByLabel(SEATS).fill(seats);
  await form.getByRole("button", { name: "Valider" }).click();
  const step = dialog(page, STEP);
  await expect(step.getByRole("checkbox", { name: "Nina" })).toBeFocused();
  return step;
}

test.describe("edit a car", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C8.1: « Modifier » on the device's car alone, of 44 px", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    expect((await editButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(card(page, "Marc").getByRole("button", { name: "Modifier", exact: true })).toHaveCount(0);
  });

  test("C8.2, C9.4: place, time, note and more seats; the card and the banner follow, the focus is back on « Modifier »", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(panel(page).getByRole("status")).toHaveText("1 sans voiture · 4 places libres");
    const form = await openForm(page);
    await expect(form.getByRole("radiogroup")).toHaveCount(0);
    await expect(form.getByLabel("Heure de départ")).toHaveValue("07:00");
    await expect(form.getByLabel(SEATS)).toHaveValue("3");
    await form.getByLabel("Lieu de départ").fill(GARE);
    await form.getByLabel("Heure de départ").fill("08:05");
    await form.getByLabel(SEATS).fill("5");
    await form.getByLabel("Note (facultatif)").fill("Coffre plein");
    await form.getByRole("button", { name: "Valider" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await expect(card(page, "Claire")).toContainText(GARE);
    await expect(card(page, "Claire")).toContainText("Coffre plein");
    await expect(card(page, "Claire").getByRole("button", { name: /^Place libre/ })).toHaveCount(3);
    await expect(panel(page).getByRole("status")).toHaveText("1 sans voiture · 6 places libres");
    expect(await rideOf(db, scene.car)).toEqual({ location: GARE, departure_time: "08:05:00", seats: 5, note: "Coffre plein" });
  });

  test("C8.3: down to the passengers, applied without the step", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const before = await rowsOf(db, seededEvent.id);
    const form = await openForm(page);
    await form.getByLabel(SEATS).fill("2");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card(page, "Claire")).toContainText("Complet");
    const after = await rowsOf(db, seededEvent.id);
    expect(after.placements).toEqual(before.placements);
    expect(after.rides).toEqual(before.rides.map((ride) => (ride.id === scene.car ? { ...ride, seats: 2 } : ride)));
  });

  test("C8.4, C3.5, C9.4: who leaves is without a car on this leg, the others stay, the retour is untouched", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const before = await rowsOf(db, seededEvent.id);
    const step = await openStep(page, "1");
    await expect(step).toContainText("2 personnes pour 1 place : cochez la personne qui sort.");
    await expect(step.getByText("0 cochée sur 1")).toBeVisible();
    await expect(valider(page, STEP)).toBeDisabled();
    await step.getByRole("checkbox", { name: "Nina" }).check();
    await step.getByRole("checkbox", { name: "Paul" }).check();
    await expect(step.getByText("2 cochées sur 1")).toBeVisible();
    await expect(valider(page, STEP)).toBeDisabled();
    await step.getByRole("checkbox", { name: "Nina" }).uncheck();
    await valider(page, STEP).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await expect(card(page, "Claire").getByRole("listitem")).toHaveText(["Nina"]);
    await expect(panel(page).getByRole("region", { name: "Sans voiture" }).getByRole("listitem")).toHaveText(["Tom", "Paul"]);
    await expect(panel(page).getByRole("status")).toHaveText("2 sans voiture · 3 places libres");
    await expect(page.getByRole("tab", { name: "Aller 2 sans voiture" })).toBeVisible();
    const after = await rowsOf(db, seededEvent.id);
    const paulsAller = (row: { person_id: string; leg: string }) => row.person_id === scene.paul && row.leg === "aller";
    expect(after.placements.find(paulsAller)?.ride_id).toBeNull();
    expect(after.placements.filter((row) => !paulsAller(row))).toEqual(before.placements.filter((row) => !paulsAller(row)));
  });

  test("C8.4: « Annuler » goes back to the form, as it was, the focus on the seats", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const before = await rowsOf(db, seededEvent.id);
    const step = await openStep(page, "1");
    await step.getByRole("button", { name: "Annuler" }).click();
    const form = dialog(page, "Modifier la voiture");
    await expect(form.getByLabel(SEATS)).toBeFocused();
    await expect(form.getByLabel(SEATS)).toHaveValue("1");
    expect(await rowsOf(db, seededEvent.id)).toEqual(before);
  });

  test("C8.5: someone boards during the step: said, nothing changes, the step opens again with the passengers now", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const step = await openStep(page, "1");
    await seedPlacement(db, { personId: scene.tom, eventId: seededEvent.id, leg: "aller", rideId: scene.car });
    const before = await rowsOf(db, seededEvent.id);
    await step.getByRole("checkbox", { name: "Paul" }).check();
    await valider(page, STEP).click();

    await expect(step.getByRole("alert")).toHaveText(CHANGED);
    await expect(step.getByRole("checkbox")).toHaveCount(3);
    await expect(step.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(step).toContainText("3 personnes pour 1 place : cochez les 2 personnes qui sortent.");
    await expect(step.getByRole("checkbox", { name: "Nina" })).toBeFocused();
    expect(await rowsOf(db, seededEvent.id)).toEqual(before);

    await step.getByRole("checkbox", { name: "Paul" }).check();
    await step.getByRole("checkbox", { name: "Tom" }).check();
    await valider(page, STEP).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card(page, "Claire").getByRole("listitem")).toHaveText(["Nina"]);
  });

  test("C8.5: someone left during the step, and all fit: back to the form, said, and « Valider » applies it", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const step = await openStep(page, "1");
    await seedPlacement(db, { personId: scene.paul, eventId: seededEvent.id, leg: "aller", rideId: null });
    await step.getByRole("checkbox", { name: "Paul" }).check();
    await valider(page, STEP).click();

    const form = dialog(page, "Modifier la voiture");
    await expect(form.getByRole("alert")).toHaveText(CHANGED);
    await expect(form.getByRole("button", { name: "Valider" })).toBeFocused();
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await rideOf(db, scene.car)).seats).toBe(1);
  });

  test("offline: said in the form, which keeps its values and gives the focus to « Valider »", async ({ context, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page);
    await form.getByLabel("Lieu de départ").fill(GARE);
    await context.setOffline(true);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(form.getByRole("alert")).toHaveText("Action impossible, vérifiez la connexion");
    await expect(form.getByRole("button", { name: "Valider" })).toBeFocused();
    await expect(form.getByLabel("Lieu de départ")).toHaveValue(GARE);
    await context.setOffline(false);
    expect((await rideOf(db, scene.car)).location).toBe("Mairie de Cesson");
  });

  test("a change made since the form showed stays: only what the form changed is sent", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page);
    await db.updateTable("ride").set({ note: "Coffre plein", seats: 4 }).where("id", "=", scene.car).execute();
    await form.getByLabel("Lieu de départ").fill(GARE);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await rideOf(db, scene.car)).toEqual({ location: GARE, departure_time: "07:00:00", seats: 4, note: "Coffre plein" });
  });

  /** Sends the place for Claire's car, then closes the sheet with Escape: closed, or still closing. */
  async function sendThenClose(page: Page, closing = false) {
    const form = await openForm(page);
    await form.getByLabel("Lieu de départ").fill(GARE);
    await form.getByRole("button", { name: "Valider" }).click();
    await page.keyboard.press("Escape");
    if (closing) await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
    else await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  /** « Modifier », found by its text: Radix hides the page from role queries while a sheet is mounted. */
  const hiddenEdit = (page: Page) => page.locator(`article[aria-labelledby="car-${scene.car}"]`).getByText("Modifier", { exact: true });

  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the sheet is ${when}: in the bar, once no sheet hides the page`, async ({ db, page, seededEvent }) => {
      const answer = await holdFirst(page, GARE, true);
      await page.goto(`/e/${seededEvent.id}`);
      if (when.endsWith("closing")) await page.addStyleTag({ content: slowClose });
      await sendThenClose(page, when.endsWith("closing"));
      const seen = await watchAlerts(page);
      if (when !== "reopened") await failHeld(page, answer);
      if (when.startsWith("reopened")) {
        await hiddenEdit(page).focus();
        await page.keyboard.press("Enter");
        await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(1);
        if (when === "reopened") await failHeld(page, answer);
        await page.keyboard.press("Escape");
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(bar(page)).toHaveText(FAILED);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      expect((await rideOf(db, scene.car)).location).toBe("Mairie de Cesson");
    });
  }

  test("a success once the sheet is reopened leaves the reopened one open", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, GARE, false);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page);
    await openForm(page);
    answer();
    await expect(page.locator(`article[aria-labelledby="car-${scene.car}"]`)).toContainText(GARE);
    // A sheet closing stays visible during its animation: its state says whether it closes.
    await page.waitForTimeout(500);
    await expect(dialog(page, "Modifier la voiture")).toHaveAttribute("data-state", "open");
  });

  // The failure is about the place of Claire's car: sent again from a reopened sheet, before
  // or after it comes, the change withdraws it if it carries the place; without it, it is said.
  const resends = { "the place": { note: "", said: false }, "the place and the note": { note: "Coffre plein", said: false }, "the note alone": { note: "Coffre plein", said: true } };
  for (const when of ["after", "before"] as const) {
    for (const [resent, { note, said }] of Object.entries(resends)) {
      test(`a change that failed, then ${resent} sent ${when} the failure: ${said ? "the failure is said" : "nothing left to say"}`, async ({ db, page, seededEvent }) => {
        const answer = await holdFirst(page, GARE, true);
        await page.goto(`/e/${seededEvent.id}`);
        await sendThenClose(page);
        const form = await openForm(page);
        if (when === "after") await failHeld(page, answer);
        if (!said) await form.getByLabel("Lieu de départ").fill(GARE);
        await form.getByLabel("Note (facultatif)").fill(note);
        await form.getByRole("button", { name: "Valider" }).click();
        if (when === "before") await failHeld(page, answer);
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Once more around a sheet: a message left waiting would show by now.
        await editButton(page).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (said) await expect(bar(page)).toHaveText(FAILED);
        else await expect(bar(page)).toBeEmpty();
        expect(await rideOf(db, scene.car)).toMatchObject({ location: said ? "Mairie de Cesson" : GARE, note: note || null });
      });
    }
  }
});
