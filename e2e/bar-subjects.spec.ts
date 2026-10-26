import type { Locator, Page } from "@playwright/test";
import { seedPerson, seedRide } from "@/db/test-participants";
import { failHeld, holdFirst, holdToken, messages, newToken, recordBar } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #228: the subject of « Ajouter une personne » and of « Proposer une voiture » is what is sent,
// not the sheet that sends it (« Le sujet d’un échec », v4.2.2; C11.10). Each opening is a new
// sheet: a failure from a closed one is withdrawn by the same send from the one reopened, from
// another tab or a seat's sheet too, at the send, before its answer.

const FAILED = "Une erreur est survenue : réessayez dans un instant.";
const INES = `Inès n’a pas pu rejoindre vos inscriptions. ${FAILED}`;
const MARC_ALLER = `La voiture de Marc pour l’aller n’a pas été proposée. ${FAILED}`;
const MARC_BOTH = `Les voitures de Marc pour l’aller et le retour n’ont pas été proposées. ${FAILED}`;
const FIRST = "Mairie de Vitré";
const AGAIN = "Gare de Cesson";

type Leg = "Aller" | "Retour";
const panel = (page: Page) => page.getByRole("tabpanel");
const tab = (page: Page, leg: Leg) => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const addButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Ajouter une personne", exact: true });
const offerButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Proposer une voiture", exact: true });
/** The bar's lines, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const valider = (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Valider" });

async function selectTab(page: Page, leg: Leg) {
  await expect(async () => {
    await tab(page, leg).click();
    await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** Closes the sheet before the answer. */
async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Fills « Ajouter une personne » open in `scope` and sends it. */
async function add(scope: Locator, firstName: string) {
  await scope.getByLabel("Prénom").fill(firstName);
  await scope.getByRole("button", { name: "Valider" }).click();
}

/** « Ajouter une personne » from the active tab's button, sent. */
async function addFromTab(page: Page, firstName: string) {
  await addButton(panel(page)).click();
  await add(page.getByRole("dialog", { name: "Ajouter une personne" }), firstName);
}

/** The device holds Claire, who goes nowhere yet; Sophie, of another device, drives on the retour. */
test.describe("the subject of « Ajouter une personne » and « Proposer une voiture »", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test.beforeEach(async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await seedPerson(db, id, { firstName: "Claire" }, token);
    await seedRide(db, id, (await seedPerson(db, id, { firstName: "Sophie" })).id, { leg: "retour" });
    await holdToken(page, id, token);
  });

  /** Fails `firstName`, sent from the Aller tab's button, the sheet closed before the answer. */
  async function failInes(page: Page, id: string) {
    const first = await holdFirst(page, "Inès", true);
    await page.goto(`/e/${id}`);
    await addFromTab(page, "Inès");
    await close(page);
    await failHeld(page, first);
    await expect(messages(page)).toHaveText([INES]);
  }

  test("C11.10, « Ajouter »: « Inès » with spaces around, from a seat's sheet on the Retour, withdraws the failure of « Inès » from the Aller, at the send", async ({
    page,
    seededEvent,
  }) => {
    await failInes(page, seededEvent.id);
    const answer = await holdFirst(page, "Inès", false);
    await selectTab(page, "Retour");
    await car(page, "Sophie").getByRole("button", { name: /^Place libre/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Sophie ?" });
    await addButton(sheet).click();
    await add(page.getByRole("dialog"), "  Inès  ");
    // Before the answer, while the sheet is open.
    await expect(lines(page)).toHaveText([]);
    answer();
    await expect(sheet.getByRole("checkbox", { name: "Inès" })).toBeChecked();
    await expect(lines(page)).toHaveText([]);
  });

  // The first name sent is the subject, its case kept: « inès » is not « Inès » (review of #307).
  for (const firstName of ["Hugo", "inès"]) {
    test(`C11.10, « Ajouter »: « ${firstName} » from the same button leaves the failure of « Inès »`, async ({ page, seededEvent }) => {
      await failInes(page, seededEvent.id);
      const answer = await holdFirst(page, firstName, false);
      await addFromTab(page, firstName);
      await expect(lines(page)).toHaveText([INES]);
      answer();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(messages(page)).toHaveText([INES]);
    });
  }

  test("C11.10, « Ajouter »: a failure that comes after « Inès » is sent again from the sheet reopened is never said", async ({ page, seededEvent }) => {
    const first = await holdFirst(page, "Inès", true);
    await page.goto(`/e/${seededEvent.id}`);
    const record = await recordBar(page);
    await addFromTab(page, "Inès");
    await close(page);
    // Next sends it once the first has its answer.
    await addFromTab(page, "Inès");
    await failHeld(page, first);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    expect((await record()).lines).toEqual([]);
  });

  /**
   * Checks « Une nouvelle personne » in the form `form`. #446, a diagnostic: once in CI the click
   * left the radio unchecked, and Playwright reads the state of the element it clicked, attached or
   * not. Should it fail again, its message says, by booleans and ids alone, whether the form was
   * remounted or closed meanwhile: the dialog and the radio tagged before the click, then whether
   * they are still attached, the dialog's `data-state`, and the `aria-checked` of the radio as
   * clicked and of the one shown now.
   */
  async function checkNewDriver(form: Locator, radio: Locator) {
    await radio.evaluate((element) => {
      const tagged = window as unknown as { offerTagged?: { dialog: Element | null; radio: Element } };
      tagged.offerTagged = { dialog: element.closest('[role="dialog"]'), radio: element };
    });
    try {
      await radio.check();
    } catch (error) {
      const facts = await form.page().evaluate(() => {
        const { dialog, radio } = (window as unknown as { offerTagged: { dialog: Element | null; radio: Element } }).offerTagged;
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        const shown = document.getElementById(radio.id);
        return {
          dialogs: dialogs.length,
          dialogAttached: !!dialog?.isConnected,
          dialogState: dialog?.getAttribute("data-state") ?? null,
          sameDialogShown: !!dialog && dialogs.includes(dialog),
          radioId: radio.id,
          radioAttached: radio.isConnected,
          radioChecked: radio.getAttribute("aria-checked"),
          sameRadioShown: shown === radio,
          shownRadioChecked: shown?.getAttribute("aria-checked") ?? null,
        };
      });
      throw new Error(`${(error as Error).message}\n#446 diagnostic: ${JSON.stringify(facts)}`, { cause: error });
    }
  }

  /**
   * Opens « Proposer une voiture » on the active tab, `leg`, for `driver` (Marc, a new person, or
   * Claire, of the device), fills the place, and with `both` drives on the other leg too.
   */
  async function offer(page: Page, { driver, leg, location, both = false }: { driver: string; leg: Leg; location: string; both?: boolean }) {
    await offerButton(panel(page)).click();
    const form = page.getByRole("dialog", { name: "Proposer une voiture" });
    const drivers = form.getByRole("radiogroup", { name: "Qui conduit ?" });
    if (driver.trim() === "Marc") {
      await checkNewDriver(form, drivers.getByRole("radio", { name: "Une nouvelle personne", exact: true }));
      await form.getByLabel("Prénom", { exact: true }).fill(driver);
    } else await drivers.getByRole("radio", { name: driver, exact: true }).check();
    await form.getByLabel(leg === "Aller" ? "Lieu de départ" : "Lieu de dépose", { exact: true }).fill(location);
    if (both) {
      const [group, choice] = leg === "Aller" ? ["Au retour", "Je ramène aussi des personnes"] : ["À l’aller", "J’emmène aussi des personnes"];
      await form.getByRole("radiogroup", { name: group }).getByRole("radio", { name: choice, exact: true }).check();
    }
    await valider(page).click();
  }

  /** Fails Marc's offer from the Aller tab, on the aller alone or on both legs, the sheet closed before the answer. */
  async function failMarc(page: Page, id: string, both: boolean) {
    const first = await holdFirst(page, FIRST, true);
    await page.goto(`/e/${id}`);
    await offer(page, { driver: "Marc", leg: "Aller", location: FIRST, both });
    await close(page);
    await failHeld(page, first);
    await expect(messages(page)).toHaveText([both ? MARC_BOTH : MARC_ALLER]);
  }

  // « Le sujet d’un échec », line « Proposer une voiture »: each leg of the offer, and who drives.
  const OFFERS: { what: string; both: boolean; leg: Leg; driver: string; again?: boolean; withdraws: boolean }[] = [
    { what: "Marc's at the aller, Marc at the aller from the form reopened withdraws it", both: false, leg: "Aller", driver: "  Marc  ", withdraws: true },
    {
      what: "Marc's with « Je ramène aussi des personnes » from the Aller tab, Marc with « J’emmène aussi des personnes » from the Retour tab withdraws it",
      both: true,
      leg: "Retour",
      driver: "Marc",
      again: true,
      withdraws: true,
    },
    { what: "Marc's at the aller, Marc at the retour leaves it", both: false, leg: "Retour", driver: "Marc", withdraws: false },
    { what: "Marc's at the aller, Claire at the aller leaves it", both: false, leg: "Aller", driver: "Claire", withdraws: false },
    { what: "Marc's on both legs, Marc at the aller alone leaves it", both: true, leg: "Aller", driver: "Marc", withdraws: false },
  ];
  for (const { what, both, leg, driver, again = false, withdraws } of OFFERS) {
    test(`C11.10, « Proposer »: after the failure of ${what}`, async ({ page, seededEvent }) => {
      await failMarc(page, seededEvent.id, both);
      const failure = both ? MARC_BOTH : MARC_ALLER;
      const after = withdraws ? [] : [failure];
      const answer = await holdFirst(page, AGAIN, false);
      if (leg === "Retour") await selectTab(page, "Retour");
      await offer(page, { driver, leg, location: AGAIN, both: again });
      // Before the answer, while the sheet is open.
      await expect(lines(page)).toHaveText(after);
      answer();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(car(page, driver.trim())).toBeVisible();
      await expect(lines(page)).toHaveText(after);
    });
  }

  test("C11.10, « Proposer »: a failure that comes after Marc's offer is sent again from the form reopened is never said", async ({ page, seededEvent }) => {
    const first = await holdFirst(page, FIRST, true);
    await page.goto(`/e/${seededEvent.id}`);
    const record = await recordBar(page);
    await offer(page, { driver: "Marc", leg: "Aller", location: FIRST });
    await close(page);
    await offer(page, { driver: "Marc", leg: "Aller", location: AGAIN });
    await failHeld(page, first);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(car(page, "Marc")).toBeVisible();
    await expect(messages(page)).toHaveCount(0);
    expect((await record()).lines).toEqual([]);
  });
});
