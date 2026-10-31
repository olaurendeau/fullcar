import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide, seedStop } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { DRIVER_PHONE, numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor } from "./photon";
import { namedPlace, textOf } from "./place-field";

leaveNoToken();

// #889, epic #881: the section « Points de RDV » of « Proposer une voiture » and « Modifier la
// voiture » (RV1.1 to RV1.10). The device holds Claire, who has a number: what a card or a form
// prints is read through `numbersHidden`.

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  edit: "Modifier la voiture",
  title: "Points de RDV",
  add: "Ajouter un point de RDV",
  max: "6 points au maximum.",
  sorted: "Points classés par heure.",
  required: "Champ requis.",
  badTime: "Heure non valide.",
  tooLong: "120 caractères au maximum.",
  answered: "Votre texte sera gardé tel quel.",
  saved: "Position enregistrée",
  off: "L’option « Points de RDV » vient d’être désactivée : votre voiture n’a pas été enregistrée. Rechargez la page, puis réessayez.",
};

/** The seeded car leaves at 07:15 (« Mairie de Cesson »); the event's aller at 07:30. */
const DEPARTURE = "07:15";

const panel = (page: Page) => page.getByRole("tabpanel");
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const submit = (page: Page, title: string) => dialog(page, title).getByRole("button", { name: "Valider", exact: true });
const point = (scope: Locator, n: number) => scope.getByRole("group", { name: `Point ${n}`, exact: true });
const placeOf = (scope: Locator, n: number) => scope.getByRole("combobox", { name: `Lieu du point ${n}`, exact: true });
const timeOf = (scope: Locator, n: number) => scope.getByLabel(`Heure du point ${n}`, { exact: true });
const removeOf = (scope: Locator, n: number) => scope.getByRole("button", { name: `Retirer le point ${n}`, exact: true });
const addButton = (scope: Locator) => scope.getByRole("button", { name: FR.add, exact: true });
const heading = (scope: Locator) => scope.getByRole("heading", { name: FR.title, exact: true });
const sortedLine = (scope: Locator) => scope.getByRole("status").filter({ hasText: FR.sorted });

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The device holds Claire, who has a number and drives a car on the aller unless `driving` is false. */
async function scene(db: Db, page: Page, eventId: string, driving = true) {
  const token = newToken();
  const claire = await seedPerson(db, eventId, { firstName: "Claire", phone: DRIVER_PHONE }, token);
  const rideId = driving ? await seedRide(db, eventId, claire.id) : "";
  await holdToken(page, eventId, token);
  return { rideId };
}

/** « Proposer une voiture » opened from the active tab. */
async function openOffer(page: Page) {
  await panel(page).getByRole("button", { name: FR.offer, exact: true }).click();
  const form = dialog(page, FR.offer);
  await expect(form).toBeVisible();
  return form;
}

async function openEdit(page: Page) {
  await panel(page).getByRole("article", { name: "Voiture de Claire" }).getByRole("button", { name: "Modifier", exact: true }).click();
  const form = dialog(page, FR.edit);
  await expect(form.getByLabel("Lieu de départ", { exact: true })).toHaveValue("Mairie de Cesson");
  return form;
}

/**
 * A line's place and time. The answer under the place ("Votre texte sera gardé tel quel.", none
 * from the fake Photon) is waited for: it moves what is below by a line, a click aimed before it
 * lands above its button (#546).
 */
async function fillPoint(form: Locator, n: number, place: string, time: string) {
  await placeOf(form, n).fill(place);
  await expect(point(form, n).locator("p", { hasText: FR.answered })).toBeVisible();
  await timeOf(form, n).fill(time);
}

const stopsOf = (db: Db, rideId: string) =>
  db
    .selectFrom("stop")
    .select(["id", "location", "location_lat", "location_lng", "stop_time"])
    .where("ride_id", "=", rideId)
    .orderBy("stop_time")
    .orderBy("rank")
    .execute();

/** The server actions the page sends from now on about `marker` (the car's id), their body kept. */
function actions(page: Page, marker: string): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    const body = request.headers()["next-action"] && request.postData();
    if (body && body.includes(marker)) sent.push(body);
  });
  return sent;
}

test.describe("« Points de RDV » du formulaire de la voiture", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });

  test("RV1.1: sur l’aller, dans « Proposer » et « Modifier » ; absente du DOM au retour", async ({ db, page, seededEvent }) => {
    await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    let form = await openOffer(page);
    await numbersHidden(async () => {
      await expect(heading(form)).toBeVisible();
      await expect(addButton(form)).toBeVisible();
      // Under the departure's time, before the seats.
      const order = await form.locator("label, h3").evaluateAll((nodes) => nodes.map((node) => node.textContent));
      expect(order.indexOf(FR.title)).toBeGreaterThan(order.indexOf("Heure de départ"));
      expect(order.indexOf(FR.title)).toBeLessThan(order.indexOf("Places, sans compter qui conduit"));
    });
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);

    form = await openEdit(page);
    await numbersHidden(() => expect(addButton(form)).toBeVisible());
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);

    await selectTab(page, "Retour");
    form = await openOffer(page);
    await numbersHidden(async () => {
      await expect(heading(form)).toHaveCount(0);
      await expect(addButton(form)).toHaveCount(0);
      await expect(form.getByLabel(/^Lieu du point/)).toHaveCount(0);
    });
  });

  test("RV1.2: « Ajouter » donne le focus au lieu de la ligne ; à 6 points, « 6 points au maximum. »", async ({ db, page, seededEvent }) => {
    await scene(db, page, seededEvent.id, false);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openOffer(page);
    await numbersHidden(async () => {
      await addButton(form).click();
      await expect(placeOf(form, 1)).toBeFocused();
      await expect(timeOf(form, 1)).toHaveValue("");
      for (let n = 2; n <= 5; n++) await addButton(form).click();
      await expect(addButton(form)).toBeVisible();
      await addButton(form).click();
      await expect(placeOf(form, 6)).toBeFocused();
      await expect(form.getByText(FR.max, { exact: true })).toBeVisible();
      await expect(addButton(form)).toHaveCount(0);
      await removeOf(form, 6).click();
      await expect(addButton(form)).toBeVisible();
      await expect(form.getByText(FR.max, { exact: true })).toHaveCount(0);
    });
  });

  test("RV1.7: sans point, une voiture sans point", async ({ db, page, seededEvent }) => {
    await scene(db, page, seededEvent.id, false);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openOffer(page);
    await numbersHidden(async () => {
      await form.getByLabel("Lieu de départ", { exact: true }).fill("Gare de Vitré");
      await expect(form.locator("p", { hasText: FR.answered })).toBeVisible();
      await submit(page, FR.offer).click();
      await expect(form).toHaveCount(0);
    });
    const ride = await db.selectFrom("ride").select("id").where("event_id", "=", seededEvent.id).executeTakeFirstOrThrow();
    expect(await stopsOf(db, ride.id)).toEqual([]);
  });

  test("RV1.3: un texte sans proposition est gardé sans position, avec la voiture proposée", async ({ db, page, seededEvent }) => {
    await scene(db, page, seededEvent.id, false);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openOffer(page);
    await numbersHidden(async () => {
      await form.getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
      await expect(form.locator("p", { hasText: FR.answered })).toBeVisible();
      await addButton(form).click();
      await fillPoint(form, 1, "Prelles boucherie", "07:45");
      await expect(form.getByText(FR.saved)).toHaveCount(0);
      await submit(page, FR.offer).click();
      await expect(form).toHaveCount(0);
    });
    const ride = await db.selectFrom("ride").select("id").where("event_id", "=", seededEvent.id).executeTakeFirstOrThrow();
    expect(await stopsOf(db, ride.id)).toEqual([
      expect.objectContaining({ location: "Prelles boucherie", location_lat: null, location_lng: null, stop_time: "07:45:00" }),
    ]);
  });

  test("RV1.3, RV1.8: la proposition choisie donne sa position, « Retirer la position du point n » la retire", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await addButton(form).click();
      const typed = textOf("Brian");
      const briancon = namedPlace("Briançon carrefour", 44.8966, 6.6343, "05100", "Briançon");
      await answerFor(typed, { features: [briancon.feature] });
      await placeOf(form, 1).fill(typed);
      await expect(form.getByRole("option")).toHaveCount(1);
      await form.getByRole("option").first().click();
      await timeOf(form, 1).fill("07:40");
      await submit(page, FR.edit).click();
      await expect(form).toHaveCount(0);
    });
    const [stop] = await stopsOf(db, rideId);
    expect(stop.location_lat).not.toBeNull();
    const kept = stop.location;

    // RV1.8: « Position enregistrée · Retirer » clears the position and keeps the text.
    const again = await openEdit(page);
    await numbersHidden(async () => {
      await expect(placeOf(again, 1)).toHaveValue(kept);
      await expect(point(again, 1).getByText(FR.saved)).toBeVisible();
      const remove = point(again, 1).getByRole("button", { name: "Retirer la position du point 1", exact: true });
      expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await remove.click();
      await expect(point(again, 1).getByText(FR.saved)).toHaveCount(0);
      await expect(placeOf(again, 1)).toHaveValue(kept);
      await submit(page, FR.edit).click();
      await expect(again).toHaveCount(0);
    });
    expect(await stopsOf(db, rideId)).toEqual([expect.objectContaining({ id: stop.id, location: kept, location_lat: null, location_lng: null })]);
  });

  test("RV1.4: les trois messages, aucun envoi, le focus sur la première ligne en erreur", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const sent = actions(page, rideId);
    await numbersHidden(async () => {
      await addButton(form).click();
      await timeOf(form, 1).fill("07:00");
      await addButton(form).click();
      await fillPoint(form, 2, "Prelles", "07:45");
      await addButton(form).click();
      await placeOf(form, 3).fill("x".repeat(121));
      await timeOf(form, 3).fill("07:50");
      await submit(page, FR.edit).click();

      await expect(point(form, 2).getByText(/Champ requis|Heure non valide|caractères|L’heure/)).toHaveCount(0);
      await expect(point(form, 1).getByText(FR.required, { exact: true })).toBeVisible();
      await expect(point(form, 1).getByText(`L’heure doit être après ${DEPARTURE}, l’heure de départ.`, { exact: true })).toBeVisible();
      await expect(point(form, 3).getByText(FR.tooLong, { exact: true })).toBeVisible();
      await expect(placeOf(form, 1)).toBeFocused();
      await expect(placeOf(form, 1)).toHaveAttribute("aria-invalid", "true");
      await expect(timeOf(form, 1)).toHaveAttribute("aria-invalid", "true");

      await timeOf(form, 1).fill("");
      await placeOf(form, 1).fill("Briançon");
      await submit(page, FR.edit).click();
      await expect(point(form, 1).getByText(FR.badTime, { exact: true })).toBeVisible();
      await expect(timeOf(form, 1)).toBeFocused();
    });
    expect(sent).toEqual([]);
    expect(await stopsOf(db, rideId)).toEqual([]);
  });

  test("RV1.5: reclassées en quittant l’heure, la phrase seulement si l’ordre change, relues dans l’ordre", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await addButton(form).click();
      await fillPoint(form, 1, "Monétier", "08:50");
      await addButton(form).click();
      await fillPoint(form, 2, "Prelles", "07:45");
      // Not while typing; and leaving a time that changes nothing says nothing.
      await expect(placeOf(form, 1)).toHaveValue("Monétier");
      await expect(sortedLine(form)).toHaveCount(0);
      await timeOf(form, 2).press("Tab");
      await expect(placeOf(form, 1)).toHaveValue("Prelles");
      await expect(placeOf(form, 2)).toHaveValue("Monétier");
      await expect(sortedLine(form)).toBeVisible();
      await timeOf(form, 2).focus();
      await timeOf(form, 2).press("Tab");
      await expect(sortedLine(form)).toHaveCount(0);
      await submit(page, FR.edit).click();
      await expect(form).toHaveCount(0);
    });
    expect((await stopsOf(db, rideId)).map(({ location }) => location)).toEqual(["Prelles", "Monétier"]);
    await page.reload();
    const again = await openEdit(page);
    await numbersHidden(async () => {
      await expect(placeOf(again, 1)).toHaveValue("Prelles");
      await expect(placeOf(again, 2)).toHaveValue("Monétier");
    });
  });

  test("RV1.6: le focus après « Retirer », et rien de supprimé avant « Valider »", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    for (const [time, location] of [
      ["07:45:00", "Prelles"],
      ["08:35:00", "Briançon"],
      ["08:50:00", "Monétier"],
    ]) {
      await seedStop(db, seededEvent.id, rideId, { time, location });
    }
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await expect(placeOf(form, 3)).toHaveValue("Monétier");
      await removeOf(form, 3).click();
      await expect(removeOf(form, 2)).toBeFocused();
      await removeOf(form, 1).click();
      await expect(addButton(form)).toBeFocused();
      await expect(placeOf(form, 1)).toHaveValue("Briançon");
      await removeOf(form, 1).click();
      await expect(addButton(form)).toBeFocused();
      await expect(form.getByLabel(/^Lieu du point/)).toHaveCount(0);
    });
    expect(await stopsOf(db, rideId)).toHaveLength(3);
    await numbersHidden(async () => {
      await submit(page, FR.edit).click();
      await expect(form).toHaveCount(0);
    });
    expect(await stopsOf(db, rideId)).toEqual([]);
  });

  test("RV1.7: une voiture sans point que l’on modifie n’envoie aucun point", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const sent = actions(page, rideId);
    await numbersHidden(async () => {
      await form.getByLabel("Note (facultatif)").fill("Coffre plein");
      await submit(page, FR.edit).click();
      await expect(form).toHaveCount(0);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("stops");
    expect(await stopsOf(db, rideId)).toEqual([]);
  });

  test("RV7.1: à 360 px, 6 points aux lieux de 120 caractères, ni débordement horizontal ni cible de moins de 44 px", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    for (let at = 0; at < 6; at++) {
      await seedStop(db, seededEvent.id, rideId, { time: `07:${40 + at}:00`, location: `${at + 1}${"é".repeat(119)}`, position: { lat: 45.7, lng: 4.6 } });
    }
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await expect(point(form, 6)).toBeVisible();
      expect(await form.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      for (let n = 1; n <= 6; n++) {
        const buttons = [removeOf(form, n), point(form, n).getByRole("button", { name: `Retirer la position du point ${n}`, exact: true })];
        for (const button of buttons) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await removeOf(form, 6).click();
      expect((await addButton(form).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await form.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    });
  });

  test("RV1.9: l’option désactivée entre-temps, la saisie est gardée, le message au-dessus de « Valider », le focus dessus", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await addButton(form).click();
      await fillPoint(form, 1, "Prelles", "07:45");
    });
    await db.updateTable("event").set({ stops_enabled: false }).where("id", "=", seededEvent.id).execute();
    await numbersHidden(async () => {
      await submit(page, FR.edit).click();
      await expect(form.getByRole("alert")).toHaveText(FR.off);
      await expect(submit(page, FR.edit)).toBeFocused();
      await expect(placeOf(form, 1)).toHaveValue("Prelles");
      await expect(timeOf(form, 1)).toHaveValue("07:45");
    });
    expect(await stopsOf(db, rideId)).toEqual([]);
  });

  test("RV1.10: une page qui n’envoie pas ses points ne déplace pas le départ à l’heure du premier ; rien n’est écrit", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    // A point recorded since the page showed (none shown): the departure moves to its time, or after.
    await seedStop(db, seededEvent.id, rideId, { time: "07:25:00", location: "Prelles" });
    const time = form.getByLabel("Heure de départ", { exact: true });
    await numbersHidden(async () => {
      await time.fill("07:30");
      await submit(page, FR.edit).click();
      await expect(form.getByText("L’heure doit être avant 07:25, l’heure du premier point de RDV.", { exact: true })).toBeVisible();
      await expect(time).toHaveAttribute("aria-invalid", "true");
      await expect(time).toBeFocused();
    });
    const car = await db.selectFrom("ride").select("departure_time").where("id", "=", rideId).executeTakeFirstOrThrow();
    expect(car.departure_time).toBe("07:15:00");
    expect(await stopsOf(db, rideId)).toHaveLength(1);
  });
});

test.describe("« Points de RDV » désactivée", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: false } });

  test("RV1.1: absente du DOM de « Proposer une voiture » et de « Modifier la voiture »", async ({ db, page, seededEvent }) => {
    await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    let form = await openOffer(page);
    await numbersHidden(async () => {
      await expect(heading(form)).toHaveCount(0);
      await expect(addButton(form)).toHaveCount(0);
    });
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    form = await openEdit(page);
    await numbersHidden(async () => {
      await expect(heading(form)).toHaveCount(0);
      await expect(addButton(form)).toHaveCount(0);
    });
  });
});
