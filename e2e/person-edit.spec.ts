import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, recordBar, watchAlerts } from "./device";
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
/** In the bar, the failure of « Clara » names the field sent and the first name before it (C11.11, #225). */
const FAILED = "Le prénom de Claire n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
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
  return { claire: claire.id, lea: lea.id, marc: marc.id };
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

/** The first name stored, and whether the number stored is `phone`: an assertion never prints a number. */
async function kept(db: Db, personId: string, phone: string) {
  const row = await stored(db, personId);
  return { firstName: row.first_name, phone: row.phone === phone };
}

/**
 * « Aucune requête » (v4.4): a change of the number, sent after from a reopened form. Once it is
 * done, `sent` holds it alone; had the « Valider » before sent anything, it would hold two.
 * Only booleans are printed: a body carries the device's token.
 */
async function nothingSentBefore(page: Page, sent: Request[]) {
  const form = await openForm(page, "Claire");
  await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(sent.map((request) => !!request.postData()?.includes(NEW_PHONE))).toEqual([true]);
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

  // Radix keeps a closing sheet mounted until its animation ends: slowed here, the answer comes
  // meanwhile. Reopened, even while the first one closes, the sheet is a new one.
  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the sheet is ${when}: in the bar, once no sheet hides the page`, async ({ db, page, seededEvent }) => {
      const answer = await holdFirst(page, "Clara", true);
      await page.goto(`/e/${seededEvent.id}`);
      if (when.endsWith("closing")) await page.addStyleTag({ content: slowClose });
      await sendThenClose(page, when.endsWith("closing"));
      const seen = await watchAlerts(page);
      if (when !== "reopened") await failHeld(page, answer);
      if (when.endsWith("closing")) expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(1);
      if (when.startsWith("reopened")) {
        // Hidden from role queries while a sheet is mounted.
        await page.locator(`[data-person-name="${scene.claire}"]`).focus();
        await page.keyboard.press("Enter");
        await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(1);
        if (when === "reopened") await failHeld(page, answer);
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
  // again before it comes, the change goes once it has: its answer withdraws the failure if it
  // carries the first name, whatever else it carries. Without it, the failure is said.
  const resends = {
    Clara: { firstName: "Clara", phone: CLAIRE_PHONE, said: false },
    "Clara and the number": { firstName: "Clara", phone: NEW_PHONE, said: false },
    "the number alone": { firstName: "Claire", phone: NEW_PHONE, said: true },
    "nothing changed": { firstName: "Claire", phone: CLAIRE_PHONE, said: true },
  };
  for (const when of ["after", "before"] as const) {
    for (const [resent, after] of Object.entries(resends)) {
      const title = `a change that failed, then ${resent} sent from a reopened sheet ${when} the failure, and done`;
      test(`${title}: ${after.said ? "the failure is said" : "nothing left to say"}`, async ({ db, page, seededEvent }) => {
        const answer = await holdFirst(page, "Clara", true);
        await page.goto(`/e/${seededEvent.id}`);
        await sendThenClose(page);
        await nameButton(page, "Claire").click();
        // Failed while the reopened sheet hides the page: the message waits.
        await expect(dialog(page, "Claire")).toBeVisible();
        if (when === "after") await failHeld(page, answer);
        await dialog(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
        const form = dialog(page, "Modifier Claire");
        await form.getByLabel("Prénom").fill(after.firstName);
        await form.getByLabel("Téléphone (facultatif)").fill(after.phone);
        await form.getByRole("button", { name: "Valider" }).click();
        if (when === "before") await failHeld(page, answer);
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Once more around a sheet: a message left waiting would show by now.
        await nameButton(page, after.firstName).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (after.said) await expect(bar(page)).toHaveText(FAILED);
        else await expect(bar(page)).toBeEmpty();
        expect(await stored(db, scene.claire)).toEqual({ first_name: after.firstName, phone: after.phone });
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

  // #298 (v4.4): « Valider » with nothing changed closes the form, and sends and checks nothing.
  // A field changed, then put back as the form showed it, is not changed (v4.4-2).
  const unchanged = {
    "V1.1: « Valider »": (form: Locator) => form.getByRole("button", { name: "Valider" }).click(),
    "V1.2: Enter in « Prénom »": (form: Locator) => form.getByLabel("Prénom").press("Enter"),
    "V1.3: « Valider » after each field changed, then put back": async (form: Locator) => {
      await form.getByLabel("Prénom").fill("Clara");
      await form.getByLabel("Prénom").fill("Claire");
      await form.getByLabel("Téléphone (facultatif)").clear();
      await form.getByLabel("Téléphone (facultatif)").fill(CLAIRE_PHONE);
      await form.getByRole("button", { name: "Valider" }).click();
    },
  };
  for (const [title, validate] of Object.entries(unchanged)) {
    test(`${title} with nothing changed: the form closes, the focus on the first name, nothing sent`, async ({ db, page, seededEvent }) => {
      const sent = changes(page, scene.claire);
      await page.goto(`/e/${seededEvent.id}`);
      await validate(await openForm(page, "Claire"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(nameButton(page, "Claire")).toBeFocused();
      await expect(alerts(page)).toHaveCount(0);
      expect(await kept(db, scene.claire, CLAIRE_PHONE)).toEqual({ firstName: "Claire", phone: true });
      await nothingSentBefore(page, sent);
    });
  }

  // Rule 2 (v4.4): nothing changed is not checked either. A first name of invisible characters
  // alone, which the database takes and `validatePerson` reads as empty, closes the form.
  test("nothing changed is not checked: a first name stored that the form refuses closes the form, and nothing is sent", async ({
    db,
    page,
    seededEvent,
  }) => {
    await db.updateTable("person").set({ first_name: "​" }).where("id", "=", scene.claire).execute();
    const sent = changes(page, scene.claire);
    await page.goto(`/e/${seededEvent.id}`);
    const name = page.locator(`[data-person-name="${scene.claire}"]`);
    const openInvisible = async () => {
      await name.click();
      await page.getByRole("dialog").getByRole("button", { name: "Modifier", exact: true }).click();
      return page.getByRole("dialog");
    };
    await (await openInvisible()).getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(name).toBeFocused();

    // As `nothingSentBefore`, with a first name the form takes: one request, the second.
    const form = await openInvisible();
    await form.getByLabel("Prénom").fill("Claire");
    await form.getByLabel("Téléphone (facultatif)").fill(NEW_PHONE);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(sent.map((request) => !!request.postData()?.includes(NEW_PHONE))).toEqual([true]);
  });

  test("V1.4: offline, nothing changed: the form closes, and nothing is said", async ({ context, page, seededEvent }) => {
    const sent = changes(page, scene.claire);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Claire");
    await context.setOffline(true);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();
    await expect(alerts(page)).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    await expect(page.getByText("Action impossible, vérifiez la connexion")).toHaveCount(0);

    await context.setOffline(false);
    await nothingSentBefore(page, sent);
    // A failure of the first « Valider » would name both fields: the number alone does not withdraw it.
    await expect(page.getByText(/connexion/)).toHaveCount(0);
  });

  test("V1.5: nothing changed, under a failure and a success in the bar: the same lines, and nothing written", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedRide(db, seededEvent.id, scene.marc, { leg: "retour", seats: 1 });
    const answer = await holdFirst(page, "Clara", true);
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Retour");
    // Claire is the device's only person without a car on the retour (Léa does not make it):
    // one tap places her, without a sheet (C5.2, #92).
    await car(page.getByRole("tabpanel"), "Marc").getByRole("button", { name: /^Place libre/ }).click();
    await expect(messages(page)).toHaveText(["Claire est dans la voiture de Marc"]);
    await sendThenClose(page);
    await failHeld(page, answer);
    const lines = [FAILED, "Claire est dans la voiture de Marc"];
    await expect(messages(page)).toHaveText(lines);
    // Said too: the region is written 100 ms after its line shows.
    await expect(bar(page)).toHaveText(FAILED);
    const buttons = page.locator("[data-message-bar] button");
    const names = () => buttons.evaluateAll((all) => all.map((button) => button.getAttribute("aria-label") ?? button.textContent));
    const before = await names();
    expect(before).toEqual(["Fermer"]);

    const sent = changes(page, scene.claire);
    const form = await openForm(page, "Claire");
    await expect(form.getByLabel("Prénom")).toHaveValue("Claire");
    const record = await recordBar(page);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();
    await expect(messages(page)).toHaveText(lines);
    expect(await names()).toEqual(before);
    expect(await record()).toEqual({ writes: [], lines: [] });
    await nothingSentBefore(page, sent);
  });

  test("V1.6: renamed by another device while the form is open, nothing changed: the new first name stays", async ({
    db,
    page,
    seededEvent,
  }) => {
    const sent = changes(page, scene.claire);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Claire");
    await db.updateTable("person").set({ first_name: "Clarisse" }).where("id", "=", scene.claire).execute();
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(`[data-person-name="${scene.claire}"]`)).toBeFocused();
    await nothingSentBefore(page, sent);
    expect((await stored(db, scene.claire)).first_name).toBe("Clarisse");
  });

  test("V1.8: a space after the first name is a change: sent, and stored without it", async ({ db, page, seededEvent }) => {
    const sent = changes(page, scene.claire);
    await page.goto(`/e/${seededEvent.id}`);
    const form = await openForm(page, "Claire");
    await form.getByLabel("Prénom").fill("Claire ");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(nameButton(page, "Claire")).toBeFocused();
    expect(sent.map((request) => !!request.postData()?.includes('"Claire "'))).toEqual([true]);
    expect(await kept(db, scene.claire, CLAIRE_PHONE)).toEqual({ firstName: "Claire", phone: true });
  });
});
