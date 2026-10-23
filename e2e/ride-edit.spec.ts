import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, recordBar, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #93: « Modifier » on the device's car, and « Qui sort de la voiture ? » (C8.1 to C8.5).

type Db = Kysely<Database>;

const GARE = "Gare de Cesson";
/** In the bar, a failure names the car and its leg (C11.11, #226). */
const BAR_FAILED =
  "Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Une erreur est survenue : réessayez dans un instant.";
const CHANGED = "Quelqu’un a pris ou libéré une place entre-temps : rien n’a changé. Choisissez à nouveau parmi les personnes à bord.";
const SEATS = "Places, sans compter qui conduit";
/** A closing sheet's animation, paused: Radix keeps the sheet mounted until the style is removed. */
const holdClose = '[role="dialog"][data-state="closed"] { animation-play-state: paused !important; }';

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

const NOTE = "Gilets jaunes";

/**
 * The changes of the car the page sends, from now on: server actions whose body carries its id.
 * Started at the click on « Modifier » that opens the criterion's form (v4.4.5, H6).
 */
function changes(page: Page, rideId: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(rideId)) sent.push(request);
  });
  return sent;
}

/**
 * « Aucune requête » (v4.4.5): the note, sent after from a reopened form. Once it is done, `sent`
 * holds it alone; had the « Valider » before sent anything, it would hold two. Counted by its
 * length, and only a boolean is printed: a body carries the device's token (#363).
 */
async function nothingSentBefore(page: Page, sent: Request[]) {
  const form = await openForm(page);
  await form.getByLabel("Note (facultatif)").fill(NOTE);
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(sent.length).toBe(1);
  expect(!!sent[0].postData()?.includes(NOTE)).toBe(true);
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

  // Safari, and Firefox on macOS, do not focus a button on a click: the sheet opens from <body>.
  test("opened without the focus on « Modifier », the sheet gives it to its first field", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await editButton(page).evaluate((button: HTMLElement) => {
      button.blur();
      button.click();
    });
    await expect(dialog(page, "Modifier la voiture").getByLabel("Lieu de départ")).toBeFocused();
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
      const held = when.endsWith("closing") ? await page.addStyleTag({ content: holdClose }) : undefined;
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
      // Answered, and reopened if it is: the first sheet may end its closing.
      await held?.evaluate((style) => style.parentNode?.removeChild(style));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(bar(page)).toHaveText(BAR_FAILED);
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
        if (said) await expect(bar(page)).toHaveText(BAR_FAILED);
        else await expect(bar(page)).toBeEmpty();
        expect(await rideOf(db, scene.car)).toMatchObject({ location: said ? "Mairie de Cesson" : GARE, note: note || null });
      });
    }
  }

  // #313 (v4.4.5, H6): « Valider » with nothing changed closes « Modifier la voiture », and sends
  // and checks nothing. A field changed, then put back as the form showed it, is not changed.
  const alerts = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
  const unchanged = {
    "W1.1: « Valider »": (form: Locator) => form.getByRole("button", { name: "Valider" }).click(),
    "W1.2: Enter in « Lieu de départ »": (form: Locator) => form.getByLabel("Lieu de départ").press("Enter"),
    "W1.3: « Valider » after the place and the time changed, then put back": async (form: Locator) => {
      await form.getByLabel("Lieu de départ").fill(GARE);
      await form.getByLabel("Lieu de départ").fill("Mairie de Cesson");
      await form.getByLabel("Heure de départ").fill("07:15");
      await form.getByLabel("Heure de départ").fill("07:00");
      await form.getByRole("button", { name: "Valider" }).click();
    },
    "W1.4: back from the step, the seats put back, « Valider »": async (form: Locator) => {
      const page = form.page();
      await form.getByLabel(SEATS).fill("1");
      await form.getByRole("button", { name: "Valider" }).click();
      await dialog(page, STEP).getByRole("button", { name: "Annuler" }).click();
      const back = dialog(page, "Modifier la voiture");
      await back.getByLabel(SEATS).fill("3");
      await back.getByRole("button", { name: "Valider" }).click();
    },
  };
  for (const [title, validate] of Object.entries(unchanged)) {
    test(`${title} with nothing changed: the sheet closes, the focus on « Modifier », nothing sent`, async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      const before = await rowsOf(db, seededEvent.id);
      const sent = changes(page, scene.car);
      await validate(await openForm(page));
      // The step did not open again: no sheet is left.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(editButton(page)).toBeFocused();
      await expect(alerts(page)).toHaveCount(0);
      expect(await rowsOf(db, seededEvent.id)).toEqual(before);
      await nothingSentBefore(page, sent);
    });
  }

  // Rule 2 (v4.4.5): nothing changed is not checked either. A place of a zero-width space alone,
  // which the database takes and `validateRide` reads as empty, closes the sheet.
  test("nothing changed is not checked: a place stored that the form refuses closes the sheet, and nothing is sent", async ({
    db,
    page,
    seededEvent,
  }) => {
    await db.updateTable("ride").set({ location: "​" }).where("id", "=", scene.car).execute();
    await page.goto(`/e/${seededEvent.id}`);
    const before = await rowsOf(db, seededEvent.id);
    const sent = changes(page, scene.car);
    const openInvisible = async () => {
      await editButton(page).click();
      const form = dialog(page, "Modifier la voiture");
      await expect(form.getByLabel("Lieu de départ")).toHaveValue("​");
      return form;
    };
    await (await openInvisible()).getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
    expect(await rowsOf(db, seededEvent.id)).toEqual(before);

    // As `nothingSentBefore`, with a place the form takes: one request, the second.
    const form = await openInvisible();
    await form.getByLabel("Lieu de départ").fill(GARE);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(sent.length).toBe(1);
    expect(!!sent[0].postData()?.includes(GARE)).toBe(true);
  });

  test("W1.5: offline, nothing changed: the sheet closes, and nothing is said", async ({ context, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const sent = changes(page, scene.car);
    const form = await openForm(page);
    await context.setOffline(true);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    await expect(page.getByText("Action impossible, vérifiez la connexion")).toHaveCount(0);

    // Back online before the note's request.
    await context.setOffline(false);
    await nothingSentBefore(page, sent);
  });

  test("W1.6: nothing changed, under a failure of this car in the bar: the bar does not change", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, GARE, true);
    await page.goto(`/e/${seededEvent.id}`);
    // Sent before the count starts.
    await sendThenClose(page);
    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([BAR_FAILED]);
    // Said too: the region is written after its line shows.
    await expect(bar(page)).toHaveText(BAR_FAILED);

    const sent = changes(page, scene.car);
    const form = await openForm(page);
    const record = await recordBar(page);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await expect(messages(page)).toHaveText([BAR_FAILED]);
    expect(await record()).toEqual({ writes: [], lines: [] });
    await nothingSentBefore(page, sent);
  });
});
