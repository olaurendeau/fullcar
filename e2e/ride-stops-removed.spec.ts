import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { animationsDone, holdToken, messages, newToken } from "./device";
import { DRIVER_PHONE, numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #891, epic #881: a Stop removed from the car's form sends its passengers back to the departure
// (RV6.1 to RV6.3), and the form at 360 px (RV7.1; the project `e2e` is 360 px wide). The device
// holds Claire, who drives: what a card or a form prints is read through `numbersHidden`.

type Db = Kysely<Database>;

const FR = {
  edit: "Modifier la voiture",
  notified: "Personne n’est prévenu : pensez à le leur dire.",
  two: "2 personnes montent ici : elles monteront au lieu de départ.",
  one: "1 personne monte ici : elle montera au lieu de départ.",
  answered: "Votre texte sera gardé tel quel.",
};

const panel = (page: Page) => page.getByRole("tabpanel");
const dialog = (page: Page) => page.getByRole("dialog", { name: FR.edit, exact: true });
const submit = (page: Page) => dialog(page).getByRole("button", { name: "Valider", exact: true });
const point = (scope: Locator, n: number) => scope.getByRole("group", { name: `Point ${n}`, exact: true });
const placeOf = (scope: Locator, n: number) => scope.getByRole("combobox", { name: `Lieu du point ${n}`, exact: true });
const timeOf = (scope: Locator, n: number) => scope.getByLabel(`Heure du point ${n}`, { exact: true });
const removeOf = (scope: Locator, n: number) => scope.getByRole("button", { name: `Retirer le point ${n}`, exact: true });
const card = (page: Page) => panel(page).getByRole("article", { name: "Voiture de Claire" });

/**
 * Claire drives a car of 5 seats with the points Prelles (07:25) and Briançon (07:35). Paul and
 * Anna board at Prelles, Léo at Briançon, Mia at the departure. Each is a device of her own.
 */
async function scene(db: Db, page: Page, eventId: string) {
  const token = newToken();
  const claire = await seedPerson(db, eventId, { firstName: "Claire", phone: DRIVER_PHONE }, token);
  const rideId = await seedRide(db, eventId, claire.id, { seats: 5 });
  const prelles = await seedStop(db, eventId, rideId, { time: "07:25:00", location: "Prelles" });
  const briancon = await seedStop(db, eventId, rideId, { time: "07:35:00", location: "Briançon" });
  const people: string[] = [];
  for (const [firstName, stopId] of [
    ["Paul", prelles],
    ["Anna", prelles],
    ["Léo", briancon],
    ["Mia", null],
  ] as const) {
    const person = await seedPerson(db, eventId, { firstName });
    await seedPlacement(db, { personId: person.id, eventId, leg: "aller", rideId, stopId });
    people.push(person.id);
  }
  await holdToken(page, eventId, token);
  return { rideId, prelles, briancon, people };
}

async function openEdit(page: Page) {
  await card(page).getByRole("button", { name: "Modifier", exact: true }).click();
  const form = dialog(page);
  await expect(form.getByLabel("Lieu de départ", { exact: true })).toHaveValue("Mairie de Cesson");
  await animationsDone(form);
  return form;
}

const placementsOf = (db: Db, rideId: string) =>
  db.selectFrom("placement").select(["person_id", "ride_id", "stop_id"]).where("ride_id", "=", rideId).execute();

const stopIdsOf = async (db: Db, rideId: string) =>
  (await db.selectFrom("stop").select("id").where("ride_id", "=", rideId).execute()).map(({ id }) => id).sort();

/**
 * What the page says of the car's seats: the banner of the coverage, the card's free seats and its
 * passengers' first names (every row of a car with points has a second line, « monte à … » or
 * « monte au départ »: RV2.2, #936).
 */
async function seatsSaid(page: Page) {
  const banner = await page.getByText(/^Tout le monde a une place/).first().innerText();
  const free = await card(page).locator("[data-free-seat]").count();
  const rows = await card(page).getByRole("list", { name: "Places" }).locator("li:not(:has([data-free-seat]))").allInnerTexts();
  return { banner, free, passengers: rows.map((row) => row.trim().split("\n")[0]) };
}

/** The place and time of a line typed; the answer under the place is waited for (#546). */
async function fillPoint(form: Locator, n: number, place: string, time: string) {
  await placeOf(form, n).fill(place);
  await expect(point(form, n).locator("p", { hasText: FR.answered })).toBeVisible();
  await timeOf(form, n).fill(time);
}

test.describe("point retiré, passagers au départ", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });

  test("RV6.1: la note au singulier et au pluriel, rien de supprimé avant « Valider », puis les passagers au départ et la phrase", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { rideId, prelles, briancon, people } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const rows = card(page).getByRole("list", { name: "Places" }).getByRole("listitem");
    // The car keeps its points: Mia, at the departure, says so (RV2.2).
    await numbersHidden(() => expect(rows.filter({ hasText: "Mia" })).toContainText("monte au départ"));
    const form = await openEdit(page);
    await numbersHidden(async () => {
      // No note while no point is removed.
      await expect(form.getByText(/monte(nt)? ici/)).toHaveCount(0);
      await removeOf(form, 1).click();
      await expect(form.getByText(FR.two, { exact: true })).toBeVisible();
      // The note is announced: it sits in a polite live region.
      await expect(form.getByRole("status").getByText(FR.two, { exact: true })).toBeVisible();
      await removeOf(form, 1).click();
      await expect(form.getByText(FR.one, { exact: true })).toBeVisible();
      // The notes stay while the form is open: nothing is deleted before « Valider ».
      await expect(form.getByText(FR.two, { exact: true })).toBeVisible();
    });
    expect(await stopIdsOf(db, rideId)).toEqual([prelles, briancon].sort());
    expect((await placementsOf(db, rideId)).filter(({ stop_id }) => stop_id !== null)).toHaveLength(3);

    await numbersHidden(async () => {
      await submit(page).click();
      await expect(form).toHaveCount(0);
      await expect(messages(page).filter({ hasText: FR.notified })).toBeVisible();
      for (const name of ["Paul", "Anna", "Léo", "Mia"]) await expect(card(page)).toContainText(name);
      // No point left: no row says where it boards (RV2.2).
      await expect(card(page).getByRole("list", { name: "Places" })).not.toContainText("monte");
    });
    expect(await stopIdsOf(db, rideId)).toEqual([]);
    const placements = await placementsOf(db, rideId);
    expect(placements.map(({ person_id }) => person_id).sort()).toEqual([...people].sort());
    expect(placements.every(({ ride_id, stop_id }) => ride_id === rideId && stop_id === null)).toBe(true);
  });

  test("RV6.1: un point que personne n’a choisi, retiré : ni note, ni phrase", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    const quiet = await seedStop(db, seededEvent.id, rideId, { time: "08:05:00", location: "Monétier" });
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await removeOf(form, 3).click();
      await expect(placeOf(form, 3)).toHaveCount(0);
      await expect(form.getByText(/monte(nt)? ici/)).toHaveCount(0);
      await submit(page).click();
      await expect(form).toHaveCount(0);
      await expect(messages(page).filter({ hasText: FR.notified })).toHaveCount(0);
    });
    expect(await stopIdsOf(db, rideId)).not.toContain(quiet);
    expect((await placementsOf(db, rideId)).filter(({ stop_id }) => stop_id !== null)).toHaveLength(3);
  });

  test("RV6.2: changer le lieu ou l’heure d’un point garde ses passagers, sans note ni phrase", async ({ db, page, seededEvent }) => {
    const { rideId, prelles } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await fillPoint(form, 1, "Prelles-sur-Gier", "07:28");
      await expect(form.getByText(/monte(nt)? ici/)).toHaveCount(0);
      await submit(page).click();
      await expect(form).toHaveCount(0);
      await expect(messages(page).filter({ hasText: FR.notified })).toHaveCount(0);
    });
    const stop = await db.selectFrom("stop").select(["id", "location", "stop_time"]).where("id", "=", prelles).executeTakeFirstOrThrow();
    expect(stop).toEqual({ id: prelles, location: "Prelles-sur-Gier", stop_time: "07:28:00" });
    expect((await placementsOf(db, rideId)).filter(({ stop_id }) => stop_id === prelles)).toHaveLength(2);
  });

  test("RV6.3: les places libres et la couverture sont les mêmes avant et après", async ({ db, page, seededEvent }) => {
    const { rideId } = await scene(db, page, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const before = await numbersHidden(async () => {
      await expect(card(page)).toBeVisible();
      return seatsSaid(page);
    });
    const form = await openEdit(page);
    await numbersHidden(async () => {
      await removeOf(form, 1).click();
      await removeOf(form, 1).click();
      await submit(page).click();
      await expect(form).toHaveCount(0);
      await expect(messages(page).filter({ hasText: FR.notified })).toBeVisible();
    });
    await numbersHidden(async () => {
      await expect(card(page)).toBeVisible();
      expect(await seatsSaid(page)).toEqual(before);
    });
    expect(await placementsOf(db, rideId)).toHaveLength(4);
  });

  test("RV7.1: à 360 px, 6 points de 120 caractères et un point retiré avec sa note : ni débordement, ni cible de moins de 44 px", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { rideId, prelles } = await scene(db, page, seededEvent.id);
    await db.updateTable("stop").set({ location: `P${"é".repeat(119)}` }).where("id", "=", prelles).execute();
    for (let at = 0; at < 4; at++) {
      await seedStop(db, seededEvent.id, rideId, { time: `08:${10 + at}:00`, location: `${at + 3}${"é".repeat(119)}`, position: { lat: 45.7, lng: 4.6 } });
    }
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openEdit(page);
    const overflow = () => form.evaluate((element) => element.scrollWidth - element.clientWidth);
    await numbersHidden(async () => {
      await expect(point(form, 6)).toBeVisible();
      expect(await overflow()).toBe(0);
      await removeOf(form, 1).click();
      await expect(form.getByText(FR.two, { exact: true })).toBeVisible();
      expect(await overflow()).toBe(0);
      const note = form.getByText(FR.two, { exact: true });
      expect((await note.boundingBox())!.width).toBeLessThanOrEqual(360);
      for (let n = 1; n <= 5; n++) expect((await removeOf(form, n).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await form.getByRole("button", { name: "Ajouter un point de RDV", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await submit(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
  });
});
