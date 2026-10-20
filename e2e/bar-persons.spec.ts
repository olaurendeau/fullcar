import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failActions, failHeld, holdFirst, holdToken, loseFirst, messages, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #225: a failure of « Ajouter une personne », of « Modifier » a person and of « Réessayer » names
// what was not done, then why (« Ce que dit un échec », « Chaque échec, mot pour mot », v4.2;
// C11.11, C11.10), and « Fermer » gives the focus to its landmark (« Le repère de chaque message »).

type Db = Kysely<Database>;

/** Numbers of no one, typed in the form: no assertion reads them. */
const PHONE = "06 00 00 00 01";
const OTHER_PHONE = "06 00 00 00 02";

/** The device holds Tom and Léa, without a car at the aller; Sophie, of another device, drives nobody there. */
async function seedScene(db: Db, eventId: string, token: string) {
  const persons = {
    tom: (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id,
    lea: (await seedPerson(db, eventId, { firstName: "Léa" }, token)).id,
  };
  const sophie = await seedRide(db, eventId, (await seedPerson(db, eventId, { firstName: "Sophie" })).id);
  for (const personId of Object.values(persons)) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  return { persons, sophie };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const nameButton = (page: Page, firstName: string) => section(page).getByRole("button", { name: firstName, exact: true });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const addButton = (scope: Page | Locator) => scope.getByRole("button", { name: "Ajouter une personne", exact: true });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
/** The bar's lines, found by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const retry = (page: Page) => page.getByRole("button", { name: "Réessayer" });

async function selectTab(page: Page, leg: "Aller" | "Retour") {
  await expect(async () => {
    await tab(page, leg).click();
    await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** Fills the form « Ajouter une personne » open in a sheet, sends it, and closes the sheet before the answer. */
async function addThenClose(page: Page, firstName: string) {
  const form = page.getByRole("dialog", { name: "Ajouter une personne" });
  await form.getByLabel("Prénom").fill(firstName);
  await form.getByRole("button", { name: "Valider" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Opens the form « Modifier {firstName} », fills what is given, and sends it. */
async function edit(page: Page, firstName: string, fields: { firstName?: string; phone?: string }) {
  await nameButton(page, firstName).click();
  await page.getByRole("dialog", { name: firstName, exact: true }).getByRole("button", { name: "Modifier", exact: true }).click();
  const form = page.getByRole("dialog", { name: `Modifier ${firstName}` });
  if (fields.firstName !== undefined) await form.getByLabel("Prénom").fill(fields.firstName);
  if (fields.phone !== undefined) await form.getByLabel("Téléphone (facultatif)").fill(fields.phone);
  await form.getByRole("button", { name: "Valider" }).click();
}

/** As `edit`, and closes the sheet before the answer. */
async function editThenClose(page: Page, firstName: string, fields: { firstName?: string; phone?: string }) {
  await edit(page, firstName, fields);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const INES = "Inès n’a pas pu rejoindre vos inscriptions.";
const OFFLINE = "Vérifiez la connexion, puis réessayez.";
const FAILED = "Une erreur est survenue : réessayez dans un instant.";
const TOM_BOTH = "Le prénom et le téléphone de Tom n’ont pas été enregistrés.";
const TOM_PHONE = "Le téléphone de Tom n’a pas été enregistré.";
const READ = "Vos inscriptions n’ont pas pu être chargées.";

test.describe("a failure of a person's form, or of « Réessayer », in the bar", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  // The first name as sent, its spaces trimmed. Sent from the Retour tab: its own button is the
  // landmark, the Aller tab's, mounted but hidden, is not.
  const ADD: Record<string, { fails: "offline" | "500" | "eventNotFound"; text: string; icon: string }> = {
    offline: { fails: "offline", text: `${INES} ${OFFLINE}`, icon: "wifi-off" },
    "a server error": { fails: "500", text: `${INES} ${FAILED}`, icon: "triangle-alert" },
    "the event deleted meanwhile": {
      fails: "eventNotFound",
      text: `${INES} Cet événement est introuvable : il a peut-être été supprimé.`,
      icon: "triangle-alert",
    },
  };
  for (const [what, { fails, text, icon }] of Object.entries(ADD)) {
    test(`C11.11, « Ajouter une personne », ${what}, the sheet closed before the answer; « Fermer »: the leg's button`, async ({
      context,
      db,
      page,
      seededEvent,
    }) => {
      const answer = fails === "offline" ? await loseFirst(page, "Inès") : await holdFirst(page, "Inès", fails === "500");
      await page.goto(`/e/${seededEvent.id}`);
      await selectTab(page, "Retour");
      await addButton(page.getByRole("tabpanel")).click();
      await addThenClose(page, "  Inès  ");
      const seen = await watchAlerts(page);
      if (fails === "offline") {
        await context.setOffline(true);
        answer();
      } else if (fails === "500") await failHeld(page, answer);
      else {
        await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
        answer();
      }

      await expect(messages(page)).toHaveText([text]);
      await expect(bar(page)).toHaveText(text);
      await expect(messages(page).locator(`svg.lucide-${icon}`)).toHaveCount(1);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await barClose(page).click();
      await expect(messages(page)).toHaveCount(0);
      await expect(addButton(page.getByRole("tabpanel"))).toBeFocused();
      await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");
    });
  }

  test("C11.11, « Ajouter une personne » from a seat's sheet, a server error; « Fermer »: the car's title", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, "Inès", true);
    await page.goto(`/e/${seededEvent.id}`);
    const seat = page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Sophie" }).getByRole("button", { name: /^Place libre/ });
    await seat.first().click();
    const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Sophie ?" });
    await addButton(sheet).click();
    await addThenClose(page, "Inès");
    await failHeld(page, answer);

    await expect(messages(page)).toHaveText([`${INES} ${FAILED}`]);
    await barClose(page).click();
    await expect(page.getByRole("heading", { name: "Voiture de Sophie" })).toBeFocused();
  });

  // Each line names the fields its send carried: a partial send again gives a line of its own,
  // and leaves the first (« Le sujet d’un échec »).
  test("C11.11, « Modifier » Tom's first name and number offline, then his number alone failing: two lines; « Fermer »: his first name", async ({
    context,
    page,
    seededEvent,
  }) => {
    const lose = await loseFirst(page, "Tommy");
    await page.goto(`/e/${seededEvent.id}`);
    await editThenClose(page, "Tom", { firstName: "Tommy", phone: PHONE });
    await context.setOffline(true);
    lose();
    await expect(messages(page)).toHaveText([`${TOM_BOTH} ${OFFLINE}`]);

    await context.setOffline(false);
    const answer = await holdFirst(page, scene.persons.tom, true);
    await editThenClose(page, "Tom", { phone: OTHER_PHONE });
    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([`${TOM_PHONE} ${FAILED}`, `${TOM_BOTH} ${OFFLINE}`]);
    await expect(bar(page)).toHaveText(`${TOM_PHONE} ${FAILED}`);
    await expect(messages(page).locator("svg.lucide-wifi-off")).toHaveCount(1);

    await barClose(page).click();
    await expect(nameButton(page, "Tom")).toBeFocused();
  });

  // « Le sujet d’un échec », line « Modifier une personne »: the person and each field sent.
  const AGAIN: { what: string; who: "tom" | "lea"; fields: { firstName?: string; phone?: string }; after: string[] }[] = [
    { what: "Tom's first name and number sent again withdraw it at the send", who: "tom", fields: { firstName: "Tommy", phone: PHONE }, after: [] },
    { what: "Tom's number alone leaves it", who: "tom", fields: { phone: PHONE }, after: [`${TOM_BOTH} ${FAILED}`] },
    { what: "Léa's first name leaves it", who: "lea", fields: { firstName: "Lila" }, after: [`${TOM_BOTH} ${FAILED}`] },
  ];
  for (const { what, who, fields, after } of AGAIN) {
    test(`C11.10: after the failure of Tom's first name and number, ${what}`, async ({ page, seededEvent }) => {
      const first = await holdFirst(page, "Tommy", true);
      await page.goto(`/e/${seededEvent.id}`);
      await editThenClose(page, "Tom", { firstName: "Tommy", phone: PHONE });
      await failHeld(page, first);
      await expect(messages(page)).toHaveText([`${TOM_BOTH} ${FAILED}`]);

      const answer = await holdFirst(page, scene.persons[who], false);
      await edit(page, who === "tom" ? "Tom" : "Léa", fields);
      // Before the answer, while the sheet is open.
      await expect(lines(page)).toHaveText(after);
      answer();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(nameButton(page, fields.firstName ?? "Tom")).toBeVisible();
      await expect(messages(page)).toHaveText(after);
      await expect(bar(page)).toHaveText(after.length ? `${TOM_BOTH} ${FAILED}` : "");
    });
  }

  test("C11.11, « Réessayer » against a server error, then offline: what was not loaded, and why; « Fermer »: « Réessayer »", async ({
    context,
    page,
    seededEvent,
  }) => {
    await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await retry(page).click();
    await expect(messages(page)).toHaveText([`${READ} ${FAILED}`]);
    await expect(bar(page)).toHaveText(`${READ} ${FAILED}`);

    // Sent again, offline: the next one withdraws the first as it leaves.
    await context.setOffline(true);
    await retry(page).click();
    await expect(messages(page)).toHaveText([`${READ} ${OFFLINE}`]);
    await expect(messages(page).locator("svg.lucide-wifi-off")).toHaveCount(1);
    await barClose(page).click();
    await expect(messages(page)).toHaveCount(0);
    await expect(retry(page)).toBeFocused();
  });

  // « Le sujet d’un échec », line « Réessayer »: the read of « Vos inscriptions » (`device:read`).
  test("C11.10: « Réessayer » again withdraws its failure at the send", async ({ page, seededEvent }) => {
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await retry(page).click();
    await expect(messages(page)).toHaveText([`${READ} ${FAILED}`]);

    failing.on = false;
    const answer = await holdFirst(page, seededEvent.id, false);
    await retry(page).click();
    await expect(page.getByText("Chargement de vos inscriptions…")).toBeVisible();
    await expect(messages(page)).toHaveCount(0);
    answer();
    await expect(section(page)).toBeVisible();
    await expect(messages(page)).toHaveCount(0);
  });

  test("C11.10: « Réessayer »'s failure offline stays once the connection and the `online` event are back", async ({ context, page, seededEvent }) => {
    await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(retry(page)).toBeVisible();
    await context.setOffline(true);
    await retry(page).click();
    await expect(messages(page)).toHaveText([`${READ} ${OFFLINE}`]);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    // Long enough for anything the network's return did to show.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_000)));
    await expect(messages(page)).toHaveText([`${READ} ${OFFLINE}`]);
    await expect(retry(page)).toBeVisible();
  });
});
