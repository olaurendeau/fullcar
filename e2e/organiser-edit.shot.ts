import type { Kysely } from "kysely";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, holdActionsWith, organiserPath, test } from "./organiser";

leaveNoToken();

/*
 * #274, M9.4 (organizer-view v3.3.8): « Modifier l’événement » at WIDTH px (`make shot`, 360 by
 * default, then 1280), without scrolling sideways: the form, the sentence on the cars' times,
 * the errors, the confirmation with its send and its failure offline, saved, and a failure in
 * the bar. Each capture waits for what it shows. `animations: "disabled"` runs a finite animation,
 * a sheet's or a confirmation's opening, to its end before the capture: what makes a capture right
 * is that its sheet is visible, not the wait for that opening. Under `organiserTraffic` (O6.1,
 * O2.10): no file name, title or message holds the token, and the links, the organiser's with the
 * token in it, are masked in every capture, which may be shared in a PR or an issue.
 */

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
    mask: [page.getByTestId("link")],
  });
}

/**
 * A sheet or a confirmation shown. Its `toBeVisible` is the condition; the wait for its opening
 * to end only keeps what follows from acting on it mid-animation. The screenshot finishes that
 * animation anyway (`animations: "disabled"`), and no Escape is pressed while a sheet or a
 * confirmation is opening (#415): the one in « a failure in the bar » closes a sheet open since
 * before its send. The guard of #444 on that wait is not needed.
 */
async function grownIn(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((each) => each.finished)));
}

const EDIT = "Modifier l’événement";
const sheet = (page: Page) => page.getByRole("dialog", { name: EDIT });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Supprimer le retour ?" });
const confirmButton = (page: Page) => confirmation(page).getByRole("button", { name: "Supprimer le retour", exact: true });

/** Aller: Marc, Sophie and Claire drive, each alone. Retour: Hugo drives Léa. */
async function seedScene(db: Kysely<Database>, eventId: string) {
  const person = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  for (const driver of ["Marc", "Sophie", "Claire"]) await seedRide(db, eventId, await person(driver));
  const hugosCar = await seedRide(db, eventId, await person("Hugo"), { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: await person("Léa"), eventId, leg: "retour", rideId: hugosCar });
}

/** The organiser's page, its sheet open and still. */
async function openSheet(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: EDIT, exact: true }).click();
  await grownIn(sheet(page));
}

test.use({ locale: "fr-FR" });

test.beforeEach(async ({ db, seededEvent }) => {
  await seedScene(db, seededEvent.id);
});

test("the form, loaded", async ({ page, seededEvent }, testInfo) => {
  await openSheet(page, organiserPath(seededEvent));
  await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes");
  await shoot(page, testInfo, "modifier-evenement");
});

test("the sentence on the cars' times", async ({ page, seededEvent }, testInfo) => {
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Heure de début").fill("14:00");
  await field(page, "Heure de fin").fill("21:00");
  await expect(field(page, "Heure de début")).toHaveAccessibleDescription(/^Les 3 voitures déjà proposées pour l’aller/);
  await expect(field(page, "Heure de fin")).toHaveAccessibleDescription(/^La voiture déjà proposée pour le retour/);
  await shoot(page, testInfo, "modifier-evenement-heures");
});

test("the errors", async ({ page, seededEvent }, testInfo) => {
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Titre").fill("");
  await field(page, "Heure de fin").fill("06:00");
  await submit(page).click();
  await expect(field(page, "Titre")).toHaveAccessibleDescription("Champ requis.");
  // After the error, the sentence on the retour's car, whose time moved.
  await expect(field(page, "Heure de fin")).toHaveAccessibleDescription(/^La fin doit être après le début\. La voiture déjà proposée/);
  await shoot(page, testInfo, "modifier-evenement-erreurs");
});

test("the confirmation, then its send, then its failure offline", async ({ page, context, seededEvent }, testInfo) => {
  await openSheet(page, organiserPath(seededEvent));
  await sheet(page).getByRole("checkbox", { name: "Retour", exact: true }).click();
  await submit(page).click();
  await grownIn(confirmation(page));
  await expect(confirmation(page)).toContainText("La voiture proposée pour le retour sera retirée. 2 personnes ne seront plus inscrites au retour.");
  await shoot(page, testInfo, "supprimer-retour");

  const held = await holdActionsWith(page, '"persons"');
  await confirmButton(page).click();
  await expect.poll(held.held).toBe(1);
  await expect(confirmButton(page)).toHaveAttribute("aria-disabled", "true");
  await shoot(page, testInfo, "supprimer-retour-envoi");

  await context.setOffline(true);
  try {
    await held.lose();
    await expect(confirmation(page).getByRole("alert")).toHaveText(
      "L’événement n’a pas été modifié et le retour n’a pas été supprimé. Vérifiez la connexion, puis réessayez.",
    );
    await shoot(page, testInfo, "supprimer-retour-hors-ligne");
  } finally {
    await context.setOffline(false);
  }
});

test("saved", async ({ page, seededEvent }, testInfo) => {
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Titre").fill("Tournoi de Rennes U13");
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText(["Événement modifié. Personne n’est prévenu : pensez à le dire au groupe."]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes U13");
  await shoot(page, testInfo, "modifier-evenement-enregistre");
});

test("a failure in the bar, the sheet closed before the answer", async ({ page, seededEvent }, testInfo) => {
  const held = await holdActionsWith(page, '"allerDate"');
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Lieu").fill("Salle Carrel");
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await held.fail();
  await expect(messages(page)).toHaveText(["L’événement n’a pas été modifié. Une erreur est survenue : réessayez dans un instant."]);
  await shoot(page, testInfo, "modifier-evenement-echec-barre");
});
