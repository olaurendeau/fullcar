import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #223: a failure of the seat sheet says who could not get in, into whose car, and why
// (« Ce que dit un échec », « Chaque échec, mot pour mot », v4.2; C11.11, C5.7, C11.10).

type Db = Kysely<Database>;

/**
 * The device holds Tom, Léa, Hugo, Nina and Zoé, in that order. Aller: Sophie (3 seats), Marc
 * (2 seats), Claire (1 seat) and Paul (5 seats) drive nobody; Tom and Léa are without a car;
 * the others are not concerned. Ana, of another device, has no car.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo"), nina: await mine("Nina"), zoe: await mine("Zoé") };
  const cars = {
    sophie: await seedRide(db, eventId, await other("Sophie")),
    marc: await seedRide(db, eventId, await other("Marc"), { seats: 2 }),
    claire: await seedRide(db, eventId, await other("Claire"), { seats: 1 }),
    paul: await seedRide(db, eventId, await other("Paul"), { seats: 5 }),
  };
  for (const personId of [persons.tom, persons.lea]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  return { persons, cars, ana: await other("Ana") };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const panel = (page: Page) => page.getByRole("tabpanel");
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
/** The bar's lines, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');

const DEVICE = ["Tom", "Léa", "Hugo", "Nina", "Zoé"];

/** Ticks exactly `names` in the sheet, in the order given. */
async function tickOnly(dialog: Locator, names: string[]) {
  const box = (name: string) => dialog.getByRole("checkbox", { name, exact: true });
  for (const name of DEVICE.filter((name) => !names.includes(name))) await box(name).setChecked(false);
  for (const name of names) await box(name).setChecked(true);
}

/** Opens `driver`'s sheet, ticks `names` (the default ticks when not given), and sends them. */
async function send(page: Page, driver: string, names?: string[]) {
  await panel(page).getByRole("article", { name: `Voiture de ${driver}` }).getByRole("button", { name: /^Place libre/ }).first().click();
  const dialog = sheet(page, driver);
  if (names) await tickOnly(dialog, names);
  await dialog.getByRole("button", { name: /^Placer/ }).click();
  return dialog;
}

/** As `send`, and closes the sheet before the answer. */
async function sendThenClose(page: Page, driver: string, names?: string[]) {
  await send(page, driver, names);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Holds the first action about `rideId` until `lose()`, then aborts it: offline by then, the page says so. */
async function loseFirst(page: Page, rideId: string) {
  let lose = () => {};
  const lost = new Promise<void>((resolve) => (lose = resolve));
  let held = false;
  await page.route("**/e/**", async (route) => {
    if (held || !route.request().postData()?.includes(rideId)) return route.fallback();
    held = true;
    await lost;
    return route.abort();
  });
  return lose;
}

interface Case {
  driver: "Sophie" | "Marc" | "Claire";
  names?: string[];
  /** How the send fails: offline, a 500, or a refusal from what changed meanwhile on the server. */
  fails: "offline" | "500" | ((db: Db, eventId: string, scene: Scene) => Promise<void>);
  text: string;
  icon?: "wifi-off";
}

const seat = (who: keyof Scene["persons"] | "ana", car: keyof Scene["cars"]) => (db: Db, eventId: string, scene: Scene) =>
  seedPlacement(db, { personId: who === "ana" ? scene.ana : scene.persons[who], eventId, leg: "aller", rideId: scene.cars[car] });

const CASES: Record<string, Case> = {
  offline: {
    driver: "Sophie",
    fails: "offline",
    text: "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez.",
    icon: "wifi-off",
  },
  "a server error": {
    driver: "Sophie",
    fails: "500",
    text: "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.",
  },
  "C5.7: the last seat taken meanwhile": {
    driver: "Claire",
    names: ["Tom"],
    fails: seat("ana", "claire"),
    text: "Tom n’a pas pu monter dans la voiture de Claire. Cette place vient d’être prise.",
  },
  "one seat left of two": {
    driver: "Marc",
    fails: seat("ana", "marc"),
    text: "Tom et Léa n’ont pas pu monter dans la voiture de Marc. Il ne reste plus qu’une place.",
  },
  "alreadyInCar, one person": {
    driver: "Sophie",
    names: ["Tom"],
    fails: seat("tom", "marc"),
    text: "Tom n’a pas pu monter dans la voiture de Sophie. Tom est déjà dans une voiture.",
  },
  "alreadyInCar, two persons": {
    driver: "Sophie",
    fails: seat("tom", "marc"),
    text: "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une de ces personnes est déjà dans une voiture.",
  },
};

test.describe("a failure of the seat sheet in the bar", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  for (const [what, { driver, names, fails, text, icon = "triangle-alert" }] of Object.entries(CASES)) {
    test(`C11.11, ${what}, the sheet closed before the answer: who, whose car, why`, async ({ context, db, page, seededEvent }) => {
      const rideId = scene.cars[driver.toLowerCase() as "sophie" | "marc" | "claire"];
      const answer = fails === "offline" ? await loseFirst(page, rideId) : await holdFirst(page, rideId, fails === "500");
      await page.goto(`/e/${seededEvent.id}`);
      await sendThenClose(page, driver, names);
      const seen = await watchAlerts(page);
      if (fails === "offline") {
        await context.setOffline(true);
        answer();
      } else if (fails === "500") await failHeld(page, answer);
      else {
        await fails(db, seededEvent.id, scene);
        answer();
      }

      await expect(messages(page)).toHaveText([text]);
      await expect(bar(page)).toHaveText(text);
      await expect(messages(page).locator(`svg.lucide-${icon}`)).toHaveCount(1);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      // The seat that had the focus may be gone with the answer: never <body>.
      await expect(page.locator("body")).not.toBeFocused();
      await barClose(page).click();
      await expect(title(page, driver)).toBeFocused();
    });
  }

  // « Le sujet d'un échec », line « un tap ; la feuille »: the car and each person sent. Hugo, or
  // Tom alone, sent to Sophie's car do not withdraw the failure of Tom and Léa there.
  const NOT_SEATED = "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
  const AGAIN = [
    { names: ["Tom", "Léa"], placed: "Tom et Léa sont dans la voiture de Sophie", withdraws: true },
    { names: ["Hugo"], placed: "Hugo est dans la voiture de Sophie", withdraws: false },
    { names: ["Tom"], placed: "Tom est dans la voiture de Sophie", withdraws: false },
  ];
  for (const { names, placed, withdraws } of AGAIN) {
    test(`C11.10: after Tom and Léa's failure in Sophie's car, ${names.join(" and ")} sent there ${withdraws ? "withdraws it at the send" : "leaves it"}`, async ({ page, seededEvent }) => {
      const first = await holdFirst(page, scene.cars.sophie, true);
      await page.goto(`/e/${seededEvent.id}`);
      await sendThenClose(page, "Sophie");
      await failHeld(page, first);
      await expect(messages(page)).toHaveText([NOT_SEATED]);

      const again = await holdFirst(page, scene.cars.sophie, false);
      const dialog = await send(page, "Sophie", names);
      // Before the answer, while the sheet is open.
      if (withdraws) await expect(lines(page)).toHaveCount(0);
      else await expect(lines(page)).toHaveText([NOT_SEATED]);
      again();
      await expect(dialog).toHaveCount(0);
      await expect(messages(page)).toHaveText(withdraws ? [placed] : [NOT_SEATED, placed]);
      await expect(bar(page)).toHaveText(withdraws ? "" : NOT_SEATED);
    });
  }

  // « Plusieurs prénoms »: beyond three, the first two and « et N autres », in the order of « Vos
  // inscriptions » (Léa, Hugo, Nina, Zoé), not the order of the ticks; the success the same way.
  test("C11.11: four persons, the failure and then the success name the first two and the others", async ({ page, seededEvent }) => {
    const ticks = ["Zoé", "Nina", "Hugo", "Léa"];
    const first = await holdFirst(page, scene.cars.paul, true);
    await page.goto(`/e/${seededEvent.id}`);
    await send(page, "Paul", ticks);
    await page.keyboard.press("Escape");
    await failHeld(page, first);
    const failure = "Léa, Hugo et 2 autres n’ont pas pu monter dans la voiture de Paul. Une erreur est survenue : réessayez dans un instant.";
    await expect(messages(page)).toHaveText([failure]);

    const dialog = await send(page, "Paul", ticks);
    await expect(dialog).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Léa, Hugo et 2 autres sont dans la voiture de Paul"]);
    await expect(title(page, "Paul")).toBeFocused();
  });
});
