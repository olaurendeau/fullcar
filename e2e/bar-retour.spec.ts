import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, holdToken, loseFirst, messages, newToken, recordBar, said } from "./device";
import { removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath, test as organiserTest } from "./organiser";

leaveNoToken();

/*
 * #267, epic #250 (organizer-view v3.3.6, decisions 44 and 45; event-board v4.4.4, rule 5): the
 * page applies a state without the retour its last one had, and the bar's lines about the retour
 * go, once; the failures `noRetour` written by that answer or later stay. A send whose aim holds
 * without the retour leaves no failure: the bar says an information. The organiser removes the
 * retour in the database (`removeRetourInDb`), as `updateEvent` does, or, on `/admin`, with
 * « Modifier l’événement » (#268). Nothing here prints a
 * token, the admin link or a number.
 */

type Db = Kysely<Database>;

const NO_RETOUR = "Il n’y a plus de retour pour cet événement.";
const carGone = (driver: string) => `Il n’y a plus de retour pour cet événement : la voiture de ${driver} n’est plus proposée.`;
const TEXT = {
  notConcernedOffline: "Tom · Retour : « Ne fait pas le retour » n’a pas été enregistré. Vérifiez la connexion, puis réessayez.",
  lookingOffline: "Tom · Retour : « Je cherche une place » n’a pas été enregistré. Vérifiez la connexion, puis réessayez.",
  lookingRefused: `Tom · Retour : « Je cherche une place » n’a pas été enregistré. ${NO_RETOUR}`,
  placed: "Tom est dans la voiture de Sophie",
  undoOffline: "Tom n’a pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ».",
};

/**
 * The device holds `first` and Léa. Aller: Marc (3 seats) drives nobody; `first` is without a
 * car, Léa is not concerned. Retour: Sophie (3 seats), of the device if `sophieMine`, drives
 * nobody; Claire drives Léa; `first` is without a car, or not concerned.
 */
async function seedScene(db: Db, eventId: string, token: string, retour: "withoutCar" | "notConcerned", { first = "Tom", sophieMine = false } = {}) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const persons = { first: await mine(first), lea: await mine("Léa") };
  await seedRide(db, eventId, await other("Marc"));
  const sophie = await seedRide(db, eventId, sophieMine ? await mine("Sophie") : await other("Sophie"), { leg: "retour" });
  const claire = await seedRide(db, eventId, await other("Claire"), { leg: "retour" });
  await seedPlacement(db, { personId: persons.first, eventId, leg: "aller", rideId: null });
  if (retour === "withoutCar") await seedPlacement(db, { personId: persons.first, eventId, leg: "retour", rideId: null });
  await seedPlacement(db, { personId: persons.lea, eventId, leg: "retour", rideId: claire });
  return { ...persons, sophie };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const panel = (page: Page) => page.getByRole("tabpanel");
const seat = (page: Page, driver: string) =>
  panel(page).getByRole("article", { name: `Voiture de ${driver}` }).getByRole("button", { name: /^Place libre/ }).first();
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const tabs = (page: Page) => page.locator('[role="tab"]');
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const undo = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });

/** Opens the cell of `firstName` on `leg` and touches `button` in its sheet. */
async function send(page: Page, firstName: string, leg: "Aller" | "Retour", button: string) {
  await cell(page, firstName, leg).click();
  await sheet(page, `${firstName} · ${leg}`).getByRole("button", { name: button }).click();
}

/** `firstName`'s cell on the retour fails offline, its sheet closed before the answer: the bar says `text`. */
async function failOffline(page: Page, personId: string, button: string, text: string) {
  const lose = await loseFirst(page, personId);
  await send(page, "Tom", "Retour", button);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.context().setOffline(true);
  lose();
  await expect(messages(page)).toHaveText([text]);
  await page.context().setOffline(false);
}

/** Sends what `open` sends, closes its sheet or confirmation, and loses its answer offline: the request is the first to carry `text`. */
async function loseClosed(page: Page, text: string, open: () => Promise<void>) {
  const lose = await loseFirst(page, text);
  await open();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.context().setOffline(true);
  lose();
}

/** « Ajouter une personne » on the aller, for the aller alone: its answer applies the state the server has now. */
async function addAtAller(page: Page, firstName: string) {
  await tab(page, "Aller").click();
  await panel(page).getByRole("button", { name: "Ajouter une personne", exact: true }).click();
  const form = sheet(page, "Ajouter une personne");
  await form.getByLabel("Prénom").fill(firstName);
  await form.getByRole("checkbox", { name: "Aller et retour" }).uncheck();
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const OFFLINE = "Vérifiez la connexion, puis réessayez.";
const GARE = "Gare de Cesson";
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });

/**
 * A failure about a car or an offer of the retour, from the Retour tab: the page of the device,
 * which holds Sophie, or of a new device (`device: false`), and its words in the bar (C11.11).
 */
const RETOUR_FAILURES: Record<string, { text: string; device: boolean; fail: (page: Page, scene: Scene) => Promise<void> }> = {
  "a tap on a seat (`seats:`)": {
    text: `Tom n’a pas pu monter dans la voiture de Sophie. ${OFFLINE}`,
    device: true,
    fail: async (page) => {
      await page.context().setOffline(true);
      await seat(page, "Sophie").click();
    },
  },
  "« Retirer la voiture » (`ride:`)": {
    text: `La voiture de Sophie pour le retour n’a pas été retirée. ${OFFLINE}`,
    device: true,
    fail: (page, scene) =>
      loseClosed(page, scene.sophie, async () => {
        await car(page, "Sophie").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
      }),
  },
  "« Modifier » the car (`ride:…:edit`)": {
    text: `Les changements de la voiture de Sophie pour le retour n’ont pas été enregistrés. ${OFFLINE}`,
    device: true,
    fail: (page) =>
      loseClosed(page, GARE, async () => {
        await car(page, "Sophie").getByRole("button", { name: "Modifier", exact: true }).click();
        await sheet(page, "Modifier la voiture").getByLabel("Lieu de dépose", { exact: true }).fill(GARE);
        await sheet(page, "Modifier la voiture").getByRole("button", { name: "Valider" }).click();
      }),
  },
  "« Proposer une voiture » (`offer:retour:…`)": {
    text: `La voiture de Marc pour le retour n’a pas été proposée. ${OFFLINE}`,
    device: false,
    fail: (page) =>
      loseClosed(page, GARE, async () => {
        await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
        const form = sheet(page, "Proposer une voiture");
        await form.getByLabel("Prénom", { exact: true }).fill("Marc");
        await form.getByLabel("Lieu de dépose", { exact: true }).fill(GARE);
        await form.getByRole("button", { name: "Valider" }).click();
      }),
  },
};

/** No sheet, no tabs, and the event's title has the focus: still once Radix has given back the focus of a sheet closed. */
async function expectWithoutRetour(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(0);
  await expect(title(page)).toBeFocused();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  await expect(title(page)).toBeFocused();
}

test.describe("the bar, the retour removed meanwhile", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test("M7.3: « Ne fait pas le retour » of Tom · Retour: no failure, the information", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, "withoutCar");
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const record = await recordBar(page);
    await cell(page, "Tom", "Retour").click();
    await removeRetourInDb(db, seededEvent.id);
    await sheet(page, "Tom · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();

    await expectWithoutRetour(page);
    await expect(messages(page)).toHaveText([NO_RETOUR]);
    expect(said((await record()).writes, "alert")).toEqual([]);
  });

  test("M7.9, page A: the next action's state takes the retour's failure, its success and its « Annuler » away; the bar is empty", async ({
    page,
    db,
    seededEvent,
  }) => {
    const persons = await seedScene(db, seededEvent.id, token, "withoutCar");
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await failOffline(page, persons.first, "Ne fait pas le retour", TEXT.notConcernedOffline);
    await tab(page, "Retour").click();
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText([TEXT.notConcernedOffline, TEXT.placed]);
    await expect(undo(page)).toHaveCount(1);
    await removeRetourInDb(db, seededEvent.id);
    await addAtAller(page, "Inès");

    await expect(tabs(page)).toHaveCount(0);
    await expect(page.locator('[data-message-bar] [role="group"] > p')).toHaveCount(0);
    await expect(page.locator("body")).not.toBeFocused();
  });

  // Decision 44, the subjects `seats:`, `ride:` and `offer:retour:…` (#267's review): each failure
  // is about the retour, by the leg it was sent on or by its offer's subjects, and goes with it.
  for (const [what, { text, device, fail }] of Object.entries(RETOUR_FAILURES)) {
    test(`decision 44: a failure of ${what} on the retour goes with it`, async ({ page, db, seededEvent }) => {
      const scene = await seedScene(db, seededEvent.id, token, "withoutCar", { sophieMine: true });
      if (device) await holdToken(page, seededEvent.id, token);
      await page.goto(`/e/${seededEvent.id}`);
      await expect(async () => {
        await tab(page, "Retour").click();
        await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true", { timeout: 500 });
      }).toPass();
      await expect(panel(page).getByRole("button", { name: "Ajouter une personne", exact: true })).toBeEnabled();
      await fail(page, scene);
      await expect(messages(page)).toHaveText([text]);
      await page.context().setOffline(false);
      await removeRetourInDb(db, seededEvent.id);
      await addAtAller(page, "Inès");

      await expect(tabs(page)).toHaveCount(0);
      await expect(page.locator('[data-message-bar] [role="group"] > p')).toHaveCount(0);
      await expect(page.locator("body")).not.toBeFocused();
    });
  }

  test("M7.9, page B: the answer that brings the transition writes its failure `noRetour`, and a later state leaves it", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id, token, "notConcerned");
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(cell(page, "Tom", "Retour")).toBeVisible();
    await removeRetourInDb(db, seededEvent.id);
    await send(page, "Tom", "Retour", "Je cherche une place");
    await expectWithoutRetour(page);
    await expect(messages(page)).toHaveText([TEXT.lookingRefused]);

    await send(page, "Tom", "Aller", "Ne fait pas l’aller");
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Ne fait pas l’aller");
    await expect(messages(page)).toHaveText([TEXT.lookingRefused]);
  });

  test("M7.9, page C, M7.3: « Sortir de la voiture » of Léa · Retour: the aller's success stays with its « Annuler », and the information", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id, token, "notConcerned", { first: "Hugo" });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Marc").click();
    await expect(messages(page)).toHaveText(["Hugo est dans la voiture de Marc"]);
    await removeRetourInDb(db, seededEvent.id);
    const record = await recordBar(page);
    await send(page, "Léa", "Retour", "Sortir de la voiture");

    await expectWithoutRetour(page);
    await expect(messages(page)).toHaveText([carGone("Claire"), "Hugo est dans la voiture de Marc"]);
    await expect(undo(page)).toHaveAccessibleDescription("Hugo est dans la voiture de Marc");
    expect(said((await record()).writes, "alert")).toEqual([]);
  });

  test("B1.4: the « Annuler » of a failure, refused by `noRetour`: the information alone, no « Annuler », nothing said in `alert`", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id, token, "withoutCar");
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await tab(page, "Retour").click();
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText([TEXT.placed]);
    await context.setOffline(true);
    await undo(page).click();
    await expect(messages(page)).toHaveText([TEXT.undoOffline, TEXT.placed]);
    await expect(undo(page)).toHaveAccessibleDescription(TEXT.undoOffline);
    // Said in `alert` 100 ms after its line: before the recording starts, not counted as a write since the send.
    await expect(bar(page)).toHaveText(TEXT.undoOffline);
    await context.setOffline(false);
    await removeRetourInDb(db, seededEvent.id);
    const record = await recordBar(page);
    await undo(page).focus();
    await page.keyboard.press("Enter");

    await expectWithoutRetour(page);
    await expect(messages(page)).toHaveText([carGone("Sophie")]);
    await expect(undo(page)).toHaveCount(0);
    expect(said((await record()).writes, "alert")).toEqual([]);
  });

  test("M7.12: « Retirer la voiture » on Sophie's car of the retour: no failure, the information, nothing written", async ({ page, db, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, "notConcerned", { sophieMine: true });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await tab(page, "Retour").click();
    await panel(page).getByRole("article", { name: "Voiture de Sophie" }).getByRole("button", { name: "Retirer la voiture" }).click();
    await removeRetourInDb(db, seededEvent.id);
    const rows = async () => (await db.selectFrom("ride").select("id").where("event_id", "=", seededEvent.id).execute()).length;
    const before = await rows();
    await page.getByRole("alertdialog").getByRole("button", { name: "Retirer la voiture" }).click();

    await expectWithoutRetour(page);
    await expect(messages(page)).toHaveText([carGone("Sophie")]);
    expect(await rows()).toBe(before);
  });
});

organiserTest.describe("the organiser's bar, the retour removed meanwhile", () => {
  organiserTest.use({ locale: "fr-FR" });

  organiserTest("M7.9, on /admin: the retour removed by « Modifier l’événement » takes the failure of the cell Retour away", async ({
    page,
    db,
    seededEvent,
  }) => {
    const token = newToken();
    const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token)).id;
    // Without a car at the aller, which unfolds « Vos inscriptions »; not concerned at the retour.
    await seedPlacement(db, { personId: tom, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(organiserPath(seededEvent));
    await expect(cell(page, "Tom", "Retour")).toBeVisible();
    await failOffline(page, tom, "Je cherche une place", TEXT.lookingOffline);
    // The retour holds nothing: unchecked, it is removed with no confirmation.
    await page.getByRole("button", { name: "Modifier l’événement", exact: true }).click();
    await sheet(page, "Modifier l’événement").getByRole("checkbox", { name: "Retour", exact: true }).uncheck();
    await sheet(page, "Modifier l’événement").getByRole("button", { name: "Valider", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Événement modifié. Personne n’est prévenu : pensez à le dire au groupe."]);
    expect((await db.selectFrom("event").select("retour_at").where("id", "=", seededEvent.id).executeTakeFirstOrThrow()).retour_at).toBeNull();
  });
});
