import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, loseFirst, messages, newToken, watchAlerts } from "./device";
import { DRIVER_PHONE, fillDriver } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #226: a failure of « Proposer une voiture », of « Modifier » a car and of « Retirer la voiture »
// names the car and its leg, then why (« Ce que dit un échec », « Chaque échec, mot pour mot »,
// v4.2; C11.11, C11.10), and « Fermer » gives the focus to its landmark (« Le repère de chaque message »).

const OFFLINE = "Vérifiez la connexion, puis réessayez.";
const FAILED = "Une erreur est survenue : réessayez dans un instant.";
const CHANGES = "Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés.";
const REMOVAL = "La voiture de Claire pour l’aller n’a pas été retirée.";
const GARE = "Gare de Cesson";

const panel = (page: Page) => page.getByRole("tabpanel");
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const offerButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Proposer une voiture", exact: true });
const form = (page: Page) => page.getByRole("dialog", { name: "Proposer une voiture" });
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
/** The bar's lines, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Retirer la voiture ?" });

async function selectTab(page: Page, leg: "Aller" | "Retour") {
  await expect(async () => {
    await tab(page, leg).click();
    await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** Sends the form open in its sheet, then closes the sheet before the answer. */
async function sendThenClose(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Opens « Proposer une voiture » on the active tab, for Marc, a new person with a number, from `location`. */
async function offerAsMarc(page: Page, location: string) {
  await offerButton(panel(page)).click();
  // The bar names her without the spaces typed around.
  await fillDriver(form(page), { firstName: "  Marc  ", phone: DRIVER_PHONE });
  // A combobox since its places propose suggestions (place-autocomplete, AL1.2).
  await form(page).getByRole("combobox", { name: /^Lieu de/ }).fill(location);
}

test.describe("an offer's failure in the bar", () => {
  test.use({ locale: "fr-FR" });

  // From the Retour tab: its own button is the landmark; the Aller tab's, mounted but hidden, is not.
  const OFFERS = {
    "offline, on the aller": { leg: "Aller", text: `La voiture de Marc pour l’aller n’a pas été proposée. ${OFFLINE}`, icon: "wifi-off" },
    "a server error, on the retour": { leg: "Retour", text: `La voiture de Marc pour le retour n’a pas été proposée. ${FAILED}`, icon: "triangle-alert" },
  } as const;
  for (const [what, { leg, text, icon }] of Object.entries(OFFERS)) {
    test(`C11.11, « Proposer une voiture », ${what}, the sheet closed before the answer; « Fermer »: the leg's « Proposer une voiture »`, async ({
      context,
      page,
      seededEvent,
    }) => {
      const offline = leg === "Aller";
      const answer = offline ? await loseFirst(page, "Mairie de Vitré") : await holdFirst(page, "Mairie de Vitré", true);
      await page.goto(`/e/${seededEvent.id}`);
      await selectTab(page, leg);
      await offerAsMarc(page, "Mairie de Vitré");
      await sendThenClose(page);
      const seen = await watchAlerts(page);
      if (offline) {
        await context.setOffline(true);
        answer();
      } else await failHeld(page, answer);

      await expect(messages(page)).toHaveText([text]);
      await expect(bar(page)).toHaveText(text);
      // `toHaveText` folds spaces: the raw text proves those typed around « Marc » are gone.
      expect(await bar(page).textContent()).toBe(text);
      await expect(messages(page).locator(`svg.lucide-${icon}`)).toHaveCount(1);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await barClose(page).click();
      await expect(messages(page)).toHaveCount(0);
      await expect(offerButton(panel(page))).toBeFocused();
      await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true");
    });
  }

  // `alreadyDriving`: Claire drives on the retour, from another page, before « Je ramène aussi des personnes » arrives.
  test("C11.11, « Proposer une voiture » with « Je ramène aussi des personnes », Claire driving meanwhile: both legs, and who drives", async ({
    db,
    page,
    seededEvent,
  }) => {
    const token = newToken();
    const claire = (await seedPerson(db, seededEvent.id, { firstName: "Claire", phone: DRIVER_PHONE }, token)).id;
    await holdToken(page, seededEvent.id, token);
    const answer = await holdFirst(page, "Mairie de Vitré", false);
    await page.goto(`/e/${seededEvent.id}`);
    await offerButton(panel(page)).click();
    await form(page).getByRole("radiogroup", { name: "Au retour" }).getByRole("radio", { name: "Je ramène aussi des personnes", exact: true }).check();
    await form(page).getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
    await sendThenClose(page);
    await seedRide(db, seededEvent.id, claire, { leg: "retour" });
    answer();

    const text = "Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Claire conduit déjà une voiture.";
    await expect(messages(page)).toHaveText([text]);
    await expect(bar(page)).toHaveText(text);
  });
});

/**
 * The device holds Claire. Aller: she drives Nina and Paul (3 seats); Tom, of another device, is
 * not concerned. Retour: Claire drives nobody.
 */
test.describe("a failure of a car's change or removal in the bar", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: { aller: string; retour: string; tom: string };

  test.beforeEach(async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const claire = (await seedPerson(db, id, { firstName: "Claire" }, token)).id;
    const aller = await seedRide(db, id, claire);
    for (const firstName of ["Nina", "Paul"]) {
      await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName })).id, eventId: id, leg: "aller", rideId: aller });
    }
    scene = { aller, retour: await seedRide(db, id, claire, { leg: "retour" }), tom: (await seedPerson(db, id, { firstName: "Tom" })).id };
    await holdToken(page, id, token);
  });

  /** Opens « Modifier la voiture » on Claire's car of the active tab, and fills what is given. */
  async function edit(page: Page, fields: Record<string, string>) {
    await car(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Modifier la voiture" });
    for (const [label, value] of Object.entries(fields)) await sheet.getByLabel(label, { exact: true }).fill(value);
  }

  /** « Retirer la voiture » on Claire's car of the aller, confirmed. */
  async function remove(page: Page) {
    await car(page, "Claire").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    await confirmation(page).getByRole("button", { name: "Retirer la voiture", exact: true }).click();
  }

  // Two seats for her two passengers, no step; Tom boards meanwhile, from another page.
  test("C11.11, « Modifier » the car, someone boarded meanwhile, the sheet closed: the car, its leg, and what to do", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.aller, false);
    await page.goto(`/e/${seededEvent.id}`);
    await edit(page, { "Places, sans compter qui conduit": "2" });
    await sendThenClose(page);
    await seedPlacement(db, { personId: scene.tom, eventId: seededEvent.id, leg: "aller", rideId: scene.aller });
    answer();

    const text = `${CHANGES} Quelqu’un a pris ou libéré une place entre-temps : modifiez la voiture de nouveau.`;
    await expect(messages(page)).toHaveText([text]);
    await expect(bar(page)).toHaveText(text);
    await barClose(page).click();
    await expect(page.getByRole("heading", { name: "Voiture de Claire" })).toBeFocused();
  });

  // « Le sujet d’un échec », line « Modifier la voiture »: this car's change, not another's.
  test("C11.10: after the failure of a change of Claire's aller car, a change of her retour car leaves it", async ({ page, seededEvent }) => {
    const first = await holdFirst(page, GARE, true);
    await page.goto(`/e/${seededEvent.id}`);
    await edit(page, { "Lieu de départ": GARE });
    await sendThenClose(page);
    await failHeld(page, first);
    await expect(messages(page)).toHaveText([`${CHANGES} ${FAILED}`]);

    await selectTab(page, "Retour");
    await edit(page, { "Lieu de dépose": GARE });
    await page.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(car(page, "Claire")).toContainText(GARE);
    await expect(messages(page)).toHaveText([`${CHANGES} ${FAILED}`]);
  });

  test("C11.11, « Retirer la voiture » offline, the confirmation closed: the car and its leg; « Fermer »: the car's title", async ({
    context,
    page,
    seededEvent,
  }) => {
    const lose = await loseFirst(page, scene.aller);
    await page.goto(`/e/${seededEvent.id}`);
    await remove(page);
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);
    await context.setOffline(true);
    lose();

    await expect(messages(page)).toHaveText([`${REMOVAL} ${OFFLINE}`]);
    await expect(bar(page)).toHaveText(`${REMOVAL} ${OFFLINE}`);
    await expect(messages(page).locator("svg.lucide-wifi-off")).toHaveCount(1);
    await barClose(page).click();
    await expect(page.getByRole("heading", { name: "Voiture de Claire" })).toBeFocused();
  });

  // A refusal says its reason: the confirmation keeps the generic words, the bar names it.
  test("C11.11, « Retirer la voiture », the event deleted meanwhile, the confirmation closed: the car, its leg, and why", async ({
    db,
    page,
    seededEvent,
  }) => {
    const answer = await holdFirst(page, scene.aller, false);
    await page.goto(`/e/${seededEvent.id}`);
    await remove(page);
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);
    await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
    answer();

    await expect(messages(page)).toHaveText([`${REMOVAL} Cet événement est introuvable : il a peut-être été supprimé.`]);
  });

  // « Le sujet d’un échec », line « Retirer la voiture »: this car's removal, whichever confirmation sends it.
  test("C11.10: « Retirer la voiture » sent again from a new confirmation withdraws its failure at the send", async ({ page, seededEvent }) => {
    const first = await holdFirst(page, scene.aller, true);
    await page.goto(`/e/${seededEvent.id}`);
    await remove(page);
    await page.keyboard.press("Escape");
    await failHeld(page, first);
    await expect(messages(page)).toHaveText([`${REMOVAL} ${FAILED}`]);

    const answer = await holdFirst(page, scene.aller, false);
    await remove(page);
    // Before the answer, while the confirmation is open.
    await expect(confirmation(page).getByRole("button", { name: "Retirer la voiture", exact: true })).toBeDisabled();
    await expect(lines(page)).toHaveCount(0);
    answer();
    await expect(car(page, "Claire")).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
  });
});
