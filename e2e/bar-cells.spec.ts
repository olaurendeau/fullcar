import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { bar, failHeld, holdFirst, holdToken, loseFirst, messages, newToken, recordBar, said, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #224: a failure of a cell's sheet names the person, the leg and the button touched, or the car
// left, and why (« Ce que dit un échec », « Chaque échec, mot pour mot », v4.2; C11.11, C11.10).

type Db = Kysely<Database>;

/**
 * The device holds Tom, Léa and Hugo, in that order. Aller: Claire, of another device, drives
 * Léa; Sophie drives nobody (3 seats); Tom and Hugo are without a car. Retour: nobody is concerned.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo") };
  const cars = { claire: await seedRide(db, eventId, await other("Claire")), sophie: await seedRide(db, eventId, await other("Sophie")) };
  await seedPlacement(db, { personId: persons.lea, eventId, leg: "aller", rideId: cars.claire });
  for (const personId of [persons.tom, persons.hugo]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  return { persons, cars };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;
type Who = keyof Scene["persons"];

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
/** The bar's lines, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');

/** Opens the cell of `firstName` on `leg` and touches `button` in its sheet. */
async function send(page: Page, firstName: string, leg: "Aller" | "Retour", button: string) {
  await cell(page, firstName, leg).click();
  await page.getByRole("dialog", { name: `${firstName} · ${leg}` }).getByRole("button", { name: button }).click();
}

/** As `send`, and closes the sheet before the answer. */
async function sendThenClose(page: Page, firstName: string, leg: "Aller" | "Retour", button: string) {
  await send(page, firstName, leg, button);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Meanwhile, `who` offers a car on `leg`: she drives there, and has no Placement left to change. */
const drives = (who: Who, leg: Leg) => async (db: Db, eventId: string, scene: Scene) => {
  const personId = scene.persons[who];
  await db.deleteFrom("placement").where("event_id", "=", eventId).where("person_id", "=", personId).where("leg", "=", leg).execute();
  await seedRide(db, eventId, personId, { leg });
};

interface Case {
  who: Who;
  leg: "Aller" | "Retour";
  button: string;
  /** How the send fails: offline, a 500, or a refusal from what changed meanwhile on the server. */
  fails: "offline" | "500" | ((db: Db, eventId: string, scene: Scene) => Promise<void>);
  text: string;
  icon?: "wifi-off";
}

const NOT_CONCERNED = { who: "tom", leg: "Aller", button: "Ne fait pas l’aller" } as const;
const LEAVE = { who: "lea", leg: "Aller", button: "Sortir de la voiture" } as const;
const TOM_FAILED = "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
const LEA_FAILED = "Léa n’a pas pu sortir de la voiture de Claire. Une erreur est survenue : réessayez dans un instant.";
const HUGO_FAILED = "Hugo · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";

const CASES: Record<string, Case> = {
  "« Ne fait pas l’aller », offline": {
    ...NOT_CONCERNED,
    fails: "offline",
    text: "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Vérifiez la connexion, puis réessayez.",
    icon: "wifi-off",
  },
  "« Ne fait pas l’aller », a server error": { ...NOT_CONCERNED, fails: "500", text: TOM_FAILED },
  "« Ne fait pas l’aller », Tom driving there meanwhile": {
    ...NOT_CONCERNED,
    fails: drives("tom", "aller"),
    text: "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Tom conduit à l’aller.",
  },
  "« Ne fait pas l’aller », the event deleted meanwhile": {
    ...NOT_CONCERNED,
    fails: async (db, eventId) => void (await db.deleteFrom("event").where("id", "=", eventId).execute()),
    text: "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Cet événement est introuvable : il a peut-être été supprimé.",
  },
  "« Je cherche une place », Tom driving on the return meanwhile": {
    who: "tom",
    leg: "Retour",
    button: "Je cherche une place",
    fails: drives("tom", "retour"),
    text: "Tom · Retour : « Je cherche une place » n’a pas été enregistré. Tom conduit au retour.",
  },
  "« Sortir de la voiture », a server error": { ...LEAVE, fails: "500", text: LEA_FAILED },
  "« Sortir de la voiture », Léa driving there meanwhile": {
    ...LEAVE,
    fails: drives("lea", "aller"),
    text: "Léa n’a pas pu sortir de la voiture de Claire. Léa conduit à l’aller.",
  },
};

const FIRST_NAMES: Record<Who, string> = { tom: "Tom", lea: "Léa", hugo: "Hugo" };

test.describe("a failure of a cell's sheet in the bar", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  for (const [what, { who, leg, button, fails, text, icon = "triangle-alert" }] of Object.entries(CASES)) {
    test(`C11.11, ${what}, the sheet closed before the answer: who, which leg, which choice, why`, async ({ context, db, page, seededEvent }) => {
      const personId = scene.persons[who];
      const answer = fails === "offline" ? await loseFirst(page, personId) : await holdFirst(page, personId, fails === "500");
      await page.goto(`/e/${seededEvent.id}`);
      await sendThenClose(page, FIRST_NAMES[who], leg, button);
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
      await expect(page.locator("body")).not.toBeFocused();
      // The line's landmark: the cell, whatever it reads now.
      await barClose(page).click();
      await expect(cell(page, FIRST_NAMES[who], leg)).toBeFocused();
    });
  }

  // « Le sujet d'un échec », line « une action de cellule »: the cell (`cell:{personId}:{leg}`).
  // The same cell reopened withdraws Tom · Aller's failure as it sends; Tom · Retour, or a seat
  // taken for Tom, leave it, and a success without words takes no failure away.
  const AGAIN: { what: string; again: (page: Page) => Promise<void>; done: string; after: string[] }[] = [
    {
      what: "« Ne fait pas l’aller » from the same cell, reopened, withdraws it at the send",
      again: (page) => send(page, "Tom", "Aller", "Ne fait pas l’aller"),
      done: "Tom, Aller : Ne fait pas l’aller",
      after: [],
    },
    {
      what: "« Je cherche une place » from Tom · Retour leaves it",
      again: (page) => send(page, "Tom", "Retour", "Je cherche une place"),
      done: "Tom, Retour : Sans voiture",
      after: [TOM_FAILED],
    },
    {
      what: "a seat taken for Tom in Sophie's car leaves it",
      again: async (page) => {
        await page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Sophie" }).getByRole("button", { name: /^Place libre/ }).first().click();
        const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Sophie ?" });
        await sheet.getByRole("checkbox", { name: "Hugo", exact: true }).setChecked(false);
        await sheet.getByRole("checkbox", { name: "Tom", exact: true }).setChecked(true);
        await sheet.getByRole("button", { name: /^Placer/ }).click();
      },
      done: "Tom, Aller : Avec Sophie",
      after: [TOM_FAILED, "Tom est dans la voiture de Sophie"],
    },
  ];
  for (const { what, again, done, after } of AGAIN) {
    test(`C11.10: after Tom · Aller's failure, ${what}`, async ({ page, seededEvent }) => {
      const first = await holdFirst(page, scene.persons.tom, true);
      await page.goto(`/e/${seededEvent.id}`);
      await sendThenClose(page, "Tom", "Aller", "Ne fait pas l’aller");
      await failHeld(page, first);
      await expect(messages(page)).toHaveText([TOM_FAILED]);

      const answer = await holdFirst(page, scene.persons.tom, false);
      await again(page);
      // Before the answer, while the sheet is open.
      await expect(lines(page)).toHaveText(after.length ? [TOM_FAILED] : []);
      answer();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(section(page).getByRole("button", { name: done, exact: true })).toBeVisible();
      // Once more around a sheet: a line left waiting, or withdrawn late, would show by now.
      await cell(page, "Hugo", "Retour").click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(messages(page)).toHaveText(after);
      await expect(bar(page)).toHaveText(after.length ? TOM_FAILED : "");
    });
  }

  // Rule 1: the failures, most recent first, recent as written in the bar. Hugo's, answered
  // while a sheet hides the page, is written as it closes: it takes its rank then, on top.
  test("C11.10: failures written A, B, C show C, B, A; one that waited for a sheet takes its rank as it closes", async ({ page, seededEvent }) => {
    const answers = {
      tom: await holdFirst(page, scene.persons.tom, true),
      lea: await holdFirst(page, scene.persons.lea, true),
      hugo: await holdFirst(page, scene.persons.hugo, true),
    };
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Tom", "Aller", "Ne fait pas l’aller");
    await failHeld(page, answers.tom);
    await sendThenClose(page, "Léa", "Aller", "Sortir de la voiture");
    await failHeld(page, answers.lea);
    await expect(messages(page)).toHaveText([LEA_FAILED, TOM_FAILED]);

    await sendThenClose(page, "Hugo", "Aller", "Ne fait pas l’aller");
    await cell(page, "Tom", "Retour").click();
    const sheet = page.getByRole("dialog", { name: "Tom · Retour" });
    await expect(sheet).toBeVisible();
    const record = await recordBar(page);
    await failHeld(page, answers.hugo);
    // Under the sheet, nothing is written: the bar shows what it showed.
    await expect(lines(page)).toHaveText([LEA_FAILED, TOM_FAILED]);
    await expect(bar(page)).toHaveText(LEA_FAILED);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(messages(page)).toHaveText([HUGO_FAILED, LEA_FAILED, TOM_FAILED]);
    await expect(bar(page)).toHaveText(HUGO_FAILED);
    const { writes } = await record();
    expect(writes.filter((write) => write.hidden)).toEqual([]);
    expect(said(writes, "alert")).toEqual([HUGO_FAILED]);
  });
});
