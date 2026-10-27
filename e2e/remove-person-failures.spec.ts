import type { BrowserContext, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { failHeld, holdFirst, holdToken, loseFirst, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #669 (docs/design/remove-person/, v2, « Refus et échecs », sections 5, 6 and 9, RP1.7; « Focus,
// barre, envoi », RP7.3): a removal that fails, said in its confirmation while it is open, in the
// bar once it is closed; and the lines of the bar that a person gone leaves without a subject.

type Db = Kysely<Database>;

const REMOVE = "Retirer de l’événement";
const STILL = "Léa fait toujours partie de l’événement.";
const REMOVED = "Léa ne fait plus partie de l’événement";
const FAILED = "Une erreur est survenue : réessayez dans un instant.";

/**
 * The device holds Léa and Tom, both without a car on the aller and on the retour; Claire, of
 * another device, drives on the aller, with 2 free seats.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const lea = (await seedPerson(db, eventId, { firstName: "Léa" }, token)).id;
  const tom = (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id;
  const claire = (await seedPerson(db, eventId, { firstName: "Claire" })).id;
  const car = await seedRide(db, eventId, claire, { seats: 2, departureTime: "08:15:00" });
  for (const personId of [lea, tom]) {
    for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId, eventId, leg, rideId: null });
  }
  return { lea, tom, claire, car };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** Every row of the event's persons, Rides and Placements: what a failed removal leaves as it was. */
async function rows(db: Db, eventId: string) {
  const persons = await db.selectFrom("person").select(["id", "first_name"]).where("event_id", "=", eventId).orderBy("id").execute();
  const rides = await db.selectFrom("ride").select(["id", "driver_id", "leg", "seats"]).where("event_id", "=", eventId).orderBy("id").execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  return { persons, rides, placements };
}

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const names = (page: Page) => section(page).locator("[data-person-name]");
const nameButton = (page: Page, firstName: string) => names(page).filter({ hasText: firstName });
const sheet = (page: Page, firstName: string) => page.getByRole("dialog", { name: firstName, exact: true });
const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Retirer Léa de l’événement ?" });
const confirm = (page: Page) => confirmation(page).getByRole("button", { name: REMOVE, exact: true });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
const barAlert = (page: Page) => page.locator('[role="status"] + [role="alert"]');
const cellButton = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });

/** Opens the sheet of `firstName`, then its confirmation. */
async function openConfirmation(page: Page, firstName = "Léa") {
  await nameButton(page, firstName).click();
  await sheet(page, firstName).getByRole("button", { name: REMOVE, exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: `Retirer ${firstName} de l’événement ?` })).toBeVisible();
}

/** Closes the confirmation, then the sheet, before the answer. */
async function closeAll(page: Page) {
  // By their CSS: a confirmation that closes hides its sheet from role queries until it is gone.
  const open = page.locator('[role="dialog"], [role="alertdialog"]');
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(open).toHaveCount(0, { timeout: 1_000 });
  }).toPass();
}

/** Puts another well-formed token in the device's place, as another browser's would be: the page knows nothing of it. */
const replaceToken = (page: Page, eventId: string) =>
  page.evaluate(([key, token]) => localStorage.setItem(key, token), [`fullcar:personal-token:${eventId}`, newToken()]);

/** What a case does to the page and the database, once the removal is held: the answer it then gets. */
type Release = (page: Page, context: BrowserContext, eventId: string, db: Db) => Promise<unknown>;

/** Each line of « Refus et échecs » the device's path meets (the anonymised event comes with #674). */
interface Case {
  /** Set before the page loads: holds the removal of Léa, and gives what lets it go, as this case answers it. */
  hold: (page: Page, scene: Scene) => Promise<Release>;
  /** Once the page has loaded, before the removal is confirmed. */
  before?: Release;
  /** In the open confirmation. */
  said: string;
  /** In the bar, after « Léa fait toujours partie de l’événement. ». */
  why: string;
  /** A refusal that sending again would not change: « Fermer » alone (decision 12). */
  final: boolean;
  /** The event is still there, its rows as they were. */
  kept: boolean;
}

const CASES: Record<string, Case> = {
  offline: {
    hold: async (page, scene) => {
      const lose = await loseFirst(page, scene.lea);
      return async (_page, context) => {
        await context.setOffline(true);
        lose();
      };
    },
    said: "Action impossible, vérifiez la connexion",
    why: "Vérifiez la connexion, puis réessayez.",
    final: false,
    kept: true,
  },
  "a server error (500)": {
    hold: async (page, scene) => {
      const answer = await holdFirst(page, scene.lea, true);
      return () => failHeld(page, answer);
    },
    said: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
    why: FAILED,
    final: false,
    kept: true,
  },
  "the token replaced in localStorage (forbidden)": {
    hold: async (page, scene) => {
      const answer = await holdFirst(page, scene.lea, false);
      return async () => answer();
    },
    before: (page, _context, eventId) => replaceToken(page, eventId),
    said: "Cet appareil ne peut pas faire ce changement : rechargez la page.",
    why: "Cet appareil ne peut pas faire ce changement : rechargez la page.",
    final: true,
    kept: true,
  },
  "the event deleted (eventNotFound)": {
    hold: async (page, scene) => {
      const answer = await holdFirst(page, scene.lea, false);
      return async (_page, _context, eventId, db) => {
        await db.deleteFrom("event").where("id", "=", eventId).execute();
        answer();
      };
    },
    said: "Cet événement est introuvable : il a peut-être été supprimé.",
    why: "Cet événement est introuvable : il a peut-être été supprimé.",
    final: true,
    kept: false,
  },
};

const barLines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');

test.describe("a removal that fails or is refused", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  for (const [what, { hold, before, said, why, final, kept }] of Object.entries(CASES)) {
    const buttons = final ? "« Fermer » alone, focused" : "the red button again, focused";
    test(`RP1.7, ${what}, the confirmation open: its words, ${buttons}; nothing changed`, async ({ context, db, page, seededEvent }) => {
      const release = await hold(page, scene);
      await page.goto(`/e/${seededEvent.id}`);
      await expect(names(page)).toHaveText(["Léa", "Tom"]);
      const stored = await rows(db, seededEvent.id);
      await before?.(page, context, seededEvent.id, db);
      await openConfirmation(page);
      await confirm(page).click();
      await expect(confirm(page)).toBeDisabled();
      await release(page, context, seededEvent.id, db);

      await expect(confirmation(page).getByRole("alert")).toHaveText(said);
      if (final) {
        expect(await confirmation(page).getByRole("button").allTextContents()).toEqual(["Fermer"]);
        await expect(confirmation(page).getByRole("button", { name: "Fermer" })).toBeFocused();
      } else {
        expect(await confirmation(page).getByRole("button").allTextContents()).toEqual([REMOVE, "Annuler"]);
        await expect(confirm(page)).toBeEnabled();
        await expect(confirm(page)).toBeFocused();
      }
      // Said in the confirmation, not in the bar.
      await expect(barLines(page)).toHaveCount(0);
      if (kept) expect(await rows(db, seededEvent.id)).toEqual(stored);

      // Closed, the focus goes back to the button that opened it, and the sheet still shows Léa.
      await confirmation(page).getByRole("button", { name: final ? "Fermer" : "Annuler" }).click();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(sheet(page, "Léa").getByRole("button", { name: REMOVE, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(names(page)).toHaveText(["Léa", "Tom"]);
      await expect(barLines(page)).toHaveCount(0);
    });

    test(`RP1.7, ${what}, the confirmation closed before the answer: the bar names Léa, then why; « Fermer »: her first name`, async ({
      context,
      db,
      page,
      seededEvent,
    }) => {
      const release = await hold(page, scene);
      await page.goto(`/e/${seededEvent.id}`);
      await expect(names(page)).toHaveText(["Léa", "Tom"]);
      const stored = await rows(db, seededEvent.id);
      await before?.(page, context, seededEvent.id, db);
      await openConfirmation(page);
      await confirm(page).click();
      await closeAll(page);
      await release(page, context, seededEvent.id, db);

      const text = `${STILL} ${why}`;
      await expect(messages(page)).toHaveText([text]);
      await expect(barAlert(page)).toHaveText(text);
      await expect(names(page)).toHaveText(["Léa", "Tom"]);
      if (kept) expect(await rows(db, seededEvent.id)).toEqual(stored);
      await barClose(page).click();
      await expect(messages(page)).toHaveCount(0);
      await expect(nameButton(page, "Léa")).toBeFocused();
    });
  }
});


/** Sends « Modifier » for `firstName`'s number, failing (500), its sheet closed before the answer. */
async function editFails(page: Page, firstName: string, personId: string, phone: string) {
  const answer = await holdFirst(page, personId, true);
  await nameButton(page, firstName).click();
  await sheet(page, firstName).getByRole("button", { name: "Modifier", exact: true }).click();
  const form = page.getByRole("dialog", { name: `Modifier ${firstName}` });
  await form.getByLabel("Téléphone (facultatif)").fill(phone);
  await form.getByRole("button", { name: "Valider" }).click();
  await closeAll(page);
  await failHeld(page, answer);
}

/** Sends « Ne fait pas l’aller » for Léa, failing (500), her cell's sheet closed before the answer. */
async function cellFails(page: Page, personId: string) {
  const answer = await holdFirst(page, personId, true);
  await cellButton(page, "Léa", "Aller").click();
  await page.getByRole("dialog", { name: "Léa · Aller" }).getByRole("button", { name: "Ne fait pas l’aller" }).click();
  await closeAll(page);
  await failHeld(page, answer);
}

/** Confirms Léa's removal, failing (500), the confirmation and the sheet closed before the answer. */
async function removalFails(page: Page, personId: string) {
  const answer = await holdFirst(page, personId, true);
  await openConfirmation(page);
  await confirm(page).click();
  await closeAll(page);
  await failHeld(page, answer);
}

const LEA_PHONE = `Le téléphone de Léa n’a pas été enregistré. ${FAILED}`;
const LEA_CELL = `Léa · Aller : « Ne fait pas l’aller » n’a pas été enregistré. ${FAILED}`;
const LEA_REMOVAL = `${STILL} ${FAILED}`;
const TOM_PHONE = `Le téléphone de Tom n’a pas été enregistré. ${FAILED}`;

// « Le sujet d’un échec » (rule 5 of v4.2, C11.10): the removal of this person.
test.describe("the subject of a removal's failure, and the lines a person gone leaves without a subject", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("RP7.3, C11.10: Léa's removal sent again withdraws its failure as it is sent", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await removalFails(page, scene.lea);
    await expect(messages(page)).toHaveText([LEA_REMOVAL]);

    const answer = await holdFirst(page, scene.lea, false);
    await openConfirmation(page);
    await confirm(page).click();
    // Before the answer, while the confirmation is open.
    await expect(barLines(page)).toHaveCount(0);
    answer();
    await expect(names(page)).toHaveText(["Tom"]);
    await expect(messages(page)).toHaveText([REMOVED]);
  });

  test("RP7.3, C11.10: neither Tom's removal nor « Modifier » Léa withdraws the failure of Léa's removal", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await removalFails(page, scene.lea);
    await expect(messages(page)).toHaveText([LEA_REMOVAL]);

    await editFails(page, "Léa", scene.lea, "06 12 34 56 78");
    await expect(messages(page)).toHaveText([LEA_PHONE, LEA_REMOVAL]);

    await openConfirmation(page, "Tom");
    await page.getByRole("alertdialog", { name: "Retirer Tom de l’événement ?" }).getByRole("button", { name: REMOVE, exact: true }).click();
    await expect(names(page)).toHaveText(["Léa"]);
    await expect(messages(page)).toHaveText([LEA_PHONE, LEA_REMOVAL, "Tom ne fait plus partie de l’événement"]);
  });

  test("RP7.3: Léa removed, the failures about her alone go; Tom's stays", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await editFails(page, "Léa", scene.lea, "06 12 34 56 78");
    await cellFails(page, scene.lea);
    await removalFails(page, scene.lea);
    await editFails(page, "Tom", scene.tom, "06 98 76 54 32");
    await expect(messages(page)).toHaveText([TOM_PHONE, LEA_REMOVAL, LEA_CELL, LEA_PHONE]);

    await openConfirmation(page);
    await confirm(page).click();
    await expect(names(page)).toHaveText(["Tom"]);
    await expect(messages(page)).toHaveText([TOM_PHONE, REMOVED]);
    await expect(barAlert(page)).toHaveText(TOM_PHONE);
  });

  test("RP7.3: any state without Léa takes her placement's success and its « Annuler », whatever brought it", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Claire" }).getByRole("button", { name: /^Place libre/ }).first().click();
    const seats = page.getByRole("dialog", { name: "Qui monte dans la voiture de Claire ?" });
    await seats.getByRole("checkbox", { name: "Tom", exact: true }).setChecked(false);
    await seats.getByRole("checkbox", { name: "Léa", exact: true }).setChecked(true);
    await seats.getByRole("button", { name: /^Placer/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Léa est dans la voiture de Claire"]);
    await expect(page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" })).toHaveCount(1);
    await editFails(page, "Tom", scene.tom, "06 98 76 54 32");
    await expect(messages(page)).toHaveText([TOM_PHONE, "Léa est dans la voiture de Claire"]);

    // Removed elsewhere; the page learns it from the answer of an action on her, refused with the state.
    await deleteSeededPerson(db, seededEvent.id, scene.lea);
    await cellButton(page, "Léa", "Retour").click();
    await page.getByRole("dialog", { name: "Léa · Retour" }).getByRole("button", { name: "Ne fait pas le retour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(names(page)).toHaveText(["Tom"]);
    await expect(messages(page)).toHaveText([
      `Léa · Retour : « Ne fait pas le retour » n’a pas été enregistré. Léa ne fait plus partie de l’événement.`,
      TOM_PHONE,
    ]);
    await expect(page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" })).toHaveCount(0);
  });
});
