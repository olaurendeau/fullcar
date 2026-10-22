import type { BrowserContext, Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, loseFirst, messages, newToken, recordBar, said, watchAlerts } from "./device";
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
  submit: "Valider",
  place: "Lieu de départ",
  seats: "Places, sans compter qui conduit",
  note: "Note (facultatif)",
  firstName: "Prénom",
  listed: "Sans voiture",
};
/** The words the scene of N1.1 needs in English (event-board v4.4.6). */
const EN: Words = {
  offer: "Offer a car",
  add: "Add a person",
  both: "Outbound and return",
  retour: "On the return trip",
  drive: "I drive back too",
  withoutCar: "I need a seat",
  notConcerned: "I’m not doing the return trip",
  submit: "Confirm",
  place: "Departure place",
  seats: "Seats, driver not included",
  note: "Note (optional)",
  firstName: "First name",
  listed: "Without a car",
};
type Words = Omit<typeof FR, "noRetour">;
const AGAIN = "Il n’y a plus de retour pour cet événement :";
const TEXT = {
  offerBoth: `Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. ${AGAIN} proposez de nouveau la voiture, pour l’aller seulement.`,
  offerAller: `La voiture de Claire pour l’aller n’a pas été proposée. ${AGAIN} proposez de nouveau la voiture, pour l’aller seulement.`,
  person: `Inès n’a pas pu rejoindre vos inscriptions. ${AGAIN} ajoutez de nouveau cette personne, pour l’aller seulement.`,
};
const PLACE = "Parking du stade";

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const submit = (page: Page, name: string, words: Words = FR) => dialog(page, name).getByRole("button", { name: words.submit });
/** The bar's lines and the tabs, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const tabs = (page: Page) => page.locator('[role="tab"]');
const retourGroup = (page: Page, words: Words = FR) => dialog(page, words.offer).getByRole("radiogroup", { name: words.retour });

/** The page open on the aller, its device known: « Ajouter une personne » waits for it (C5.9). */
async function open(page: Page, eventId: string, scope: (page: Page) => Locator = (each) => each.getByRole("tabpanel"), words: Words = FR) {
  await page.goto(`/e/${eventId}`);
  await expect(scope(page).getByRole("button", { name: words.add, exact: true })).toBeEnabled();
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
  return claire;
}

/** `firstName` is shown without a car at the aller, under the sheet: the answer is applied. */
const registered = (page: Page, firstName: string, words: Words = FR) =>
  expect(page.getByRole("region", { name: words.listed, includeHidden: true }).getByText(firstName)).toBeAttached();

/** « Proposer une voiture » from the aller, Claire driving, with `choice` au retour. */
async function fillOffer(page: Page, scope: Locator, choice: string, words: Words = FR) {
  await scope.getByRole("button", { name: words.offer, exact: true }).click();
  const form = dialog(page, words.offer);
  await form.getByLabel(words.place, { exact: true }).fill(PLACE);
  await form.getByLabel(words.seats, { exact: true }).fill("3");
  await form.getByLabel(words.note, { exact: true }).fill("Départ à l’heure");
  await retourGroup(page, words).getByRole("radio", { name: choice, exact: true }).check();
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
async function sendHeldRegistration(page: Page, scope: Locator, firstName: string, hasRetour: boolean, words: Words = FR) {
  const answer = await holdFirst(page, firstName, false);
  await scope.getByRole("button", { name: words.add, exact: true }).click();
  await dialog(page, words.add).getByLabel(words.firstName).fill(firstName);
  if (hasRetour) await dialog(page, words.add).getByRole("checkbox", { name: words.both }).uncheck();
  await submit(page, words.add, words).click();
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

  // The owner's decision on #267 (review of #371): an offer on both legs failed while the retour
  // was there stays once it goes, cut to its aller part, which the aller sent again withdraws.
  test("N1.6: « Je ramène aussi » failed offline, then the retour removed: the line stays, about the aller alone", async ({ page, context, db, seededEvent }) => {
    const offline = "Vérifiez la connexion, puis réessayez.";
    await seedClaire(db, page, seededEvent.id);
    const scope = await open(page, seededEvent.id);
    const lose = await loseFirst(page, PLACE);
    await fillOffer(page, scope, FR.drive);
    await submit(page, FR.offer).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    lose();
    await expect(lines(page)).toHaveText([`Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. ${offline}`]);
    await context.setOffline(false);
    await removeRetourInDb(db, seededEvent.id);
    const answer = await sendHeldRegistration(page, scope, "Inès", true);
    await answer();

    await registered(page, "Inès");
    await expect(tabs(page)).toHaveCount(0);
    await expect(lines(page)).toHaveText([`La voiture de Claire pour l’aller n’a pas été proposée. ${offline}`]);

    const again = await holdFirst(page, PLACE, false);
    await page.getByRole("region", { name: "Aller", exact: true }).getByRole("button", { name: FR.offer, exact: true }).click();
    // Inès is of the device too: who drives is chosen.
    await dialog(page, FR.offer).getByRole("radiogroup", { name: "Qui conduit ?" }).getByRole("radio", { name: "Claire", exact: true }).check();
    await dialog(page, FR.offer).getByLabel("Lieu de départ", { exact: true }).fill(PLACE);
    await submit(page, FR.offer).click();
    await expect(lines(page)).toHaveCount(0);
    again();
    await expect.poll(() => rides(db, seededEvent.id)).toEqual([{ leg: "aller", location: PLACE }]);
  });

  // Offline or an error alone keeps the aller part: a refusal's reason may hold only with the
  // retour. Claire drives there meanwhile; the retour gone, she drives nothing (decision 44).
  test("N1.5: « Je ramène aussi » refused by `alreadyDriving`, then the retour removed: the line goes with it, and `alert` is emptied", async ({
    page,
    db,
    seededEvent,
  }) => {
    const claire = await seedClaire(db, page, seededEvent.id);
    await page.clock.install();
    const scope = await open(page, seededEvent.id);
    const answer = await holdFirst(page, PLACE, false);
    await fillOffer(page, scope, FR.drive);
    await submit(page, FR.offer).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await seedRide(db, seededEvent.id, claire, { leg: "retour" });
    answer();
    const refused = "Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Claire conduit déjà une voiture.";
    await expect(lines(page)).toHaveText([refused]);
    await expect(bar(page)).toHaveText(refused);
    const record = await recordBar(page);
    await removeRetourInDb(db, seededEvent.id);
    await (await sendHeldRegistration(page, scope, "Inès", true))();

    await registered(page, "Inès");
    await expect(tabs(page)).toHaveCount(0);
    await page.clock.runFor(1_000);
    await expect(lines(page)).toHaveCount(0);
    expect(said((await record()).writes, "alert")).toEqual([]);
    await expect(bar(page)).toBeEmpty();
  });

  // Offered from the Retour tab, the line cut to the aller has the aller's « Proposer une voiture »
  // for landmark: the Retour's is gone with the tabs (rule 8).
  test("N1.6: « J’emmène aussi » from the Retour failed offline, then the retour removed: « Fermer » gives the focus to the aller's « Proposer une voiture »", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const offline = "Vérifiez la connexion, puis réessayez.";
    await seedClaire(db, page, seededEvent.id);
    const scope = await open(page, seededEvent.id);
    await expect(async () => {
      await page.getByRole("tab", { name: /^Retour/ }).click();
      await expect(page.getByRole("tab", { name: /^Retour/ })).toHaveAttribute("aria-selected", "true", { timeout: 500 });
    }).toPass();
    const lose = await loseFirst(page, PLACE);
    await scope.getByRole("button", { name: FR.offer, exact: true }).click();
    await dialog(page, FR.offer).getByLabel("Lieu de dépose", { exact: true }).fill(PLACE);
    await dialog(page, FR.offer).getByRole("radiogroup", { name: "À l’aller" }).getByRole("radio", { name: "J’emmène aussi", exact: true }).check();
    await submit(page, FR.offer).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    lose();
    await expect(lines(page)).toHaveText([`Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. ${offline}`]);
    await context.setOffline(false);
    await removeRetourInDb(db, seededEvent.id);
    await page.getByRole("tab", { name: /^Aller/ }).click();
    await (await sendHeldRegistration(page, scope, "Inès", true))();

    await registered(page, "Inès");
    await expect(lines(page)).toHaveText([`La voiture de Claire pour l’aller n’a pas été proposée. ${offline}`]);
    await page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("region", { name: "Aller", exact: true }).getByRole("button", { name: FR.offer, exact: true })).toBeFocused();
  });
});

/*
 * Event-board v4.4.6 (#372, H7): cutting a line to its aller part is not writing it. The region
 * `alert` that said the whole line is emptied, and nothing is written after; one that waits to
 * say it says the cut words, once; one that says another failure is left alone. « Ensuite »:
 * no tabs left, then the clock moves on by 1 000 ms. Inès's answer brings the state without the retour.
 */
test.describe("event-board v4.4.6: a failure line cut to its aller part is not announced", () => {
  const OFFLINE = { "fr-FR": "Vérifiez la connexion, puis réessayez.", "en-US": "Check your connection, then try again." };
  const WHOLE = {
    "fr-FR": "Les voitures de Claire pour l’aller et le retour n’ont pas été proposées.",
    "en-US": "Claire’s cars for the outbound and return trips were not offered.",
  };
  const CUT = { "fr-FR": "La voiture de Claire pour l’aller n’a pas été proposée.", "en-US": "Claire’s car for the outbound trip was not offered." };
  const FAILED = "Une erreur est survenue : réessayez dans un instant.";
  const HUGO = `Hugo n’a pas pu rejoindre vos inscriptions. ${OFFLINE["fr-FR"]}`;

  /** Claire's offer on both legs from the Aller, « Valider », then the sheet closed before its answer. */
  async function sendOffer(page: Page, scope: Locator, words: Words = FR) {
    await fillOffer(page, scope, words.drive, words);
    await submit(page, words.offer, words).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  /** Online, the retour removed, Inès registered at the aller: then « Ensuite », the page without tabs and 1 000 ms gone by. */
  async function removeRetour(page: Page, context: BrowserContext, db: Db, eventId: string, scope: Locator, words: Words = FR) {
    await context.setOffline(false);
    await removeRetourInDb(db, eventId);
    await (await sendHeldRegistration(page, scope, "Inès", true, words))();
    await registered(page, "Inès", words);
    await expect(tabs(page)).toHaveCount(0);
    await page.clock.runFor(1_000);
  }

  for (const [locale, words] of [
    ["fr-FR", FR],
    ["en-US", EN],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test("N1.1: offline, said in `alert`, then the retour removed: the line is cut, `alert` emptied with nothing written, `status` untouched", async ({
        page,
        context,
        db,
        seededEvent,
      }) => {
        await seedClaire(db, page, seededEvent.id);
        await page.clock.install();
        const scope = await open(page, seededEvent.id, undefined, words);
        const lose = await loseFirst(page, PLACE);
        await sendOffer(page, scope, words);
        await context.setOffline(true);
        lose();
        await expect(bar(page)).toHaveText(`${WHOLE[locale]} ${OFFLINE[locale]}`);
        const record = await recordBar(page);
        await removeRetour(page, context, db, seededEvent.id, scope, words);

        await expect(messages(page)).toHaveText([`${CUT[locale]} ${OFFLINE[locale]}`]);
        const { writes } = await record();
        expect(said(writes, "alert")).toEqual([]);
        expect(said(writes, "status")).toEqual([]);
        await expect(bar(page)).toBeEmpty();
      });
    });
  }

  test.describe("fr-FR", () => {
    test.use({ locale: "fr-FR" });

    test("N1.2: an error, said in `alert`, then the retour removed: the line is cut, `alert` emptied with nothing written", async ({
      page,
      context,
      db,
      seededEvent,
    }) => {
      await seedClaire(db, page, seededEvent.id);
      await page.clock.install();
      const scope = await open(page, seededEvent.id);
      const answer = await holdFirst(page, PLACE, true);
      await sendOffer(page, scope);
      await failHeld(page, answer);
      await expect(bar(page)).toHaveText(`${WHOLE["fr-FR"]} ${FAILED}`);
      const record = await recordBar(page);
      await removeRetour(page, context, db, seededEvent.id, scope);

      await expect(messages(page)).toHaveText([`${CUT["fr-FR"]} ${FAILED}`]);
      expect(said((await record()).writes, "alert")).toEqual([]);
      await expect(bar(page)).toBeEmpty();
    });

    test("N1.3: the failure not said yet as its line is cut: `alert` says the cut words once, never the whole line", async ({ page, db, seededEvent }) => {
      await seedClaire(db, page, seededEvent.id);
      await page.clock.install();
      const scope = await open(page, seededEvent.id);
      const claire = await holdFirst(page, PLACE, true);
      await sendOffer(page, scope);
      await removeRetourInDb(db, seededEvent.id);
      // The page's actions leave one at a time: Inès's, after Claire's answer.
      const ines = await sendHeldRegistration(page, scope, "Inès", true);
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
      const record = await recordBar(page);
      await failHeld(page, claire);
      await expect(messages(page)).toHaveText([`${WHOLE["fr-FR"]} ${FAILED}`]);
      await ines();
      await expect(tabs(page)).toHaveCount(0);
      await page.clock.runFor(1_000);

      const cut = `${CUT["fr-FR"]} ${FAILED}`;
      expect(said((await record()).writes, "alert")).toEqual([cut]);
      await expect(messages(page)).toHaveText([cut]);
    });

    test("N1.4: another failure said in `alert` as Claire's line is cut: `alert` is not touched", async ({ page, context, db, seededEvent }) => {
      await seedClaire(db, page, seededEvent.id);
      await page.clock.install();
      const scope = await open(page, seededEvent.id);
      const loseClaire = await loseFirst(page, PLACE);
      await sendOffer(page, scope);
      await context.setOffline(true);
      loseClaire();
      await expect(messages(page)).toHaveText([`${WHOLE["fr-FR"]} ${OFFLINE["fr-FR"]}`]);
      await context.setOffline(false);
      const loseHugo = await loseFirst(page, "Hugo");
      await scope.getByRole("button", { name: FR.add, exact: true }).click();
      await dialog(page, FR.add).getByLabel(FR.firstName).fill("Hugo");
      await expect(dialog(page, FR.add).getByRole("checkbox", { name: FR.both })).toBeChecked();
      await submit(page, FR.add).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await context.setOffline(true);
      loseHugo();
      await expect(bar(page)).toHaveText(HUGO);
      const record = await recordBar(page);
      await removeRetour(page, context, db, seededEvent.id, scope);

      await expect(messages(page)).toHaveText([HUGO, `${CUT["fr-FR"]} ${OFFLINE["fr-FR"]}`]);
      expect((await record()).writes.filter((write) => write.region === "alert")).toEqual([]);
      await expect(bar(page)).toHaveText(HUGO);
    });
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
