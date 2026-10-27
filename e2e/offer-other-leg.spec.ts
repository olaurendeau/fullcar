import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { animationsDone, holdToken, newToken } from "./device";
import { DRIVER_PHONE, fillDriver, numbersHidden } from "./driver";
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
  drive: { aller: "J’emmène aussi des personnes", retour: "Je ramène aussi des personnes" },
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

/** The device holds `names`, each with a number to drive, with their token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, names: string[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const firstName of names) ids[firstName] = (await seedPerson(db, eventId, { firstName, phone: DRIVER_PHONE }, token)).id;
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

  test("C4.11, C4.2, C4.4: « Je ramène aussi des personnes » makes the retour's car where and when unfolded; the place follows until changed", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = otherLeg(page, FR.title.retour);
    // A new person: « Je ne fais pas le retour » (C4.4), nothing unfolded.
    expect(await radios(group)).toEqual({ names: [FR.drive.retour, FR.withoutCar, FR.notConcerned.retour], checked: [FR.notConcerned.retour] });
    await expect(field(page, FR.location.retour)).toHaveCount(0);

    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
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

  test("C4.2: « J’emmène aussi des personnes » from the Retour tab, from her state there by default", async ({ db, page, seededEvent }) => {
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

  test("C4.11: « Je ramène aussi des personnes » checked before anyone drives is kept once someone does (review of #212)", async ({ db, page, seededEvent }) => {
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

  test("C4.12, C3.5: a passenger of Marc stays by default; « Je ramène aussi des personnes » leaves his car, which frees a seat", async ({ db, page, seededEvent }) => {
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
    // C3.5: without « Je ramène aussi des personnes », the retour does not change.
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
    await numbersHidden(() => expect(car(page, "Tom")).toContainText("Église"));
  });

  test("C4.10: a response lost, then sent again with « Je ramène aussi des personnes »: exactly two cars", async ({ db, page, seededEvent }) => {
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
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
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
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
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

// #649, event-board v4.5 (E1.1 to E1.7): the other leg read from the event, its line under its title.

const LONG_PLACE = "Complexe sportif intercommunal Colette-Besson, entrée par le parking nord, 12 boulevard Albert-Ier, 35200 Rennes, France";

const HINT = {
  retour: "Le retour part du lieu de l’événement, Gymnase des Gayeulles, le samedi 12 décembre 2026 à 18:00.",
  aller: "L’aller va jusqu’au lieu de l’événement, Gymnase des Gayeulles, le samedi 12 décembre 2026 à 07:30.",
};

const EN = {
  offer: "Offer a car",
  title: { aller: "On the outbound trip", retour: "On the return trip" },
  drive: { aller: "I take people there too", retour: "I bring people back too" },
  hint: {
    retour: /^The return trip leaves Gymnase des Gayeulles on Saturday, December 12, 2026 at 6:00\sPM\.$/,
    aller: /^The outbound trip goes to Gymnase des Gayeulles on Saturday, December 12, 2026 at 7:30\sAM\.$/,
  },
};

/** The line of a group: the element its `aria-describedby` names. */
async function hintOf(group: Locator) {
  const id = await group.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  return group.page().locator(`[id="${id}"]`);
}

/** Opens « Proposer une voiture », or `offer` in another language, from the Aller or from the tab named. */
async function openFrom(page: Page, eventId: string, tab?: string, offer = FR.offer) {
  await page.goto(`/e/${eventId}`);
  if (tab) await selectTab(page, tab);
  await panel(page).getByRole("button", { name: offer, exact: true }).click();
  await expect(page.getByRole("dialog", { name: offer })).toBeVisible();
}

/** E1.5: the line wraps, the place whole, and nothing overflows the page, the sheet, the group or the line. */
async function expectWrapped(page: Page, offer: string, group: Locator) {
  const line = await hintOf(group);
  await expect(line).toBeVisible();
  await expect(line).toContainText(LONG_PLACE);
  await expect(line).not.toContainText("…");
  expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const scope of [page.getByRole("dialog", { name: offer }), group]) {
    expect(await scope.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(await line.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(0);
}

test.describe("the other leg read from the event (v4.5)", () => {
  test.use({ locale: "fr-FR" });

  test("E1.1: from the Aller, « Au retour » is described by where and when the retour leaves", async ({ page, seededEvent }) => {
    await openFrom(page, seededEvent.id);
    const group = otherLeg(page, FR.title.retour);
    await expect(group).toHaveAccessibleDescription(HINT.retour);
    expect(await radios(group)).toEqual({ names: [FR.drive.retour, FR.withoutCar, FR.notConcerned.retour], checked: [FR.notConcerned.retour] });
    const line = await hintOf(group);
    await expect(line).toBeVisible();
    // Measured once the sheet has slid in: read at two frames of its opening, two boxes were not
    // in the same sheet's place (#820).
    await animationsDone(form(page));
    const [title, hint, first] = await Promise.all([
      form(page).getByText(FR.title.retour, { exact: true }).boundingBox(),
      line.boundingBox(),
      group.getByRole("radio").first().boundingBox(),
    ]);
    expect(hint!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(first!.y);
    await expect(radio(form(page), "Je ramène aussi")).toHaveCount(0);
  });

  test("E1.1, C4.5: a passenger of Marc on the retour: the same line, then the four choices", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, id, marc.id, { leg: "retour" });
    const { Claire: claire } = await device(db, page, id, ["Claire"]);
    await place(db, id, claire, "retour", marcsCar);
    await openFrom(page, id);
    await radio(form(page).getByRole("radiogroup", { name: "Qui conduit ?" }), "Claire").check();
    const group = otherLeg(page, FR.title.retour);
    await expect(group).toHaveAccessibleDescription(HINT.retour);
    const stay = "Je reste dans la voiture de Marc";
    expect(await radios(group)).toEqual({ names: [FR.drive.retour, stay, FR.withoutCar, FR.notConcerned.retour], checked: [stay] });
    for (const leaving of [FR.drive.retour, FR.withoutCar, FR.notConcerned.retour]) {
      await expect(radio(group, leaving)).toHaveAccessibleDescription("Quittera la voiture de Marc");
    }
  });

  test("E1.2: from the Retour, « À l’aller » is described by where and when the aller goes", async ({ page, seededEvent }) => {
    await openFrom(page, seededEvent.id, "Retour");
    const group = otherLeg(page, FR.title.aller);
    await expect(group).toHaveAccessibleDescription(HINT.aller);
    expect((await radios(group)).names[0]).toBe(FR.drive.aller);
  });

  test("E1.3: the line describes the leg, not the car: still 18:00 when the retour's car leaves at 18:30", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await openFrom(page, id);
    const group = otherLeg(page, FR.title.retour);
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
    await field(page, FR.location.aller).fill("Mairie");
    await radio(group, FR.drive.retour).check();
    await expect(field(page, FR.location.retour)).toBeVisible();
    await expect(field(page, FR.otherTime.retour)).toBeVisible();
    await field(page, FR.otherTime.retour).fill("18:30");
    await expect(group).toHaveAccessibleDescription(HINT.retour);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect((await rides(db, id)).map((ride) => [ride.leg, ride.departure_time])).toEqual([
      ["aller", "07:30:00"],
      ["retour", "18:30:00"],
    ]);
  });

  test.describe("a place of 120 characters", () => {
    test.use({ eventFields: { location: LONG_PLACE } });

    test("E1.5: at 360 px, the line wraps, the place whole, and nothing overflows", async ({ page, seededEvent }) => {
      expect(LONG_PLACE).toHaveLength(120);
      await openFrom(page, seededEvent.id);
      await expectWrapped(page, FR.offer, otherLeg(page, FR.title.retour));
    });
  });

  test.describe("the retour another day", () => {
    test.use({ eventFields: { retourAt: "2026-12-13 17:00:00" } });

    test("E1.6: the line gives the retour's whole date", async ({ page, seededEvent }) => {
      await openFrom(page, seededEvent.id);
      await expect(otherLeg(page, FR.title.retour)).toHaveAccessibleDescription(
        "Le retour part du lieu de l’événement, Gymnase des Gayeulles, le dimanche 13 décembre 2026 à 17:00.",
      );
    });
  });

  test.describe("the retour on the first of a month", () => {
    test.use({ eventFields: { retourAt: "2027-05-01 18:00:00" } });

    test("E1.6, #625: the line writes « 1er », as the header does", async ({ page, seededEvent }) => {
      await openFrom(page, seededEvent.id);
      await expect(otherLeg(page, FR.title.retour)).toHaveAccessibleDescription(
        "Le retour part du lieu de l’événement, Gymnase des Gayeulles, le samedi 1er mai 2027 à 18:00.",
      );
    });
  });

  test("E1.7: who drives already on the retour has no group, so no line; someone else has both back", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await seedRide(db, id, lea, { leg: "retour" });
    await openFrom(page, id);
    const drivers = form(page).getByRole("radiogroup", { name: "Qui conduit ?" });
    await radio(drivers, "Léa").check();
    await expect(otherLeg(page, FR.title.retour)).toHaveCount(0);
    await expect(form(page)).not.toContainText("Le retour part");
    await radio(drivers, FR.newDriver).check();
    await expect(otherLeg(page, FR.title.retour)).toHaveAccessibleDescription(HINT.retour);
    await radio(drivers, "Léa").check();
    await expect(otherLeg(page, FR.title.retour)).toHaveCount(0);
    await expect(form(page)).not.toContainText("Le retour part");
  });

  test("E1.7: « Modifier la voiture » has no group, so no line", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await seedRide(db, id, lea, { leg: "aller" });
    await page.goto(`/e/${id}`);
    await car(page, "Léa").getByRole("button", { name: "Modifier", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Modifier la voiture" });
    await expect(sheet.getByLabel(FR.location.aller, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("radiogroup", { name: FR.title.retour })).toHaveCount(0);
    await expect(sheet).not.toContainText("Le retour part");
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    test("E1.7: no group « Au retour », no line", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await page.getByRole("button", { name: FR.offer, exact: true }).click();
      await expect(field(page, FR.firstName)).toBeVisible();
      await expect(form(page).getByRole("radiogroup", { name: FR.title.retour })).toHaveCount(0);
      await expect(form(page)).not.toContainText("Le retour part");
    });
  });
});

test.describe("the other leg read from the event, in English (v4.5)", () => {
  test.use({ locale: "en-US" });
  const group = (page: Page, title: string) => page.getByRole("dialog", { name: EN.offer }).getByRole("radiogroup", { name: title });

  test("E1.4: the lines and the choices that drive, from either tab", async ({ page, seededEvent }) => {
    await openFrom(page, seededEvent.id, undefined, EN.offer);
    const retour = group(page, EN.title.retour);
    await expect(retour).toHaveAccessibleDescription(EN.hint.retour);
    expect((await radios(retour)).names[0]).toBe(EN.drive.retour);

    await openFrom(page, seededEvent.id, "Return", EN.offer);
    const aller = group(page, EN.title.aller);
    await expect(aller).toHaveAccessibleDescription(EN.hint.aller);
    expect((await radios(aller)).names[0]).toBe(EN.drive.aller);
  });

  test.describe("a place of 120 characters", () => {
    test.use({ eventFields: { location: LONG_PLACE } });

    test("E1.5: at 360 px, the line wraps in English too", async ({ page, seededEvent }) => {
      await openFrom(page, seededEvent.id, undefined, EN.offer);
      await expectWrapped(page, EN.offer, group(page, EN.title.retour));
    });
  });
});
