import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { removeRetourInDb } from "./event-db";
import { DRIVER_PHONE } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #171: « Qui monte avec vous ? » in « Proposer une voiture » (C4.13, v4-10; C4.5, C4.10, C5.10, C3.5, C11.11).

type Db = Kysely<Database>;

const panel = (page: Page) => page.getByRole("tabpanel");
const form = (page: Page) => page.getByRole("dialog", { name: "Proposer une voiture" });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider" });
const driverRadio = (page: Page, name: string) => form(page).getByRole("radiogroup", { name: "Qui conduit ?" }).getByRole("radio", { name, exact: true });
const group = (page: Page) => form(page).getByRole("group", { name: "Qui monte avec vous ?" });
const box = (page: Page, name: string) => group(page).getByRole("checkbox", { name, exact: true });
const field = (page: Page, label: string) => form(page).getByLabel(label, { exact: true });
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Locator) => scope.getByRole("button", { name: /^Place libre : / });
/** The bar's lines and its « Annuler », by their CSS: a sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const undo = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });

/** The device holds `names`, each with a number to drive, with their token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, names: string[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const firstName of names) ids[firstName] = (await seedPerson(db, eventId, { firstName, phone: DRIVER_PHONE }, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

const place = (db: Db, eventId: string, personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });

/** Where each of `ids` is on `leg`, in their order: a Ride, `null` without a car, `undefined` not concerned. */
const where = (db: Db, ids: string[], leg: Leg) =>
  Promise.all(
    ids.map(async (id) => (await db.selectFrom("placement").select("ride_id").where("person_id", "=", id).where("leg", "=", leg).executeTakeFirst())?.ride_id),
  );

const driven = async (db: Db, eventId: string, driverId: string) =>
  (await db.selectFrom("ride").select("id").where("event_id", "=", eventId).where("driver_id", "=", driverId).execute()).map(({ id }) => id);

/** The offers the page sends: server actions whose body carries `marker`. */
function offers(page: Page, marker: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(marker)) sent.push(request);
  });
  return sent;
}

/**
 * The keys of the offer a request sent, its third argument (`offerRide(id, token, offer)`). Only
 * keys: an assertion on the body would print the device's token when it fails.
 */
const sentKeys = (request: Request): string[] => Object.keys(JSON.parse(request.postData() ?? "[]")[2] ?? {});

/** Whether two offers sent the same `passengerIds`: a boolean, never the values, as `sentKeys`. */
const samePassengers = (one: Request, other: Request) => {
  const ids = (request: Request) => JSON.stringify(JSON.parse(request.postData() ?? "[]")[2]?.passengerIds ?? null);
  return ids(one) === ids(other);
};

async function openForm(page: Page) {
  await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
  await expect(form(page)).toBeVisible();
}

/** The boxes of the group, as their labels read, and whether each is ticked. */
const boxes = (page: Page) =>
  group(page)
    .getByRole("checkbox")
    .evaluateAll((all) => all.map((each) => `${each.closest("label")?.textContent} ${each.getAttribute("aria-checked")}`));

test.describe("« Qui monte avec vous ? »", () => {
  test.use({ locale: "fr-FR" });

  test("C4.13, C3.5, C5.10: those without a car but who drives, unticked; the ticked board on this leg alone, then « Annuler »", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, id, marc.id);
    const { Claire: claire, Léa: lea, Tom: tom, Hugo: hugo, Zoé: zoe } = await device(db, page, id, ["Claire", "Léa", "Tom", "Hugo", "Zoé"]);
    for (const person of [claire, lea, tom]) await place(db, id, person, "aller", null);
    await place(db, id, zoe, "aller", marcsCar);
    await place(db, id, lea, "retour", null);
    const sent = offers(page, "Gare de Vitré");
    await page.goto(`/e/${id}`);

    // Nobody chosen: everyone without a car; Hugo, not concerned, and Zoé, in Marc's car, are not.
    await openForm(page);
    await expect(group(page)).toBeVisible();
    expect(await boxes(page)).toEqual(["ClaireSans voiture false", "LéaSans voiture false", "TomSans voiture false"]);
    await expect(box(page, "Léa")).toHaveAccessibleDescription("Sans voiture");
    await box(page, "Léa").check();
    // Léa drives: she leaves the group, and her tick with her.
    await driverRadio(page, "Léa").check();
    expect(await boxes(page)).toEqual(["ClaireSans voiture false", "TomSans voiture false"]);
    await driverRadio(page, "Claire").check();
    expect(await boxes(page)).toEqual(["LéaSans voiture false", "TomSans voiture false"]);
    await box(page, "Tom").check();
    await box(page, "Léa").check();
    await field(page, "Lieu de départ").fill("Gare de Vitré");
    // At 360 px, the sheet does not scroll sideways (C11.2).
    expect(await form(page).evaluate((sheet) => sheet.scrollWidth - sheet.clientWidth)).toBe(0);
    await submit(page).click();

    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Léa et Tom sont dans la voiture de Claire"]);
    await expect(undo(page)).toBeVisible();
    await expect(title(page, "Claire")).toBeFocused();
    expect(sent.length).toBe(1);
    expect(sentKeys(sent[0])).toContain("passengerIds");
    const [clairesCar] = await driven(db, id, claire);
    expect(await where(db, [lea, tom, hugo], "aller")).toEqual([clairesCar, clairesCar, undefined]);
    // On this leg only: the retour is as it was (C3.5).
    expect(await where(db, [lea, tom], "retour")).toEqual([null, undefined]);
    await expect(freeSeats(car(page, "Claire"))).toHaveCount(1);

    // « Annuler » gives them back their state before, without a car, and leaves the car offered.
    await undo(page).click();
    await expect(lines(page)).toHaveText(["Léa et Tom ne sont plus dans la voiture de Claire"]);
    expect(await where(db, [lea, tom], "aller")).toEqual([null, null]);
    expect(await driven(db, id, claire)).toEqual([clairesCar]);
    await expect(freeSeats(car(page, "Claire"))).toHaveCount(3);
  });

  test("C4.13: without a car, nobody else: no group; a new driver lists them all", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa", "Tom"]);
    await place(db, id, lea, "aller", null);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Léa").check();
    await expect(field(page, "Lieu de départ")).toBeVisible();
    await expect(group(page)).toHaveCount(0);
    await driverRadio(page, "Une nouvelle personne").check();
    expect(await boxes(page)).toEqual(["LéaSans voiture false"]);
  });

  test("nobody ticked: the offer is #90's, without `passengerIds`, nothing in the bar, the focus back on its button", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire, Léa: lea } = await device(db, page, id, ["Claire", "Léa"]);
    await place(db, id, lea, "aller", null);
    const sent = offers(page, "Gare de Vitré");
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Claire").check();
    await expect(box(page, "Léa")).not.toBeChecked();
    await field(page, "Lieu de départ").fill("Gare de Vitré");
    await submit(page).click();

    await expect(form(page)).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "Proposer une voiture", exact: true })).toBeFocused();
    await expect(lines(page)).toHaveCount(0);
    expect(sent.length).toBe(1);
    expect(sentKeys(sent[0])).not.toContain("passengerIds");
    expect(await driven(db, id, claire)).toHaveLength(1);
    expect(await where(db, [lea], "aller")).toEqual([null]);
  });

  test("C4.5: a passenger chosen to drive, two ticked: her seat is freed, both board her car, in one request", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, id, marc.id);
    const { Léa: lea, Tom: tom, Inès: ines } = await device(db, page, id, ["Léa", "Tom", "Inès"]);
    await place(db, id, lea, "aller", marcsCar);
    for (const person of [tom, ines]) await place(db, id, person, "aller", null);
    const sent = offers(page, "Église");
    await page.goto(`/e/${id}`);
    await expect(freeSeats(car(page, "Marc"))).toHaveCount(2);

    await openForm(page);
    await driverRadio(page, "Léa").check();
    await box(page, "Tom").check();
    await box(page, "Inès").check();
    await field(page, "Lieu de départ").fill("Église");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Tom et Inès sont dans la voiture de Léa"]);
    await expect(freeSeats(car(page, "Marc"))).toHaveCount(3);
    const [leasCar] = await driven(db, id, lea);
    expect(await where(db, [lea, tom, ines], "aller")).toEqual([undefined, leasCar, leasCar]);
    expect(sent.length).toBe(1);
  });

  test("C4.13: more ticked than seats: nothing created, the message under the group, the focus and the values kept", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire, Léa: lea, Tom: tom } = await device(db, page, id, ["Claire", "Léa", "Tom"]);
    for (const person of [lea, tom]) await place(db, id, person, "aller", null);
    const sent = offers(page, "Mairie");
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Claire").check();
    await field(page, "Lieu de départ").fill("Mairie");
    await field(page, "Places, sans compter qui conduit").fill("1");
    await box(page, "Léa").check();
    await box(page, "Tom").check();
    await expect(box(page, "Léa")).not.toHaveAttribute("aria-invalid");
    await submit(page).click();

    await expect(group(page)).toHaveAccessibleDescription("1 place seulement : décochez quelqu’un ou ajoutez des places.");
    // Each box says it is in error, as « Qui conduit ? » does (C4.7).
    for (const name of ["Léa", "Tom"]) await expect(box(page, name)).toHaveAttribute("aria-invalid", "true");
    await expect(box(page, "Léa")).toBeFocused();
    await expect(box(page, "Tom")).toBeChecked();
    await expect(field(page, "Lieu de départ")).toHaveValue("Mairie");
    expect(sent.length).toBe(0);
    expect(await driven(db, id, claire)).toEqual([]);

    // The message counts the seats sent, not those typed since.
    await field(page, "Places, sans compter qui conduit").fill("3");
    await expect(group(page)).toHaveAccessibleDescription("1 place seulement : décochez quelqu’un ou ajoutez des places.");
    await field(page, "Places, sans compter qui conduit").fill("1");

    // One unticked: one person, `Seat.placed`.
    await box(page, "Léa").uncheck();
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Tom est dans la voiture de Claire"]);
    await expect(undo(page)).toBeVisible();
    expect(await where(db, [lea, tom], "aller")).toEqual([null, (await driven(db, id, claire))[0]]);
  });

  test("M7.6: two ticked, refused by `noRetour` from the aller: the boxes stay ticked, and a second « Valider » boards the same", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    const { Claire: claire, Léa: lea, Tom: tom } = await device(db, page, id, ["Claire", "Léa", "Tom"]);
    for (const person of [claire, lea, tom]) await place(db, id, person, "aller", null);
    const sent = offers(page, "Parking du stade");
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Claire").check();
    await box(page, "Léa").check();
    await box(page, "Tom").check();
    await field(page, "Lieu de départ").fill("Parking du stade");
    await form(page).getByRole("radiogroup", { name: "Au retour" }).getByRole("radio", { name: "Je ramène aussi des personnes", exact: true }).check();
    await removeRetourInDb(db, id);
    await submit(page).click();

    await expect(form(page).getByRole("alert")).toHaveText("Il n’y a plus de retour pour cet événement : rien n’a changé.");
    expect(await driven(db, id, claire)).toEqual([]);
    for (const name of ["Léa", "Tom"]) await expect(box(page, name)).toBeChecked();

    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Léa et Tom sont dans la voiture de Claire"]);
    expect(sent.length).toBe(2);
    expect(sentKeys(sent[1])).toContain("passengerIds");
    expect(samePassengers(sent[0], sent[1])).toBe(true);
    const cars = await driven(db, id, claire);
    expect(cars.length).toBe(1);
    expect(await where(db, [lea, tom], "aller")).toEqual([cars[0], cars[0]]);
  });

  test("C4.10: a response lost after the write, sent again: one car, each passenger placed once, and the bar says so", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire, Léa: lea, Tom: tom } = await device(db, page, id, ["Claire", "Léa", "Tom"]);
    for (const person of [lea, tom]) await place(db, id, person, "aller", null);
    let lost = false;
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (!lost && request.headers()["next-action"] && request.postData()?.includes("Mairie de Vitré")) {
        lost = true;
        // The request reaches the server and writes; its answer never reaches the page.
        await route.fetch();
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Claire").check();
    await field(page, "Lieu de départ").fill("Mairie de Vitré");
    await box(page, "Léa").check();
    await box(page, "Tom").check();
    await submit(page).click();
    await expect(form(page).getByRole("alert")).toHaveText("Une erreur est survenue et rien n’a changé. Réessayez dans un instant.");

    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Léa et Tom sont dans la voiture de Claire"]);
    const cars = await driven(db, id, claire);
    expect(cars).toHaveLength(1);
    const rows = await db.selectFrom("placement").select("person_id").where("ride_id", "=", cars[0]).execute();
    expect(rows.map((row) => row.person_id).sort()).toEqual([lea, tom].sort());
  });

  test("C11.11: two ticked, one of them in a car meanwhile, the form closed before the answer: the bar names both", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const sophie = await seedPerson(db, id, { firstName: "Sophie" });
    const { Marc: marc, Inès: ines, Hugo: hugo } = await device(db, page, id, ["Marc", "Inès", "Hugo"]);
    for (const person of [marc, ines, hugo]) await place(db, id, person, "aller", null);
    const answer = await holdFirst(page, "Mairie de Vitré", false);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Marc").check();
    await box(page, "Hugo").check();
    await box(page, "Inès").check();
    await field(page, "Lieu de départ").fill("Mairie de Vitré");
    // Hugo boards Sophie's car from another device: this page does not know it yet.
    await place(db, id, hugo, "aller", await seedRide(db, id, sophie.id));
    await submit(page).click();
    await expect(submit(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    const seen = await watchAlerts(page);
    answer();

    await expect(lines(page)).toHaveText([
      "La voiture de Marc pour l’aller n’a pas été proposée. Parmi Inès et Hugo, une personne au moins est déjà dans une voiture.",
    ]);
    expect(await driven(db, id, marc)).toEqual([]);
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });

  test("a success from a form closed since waits for the form opened meanwhile to close, then says who boarded, with « Annuler »", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Claire", "Léa"]);
    await place(db, id, lea, "aller", null);
    const answer = await holdFirst(page, "Mairie de Vitré", false);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await driverRadio(page, "Claire").check();
    await box(page, "Léa").check();
    await field(page, "Lieu de départ").fill("Mairie de Vitré");
    await submit(page).click();
    await expect(submit(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await openForm(page);
    const seen = await watchAlerts(page);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes("Mairie de Vitré"));
    answer();
    await answered;

    // Shown while the form opened since hides the page, the success would be neither seen nor announced.
    await expect(form(page).getByRole("group", { name: "Qui monte avec vous ?" })).toHaveCount(0);
    await expect(lines(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText(["Léa est dans la voiture de Claire"]);
    await expect(undo(page)).toBeVisible();
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });
});
