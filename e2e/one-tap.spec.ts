import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failActions, failHeld, holdActions, holdFirst, holdToken, messages, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #92: a free seat takes a seat in one tap (R5). The only person of the device without a car on
// the leg boards at once (C5.2); a device without a person registers from the seat, and boards
// (C5.4). What came of it is the bar's (« Un tap, et « Annuler » », « Chaque échec, mot pour mot »).

type Db = Kysely<Database>;

/**
 * The device holds Tom, without a car on both legs. Aller: Sophie (3 seats), Marc (2 seats) and
 * Claire (1 seat), of other devices, drive nobody. Retour: Paul (3 seats). Ana, of another
 * device, is without a car at the aller. Without `token`, the device holds nobody.
 */
async function seedScene(db: Db, eventId: string, token?: string) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const tom = token && (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id;
  const cars = {
    sophie: await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:00:00" }),
    marc: await seedRide(db, eventId, await other("Marc"), { departureTime: "07:15:00", seats: 2 }),
    claire: await seedRide(db, eventId, await other("Claire"), { departureTime: "07:30:00", seats: 1 }),
    paul: await seedRide(db, eventId, await other("Paul"), { leg: "retour" }),
  };
  if (tom) for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId: tom, eventId, leg, rideId: null });
  const ana = await seedPerson(db, eventId, { firstName: "Ana" });
  await seedPlacement(db, { personId: ana.id, eventId, leg: "aller", rideId: null });
  return { tom: tom || "", cars, ana };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db.selectFrom("placement").select(["leg", "ride_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

/** The id of the person named `firstName`, whom the page registered. */
async function personNamed(db: Db, eventId: string, firstName: string) {
  return (await db.selectFrom("person").select("id").where("event_id", "=", eventId).where("first_name", "=", firstName).executeTakeFirstOrThrow()).id;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: `Place libre : prendre une place dans la voiture de ${driver}` }).first();
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const banner = (page: Page) => panel(page).getByRole("status").filter({ hasText: /\S/ });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const registration = (page: Page) => page.getByRole("dialog", { name: "Ajouter une personne" });
/** The message bar's status region, where a success goes: found by its CSS, as a sheet hides the page. */
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });

test.describe("one tap", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C5.2, C2.2, C3.5: one click places Tom, the bar says so, the focus on the car's title; the retour does not change", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();

    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
    await expect(barStatus(page)).toHaveText("Tom est dans la voiture de Sophie");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(title(page, "Sophie")).toBeFocused();
    await expect(car(page, "Sophie").getByRole("listitem")).toHaveText(["Tom", "Place libre", "Place libre"]);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Avec Sophie");
    await expect(cell(page, "Tom", "Retour")).toHaveAccessibleName("Tom, Retour : Sans voiture");
    expect(await placements(db, seededEvent.id, scene.tom)).toEqual({ aller: scene.cars.sophie, retour: null });
  });

  test("C5.7: two devices, the last seat; the second tap says it was just taken, and the page shows the full car", async ({ browser, baseURL, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(seat(page, "Claire")).toBeEnabled();
    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await holdToken(other, seededEvent.id, scene.ana.token);
      await other.goto(`/e/${seededEvent.id}`);
      await seat(other, "Claire").click();
      await expect(messages(other)).toHaveText(["Ana est dans la voiture de Claire"]);
    } finally {
      for (const other of context.pages()) await other.goto("about:blank").catch(() => other.close());
      await context.close();
    }

    await seat(page, "Claire").click();
    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Claire. Cette place vient d’être prise."]);
    await expect(car(page, "Claire")).toContainText("Complet");
    await expect(car(page, "Claire").getByRole("listitem")).toHaveText(["Ana"]);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
    await expect(title(page, "Claire")).toBeFocused();
    expect(await placements(db, seededEvent.id, scene.tom)).toEqual({ aller: null, retour: null });
  });

  test("C5.8: the answer lost after the write, then a tap again: Tom is placed once, and no failure is left", async ({ db, page, seededEvent }) => {
    let lost = false;
    await page.route("**/e/**", async (route) => {
      if (lost || !route.request().postData()?.includes(scene.cars.sophie)) return route.fallback();
      lost = true;
      // The request reaches the server, which writes; its answer never comes back.
      await route.fetch();
      await route.abort();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant."]);
    expect(await placements(db, seededEvent.id, scene.tom)).toEqual({ aller: scene.cars.sophie, retour: null });
    await expect(seat(page, "Sophie")).toBeFocused();

    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
    await expect(bar(page)).toBeEmpty();
    await expect(car(page, "Sophie").getByRole("listitem")).toHaveText(["Tom", "Place libre", "Place libre"]);
    expect(await placements(db, seededEvent.id, scene.tom)).toEqual({ aller: scene.cars.sophie, retour: null });
  });

  // « Chaque échec, mot pour mot », lines « Un tap sur une place »: who, whose car, why. A refusal
  // gives the focus to the car's title, or to the leg's banner once the car is gone; never <body>.
  const CASES: { what: string; driver: string; fails: "offline" | "500" | ((db: Db, eventId: string) => Promise<unknown>); text: string; landmark: "title" | "banner" }[] = [
    { what: "offline", driver: "Sophie", fails: "offline", text: "Tom n’a pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez.", landmark: "title" },
    { what: "a server error", driver: "Sophie", fails: "500", text: "Tom n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.", landmark: "title" },
    {
      what: "seatTaken",
      driver: "Claire",
      fails: (db, eventId) => seedPlacement(db, { personId: scene.ana.id, eventId, leg: "aller", rideId: scene.cars.claire }),
      text: "Tom n’a pas pu monter dans la voiture de Claire. Cette place vient d’être prise.",
      landmark: "title",
    },
    {
      what: "alreadyInCar",
      driver: "Sophie",
      fails: (db, eventId) => seedPlacement(db, { personId: scene.tom, eventId, leg: "aller", rideId: scene.cars.marc }),
      text: "Tom n’a pas pu monter dans la voiture de Sophie. Tom est déjà dans une voiture.",
      landmark: "title",
    },
    {
      what: "rideGone",
      driver: "Sophie",
      fails: (db) => db.deleteFrom("ride").where("id", "=", scene.cars.sophie).execute(),
      text: "Tom n’a pas pu monter dans la voiture de Sophie. Cette voiture n’est plus proposée.",
      landmark: "banner",
    },
  ];
  for (const { what, driver, fails, text, landmark } of CASES) {
    test(`C11.11, C5.7, a tap, ${what}: in the bar, and the focus never on <body>`, async ({ context, db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await expect(seat(page, driver)).toBeEnabled();
      if (fails === "offline") await context.setOffline(true);
      else if (fails === "500") await failActions(page);
      else await fails(db, seededEvent.id);
      await seat(page, driver).click();

      await expect(messages(page)).toHaveText([text]);
      await expect(bar(page)).toHaveText(text);
      await expect(page.locator("body")).not.toBeFocused();
      if (typeof fails === "function") await expect(landmark === "title" ? title(page, driver) : banner(page)).toBeFocused();
      await barClose(page).click();
      await expect(landmark === "title" ? title(page, driver) : banner(page)).toBeFocused();
      expect(await placements(db, seededEvent.id, scene.tom)).toEqual({ aller: what === "alreadyInCar" ? scene.cars.marc : null, retour: null });
    });
  }

  // « Le sujet d'un échec », line « un tap »: the car and the person sent. A tap again in that car
  // withdraws the failure as it sends; a tap in another car leaves it.
  const FAILED = "Tom n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
  for (const { driver, withdraws } of [
    { driver: "Sophie", withdraws: true },
    { driver: "Marc", withdraws: false },
  ]) {
    test(`C11.10: after Tom's failure in Sophie's car, a tap in ${driver}'s car ${withdraws ? "withdraws it at the send" : "leaves it"}`, async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await expect(seat(page, "Sophie")).toBeEnabled();
      const failing = await failActions(page);
      await seat(page, "Sophie").click();
      await expect(messages(page)).toHaveText([FAILED]);
      failing.on = false;

      const answer = await holdFirst(page, scene.cars[driver === "Sophie" ? "sophie" : "marc"], false);
      await seat(page, driver).click();
      // Before the answer.
      await expect(messages(page)).toHaveText(withdraws ? [] : [FAILED]);
      answer();
      const placed = `Tom est dans la voiture de ${driver}`;
      await expect(messages(page)).toHaveText(withdraws ? [placed] : [FAILED, placed]);
      await expect(bar(page)).toHaveText(withdraws ? "" : FAILED);
    });
  }

  // « Le sujet d'un échec », line « une action de cellule »: a seat taken for Tom by a tap leaves Tom · Aller's failure.
  test("C11.10: after Tom · Aller's failure, a seat taken for Tom by a tap leaves it", async ({ page, seededEvent }) => {
    const first = await holdFirst(page, scene.tom, true);
    await page.goto(`/e/${seededEvent.id}`);
    await cell(page, "Tom", "Aller").click();
    await page.getByRole("dialog", { name: "Tom · Aller" }).getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await failHeld(page, first);
    const cellFailed = "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
    await expect(messages(page)).toHaveText([cellFailed]);

    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText([cellFailed, "Tom est dans la voiture de Sophie"]);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Avec Sophie");
  });

  test("C5.9: the persons not read yet, the tap opens nothing; read, it places", async ({ page, seededEvent }) => {
    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(seat(page, "Sophie")).toBeDisabled();
    await seat(page, "Sophie").click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    release();
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
  });
});

test.describe("one tap, a device without a person", () => {
  test.use({ locale: "fr-FR" });
  let scene: Scene;

  test.beforeEach(async ({ db, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id);
  });

  for (const both of [true, false]) {
    test(`C5.4, C5.3: from a free seat, first name and « Valider » place Inès; ${both ? "« Aller et retour », one click places her on the retour" : "only the aller, she is not on the retour"}`, async ({ db, page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      // Three actions: the seat, the first name, « Valider ».
      await seat(page, "Marc").click();
      const form = registration(page);
      await expect(form).toHaveAccessibleDescription(
        /^Cette personne prendra une place dans la voiture de Marc\.\s*Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement\.$/,
      );
      await expect(form.getByLabel("Prénom")).toBeFocused();
      if (!both) await form.getByLabel("Aller et retour").uncheck();
      await form.getByLabel("Prénom").fill("Inès");
      await form.getByRole("button", { name: "Valider" }).click();

      await expect(form).toHaveCount(0);
      await expect(messages(page)).toHaveText(["Inès est dans la voiture de Marc"]);
      await expect(title(page, "Marc")).toBeFocused();
      await expect(cell(page, "Inès", "Aller")).toHaveAccessibleName("Inès, Aller : Avec Marc");
      await expect(cell(page, "Inès", "Retour")).toHaveAccessibleName(both ? "Inès, Retour : Sans voiture" : "Inès, Retour : Ne fait pas le retour");
      const ines = await personNamed(db, seededEvent.id, "Inès");
      expect(await placements(db, seededEvent.id, ines)).toEqual(both ? { aller: scene.cars.marc, retour: null } : { aller: scene.cars.marc });
      if (!both) return;

      await tab(page, "Retour").click();
      await seat(page, "Paul").click();
      await expect(messages(page)).toHaveText(["Inès est dans la voiture de Paul"]);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await placements(db, seededEvent.id, ines)).toEqual({ aller: scene.cars.marc, retour: scene.cars.paul });
    });
  }

  test("C5.4: the seat taken meanwhile, Inès is kept without a car, and the bar says why", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Claire").click();
    await seedPlacement(db, { personId: scene.ana.id, eventId: seededEvent.id, leg: "aller", rideId: scene.cars.claire });
    await registration(page).getByLabel("Prénom").fill("Inès");
    await registration(page).getByRole("button", { name: "Valider" }).click();

    await expect(registration(page)).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Inès n’a pas pu monter dans la voiture de Claire. Cette place vient d’être prise."]);
    await expect(car(page, "Claire")).toContainText("Complet");
    await expect(cell(page, "Inès", "Aller")).toHaveAccessibleName("Inès, Aller : Sans voiture");
    await expect(title(page, "Claire")).toBeFocused();
    const ines = await personNamed(db, seededEvent.id, "Inès");
    expect(await placements(db, seededEvent.id, ines)).toEqual({ aller: null, retour: null });
  });

  // A success never closes a sheet opened since, and waits for no sheet to hide the page (#167).
  test("closed before the answer, another registration opened meanwhile: it stays open, and the bar waits for it", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, "Inès", false);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Marc").click();
    await registration(page).getByLabel("Prénom").fill("Inès");
    await registration(page).getByRole("button", { name: "Valider" }).click();
    await page.keyboard.press("Escape");
    await expect(registration(page)).toHaveCount(0);
    await seat(page, "Sophie").click();
    const again = page.getByRole("dialog", { name: "Ajouter une personne" });
    await expect(again).toHaveAccessibleDescription(/^Cette personne prendra une place dans la voiture de Sophie\./);
    const seen = await watchAlerts(page);
    answer();

    const seated = async () => {
      const ines = await db.selectFrom("person").select("id").where("event_id", "=", seededEvent.id).where("first_name", "=", "Inès").executeTakeFirst();
      return ines && placements(db, seededEvent.id, ines.id);
    };
    await expect.poll(seated).toEqual({ aller: scene.cars.marc, retour: null });
    await expect(again).toHaveAttribute("data-state", "open");
    await expect(barStatus(page)).toHaveText("");
    await page.keyboard.press("Escape");
    await expect(again).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Inès est dans la voiture de Marc"]);
    await expect(seat(page, "Sophie")).toBeFocused();
    expect(await seen()).toEqual({ inSheet: false, barHidden: false });
  });

  test("closed without effect, the focus goes back to the seat, and nobody is registered", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();
    await registration(page).getByRole("button", { name: "Fermer" }).click();
    await expect(registration(page)).toHaveCount(0);
    await expect(seat(page, "Sophie")).toBeFocused();
    await expect(db.selectFrom("person").select("id").where("event_id", "=", seededEvent.id).where("first_name", "=", "Inès").execute()).resolves.toEqual([]);
  });
});

test.describe("one tap, the driver's device", () => {
  test.use({ locale: "fr-FR" });

  // The driver is never counted among the persons to place on the leg where she drives.
  test("C5.6: a free seat of the driver's own car places the only other person without a car", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const paul = await seedPerson(db, seededEvent.id, { firstName: "Paul" }, token);
    const lea = await seedPerson(db, seededEvent.id, { firstName: "Léa" }, token);
    const ride = await seedRide(db, seededEvent.id, paul.id);
    await seedPlacement(db, { personId: lea.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Paul").click();

    await expect(messages(page)).toHaveText(["Léa est dans la voiture de Paul"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(title(page, "Paul")).toBeFocused();
    expect(await placements(db, seededEvent.id, lea.id)).toEqual({ aller: ride });
  });
});
