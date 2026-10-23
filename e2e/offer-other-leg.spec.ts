import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #169: « Au retour » / « À l’aller » in « Proposer une voiture » (R4 amended, C4.11, v4-8, v4-9).

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  firstName: "Prénom",
  newDriver: "Une nouvelle personne",
  location: { aller: "Lieu de départ", retour: "Lieu de dépose" },
  time: "Heure de départ",
  title: { aller: "À l’aller", retour: "Au retour" },
  drive: { aller: "J’emmène aussi", retour: "Je ramène aussi" },
  withoutCar: "Je cherche une place",
  notConcerned: { aller: "Je ne fais pas l’aller", retour: "Je ne fais pas le retour" },
  otherTime: { aller: "Heure de départ de l’aller", retour: "Heure de départ du retour" },
  same: "Mêmes places et même note pour les deux voitures.",
  required: "Champ requis.",
  // Under each place of a car, after its error (place-autocomplete, AL1.9 (b), AL4.4).
  placeHint: "Visible par toutes les personnes qui ont le lien.",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
};

const panel = (page: Page) => page.getByRole("tabpanel");
const form = (page: Page) => page.getByRole("dialog", { name: FR.offer });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider" });
const field = (page: Page, label: string) => form(page).getByLabel(label, { exact: true });
const otherLeg = (page: Page, title: string) => form(page).getByRole("radiogroup", { name: title });
const radio = (scope: Locator, name: string) => scope.getByRole("radio", { name, exact: true });
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Locator) => scope.getByRole("button", { name: /^Place libre : / });

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

async function openForm(page: Page) {
  await panel(page).getByRole("button", { name: FR.offer, exact: true }).click();
  await expect(form(page)).toBeVisible();
}

/** The device holds `names`, with their token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, names: string[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const firstName of names) ids[firstName] = (await seedPerson(db, eventId, { firstName }, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

const place = (db: Db, eventId: string, personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });

const rides = (db: Db, eventId: string) =>
  db.selectFrom("ride").select(["leg", "location", "departure_time", "seats", "note"]).where("event_id", "=", eventId).orderBy("leg").execute();

/** Where `personId` is on `leg`: the Ride, `null` without a car, `undefined` not concerned. */
async function placementOf(db: Db, personId: string, leg: Leg) {
  const row = await db.selectFrom("placement").select("ride_id").where("person_id", "=", personId).where("leg", "=", leg).executeTakeFirst();
  return row?.ride_id;
}

/** The radios of a group, as their labels read, and the one checked. */
async function radios(group: Locator) {
  const all = await group.getByRole("radio").all();
  const names = await Promise.all(all.map((each) => each.getAttribute("aria-labelledby").then((id) => group.page().locator(`[id="${id}"]`).textContent())));
  const checked = await Promise.all(all.map((each) => each.getAttribute("aria-checked")));
  return { names, checked: names.filter((_, at) => checked[at] === "true") };
}

test.describe("the other leg in « Proposer une voiture »", () => {
  test.use({ locale: "fr-FR" });

  test("C4.11, C4.2, C4.4: « Je ramène aussi » makes the retour's car where and when unfolded; the place follows until changed", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    // A new person: « Je ne fais pas le retour » (C4.4), nothing unfolded.
    expect(await radios(group)).toEqual({ names: [FR.drive.retour, FR.withoutCar, FR.notConcerned.retour], checked: [FR.notConcerned.retour] });
    await expect(field(page, FR.location.retour)).toHaveCount(0);

    await field(page, FR.firstName).fill("Marc");
    await field(page, FR.location.aller).fill("Mairie");
    await radio(group, FR.drive.retour).check();
    await expect(field(page, FR.location.retour)).toHaveValue("Mairie");
    await expect(field(page, FR.otherTime.retour)).toHaveValue("18:00");
    await expect(field(page, FR.otherTime.retour)).toHaveAccessibleDescription("Le samedi 12 décembre 2026");
    await expect(form(page)).toContainText(FR.same);
    // It follows this leg's place, until it is changed.
    await field(page, FR.location.aller).fill("Mairie de Vitré");
    await expect(field(page, FR.location.retour)).toHaveValue("Mairie de Vitré");
    await field(page, FR.location.retour).fill("Gymnase");
    await field(page, FR.location.aller).fill("Mairie de Vitré, parvis");
    await expect(field(page, FR.location.retour)).toHaveValue("Gymnase");
    // Unfolded, the sheet does not scroll sideways at 360 px (C11.2).
    expect(await form(page).evaluate((sheet) => sheet.scrollWidth - sheet.clientWidth)).toBe(0);

    await field(page, FR.otherTime.retour).fill("18:30");
    await field(page, "Places, sans compter qui conduit").fill("2");
    await field(page, "Note (facultatif)").fill("Coffre plein");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect(await rides(db, id)).toEqual([
      { leg: "aller", location: "Mairie de Vitré, parvis", departure_time: "07:30:00", seats: 2, note: "Coffre plein" },
      { leg: "retour", location: "Gymnase", departure_time: "18:30:00", seats: 2, note: "Coffre plein" },
    ]);
    await selectTab(page, "Retour");
    await expect(freeSeats(car(page, "Marc"))).toHaveCount(2);
  });

  test("C4.2: « J’emmène aussi » from the Retour tab, from her state there by default", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await place(db, id, lea, "aller", null);
    await page.goto(`/e/${id}`);
    await selectTab(page, "Retour");
    await openForm(page);
    const group = otherLeg(page, FR.title.aller);
    expect(await radios(group)).toEqual({ names: [FR.drive.aller, FR.withoutCar, FR.notConcerned.aller], checked: [FR.withoutCar] });
    await radio(group, FR.drive.aller).check();
    await expect(field(page, FR.otherTime.aller)).toHaveValue("07:30");
    await field(page, FR.location.retour).fill("Gymnase");
    await expect(field(page, FR.location.aller)).toHaveValue("Gymnase");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect((await rides(db, id)).map((ride) => [ride.leg, ride.location, ride.departure_time])).toEqual([
      ["aller", "Gymnase", "07:30:00"],
      ["retour", "Gymnase", "18:00:00"],
    ]);
    // She drives on the aller now: no longer without a car there.
    expect(await placementOf(db, lea, "aller")).toBeUndefined();
  });

  test("C4.11: it follows who drives; « Je cherche une place » and « Je ne fais pas le retour » do what they say", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea, Tom: tom } = await device(db, page, id, ["Léa", "Tom"]);
    await place(db, id, tom, "retour", null);
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    const drivers = form(page).getByRole("radiogroup", { name: "Qui conduit ?" });
    await radio(drivers, "Tom").check();
    expect((await radios(group)).checked).toEqual([FR.withoutCar]);
    await radio(drivers, "Léa").check();
    expect((await radios(group)).checked).toEqual([FR.notConcerned.retour]);
    await radio(group, FR.withoutCar).check();
    await field(page, FR.location.aller).fill("Gare");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);

    await openForm(page);
    expect((await radios(group)).checked).toEqual([FR.withoutCar]);
    await radio(group, FR.notConcerned.retour).check();
    await field(page, FR.location.aller).fill("Église");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect([await placementOf(db, lea, "retour"), await placementOf(db, tom, "retour")]).toEqual([null, undefined]);
    expect((await rides(db, id)).map((ride) => ride.leg)).toEqual(["aller", "aller"]);
  });

  test("C4.11: « Je ramène aussi » checked before anyone drives is kept once someone does (review of #212)", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await device(db, page, id, ["Léa", "Tom"]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    await field(page, FR.location.aller).fill("Gare");
    await radio(group, FR.drive.retour).check();
    await submit(page).click();
    const drivers = form(page).getByRole("radiogroup", { name: "Qui conduit ?" });
    await expect(drivers).toHaveAccessibleDescription("Choisissez qui conduit.");
    await radio(drivers, "Léa").check();
    expect((await radios(group)).checked).toEqual([FR.drive.retour]);
    await expect(field(page, FR.location.retour)).toHaveValue("Gare");
    // Léa's from now on: Tom has his own default, and Léa gets hers back.
    await radio(drivers, "Tom").check();
    expect((await radios(group)).checked).toEqual([FR.notConcerned.retour]);
    await radio(drivers, "Léa").check();
    expect((await radios(group)).checked).toEqual([FR.drive.retour]);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect((await rides(db, id)).map((ride) => ride.leg)).toEqual(["aller", "retour"]);
  });

  test("C4.11, C4.6: absent once she drives on the other leg, from another tab: « Valider » keeps the focus", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    await radio(group, FR.drive.retour).check();
    await field(page, FR.location.aller).fill("Gare");
    await seedRide(db, id, lea, { leg: "retour" });
    // Sent from the place unfolded, which the refusal takes away.
    await field(page, FR.location.retour).press("Enter");
    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    await expect(group).toHaveCount(0);
    await expect(submit(page)).toBeFocused();
    // A new person has none on the other leg: the field is back.
    const drivers = form(page).getByRole("radiogroup", { name: "Qui conduit ?" });
    await radio(drivers, FR.newDriver).check();
    expect((await radios(group)).checked).toEqual([FR.notConcerned.retour]);
    await radio(drivers, "Léa").check();
    await expect(group).toHaveCount(0);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect((await rides(db, id)).map((ride) => [ride.leg, ride.location])).toEqual([
      ["aller", "Gare"],
      ["retour", "Mairie de Cesson"],
    ]);
  });

  test("C4.12, C3.5: a passenger of Marc stays by default; « Je ramène aussi » leaves his car, which frees a seat", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, id, marc.id, { leg: "retour" });
    const { Léa: lea, Tom: tom } = await device(db, page, id, ["Léa", "Tom"]);
    await place(db, id, lea, "retour", marcsCar);
    await place(db, id, tom, "retour", marcsCar);
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    const stay = "Je reste dans la voiture de Marc";
    await radio(form(page), "Léa").check();
    expect(await radios(group)).toEqual({ names: [FR.drive.retour, stay, FR.withoutCar, FR.notConcerned.retour], checked: [stay] });
    for (const leaving of [FR.drive.retour, FR.withoutCar, FR.notConcerned.retour]) {
      await expect(radio(group, leaving)).toHaveAccessibleDescription("Quittera la voiture de Marc");
    }
    await expect(radio(group, stay)).toHaveAccessibleDescription("");
    // C3.5: without « Je ramène aussi », the retour does not change.
    await field(page, FR.location.aller).fill("Gare");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect(await placementOf(db, lea, "retour")).toBe(marcsCar);

    await openForm(page);
    await radio(group, FR.drive.retour).check();
    await field(page, FR.location.aller).fill("Église");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await selectTab(page, "Retour");
    await expect(freeSeats(car(page, "Marc"))).toHaveCount(2);
    await expect(car(page, "Tom")).toContainText("Église");
  });

  test("C4.10: a response lost, then sent again with « Je ramène aussi »: exactly two cars", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    let lost = false;
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (!lost && request.headers()["next-action"] && request.postData()?.includes("Mairie de Vitré")) {
        lost = true;
        await route.fetch();
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.firstName).fill("Marc");
    await field(page, FR.location.aller).fill("Mairie de Vitré");
    await radio(otherLeg(page, FR.title.retour), FR.drive.retour).check();
    await submit(page).click();
    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect((await rides(db, id)).map((ride) => ride.leg)).toEqual(["aller", "retour"]);
  });

  test("C4.7: the other leg's place or time empty: nothing sent, the focus on the first", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.headers()["next-action"] && request.postData()?.includes("Mairie")) sent.push(request.url());
    });
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.firstName).fill("Marc");
    await field(page, FR.location.aller).fill("Mairie");
    await radio(otherLeg(page, FR.title.retour), FR.drive.retour).check();
    await field(page, FR.location.retour).fill("");
    await field(page, FR.otherTime.retour).fill("");
    await submit(page).click();
    await expect(field(page, FR.location.retour)).toBeFocused();
    await expect(field(page, FR.location.retour)).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, FR.location.retour)).toHaveAccessibleDescription(`${FR.required} ${FR.placeHint}`);
    await expect(field(page, FR.otherTime.retour)).toHaveAccessibleDescription(`${FR.required} Le samedi 12 décembre 2026`);
    // This leg's place stays as it was, and holds no error.
    await expect(field(page, FR.location.aller)).not.toHaveAttribute("aria-invalid");
    expect(sent).toEqual([]);
    expect(await rides(db, id)).toEqual([]);
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    test("C4.11: no other leg in the form", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      // No tabs: the only leg.
      await page.getByRole("button", { name: FR.offer, exact: true }).click();
      await expect(field(page, FR.firstName)).toBeVisible();
      await expect(form(page).getByRole("radiogroup")).toHaveCount(0);
      await expect(form(page)).not.toContainText(FR.title.retour);
    });
  });
});
