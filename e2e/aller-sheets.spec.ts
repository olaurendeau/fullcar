import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { editEventInDb, removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #266, epic #250 (organizer-view v3.3.6, decisions 41 and 47, M7.6, M7.8): a sheet opened on
 * the Aller that sends on the retour too (« Je ramène aussi », « Je cherche une place » au
 * retour, « Aller et retour »), refused by `noRetour`, stays open without its retour part, says
 * `Actions.noRetour` above « Valider », which takes the focus, and a second « Valider » records the
 * aller alone. Closed before the answer, the bar says what to do again. A sheet keeps the legs
 * it had at its opening: neither the retour going nor one coming changes it, nor takes its focus
 * to <body>. The organiser changes the event in the database (`editEventInDb`), as `updateEvent`
 * does. Nothing here prints a token, the admin link or a number.
 */

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  add: "Ajouter une personne",
  both: "Aller et retour",
  retour: "Au retour",
  drive: "Je ramène aussi",
  withoutCar: "Je cherche une place",
  notConcerned: "Je ne fais pas le retour",
  noRetour: "Il n’y a plus de retour pour cet événement : rien n’a changé.",
};
const AGAIN = "Il n’y a plus de retour pour cet événement :";
const TEXT = {
  offerBoth: `Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. ${AGAIN} proposez de nouveau la voiture, pour l’aller seulement.`,
  offerAller: `La voiture de Claire pour l’aller n’a pas été proposée. ${AGAIN} proposez de nouveau la voiture, pour l’aller seulement.`,
  person: `Inès n’a pas pu rejoindre vos inscriptions. ${AGAIN} ajoutez de nouveau cette personne, pour l’aller seulement.`,
};
const PLACE = "Parking du stade";

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const submit = (page: Page, name: string) => dialog(page, name).getByRole("button", { name: "Valider" });
/** The bar's lines and the tabs, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const tabs = (page: Page) => page.locator('[role="tab"]');
const retourGroup = (page: Page) => dialog(page, FR.offer).getByRole("radiogroup", { name: FR.retour });

/** The page open on the aller, its device known: « Ajouter une personne » waits for it (C5.9). */
async function open(page: Page, eventId: string, scope: (page: Page) => Locator = (each) => each.getByRole("tabpanel")) {
  await page.goto(`/e/${eventId}`);
  await expect(scope(page).getByRole("button", { name: FR.add, exact: true })).toBeEnabled();
  return scope(page);
}

/**
 * Claire, on the device, without a car at the aller; at the retour, without a car too, or not
 * concerned. She alone can drive, chosen as the sheet opens, and a choice au retour other than
 * where she stands is sent (`otherLegKind`).
 */
async function seedClaire(db: Db, page: Page, eventId: string, retour: "withoutCar" | "notConcerned" = "notConcerned") {
  const token = newToken();
  const claire = (await seedPerson(db, eventId, { firstName: "Claire" }, token)).id;
  await seedPlacement(db, { personId: claire, eventId, leg: "aller", rideId: null });
  if (retour === "withoutCar") await seedPlacement(db, { personId: claire, eventId, leg: "retour", rideId: null });
  await holdToken(page, eventId, token);
}

/** `firstName` is shown without a car at the aller, under the sheet: the answer is applied. */
const registered = (page: Page, firstName: string) =>
  expect(page.getByRole("region", { name: "Sans voiture", includeHidden: true }).getByText(firstName)).toBeAttached();

/** « Proposer une voiture » from the aller, Claire driving, with `choice` au retour. */
async function fillOffer(page: Page, scope: Locator, choice: string) {
  await scope.getByRole("button", { name: FR.offer, exact: true }).click();
  const form = dialog(page, FR.offer);
  await form.getByLabel("Lieu de départ", { exact: true }).fill(PLACE);
  await form.getByLabel("Places, sans compter qui conduit", { exact: true }).fill("3");
  await form.getByLabel("Note (facultatif)", { exact: true }).fill("Départ à l’heure");
  await retourGroup(page).getByRole("radio", { name: choice, exact: true }).check();
}

/** What the offer's sheet kept of the aller: its place, its seats and its note. */
async function expectAllerKept(page: Page) {
  const form = dialog(page, FR.offer);
  await expect(form.getByLabel("Lieu de départ", { exact: true })).toHaveValue(PLACE);
  await expect(form.getByLabel("Places, sans compter qui conduit", { exact: true })).toHaveValue("3");
  await expect(form.getByLabel("Note (facultatif)", { exact: true })).toHaveValue("Départ à l’heure");
}

/** `locator` has the focus, and still has it once anything a `setTimeout` gives the focus to has run. */
async function expectFocusStays(page: Page, locator: Locator) {
  await expect(locator).toBeFocused();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  await expect(locator).toBeFocused();
}

/** Registers `firstName` from `scope`, for the aller alone, its answer held until `answer()`; the sheet closed meanwhile. */
async function sendHeldRegistration(page: Page, scope: Locator, firstName: string, hasRetour: boolean) {
  const answer = await holdFirst(page, firstName, false);
  await scope.getByRole("button", { name: FR.add, exact: true }).click();
  await dialog(page, FR.add).getByLabel("Prénom").fill(firstName);
  if (hasRetour) await dialog(page, FR.add).getByRole("checkbox", { name: FR.both }).uncheck();
  await submit(page, FR.add).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(firstName));
  return async () => {
    answer();
    await answered;
  };
}

const rides = (db: Db, eventId: string) => db.selectFrom("ride").select(["leg", "location"]).where("event_id", "=", eventId).execute();

/** The legs on which `firstName`, of event `eventId`, has a Placement. */
const legsOf = async (db: Db, eventId: string, firstName: string) =>
  (
    await db
      .selectFrom("placement")
      .innerJoin("person", "person.id", "placement.person_id")
      .select("placement.leg")
      .where("person.event_id", "=", eventId)
      .where("person.first_name", "=", firstName)
      .orderBy("placement.leg")
      .execute()
  ).map(({ leg }) => leg);

test.describe("a sheet of the Aller that sends on the retour, the retour removed meanwhile", () => {
  test.use({ locale: "fr-FR" });

  test("M7.6: « Je ramène aussi » is refused; the sheet stays without « Au retour », and a second « Valider » offers the aller", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedClaire(db, page, seededEvent.id);
    const scope = await open(page, seededEvent.id);
    const seen = await watchAlerts(page);
    await fillOffer(page, scope, FR.drive);
    await removeRetourInDb(db, seededEvent.id);
    // Sent from a field, which keeps the focus while the form sends: « Valider » takes it all the same.
    await dialog(page, FR.offer).getByLabel("Lieu de départ", { exact: true }).press("Enter");

    await expect(dialog(page, FR.offer).getByRole("alert")).toHaveText(FR.noRetour);
    await expect(retourGroup(page)).toHaveCount(0);
    await expect(dialog(page, FR.offer).getByLabel("Lieu de dépose")).toHaveCount(0);
    await expectAllerKept(page);
    await expectFocusStays(page, submit(page, FR.offer));
    expect(await rides(db, seededEvent.id)).toEqual([]);
    await expect(lines(page)).toHaveCount(0);

    await submit(page, FR.offer).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await rides(db, seededEvent.id)).toEqual([{ leg: "aller", location: PLACE }]);
    await expect(tabs(page)).toHaveCount(0);
    await expect(lines(page)).toHaveCount(0);
    await expectFocusStays(page, title(page));
    // Said in the sheet, and nothing written in the bar under it.
    expect(await seen()).toEqual({ inSheet: true, barHidden: false });
  });

  for (const [choice, text] of [
    [FR.drive, TEXT.offerBoth],
    [FR.withoutCar, TEXT.offerAller],
  ]) {
    test(`M7.6, B1.7: « ${choice} », the sheet closed before the answer: the bar says to offer the car again; offered again, the line goes`, async ({
      page,
      db,
      seededEvent,
    }) => {
      await seedClaire(db, page, seededEvent.id);
      const scope = await open(page, seededEvent.id);
      const seen = await watchAlerts(page);
      const answer = await holdFirst(page, PLACE, false);
      await fillOffer(page, scope, choice);
      await submit(page, FR.offer).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await removeRetourInDb(db, seededEvent.id);
      answer();

      await expect(lines(page)).toHaveText([text]);
      await expect(tabs(page)).toHaveCount(0);
      await expectFocusStays(page, title(page));
      expect(await rides(db, seededEvent.id)).toEqual([]);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });

      // B1.7: the car offered again for the aller, the one leg left, its answer held: the line goes as it leaves.
      const again = await holdFirst(page, PLACE, false);
      await page.getByRole("region", { name: "Aller", exact: true }).getByRole("button", { name: FR.offer, exact: true }).click();
      await dialog(page, FR.offer).getByLabel("Lieu de départ", { exact: true }).fill(PLACE);
      await expect(retourGroup(page)).toHaveCount(0);
      await submit(page, FR.offer).click();
      await expect(lines(page)).toHaveCount(0);
      expect(await rides(db, seededEvent.id)).toEqual([]);
      again();
      await expect.poll(() => rides(db, seededEvent.id)).toEqual([{ leg: "aller", location: PLACE }]);
    });
  }

  test("M7.6: « Je ne fais pas le retour » offers the aller, without a refusal", async ({ page, db, seededEvent }) => {
    await seedClaire(db, page, seededEvent.id, "withoutCar");
    const scope = await open(page, seededEvent.id);
    await fillOffer(page, scope, FR.notConcerned);
    await removeRetourInDb(db, seededEvent.id);
    await submit(page, FR.offer).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await rides(db, seededEvent.id)).toEqual([{ leg: "aller", location: PLACE }]);
    await expect(lines(page)).toHaveCount(0);
  });

  test("M7.6: a state without the retour, applied before any send, leaves « Au retour » in the sheet", async ({ page, db, seededEvent }) => {
    await seedClaire(db, page, seededEvent.id);
    const scope = await open(page, seededEvent.id);
    const answer = await sendHeldRegistration(page, scope, "Inès", true);
    await fillOffer(page, scope, FR.drive);
    await removeRetourInDb(db, seededEvent.id);
    await answer();

    await registered(page, "Inès");
    await expect(retourGroup(page)).toBeVisible();
    await expect(dialog(page, FR.offer).getByLabel("Lieu de dépose")).toHaveValue(PLACE);
    await expect(tabs(page)).toHaveCount(2);
    await expectFocusStays(page, retourGroup(page).getByRole("radio", { name: FR.drive, exact: true }));

    // Its own answer takes it away.
    await submit(page, FR.offer).click();
    await expect(dialog(page, FR.offer).getByRole("alert")).toHaveText(FR.noRetour);
    await expect(retourGroup(page)).toHaveCount(0);
    await expectFocusStays(page, submit(page, FR.offer));
  });

  test("M7.8: « Aller et retour » is refused; the sheet stays without it, and a second « Valider » registers Inès at the aller", async ({
    page,
    db,
    seededEvent,
  }) => {
    const scope = await open(page, seededEvent.id);
    const seen = await watchAlerts(page);
    await scope.getByRole("button", { name: FR.add, exact: true }).click();
    await dialog(page, FR.add).getByLabel("Prénom").fill("Inès");
    await expect(dialog(page, FR.add).getByRole("checkbox", { name: FR.both })).toBeChecked();
    await removeRetourInDb(db, seededEvent.id);
    // Sent from a field, which keeps the focus while the form sends: « Valider » takes it all the same.
    await dialog(page, FR.add).getByLabel("Prénom").press("Enter");

    await expect(dialog(page, FR.add).getByRole("alert")).toHaveText(FR.noRetour);
    await expect(dialog(page, FR.add).getByRole("checkbox", { name: FR.both })).toHaveCount(0);
    await expect(dialog(page, FR.add).getByLabel("Prénom")).toHaveValue("Inès");
    await expectFocusStays(page, submit(page, FR.add));
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual([]);

    await submit(page, FR.add).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual(["aller"]);
    await expect(lines(page)).toHaveCount(0);
    await expectFocusStays(page, title(page));
    // Said in the sheet, and nothing written in the bar under it.
    expect(await seen()).toEqual({ inSheet: true, barHidden: false });
  });

  test("M7.8: « Aller et retour », the sheet closed before the answer: the bar says to add Inès again", async ({ page, db, seededEvent }) => {
    const scope = await open(page, seededEvent.id);
    const seen = await watchAlerts(page);
    const answer = await holdFirst(page, "Inès", false);
    await scope.getByRole("button", { name: FR.add, exact: true }).click();
    await dialog(page, FR.add).getByLabel("Prénom").fill("Inès");
    await submit(page, FR.add).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await removeRetourInDb(db, seededEvent.id);
    answer();

    await expect(lines(page)).toHaveText([TEXT.person]);
    await expectFocusStays(page, title(page));
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual([]);
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });
});

// Review of #351: the same person form, in a free seat's sheet of the aller (seat-sheet.tsx), stays
// as « Ajouter une personne » does. Sophie, of another device, drives the aller (3 seats).
test.describe("a free seat's sheet of the Aller, with « Aller et retour », the retour removed meanwhile", () => {
  test.use({ locale: "fr-FR" });
  const seat = (page: Page) => page.getByRole("tabpanel").getByRole("button", { name: "Place libre : prendre une place dans la voiture de Sophie" }).first();
  const seedSophie = async (db: Db, eventId: string) => {
    const sophie = (await seedPerson(db, eventId, { firstName: "Sophie" })).id;
    return seedRide(db, eventId, sophie, { leg: "aller" });
  };
  /** The form refused: « Aller et retour » gone, the first name kept, the alert said, and « Valider » focused. */
  async function expectRefused(page: Page, form: Locator) {
    await expect(form.getByRole("alert")).toHaveText(FR.noRetour);
    await expect(form.getByRole("checkbox", { name: FR.both })).toHaveCount(0);
    await expect(form.getByLabel("Prénom")).toHaveValue("Inès");
    await expectFocusStays(page, form.getByRole("button", { name: "Valider" }));
  }

  test("the first registration from a seat stays; a second « Valider » seats Inès at the aller", async ({ page, db, seededEvent }) => {
    const rideId = await seedSophie(db, seededEvent.id);
    await open(page, seededEvent.id);
    const seen = await watchAlerts(page);
    await seat(page).click();
    const form = dialog(page, FR.add);
    await form.getByLabel("Prénom").fill("Inès");
    await expect(form.getByRole("checkbox", { name: FR.both })).toBeChecked();
    await removeRetourInDb(db, seededEvent.id);
    await form.getByLabel("Prénom").press("Enter");

    await expectRefused(page, form);
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual([]);

    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const placed = await db
      .selectFrom("placement")
      .innerJoin("person", "person.id", "placement.person_id")
      .select(["placement.leg", "placement.ride_id"])
      .where("person.event_id", "=", seededEvent.id)
      .where("person.first_name", "=", "Inès")
      .execute();
    expect(placed).toEqual([{ leg: "aller", ride_id: rideId }]);
    expect(await seen()).toEqual({ inSheet: true, barHidden: false });
  });

  test("« Ajouter une personne » in « Qui monte… ? » stays; a second « Valider » adds Inès to its list, at the aller", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedSophie(db, seededEvent.id);
    const token = newToken();
    for (const firstName of ["Tom", "Léa"]) {
      const personId = (await seedPerson(db, seededEvent.id, { firstName }, token)).id;
      await seedPlacement(db, { personId, eventId: seededEvent.id, leg: "aller", rideId: null });
    }
    await holdToken(page, seededEvent.id, token);
    await open(page, seededEvent.id);
    const seen = await watchAlerts(page);
    await seat(page).click();
    const sheet = dialog(page, "Qui monte dans la voiture de Sophie ?");
    await sheet.getByRole("button", { name: FR.add, exact: true }).click();
    // The same sheet, titled after the form while it shows it.
    const form = dialog(page, FR.add);
    await form.getByLabel("Prénom").fill("Inès");
    await removeRetourInDb(db, seededEvent.id);
    await form.getByLabel("Prénom").press("Enter");

    await expectRefused(page, form);
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual([]);

    await form.getByRole("button", { name: "Valider" }).click();
    await expectFocusStays(page, sheet.getByRole("checkbox", { name: "Inès", exact: true }));
    expect(await legsOf(db, seededEvent.id, "Inès")).toEqual(["aller"]);
    expect(await seen()).toEqual({ inSheet: true, barHidden: false });
  });
});

// Review of #330: the aller's panel mounts anew as the tabs come, and the sheet in it with it;
// Radix then gave the focus back to a trigger no longer in the page, and it fell to <body>.
test.describe("a sheet of the Aller, a retour added meanwhile", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("the sheet stays as it opened, its focus kept; closed, the tabs come and the title has the focus", async ({ page, db, seededEvent }) => {
    const allerAlone = (each: Page) => each.getByRole("region", { name: "Aller", exact: true });
    const scope = await open(page, seededEvent.id, allerAlone);
    const seen = await watchAlerts(page);
    const answer = await sendHeldRegistration(page, scope, "Inès", false);
    await scope.getByRole("button", { name: FR.offer, exact: true }).click();
    const place = dialog(page, FR.offer).getByLabel("Lieu de départ", { exact: true });
    await place.fill(PLACE);
    await editEventInDb(db, seededEvent.id, { retourAt: "2026-12-12 18:00:00" });
    await answer();

    await registered(page, "Inès");
    await expect(dialog(page, FR.offer)).toBeVisible();
    await expect(place).toHaveValue(PLACE);
    await expect(retourGroup(page)).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(0);
    await expectFocusStays(page, place);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(2);
    await expectFocusStays(page, title(page));
    // The registration done, nothing to say: no alert anywhere, nor a line under the sheet.
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });
});
