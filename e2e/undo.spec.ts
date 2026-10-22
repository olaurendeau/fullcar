import type { BrowserContext, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { failHeld, holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #170: « Annuler » in the bar after a placement (« Un tap, et « Annuler » », « La barre de
// messages », rule 6 and rule 8; C5.2 and C5.10 amended, C3.5, C9.4, C11.10, C11.11).

type Db = Kysely<Database>;

/**
 * The device holds Tom, without a car at the aller and in Paul's car at the retour, and Hugo, who
 * does not do the aller. Aller: Sophie (3 seats) and Marc (2 seats) drive nobody. With `lea`, the
 * device holds Léa too, without a car at the aller, between them.
 */
async function seedScene(db: Db, eventId: string, token: string, lea = false) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const tom = await mine("Tom");
  const persons = { tom, lea: lea ? await mine("Léa") : "", hugo: await mine("Hugo") };
  const cars = {
    sophie: await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:00:00" }),
    marc: await seedRide(db, eventId, await other("Marc"), { departureTime: "07:15:00", seats: 2 }),
    paul: await seedRide(db, eventId, await other("Paul"), { leg: "retour" }),
  };
  await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: tom, eventId, leg: "retour", rideId: cars.paul });
  if (lea) await seedPlacement(db, { personId: persons.lea, eventId, leg: "aller", rideId: null });
  return { persons, cars };
}

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db.selectFrom("placement").select(["leg", "ride_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

/** `personIds` leave their car of the aller from another device: in base only, the page reads nothing. */
async function leaveInDb(db: Db, eventId: string, personIds: string[]) {
  await db.updateTable("placement").set({ ride_id: null }).where("event_id", "=", eventId).where("leg", "=", "aller").where("person_id", "in", personIds).execute();
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: /^Place libre/ }).first();
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const banner = (page: Page) => panel(page).getByRole("status").filter({ hasText: /\S/ });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
const bar = (page: Page) => page.locator("[data-message-bar]");
/** The bar's lines, found by their CSS: a sheet or a confirmation hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
/** The bar's status region, where a success goes. */
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
/** Every « Annuler » of the bar, top to bottom: out of its regions, between the lines and « Fermer ». */
const undo = (page: Page) => bar(page).getByRole("button", { name: "Annuler" });

/** Opens `driver`'s sheet from a free seat, ticks exactly `names`, and sends them. */
async function sendFromSheet(page: Page, driver: string, names: string[]) {
  await seat(page, driver).click();
  const dialog = sheet(page, driver);
  const submit = dialog.getByRole("button", { name: /^Placer/ });
  await expect(submit).toBeVisible();
  for (const name of ["Tom", "Léa", "Hugo"]) {
    const box = dialog.getByRole("checkbox", { name, exact: true });
    if (await box.count()) await box.setChecked(names.includes(name));
  }
  await submit.click();
}

/** Answers the cell's sheet of `firstName` on `leg` with `button`. */
async function cellAction(page: Page, firstName: string, leg: "Aller" | "Retour", button: string) {
  await cell(page, firstName, leg).click();
  await page.getByRole("dialog", { name: `${firstName} · ${leg}` }).getByRole("button", { name: button }).click();
}

const PLACED = "Tom est dans la voiture de Sophie";
const UNDONE = "Tom n’est plus dans la voiture de Sophie";
/** Nobody given back: the success of « Annuler » says so (`Seat.alreadyOut`, v4.4.4). */
const ALREADY_OUT = "Tom n’était déjà plus dans la voiture de Sophie";
const UNDO_OFFLINE = "Tom n’a pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ».";

test.describe("« Annuler »", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
  });

  test.describe("after a tap", () => {
    test.beforeEach(async ({ db, seededEvent }) => {
      scene = await seedScene(db, seededEvent.id, token);
    });

    test("C5.2, C5.10, C9.4, C3.5: « Annuler » gives Tom back without a car, the seat is free again, the retour does not change", async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      await expect(undo(page)).toHaveCount(1);
      await expect(undo(page)).toHaveAccessibleDescription(PLACED);
      await expect(banner(page)).toHaveText("Tout le monde a une place · 4 places libres");

      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDONE]);
      await expect(barStatus(page)).toHaveText(UNDONE);
      await expect(undo(page)).toHaveCount(0);
      await expect(title(page, "Sophie")).toBeFocused();
      await expect(car(page, "Sophie").getByRole("listitem")).toHaveText(["Place libre", "Place libre", "Place libre"]);
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
      await expect(cell(page, "Tom", "Retour")).toHaveAccessibleName("Tom, Retour : Avec Paul");
      await expect(banner(page)).toHaveText("1 sans voiture · 5 places libres");
      await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 1 sans voiture");
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: scene.cars.paul });
    });

    for (const closing of ["« Fermer »", "Escape"] as const) {
      test(`C5.10: the success and « Annuler » are still there 10 s later and after another action fails; ${closing} takes them`, async ({ page, seededEvent }) => {
        await page.clock.install();
        const hugo = await holdFirst(page, scene.persons.hugo, true);
        await page.goto(`/e/${seededEvent.id}`);
        await seat(page, "Sophie").click();
        await expect(messages(page)).toHaveText([PLACED]);
        await page.clock.fastForward(10_000);
        // Its sheet closed before the answer, the failure goes to the bar.
        await cellAction(page, "Hugo", "Aller", "Je cherche une place");
        await page.keyboard.press("Escape");
        await failHeld(page, hugo);
        const failed = "Hugo · Aller : « Je cherche une place » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
        await expect(messages(page)).toHaveText([failed, PLACED]);
        await expect(undo(page)).toHaveAccessibleDescription(PLACED);

        if (closing === "Escape") {
          await undo(page).focus();
          await page.keyboard.press("Escape");
        } else await bar(page).getByRole("button", { name: "Fermer" }).click();
        await expect(messages(page)).toHaveCount(0);
        await expect(undo(page)).toHaveCount(0);
      });
    }

    test("C5.10: the next action that succeeds takes the success and its « Annuler »", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(undo(page)).toHaveCount(1);
      await cellAction(page, "Tom", "Aller", "Sortir de la voiture");
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
      await expect(messages(page)).toHaveCount(0);
      await expect(undo(page)).toHaveCount(0);
    });

    test("C5.10, two contexts: Tom moved to Marc's car meanwhile is not touched; nobody undone, the bar says so", async ({ browser, baseURL, db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(undo(page)).toHaveCount(1);
      const context = await browser.newContext({ locale: "fr-FR", baseURL });
      try {
        const other = await context.newPage();
        await holdToken(other, seededEvent.id, token);
        await other.goto(`/e/${seededEvent.id}`);
        // Nobody of the device without a car: « Vos inscriptions » starts folded there.
        await other.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Vos inscriptions/ }).click();
        await cellAction(other, "Tom", "Aller", "Sortir de la voiture");
        await expect(cell(other, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
        await seat(other, "Marc").click();
        await expect(messages(other)).toHaveText(["Tom est dans la voiture de Marc"]);
      } finally {
        for (const other of context.pages()) await other.goto("about:blank").catch(() => other.close());
        await context.close();
      }

      await undo(page).click();
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Avec Marc");
      await expect(messages(page)).toHaveText([ALREADY_OUT]);
      await expect(title(page, "Sophie")).toBeFocused();
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: scene.cars.marc, retour: scene.cars.paul });
    });

    test("B1.3: « Annuler » of a success that gives nobody back says Tom was already out", async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      await expect(undo(page)).toHaveCount(1);
      await leaveInDb(db, seededEvent.id, [scene.persons.tom]);

      await undo(page).focus();
      await page.keyboard.press("Enter");
      await expect(messages(page)).toHaveText([ALREADY_OUT]);
      const buttons = bar(page).getByRole("button");
      await expect(buttons).toHaveCount(1);
      await expect(buttons).toHaveAccessibleName("Fermer");
      await expect(title(page, "Sophie")).toBeFocused();
    });

    // Rule 6: offline, the failure gets its own « Annuler », which the success loses; a seat taken
    // since for Hugo leaves both; sent again from the keyboard, it shows nowhere until the answer.
    test("C5.10, C11.10, C11.11: « Annuler » offline, then again from its failure, its answer held", async ({ context, db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      await context.setOffline(true);
      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDO_OFFLINE, PLACED]);
      await expect(undo(page)).toHaveCount(1);
      await expect(undo(page)).toHaveAccessibleDescription(UNDO_OFFLINE);
      await expect(title(page, "Sophie")).toBeFocused();
      await context.setOffline(false);

      await sendFromSheet(page, "Marc", ["Hugo"]);
      await expect(messages(page)).toHaveText([UNDO_OFFLINE, "Hugo est dans la voiture de Marc"]);
      await expect(undo(page)).toHaveCount(2);

      const answer = await holdFirst(page, scene.cars.sophie, false);
      await undo(page).first().focus();
      await page.keyboard.press("Enter");
      await expect(messages(page)).toHaveText(["Hugo est dans la voiture de Marc"]);
      await expect(undo(page)).toHaveCount(1);
      await expect(undo(page)).toHaveAccessibleDescription("Hugo est dans la voiture de Marc");
      await expect(title(page, "Sophie")).toBeFocused();
      answer();
      await expect(messages(page)).toHaveText([UNDONE]);
      await expect(title(page, "Sophie")).toBeFocused();
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: scene.cars.paul });
    });

    // « Le sujet d’un échec »: « Sortir de la voiture » leaves the failure of « Annuler », and
    // « Annuler » in Sophie's car leaves the failure of a seat there.
    test("C11.10: neither a cell's action nor « Annuler » withdraws the other's failure", async ({ context, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      const hugo = await holdFirst(page, scene.persons.hugo, true);
      await sendFromSheet(page, "Sophie", ["Hugo"]);
      await page.keyboard.press("Escape");
      await failHeld(page, hugo);
      const hugoFailed = "Hugo n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
      await context.setOffline(true);
      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDO_OFFLINE, hugoFailed, PLACED]);
      await context.setOffline(false);

      await cellAction(page, "Tom", "Aller", "Sortir de la voiture");
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
      await expect(messages(page)).toHaveText([UNDO_OFFLINE, hugoFailed]);

      await undo(page).click();
      await expect(messages(page)).toHaveText([hugoFailed, ALREADY_OUT]);
      await expect(title(page, "Sophie")).toBeFocused();
    });

    // With #330: « Annuler » comes from the bar, never from a sheet, so nothing holds the retour for it.
    test("C5.10, M7.10: « Annuler » on the retour; once the retour is gone, no failure, the information, and the focus on the title", async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await tab(page, "Retour").click();
      await cellAction(page, "Tom", "Retour", "Sortir de la voiture");
      await expect(cell(page, "Tom", "Retour")).toHaveAccessibleName("Tom, Retour : Sans voiture");
      await seat(page, "Paul").click();
      await expect(messages(page)).toHaveText(["Tom est dans la voiture de Paul"]);
      await undo(page).click();
      await expect(messages(page)).toHaveText(["Tom n’est plus dans la voiture de Paul"]);
      await expect(title(page, "Paul")).toBeFocused();
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: null });

      await seat(page, "Paul").click();
      await expect(messages(page)).toHaveText(["Tom est dans la voiture de Paul"]);
      await removeRetourInDb(db, seededEvent.id);
      await undo(page).click();
      await expect(messages(page)).toHaveText(["Il n’y a plus de retour pour cet événement : la voiture de Paul n’est plus proposée."]);
      await expect(undo(page)).toHaveCount(0);
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(page.locator("#event-title")).toBeFocused();
      // Refused by `noRetour`, nothing written: the retour went with its Placements.
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null });
    });

    test("rule 8: « Annuler » after a change of tab: the focus on the active tab, the tab kept; back on the aller, on the car's title", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await tab(page, "Retour").click();
      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDONE]);
      await expect(tab(page, "Retour")).toBeFocused();
      await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");

      await tab(page, "Aller").click();
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      await tab(page, "Retour").click();
      await tab(page, "Aller").click();
      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDONE]);
      await expect(title(page, "Sophie")).toBeFocused();
      await expect(title(page, "Sophie")).toBeVisible();
    });
  });

  test.describe("after the sheet", () => {
    test.beforeEach(async ({ db, seededEvent }) => {
      scene = await seedScene(db, seededEvent.id, token, true);
    });

    test("C5.10: Tom, without a car before, and Hugo, not concerned, each get their state back; Léa is not touched", async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await sendFromSheet(page, "Sophie", ["Tom", "Hugo"]);
      await expect(messages(page)).toHaveText(["Tom et Hugo sont dans la voiture de Sophie"]);

      await undo(page).click();
      await expect(messages(page)).toHaveText(["Tom et Hugo ne sont plus dans la voiture de Sophie"]);
      await expect(undo(page)).toHaveCount(0);
      await expect(title(page, "Sophie")).toBeFocused();
      await expect(cell(page, "Hugo", "Aller")).toHaveAccessibleName("Hugo, Aller : Ne fait pas l’aller");
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: scene.cars.paul });
      expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({});
      expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });
    });

    // Rule 8, in the order of #311's review: the line of the element that had the focus first,
    // before the line written in the same render. Next sends Marc's seats once Sophie's are answered.
    test("rule 8: a late answer replaces the success whose « Annuler » has the focus: the focus on that success's car", async ({ page, seededEvent }) => {
      const sophie = await holdFirst(page, scene.cars.sophie, false);
      const marc = await holdFirst(page, scene.cars.marc, false);
      await page.goto(`/e/${seededEvent.id}`);
      for (const [driver, name] of [["Sophie", "Tom"], ["Marc", "Léa"]]) {
        await sendFromSheet(page, driver, [name]);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      sophie();
      await expect(messages(page)).toHaveText([PLACED]);
      await undo(page).focus();

      marc();
      await expect(messages(page)).toHaveText(["Léa est dans la voiture de Marc"]);
      await expect(title(page, "Sophie")).toBeFocused();
    });

    // « Le sujet d’un échec », the « Annuler » row: seats asked again in the same car are another
    // subject. The undo's answer is lost after its write; Hugo's cell brings the state back.
    test("C11.10: Tom and Léa placed again in Sophie's car do not withdraw the failure of their « Annuler »", async ({ page, seededEvent }) => {
      let lost = false;
      await page.route("**/e/**", async (route) => {
        if (lost || !route.request().postData()?.includes("withoutCar")) return route.fallback();
        lost = true;
        await route.fetch();
        await route.abort();
      });
      await page.goto(`/e/${seededEvent.id}`);
      await sendFromSheet(page, "Sophie", ["Tom", "Léa"]);
      await expect(messages(page)).toHaveText(["Tom et Léa sont dans la voiture de Sophie"]);
      await undo(page).click();
      const failed = "Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Une erreur est survenue : dans un instant, utilisez de nouveau « Annuler ».";
      await expect(messages(page)).toHaveText([failed, "Tom et Léa sont dans la voiture de Sophie"]);
      await cellAction(page, "Hugo", "Aller", "Je cherche une place");
      await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");

      await sendFromSheet(page, "Sophie", ["Tom", "Léa"]);
      await expect(messages(page)).toHaveText([failed, "Tom et Léa sont dans la voiture de Sophie"]);
      await expect(undo(page)).toHaveCount(2);
    });
  });

  // Rule 5 (v4.4.1): a car removed takes every message about it, `undo:{rideId}` included.
  test.describe("the car removed", () => {
    let sophie: string;

    // The device holds Sophie, who drives at the aller, and Tom, without a car there.
    test.beforeEach(async ({ db, seededEvent }) => {
      const mine = async (firstName: string) => (await seedPerson(db, seededEvent.id, { firstName }, token)).id;
      sophie = await seedRide(db, seededEvent.id, await mine("Sophie"));
      await seedPlacement(db, { personId: await mine("Tom"), eventId: seededEvent.id, leg: "aller", rideId: null });
    });

    const remove = async (page: Page) => {
      await car(page, "Sophie").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
      await page.getByRole("alertdialog", { name: "Retirer la voiture ?" }).getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    };

    test("rule 5: the failure of an « Annuler » in the bar goes once the car is removed", async ({ context, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      await context.setOffline(true);
      await undo(page).click();
      await expect(messages(page)).toHaveText([UNDO_OFFLINE, PLACED]);
      await context.setOffline(false);

      await remove(page);
      await expect(car(page, "Sophie")).toHaveCount(0);
      // The confirmation hides the bar from role queries until it is gone: its lines are read by their CSS.
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(lines(page)).toHaveCount(0);
      await expect(undo(page)).toHaveCount(0);
    });

    // Next sends the page's actions one at a time: « Annuler », sent while the removal waits for
    // its answer, leaves once the car is gone, and its failure is never said.
    test("rule 5: an « Annuler » sent before the removal's answer, whose answer is lost: its failure is never said", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([PLACED]);
      const removal = await holdFirst(page, sophie, false);
      let undone = false;
      await page.route("**/e/**", async (route) => {
        if (undone || !route.request().postData()?.includes("withoutCar")) return route.fallback();
        undone = true;
        await route.abort();
      });
      await remove(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await undo(page).click();
      const aborted = page.waitForEvent("requestfailed", (request) => !!request.postData()?.includes("withoutCar"));
      removal();
      await aborted;

      await expect(car(page, "Sophie")).toHaveCount(0);
      // A message left would be written by now.
      await page.waitForTimeout(500);
      await expect(lines(page)).toHaveCount(0);
    });
  });
});

// v4.4.4 (#341, #357): « Annuler » sent again from its failure's line replaces the newer success,
// Hugo's, and its « Annuler »; Hugo stays in Marc's car. Nobody given back, the success says the
// persons were already out (`Seat.alreadyOut`) instead of leaving the bar silent.
const B1 = {
  fr: {
    locale: "fr-FR",
    car: (driver: string) => `Voiture de ${driver}`,
    freeSeat: /^Place libre/,
    sheet: "Qui monte dans la voiture de Sophie ?",
    submit: /^Placer/,
    undo: "Annuler",
    close: "Fermer",
    placed: "Tom et Léa sont dans la voiture de Sophie",
    failed: "Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ».",
    hugo: "Hugo est dans la voiture de Marc",
    undone: "Tom et Léa ne sont plus dans la voiture de Sophie",
    alreadyOut: "Tom et Léa n’étaient déjà plus dans la voiture de Sophie",
  },
  en: {
    locale: "en-GB",
    car: (driver: string) => `${driver}’s car`,
    freeSeat: /^Free seat/,
    sheet: "Who gets in Sophie’s car?",
    submit: /^Seat/,
    undo: "Undo",
    close: "Close",
    placed: "Tom and Léa are in Sophie’s car",
    failed: "Tom and Léa could not leave Sophie’s car. Check your connection, then use “Undo” again.",
    hugo: "Hugo is in Marc’s car",
    undone: "Tom and Léa are no longer in Sophie’s car",
    alreadyOut: "Tom and Léa were already out of Sophie’s car",
  },
};

for (const language of ["fr", "en"] as const) {
  const words = B1[language];

  test.describe(`« Annuler » from a failure's line, after a newer success (${language})`, () => {
    test.use({ locale: words.locale });
    const token = newToken();
    let scene: Awaited<ReturnType<typeof seedScene>>;

    // Tom, Léa and Hugo, without a car at the aller: once Tom and Léa are in Sophie's car, Hugo boards Marc's in one tap.
    test.beforeEach(async ({ db, page, seededEvent }) => {
      await holdToken(page, seededEvent.id, token);
      scene = await seedScene(db, seededEvent.id, token, true);
      await seedPlacement(db, { personId: scene.persons.hugo, eventId: seededEvent.id, leg: "aller", rideId: null });
    });

    const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: words.car(driver), exact: true });
    const undoes = (page: Page) => bar(page).getByRole("button", { name: words.undo });

    /** Tom and Léa by the sheet in Sophie's car, their « Annuler » failed offline, then Hugo in Marc's car. */
    async function failThenHugo(page: Page, context: BrowserContext, eventId: string) {
      await page.goto(`/e/${eventId}`);
      await car(page, "Sophie").getByRole("button", { name: words.freeSeat }).first().click();
      const dialog = page.getByRole("dialog", { name: words.sheet });
      await expect(dialog.getByRole("button", { name: words.submit })).toBeVisible();
      for (const name of ["Tom", "Léa", "Hugo"]) await dialog.getByRole("checkbox", { name, exact: true }).setChecked(name !== "Hugo");
      await dialog.getByRole("button", { name: words.submit }).click();
      await expect(messages(page)).toHaveText([words.placed]);
      await context.setOffline(true);
      await undoes(page).click();
      await expect(messages(page)).toHaveText([words.failed, words.placed]);
      // Said in `alert` 100 ms after its line, before anything is recorded.
      await expect(page.locator('[role="status"] + [role="alert"]')).toHaveText(words.failed);
      await context.setOffline(false);
      await car(page, "Marc").getByRole("button", { name: words.freeSeat }).first().click();
      await expect(messages(page)).toHaveText([words.failed, words.hugo]);
      await expect(undoes(page)).toHaveCount(2);
    }

    /** The failure's « Annuler », from the keyboard: the bar then says `text` alone, with « Fermer », the focus on Sophie's car. */
    async function undoFromFailure(page: Page, text: string) {
      const record = await recordBar(page);
      await undoes(page).first().focus();
      await page.keyboard.press("Enter");
      await expect(messages(page)).toHaveText([text]);
      const buttons = bar(page).getByRole("button");
      await expect(buttons).toHaveCount(1);
      await expect(buttons).toHaveAccessibleName(words.close);
      await expect(page.getByRole("heading", { name: words.car("Sophie"), exact: true })).toBeFocused();
      await expect(barStatus(page)).toHaveText(text);
      return (await record()).writes;
    }

    if (language === "fr") {
      test("B1.1: Tom and Léa given back, their success replaces Hugo's and its « Annuler »; Hugo stays in Marc's car", async ({ context, db, page, seededEvent }) => {
        await failThenHugo(page, context, seededEvent.id);
        await undoFromFailure(page, words.undone);
        expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ aller: scene.cars.marc });
        expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ aller: null, retour: scene.cars.paul });
        expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ aller: null });
      });
    }

    test("B1.2: Tom and Léa out of Sophie's car from another device, nobody given back: the bar says they were already out", async ({ context, db, page, seededEvent }) => {
      await failThenHugo(page, context, seededEvent.id);
      await leaveInDb(db, seededEvent.id, [scene.persons.tom, scene.persons.lea]);
      const writes = await undoFromFailure(page, words.alreadyOut);
      expect(said(writes, "alert")).toEqual([]);
      expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ aller: scene.cars.marc });
    });
  });
}
