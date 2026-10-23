import type { Kysely } from "kysely";
import type { Locator, Page, Request } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { messages } from "./device";
import { editEventInDb } from "./event-db";
import { leaveNoToken } from "./fixtures";
import { expect, holdActionsWith, isAction, oneCharOff, organiserPath, test } from "./organiser";

/*
 * #270, epic #250 (organizer-view v3.3.8, « Supprimer le retour »): unchecking « Retour » on a
 * retour that holds cars or persons asks first, in a confirmation over the sheet, which then
 * says its own answers (M3.2 to M3.5, M3.7, M9.1, M9.2). Each test runs under `organiserTraffic`
 * (O6.1, O2.10). Decision: what « a second context » does during the confirmation is written in
 * the database. Reason: the server counts the rows, whoever wrote them, and the confirmation's
 * answer is what is tested. Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const WORDS = {
  fr: {
    edit: "Modifier l’événement",
    question: "Supprimer le retour ?",
    confirm: "Supprimer le retour",
    cancel: "Annuler",
    submit: "Valider",
    body: (cars: number, persons: number) =>
      `Les ${cars} voitures proposées pour le retour seront retirées. ${persons} personnes ne seront plus inscrites au retour.`,
    aller: "L’aller ne change pas.",
    notified: "Personne n’est prévenu : pensez à le leur dire.",
    saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  },
  en: {
    edit: "Edit the event",
    question: "Remove the return trip?",
    confirm: "Remove the return trip",
    cancel: "Cancel",
    submit: "Confirm",
    body: (cars: number, persons: number) =>
      `The ${cars} cars offered for the return trip will be removed. ${persons} people will no longer be signed up for the return trip.`,
    aller: "The outbound trip does not change.",
    notified: "Nobody is notified: remember to tell them.",
  },
};
const FR = WORDS.fr;
const NOT_DONE = "L’événement n’a pas été modifié et le retour n’a pas été supprimé.";
const SAID = {
  changed: "Le retour a changé entre-temps : vérifiez les nombres ci-dessus, puis confirmez de nouveau.",
  offline: `${NOT_DONE} Vérifiez la connexion, puis réessayez.`,
  failed: `${NOT_DONE} Une erreur est survenue : réessayez dans un instant.`,
  gone: `${NOT_DONE} Cet événement est introuvable : il a peut-être été supprimé.`,
  sheetChanged: "L’événement vient d’être modifié depuis un autre appareil.",
};

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const editButton = (page: Page, name = FR.edit) => page.getByRole("button", { name, exact: true });
const sheet = (page: Page, name = FR.edit) => page.getByRole("dialog", { name });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: FR.submit, exact: true });
const confirmation = (page: Page, name = FR.question) => page.getByRole("alertdialog", { name });
const confirmButton = (page: Page) => confirmation(page).getByRole("button", { name: FR.confirm, exact: true });
const cancelButton = (page: Page) => confirmation(page).getByRole("button", { name: FR.cancel, exact: true });
// Under a modal, the page is `aria-hidden`: read by its elements, not by their roles.
const header = (page: Page) => page.locator("main header").first();
const tabs = (page: Page) => page.locator('main [role="tab"]');

/**
 * The confirmation done appearing, as a person sees it open: its opening animation over. Radix
 * gives it Escape only once it is the highest layer, two renders and their effects after it has
 * taken the focus; until then Escape is the sheet's, which closes with the confirmation in it
 * (#415). That its 100 ms animation outlasts those renders is measured, not guaranteed: 0 failure
 * in 60 runs with the CPU 6 times slower, 0 in 40 at 12 times (#435). Without the animation, or
 * shorter than that, the wait would cover nothing, or less than was measured: it fails (#439).
 * Read from the style, not from `getAnimations()`, which is empty once the animation is over.
 */
async function grownIn(dialog: Locator) {
  const opening = await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((each) => each.finished));
    const style = getComputedStyle(element);
    return { name: style.animationName, ms: parseFloat(style.animationDuration) * 1000 };
  });
  expect(opening.name, "grownIn: the confirmation has no opening animation to wait for").not.toBe("none");
  expect(opening.ms, "grownIn: the opening animation is shorter than the measured margin, in ms").toBeGreaterThanOrEqual(100);
}

/** The removals sent from now on: the changes whose body carries confirmed numbers. Counted, never shown. */
function removals(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"persons"')) sent.push(request);
  });
  return sent;
}

/**
 * M3.2's retour, on event `eventId`: Sophie drives Léa, Hugo and Nina; Marc drives nobody; Tom,
 * Inès, Paul and Zoé are without a car. 2 cars, 9 persons. Tom is also without a car at the
 * aller; the others are only on the retour.
 */
async function seedRetour(db: Kysely<Database>, eventId: string) {
  const person = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const sophie = await person("Sophie");
  const marc = await person("Marc");
  const sophiesCar = await seedRide(db, eventId, sophie, { leg: "retour", departureTime: "18:30:00" });
  const marcsCar = await seedRide(db, eventId, marc, { leg: "retour", departureTime: "18:30:00" });
  const ids: Record<string, string> = {};
  for (const [firstName, rideId] of [
    ["Léa", sophiesCar],
    ["Hugo", sophiesCar],
    ["Nina", sophiesCar],
    ["Tom", null],
    ["Inès", null],
    ["Paul", null],
    ["Zoé", null],
  ] as const) {
    ids[firstName] = await person(firstName);
    await seedPlacement(db, { personId: ids[firstName], eventId, leg: "retour", rideId });
  }
  await seedPlacement(db, { personId: ids.Tom, eventId, leg: "aller", rideId: null });
  return { tom: ids.Tom, ines: ids["Inès"], marcsCar };
}

/** A car offered for the retour by a new person, as a second device would. */
async function offerRetourCar(db: Kysely<Database>, eventId: string, firstName: string) {
  const { id } = await seedPerson(db, eventId, { firstName });
  await seedRide(db, eventId, id, { leg: "retour", departureTime: "19:00:00" });
}

/** What the event's retour holds in the database. */
async function retourRows(db: Kysely<Database>, eventId: string) {
  const event = await db.selectFrom("event").select("retour_at").where("id", "=", eventId).executeTakeFirstOrThrow();
  const count = async (table: "ride" | "placement") => {
    const { n } = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("event_id", "=", eventId)
      .where("leg", "=", "retour")
      .executeTakeFirstOrThrow();
    return Number(n);
  };
  return { retourAt: event.retour_at, rides: await count("ride"), placements: await count("placement") };
}

/** The organiser unchecks « Retour » and sends: the confirmation opens. */
async function askRemoval(page: Page, path: string) {
  await page.goto(path);
  await editButton(page).click();
  await retourBox(page).click();
  await submit(page).click();
  await expect(confirmation(page)).toBeVisible();
}

/** The retour removed and the page as M3.1 has it: only « Début », no tab, one section. */
async function expectRemoved(page: Page, db: Kysely<Database>, eventId: string) {
  await expect(confirmation(page)).toHaveCount(0);
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
  await expect(header(page).locator("dt")).toHaveText(["Début"]);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveCount(1);
  expect(await retourRows(db, eventId)).toEqual({ retourAt: null, rides: 0, placements: 0 });
}

/** The retour as seeded, and the page still showing it. */
async function expectKept(page: Page, db: Kysely<Database>, eventId: string) {
  await expect(header(page).locator("dt")).toHaveText(["Début", "Fin"]);
  await expect(tabs(page)).toHaveCount(2);
  expect(await retourRows(db, eventId)).toEqual({ retourAt: "2026-12-12 18:00:00", rides: 2, placements: 7 });
}

test.describe("M3: removing a retour that holds cars and persons", () => {
  test("M3.2, M3.3: « Valider » asks first, the focus on « Annuler »; « Annuler » writes nothing, back on « Valider »", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await expect(confirmation(page).locator("p")).toHaveText([FR.body(2, 9), FR.aller, FR.notified]);
    await expect(cancelButton(page)).toBeFocused();
    await expectKept(page, db, seededEvent.id);

    await cancelButton(page).click();
    await expect(confirmation(page)).toHaveCount(0);
    await expect(sheet(page)).toBeVisible();
    await expect(retourBox(page)).not.toBeChecked();
    await expect(submit(page)).toBeFocused();
    await expectKept(page, db, seededEvent.id);

    // Escape does the same.
    await submit(page).click();
    await expect(cancelButton(page)).toBeFocused();
    await grownIn(confirmation(page));
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);
    await expect(submit(page)).toBeFocused();
  });

  test("M3.4: « Supprimer le retour »: the retour's cars and Placements go, the persons and the aller stay, and the page shows it", async ({
    page,
    db,
    seededEvent,
  }) => {
    const { tom, ines } = await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await confirmButton(page).click();

    await expectRemoved(page, db, seededEvent.id);
    await expect(editButton(page)).toBeFocused();
    const persons = await db.selectFrom("person").select("id").where("event_id", "=", seededEvent.id).execute();
    expect(persons.length).toBe(9);
    const placements = (personId: string) =>
      db.selectFrom("placement").select(["leg", "ride_id"]).where("person_id", "=", personId).execute();
    expect(await placements(tom)).toEqual([{ leg: "aller", ride_id: null }]);
    expect(await placements(ines)).toEqual([]);
  });

  test("M3.5: a car offered meanwhile: nothing written, the new numbers and why, the focus on « Supprimer le retour »; again, removed", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await offerRetourCar(db, seededEvent.id, "Julie");
    await confirmButton(page).click();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.changed);
    await expect(confirmation(page).getByText(FR.body(3, 10), { exact: true })).toBeVisible();
    await expect(confirmButton(page)).toBeFocused();
    expect((await retourRows(db, seededEvent.id)).retourAt).toBe("2026-12-12 18:00:00");

    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  test("M3.5: a car removed and another offered meanwhile: the numbers kept, « Supprimer le retour » removes at once", async ({
    page,
    db,
    seededEvent,
  }) => {
    const { marcsCar } = await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await db.deleteFrom("ride").where("id", "=", marcsCar).execute();
    await offerRetourCar(db, seededEvent.id, "Julie");
    const sent = removals(page);
    await confirmButton(page).click();

    await expectRemoved(page, db, seededEvent.id);
    expect(sent.length).toBe(1);
  });

  test("M3.5: the retour emptied meanwhile: « Supprimer le retour » saves, and the bar says so", async ({ page, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await db.deleteFrom("placement").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    await db.deleteFrom("ride").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    await confirmButton(page).click();

    await expectRemoved(page, db, seededEvent.id);
  });
});

test.describe("M3.7: the confirmation while it sends, and after a failure", () => {
  test("point 1: while it sends, « Supprimer le retour » and « Annuler » are aria-disabled, a second tap sends nothing, Escape closes nothing", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    const held = await holdActionsWith(page, '"persons"');
    const sent = removals(page);
    await confirmButton(page).click();
    await expect.poll(held.held).toBe(1);

    await expect(confirmButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(confirmButton(page)).toHaveText(FR.confirm);
    await expect(confirmButton(page)).toBeFocused();
    await expect(cancelButton(page)).toHaveAttribute("aria-disabled", "true");
    // `aria-disabled` is not `disabled`: Playwright clicks it only when forced, as a person can.
    await confirmButton(page).click({ force: true });
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmButton(page)).toBeFocused();
    await cancelButton(page).click({ force: true });
    expect(sent.length).toBe(1);

    // Still open when the answer comes, a closing one included: the failure is said in it.
    await held.fail();
    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.failed);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  test("points 6 and 11: offline, the confirmation says so above its buttons; nothing changed; again, online, removed", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await context.setOffline(true);
    await confirmButton(page).click();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.offline);
    await expect(confirmButton(page)).toBeFocused();
    await expect(confirmButton(page)).not.toHaveAttribute("aria-disabled");
    await expectKept(page, db, seededEvent.id);

    await context.setOffline(false);
    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  test("points 7 and 11: the server fails: the reason is the generic one; again, removed", async ({ page, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    const held = await holdActionsWith(page, '"persons"');
    await confirmButton(page).click();
    await expect.poll(held.held).toBe(1);
    await held.fail();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.failed);
    await expect(confirmButton(page)).toBeFocused();
    await expectKept(page, db, seededEvent.id);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  test("points 8 and 11: the token altered on the way: the generic reason; again, the token whole, removed", async ({ page, db, seededEvent }) => {
    const { token } = seededEvent;
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    const altered = { on: true };
    await page.route(
      (url) => url.pathname.endsWith("/admin"),
      (route) => {
        const body = route.request().postData() ?? "";
        if (!altered.on || !isAction(route.request()) || !body.includes('"persons"')) return route.fallback();
        return route.fallback({ postData: body.replace(token, oneCharOff(token)) });
      },
    );
    await confirmButton(page).click();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.failed);
    await expect(confirmButton(page)).toBeFocused();
    await expectKept(page, db, seededEvent.id);

    altered.on = false;
    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  test("point 9: the event deleted: the confirmation says so, « Supprimer le retour » disabled, the focus on « Annuler », then the sheet's « Valider » disabled", async ({
    page,
    db,
    seededEvent,
    organiserTraffic,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await organiserTraffic.keepNumbers();
    await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
    await confirmButton(page).click();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.gone);
    await expect(confirmButton(page)).toBeDisabled();
    await expect(cancelButton(page)).toBeFocused();
    await cancelButton(page).click();
    await expect(confirmation(page)).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
  });

  test("points 10 and 11: the title changed elsewhere: the confirmation closes, the sheet says so, « Retour » still unchecked; again, removed", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    await editEventInDb(db, seededEvent.id, { title: "Tournoi de Rennes U13" });
    await confirmButton(page).click();

    await expect(confirmation(page)).toHaveCount(0);
    await expect(sheet(page).getByRole("alert").locator("p").first()).toHaveText(SAID.sheetChanged);
    await expect(retourBox(page)).not.toBeChecked();
    await expect(submit(page)).toBeFocused();
    await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes U13");

    await submit(page).click();
    await expect(confirmation(page)).toBeVisible();
    await confirmButton(page).click();
    await expectRemoved(page, db, seededEvent.id);
  });

  // #405: the answer `errors` closes the confirmation, and the sheet shows them. Only a forged
  // request gets it: the start date put on 2000-01-01 on the way, which the server refuses. A fixed
  // date, long past and never the seed's: one relative to today would be the seed's some day (#462).
  test("`errors`: the confirmation closes, the error under its field, the focus on it; nothing changed", async ({ page, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    const past = "2000-01-01";
    await page.route(
      (url) => url.pathname.endsWith("/admin"),
      (route) => {
        const body = route.request().postData() ?? "";
        if (!isAction(route.request()) || !body.includes('"persons"')) return route.fallback();
        return route.fallback({ postData: body.replace(/"allerDate":\s*"[^"]*"/, `"allerDate":"${past}"`) });
      },
    );
    await confirmButton(page).click();

    await expect(confirmation(page)).toHaveCount(0);
    await expect(field(page, "Date de début")).toHaveAccessibleDescription("Cette date est déjà passée.");
    await expect(field(page, "Date de début")).toBeFocused();
    await expect(retourBox(page)).not.toBeChecked();
    await expectKept(page, db, seededEvent.id);
  });

  // #405: while it sends, the focus may leave « Supprimer le retour »: the answer brings it back.
  test("the focus moved to « Annuler » while it sends: a failure gives it back to « Supprimer le retour »", async ({ page, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    await askRemoval(page, organiserPath(seededEvent));
    const held = await holdActionsWith(page, '"persons"');
    await confirmButton(page).click();
    await expect.poll(held.held).toBe(1);
    await page.keyboard.press("Tab");
    await expect(cancelButton(page)).toBeFocused();
    await held.fail();

    await expect(confirmation(page).getByRole("alert")).toHaveText(SAID.failed);
    await expect(confirmButton(page)).toBeFocused();
  });
});

test.describe("M9: the confirmation, readable everywhere", () => {
  for (const [locale, words] of [
    ["fr-FR", WORDS.fr],
    ["en-GB", WORDS.en],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test("M9.1: at 360 px, then at 125 %: nothing sideways, no button wrapped, each button 44 px at least", async ({
        page,
        db,
        seededEvent,
      }) => {
        await seedRetour(db, seededEvent.id);
        await page.setViewportSize({ width: 360, height: 780 });
        await page.goto(organiserPath(seededEvent));
        for (const size of ["100%", "125%"]) {
          await page.evaluate((size) => (document.documentElement.style.fontSize = size), size);
          await editButton(page, words.edit).click();
          await sheet(page, words.edit).getByRole("checkbox").click();
          await sheet(page, words.edit).getByRole("button", { name: words.submit, exact: true }).click();
          const dialog = confirmation(page, words.question);
          await expect(dialog).toBeVisible();
          // Measured once it has grown in: it opens from 95 %.
          await grownIn(dialog);
          const sideways = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(sideways, `the confirmation scrolls sideways at ${size}`).toBe(0);
          const pageSideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(pageSideways, `the page scrolls sideways at ${size}`).toBe(0);
          const buttons = dialog.getByRole("button");
          expect(await buttons.count()).toBe(2);
          for (const button of await buttons.all()) {
            const name = await button.innerText();
            const { lines, clipped } = await button.evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
              return { lines: tops.size, clipped: element.scrollWidth > element.clientWidth };
            });
            expect(lines, `« ${name} » on one line at ${size}`).toBe(1);
            expect(clipped, `« ${name} » cut at ${size}`).toBe(false);
            expect((await button.boundingBox())!.height, `« ${name} » at ${size}`).toBeGreaterThanOrEqual(44);
          }
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await page.keyboard.press("Escape");
          await expect(sheet(page, words.edit)).toHaveCount(0);
        }
      });
    });
  }

  test.describe("en-GB", () => {
    test.use({ locale: "en-GB" });

    test("M9.2: the confirmation speaks English, with no French word", async ({ page, db, seededEvent }) => {
      const { en } = WORDS;
      await seedRetour(db, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      await editButton(page, en.edit).click();
      await sheet(page, en.edit).getByRole("checkbox", { name: "Return", exact: true }).click();
      await sheet(page, en.edit).getByRole("button", { name: en.submit, exact: true }).click();
      const dialog = confirmation(page, en.question);
      await expect(dialog.locator("p")).toHaveText([en.body(2, 9), en.aller, en.notified]);
      await expect(dialog.getByRole("button")).toHaveText([en.confirm, en.cancel]);
      const text = await dialog.innerText();
      for (const french of ["Supprimer", "retour", "voiture", "personne", "Annuler", "aller", "prévenu"]) {
        expect(text.includes(french), `« ${french} » in the confirmation`).toBe(false);
      }
    });
  });
});
