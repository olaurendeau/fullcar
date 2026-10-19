import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #167: « Modifier » in the sheet of a first name: the first name and the number of one of the device's persons (C2.3).

type Db = Kysely<Database>;

const CLAIRE_PHONE = "06 11 22 33 44";
const MARC_PHONE = "07 98 76 54 32";
const NEW_PHONE = "07 12 12 12 12";
const REQUIRED = "Champ requis.";
const INVALID_PHONE = "Numéro non valide : de 6 à 15 chiffres, avec seulement des espaces et + . - ( )";
const PHONE_HINT = "Visible seulement par l’organisateur et par les personnes de la même voiture.";
const FAILED = "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.";
const slowClose = '[role="dialog"][data-state="closed"] { animation-duration: 2s !important; }';

/**
 * The device holds Claire, with a number, and Léa, without one. Aller: Claire drives; Marc,
 * of another device, drives Léa. Retour: Claire is without a car; Léa is not concerned.
 */
async function seedScene(db: Db, eventId: string, token: string, marcsToken: string) {
  const claire = await seedPerson(db, eventId, { firstName: "Claire", phone: CLAIRE_PHONE }, token);
  const lea = await seedPerson(db, eventId, { firstName: "Léa" }, token);
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: MARC_PHONE }, marcsToken);
  await seedRide(db, eventId, claire.id, { departureTime: "07:00:00" });
  const marcsCar = await seedRide(db, eventId, marc.id);
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: marcsCar });
  await seedPlacement(db, { personId: claire.id, eventId, leg: "retour", rideId: null });
  return { claire: claire.id, lea: lea.id };
}

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const nameButton = (page: Page, firstName: string) => section(page).getByRole("button", { name: firstName, exact: true });
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const call = (scope: Page | Locator, firstName: string) => scope.getByRole("link", { name: `Appeler ${firstName} au`, exact: false });
const withoutCar = (page: Page) => page.getByRole("tabpanel").getByRole("region", { name: "Sans voiture" }).getByRole("listitem");
const alerts = (scope: Page | Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });

/** Opens the sheet of `firstName`, then its form: the focus on the first name, which it reads. */
async function openForm(page: Page, firstName: string) {
  await nameButton(page, firstName).click();
  await dialog(page, firstName).getByRole("button", { name: "Modifier", exact: true }).click();
  const form = dialog(page, `Modifier ${firstName}`);
  await expect(form.getByLabel("Prénom")).toBeFocused();
  return form;
}

/** The changes the page sends: server actions whose body carries `text`. */
function changes(page: Page, text: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(text)) sent.push(request);
  });
  return sent;
}

async function stored(db: Db, personId: string) {
  return db.selectFrom("person").select(["first_name", "phone"]).where("id", "=", personId).executeTakeFirstOrThrow();
}

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

test.describe("edit a person", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  const marcsToken = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token, marcsToken);
    await holdToken(page, seededEvent.id, token);
  });

  test("C2.3: the form, filled, without « Aller et retour » nor the device's sentence", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await nameButton(page, "Claire").click();
    const sheet = dialog(page, "Claire");
    await expect(call(sheet, "Claire")).toHaveText(CLAIRE_PHONE);
    const edit = sheet.getByRole("button", { name: "Modifier", exact: true });
    expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await edit.click();

    const form = dialog(page, "Modifier Claire");
    await expect(form.getByLabel("Prénom")).toHaveValue("Claire");
    await expect(form.getByLabel("Téléphone (facultatif)")).toHaveValue(CLAIRE_PHONE);
    await expect(form.getByLabel("Téléphone (facultatif)")).toHaveAccessibleDescription(PHONE_HINT);
    await expect(form.getByRole("checkbox")).toHaveCount(0);
    await expect(form.getByText("cet appareil s’en souviendra")).toHaveCount(0);
    await expect(form.getByRole("link")).toHaveCount(0);
  });

  test("C2.3: the new first name shows once the action ends, everywhere, and the focus is on it", async ({
    db,
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await page.evaluate(() => document.documentElement.setAttribute("data-not-reloaded", ""));
    const form = await openForm(page, "Claire");
    await form.getByLabel("Prénom").fill("Clara");
    await form.getByRole("button", { name: "Valider" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Clara")).toBeFocused();
    await expect(section(page).getByRole("rowheader")).toHaveText(["Clara", "Léa"]);
    await expect(section(page).getByRole("button", { name: "Clara, Aller : Conduit", exact: true })).toBeVisible();
    await expect(car(page.getByRole("tabpanel"), "Clara")).toBeVisible();
    await selectTab(page, "Retour");
    await expect(withoutCar(page)).toHaveText(["Clara"]);
    await expect(page.locator("html[data-not-reloaded]")).toHaveCount(1);
    expect(await stored(db, scene.claire)).toEqual({ first_name: "Clara", phone: CLAIRE_PHONE });
  });

  test("C2.3, C10.1: the new number in the first name's sheet; emptied, it is removed", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    let form = await openForm(page, "Léa");
    await expect(form.getByLabel("Téléphone (facultatif)")).toHaveValue("");
    await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Léa")).toBeFocused();

    await nameButton(page, "Léa").click();
    await expect(call(dialog(page, "Léa"), "Léa")).toHaveAttribute("href", "tel:0712121212");
    await dialog(page, "Léa").getByRole("button", { name: "Modifier", exact: true }).click();
    form = dialog(page, "Modifier Léa");
    await expect(form.getByLabel("Téléphone (facultatif)")).toHaveValue(NEW_PHONE);
    await form.getByLabel("Téléphone (facultatif)").clear();
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await nameButton(page, "Léa").click();
    await expect(dialog(page, "Léa").getByRole("button", { name: "Modifier", exact: true })).toBeVisible();
    await expect(dialog(page, "Léa").getByRole("link")).toHaveCount(0);
    expect(await stored(db, scene.lea)).toEqual({ first_name: "Léa", phone: null });
  });

  test("C2.3, C1.8: an empty first name or a malformed number changes nothing", async ({ db, page, seededEvent }) => {
    const sent = changes(page, scene.claire);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Claire");
    const firstName = form.getByLabel("Prénom");
    const phone = form.getByLabel("Téléphone (facultatif)");
    await firstName.clear();
    await phone.fill("06 12");
    await form.getByRole("button", { name: "Valider" }).click();

    await expect(firstName).toHaveAccessibleDescription(REQUIRED);
    await expect(phone).toHaveAccessibleDescription(`${INVALID_PHONE} ${PHONE_HINT}`);
    await expect(firstName).toBeFocused();
    await expect(phone).toHaveValue("06 12");

    await firstName.fill("Clara");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(phone).toBeFocused();
    await expect(firstName).not.toHaveAttribute("aria-invalid");
    await expect(firstName).toHaveValue("Clara");
    await expect(form).toBeVisible();
    expect(sent).toHaveLength(0);
    expect(await stored(db, scene.claire)).toEqual({ first_name: "Claire", phone: CLAIRE_PHONE });
  });

  test("C10.1: the new number on the shared car's card, for the other device in it", async ({ browser, baseURL, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Léa");
    await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(nameButton(page, "Léa")).toBeFocused();

    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const marcs = await context.newPage();
      await holdToken(marcs, seededEvent.id, marcsToken);
      await marcs.goto(`/e/${seededEvent.id}`);
      // Once the device's persons are read: Marc's, with the numbers his device may see.
      await expect(section(marcs)).toBeVisible();
      await expect(call(car(marcs, "Marc"), "Léa")).toHaveText(NEW_PHONE);
      await expect(call(car(marcs, "Marc"), "Léa")).toHaveAttribute("href", "tel:0712121212");
      // Claire's car shares nothing with Marc's device: no number on it.
      await expect(car(marcs, "Claire").getByRole("link")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("« Fermer » and Escape give the focus back to the first name, and change nothing", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    let form = await openForm(page, "Claire");
    await form.getByLabel("Prénom").fill("Clara");
    await form.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();

    // Each opening is a new sheet: its number and « Modifier » again, then a new form.
    await nameButton(page, "Claire").click();
    await expect(call(dialog(page, "Claire"), "Claire")).toBeVisible();
    await dialog(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
    form = dialog(page, "Modifier Claire");
    await expect(form.getByLabel("Prénom")).toHaveValue("Claire");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();
    expect(await stored(db, scene.claire)).toEqual({ first_name: "Claire", phone: CLAIRE_PHONE });
  });

  test("offline: said in the form, which keeps its values; nothing changes", async ({ context, db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Claire");
    await form.getByLabel("Prénom").fill("Clara");
    await context.setOffline(true);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(alerts(form)).toHaveText("Action impossible, vérifiez la connexion");
    await expect(form.getByLabel("Prénom")).toHaveValue("Clara");
    await expect(form.getByRole("button", { name: "Valider" })).toBeFocused();

    await context.setOffline(false);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Clara")).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
    expect(await stored(db, scene.claire)).toEqual({ first_name: "Clara", phone: CLAIRE_PHONE });
  });

  /** Sends « Clara » for Claire, then closes the sheet with Escape: closed, or still closing. */
  async function sendThenClose(page: Page, closing = false) {
    const form = await openForm(page, "Claire");
    await form.getByLabel("Prénom").fill("Clara");
    await form.getByRole("button", { name: "Valider" }).click();
    await page.keyboard.press("Escape");
    if (closing) await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
    else await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  /** Lets the held change through as a 500, once it has failed. */
  async function fail(page: Page, answer: () => void) {
    const responded = page.waitForResponse((response) => response.status() === 500);
    answer();
    await responded;
  }

  // Radix keeps a closing sheet mounted until its animation ends: slowed here, the answer comes
  // meanwhile. Reopened, even while the first one closes, the sheet is a new one.
  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the sheet is ${when}: in the bar, once no sheet hides the page`, async ({ db, page, seededEvent }) => {
      const answer = await holdFirst(page, "Clara", true);
      await page.goto(`/e/${seededEvent.id}`);
      if (when.endsWith("closing")) await page.addStyleTag({ content: slowClose });
      await sendThenClose(page, when.endsWith("closing"));
      const seen = await watchAlerts(page);
      if (when !== "reopened") await fail(page, answer);
      if (when.endsWith("closing")) expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(1);
      if (when.startsWith("reopened")) {
        // Hidden from role queries while a sheet is mounted.
        await page.locator(`[data-person-name="${scene.claire}"]`).focus();
        await page.keyboard.press("Enter");
        await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(1);
        if (when === "reopened") await fail(page, answer);
        await page.keyboard.press("Escape");
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(bar(page)).toHaveText(FAILED);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(alerts(page)).toHaveText([FAILED]);
      expect(await stored(db, scene.claire)).toEqual({ first_name: "Claire", phone: CLAIRE_PHONE });
    });
  }

  // The failure is about Claire's first name, not about the sheet that sent it (#208). Sent
  // again before it comes, the change goes once it has: its answer withdraws the failure, if it
  // carries the first name. The number alone leaves it to say.
  for (const when of ["after", "before"] as const) {
    for (const resent of ["Clara", "the number alone"] as const) {
      const title = `a change that failed, then ${resent} sent from a reopened sheet ${when} the failure, and done`;
      test(`${title}: ${resent === "Clara" ? "nothing left to say" : "the failure is said"}`, async ({ db, page, seededEvent }) => {
        const answer = await holdFirst(page, "Clara", true);
        await page.goto(`/e/${seededEvent.id}`);
        await sendThenClose(page);
        await nameButton(page, "Claire").click();
        // Failed while the reopened sheet hides the page: the message waits.
        await expect(dialog(page, "Claire")).toBeVisible();
        if (when === "after") await fail(page, answer);
        await dialog(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
        const form = dialog(page, "Modifier Claire");
        if (resent === "Clara") await form.getByLabel("Prénom").fill("Clara");
        else await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
        await form.getByRole("button", { name: "Valider" }).click();
        if (when === "before") await fail(page, answer);
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Once more around a sheet: a message left waiting would show by now.
        const firstName = resent === "Clara" ? "Clara" : "Claire";
        await nameButton(page, firstName).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (resent === "Clara") await expect(bar(page)).toBeEmpty();
        else await expect(bar(page)).toHaveText(FAILED);
        const phone = resent === "Clara" ? CLAIRE_PHONE : NEW_PHONE;
        expect(await stored(db, scene.claire)).toEqual({ first_name: firstName, phone });
      });
    }
  }

  // Next sends one server action at a time: the second, from a form filled before the first's
  // answer, goes once it has come, with only what it changed (#208).
  test("a form filled before another change's answer sends only what it changed: it undoes nothing", async ({
    db,
    page,
    seededEvent,
  }) => {
    const answer = await holdFirst(page, "Clara", false);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page);
    const form = await openForm(page, "Claire");
    await expect(form.getByLabel("Prénom")).toHaveValue("Claire");
    await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
    await form.getByRole("button", { name: "Valider" }).click();
    // Sent, not dropped: inactive until its answer (C1.9).
    await expect(form.getByRole("button", { name: "Valider" })).toBeDisabled();
    answer();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Clara")).toBeFocused();
    expect(await stored(db, scene.claire)).toEqual({ first_name: "Clara", phone: NEW_PHONE });
  });
});
