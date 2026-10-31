import type { Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide } from "@/db/test-participants";
import { bar, holdFirst, holdToken, newToken } from "./device";
import { numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #777, epic #766: « Proposer une voiture » asks who drives for a number (event-board v4.8,
// rules 6 and 7, criteria T4). The numbers are the test's own: an assertion that could print
// one goes through `numbersHidden`, a stored one is compared, never printed. A failure on a
// field of a number prints the input, its value included (#865): each one goes through it.

type Db = Kysely<Database>;

const MARC_PHONE = "06 12 34 56 78";
const CLAIRE_PHONE = "06 98 76 54 32";
const TOM_PHONE = "07 11 22 33 44";

const FR = {
  offer: "Proposer une voiture",
  edit: "Modifier la voiture",
  driver: "Qui conduit ?",
  newDriver: "Une nouvelle personne",
  firstName: "Prénom",
  phone: "Téléphone",
  optional: "Téléphone (facultatif)",
  driverPhone: (firstName: string) => `Téléphone de ${firstName}`,
  hint: "Pour que les personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture.",
  required: "Un numéro est requis pour proposer une voiture.",
  invalid: "Numéro non valide : de 6 à 15 chiffres, avec seulement des espaces et + . - ( )",
  location: "Lieu de départ",
  retourLocation: "Lieu de dépose",
  time: "Heure de départ",
  note: "Note (facultatif)",
  drive: "Je ramène aussi des personnes",
  retourTitle: "Au retour",
  offline: "Action impossible, vérifiez la connexion",
  placeAnswered: "Votre texte sera gardé tel quel.",
  barRefused: "La voiture de Claire pour l’aller n’a pas été proposée. Un numéro est requis pour proposer une voiture.",
};

const EN = {
  phone: "Phone",
  hint: "So that the people on board can reach you. Only visible to the organiser and to the people in the same car.",
  required: "A number is needed to offer a car.",
  driverPhone: "Claire’s phone",
};

const panel = (page: Page) => page.getByRole("tabpanel");
const form = (page: Page, title = FR.offer) => page.getByRole("dialog", { name: title });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider" });
const field = (page: Page, label: string) => form(page).getByLabel(label, { exact: true });
/** The fields of a number in the form, by the start of their label. */
const phoneFields = (page: Page) => form(page).getByLabel(/^(Téléphone|Phone|.*’s phone)/);
const choices = (page: Page) => form(page).getByRole("radiogroup", { name: FR.driver });
const radio = (page: Page, name: string) => choices(page).getByRole("radio", { name, exact: true });
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });

/** Opens « Proposer une voiture » on the active tab: the button waits until the device is known (C5.9). */
async function openForm(page: Page, name = FR.offer) {
  await panel(page).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

/** Types the place, then waits for the fake Photon's answer, whose line moves « Valider » (#546). */
async function fillPlace(page: Page, text: string, label = FR.location) {
  const input = field(page, label);
  await input.fill(text);
  await expect(input.locator("xpath=ancestor::div[2]").locator("p", { hasText: FR.placeAnswered })).toBeVisible();
}

/** The offers the page sends: server actions whose body carries `marker`. */
function offers(page: Page, marker: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(marker)) sent.push(request);
  });
  return sent;
}

const rides = (db: Db, eventId: string) => db.selectFrom("ride").select(["leg", "location"]).where("event_id", "=", eventId).orderBy("leg").execute();
const persons = (db: Db, eventId: string) => db.selectFrom("person").select("first_name").where("event_id", "=", eventId).execute();

/** Whether `personId`'s number is `phone`: `null` for none. Only the boolean is ever printed. */
async function hasNumber(db: Db, personId: string, phone: string | null) {
  const row = await db.selectFrom("person").select("phone").where("id", "=", personId).executeTakeFirstOrThrow();
  return row.phone === phone;
}

/** The person stored by the first name `firstName`, and whether her number is `phone`. */
async function storedAs(db: Db, eventId: string, firstName: string, phone: string) {
  const row = await db.selectFrom("person").select(["id", "phone"]).where("event_id", "=", eventId).where("first_name", "=", firstName).executeTakeFirstOrThrow();
  return row.phone === phone;
}

/** The device holds these persons, with their number or none, under one token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, fields: { firstName: string; phone?: string }[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const person of fields) ids[person.firstName] = (await seedPerson(db, eventId, person, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

/** The sheet of `firstName` in « Vos inscriptions », unfolded first if it is folded. */
async function nameSheet(page: Page, firstName: string) {
  const toggle = section(page).getByRole("button", { name: /^Vos inscriptions/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await section(page).getByRole("button", { name: firstName, exact: true }).click();
  return page.getByRole("dialog", { name: firstName, exact: true });
}

test.describe("a number to offer a car", () => {
  test.use({ locale: "fr-FR" });

  test("T4.1: a new driver, without a number: « Téléphone », its help, then « Valider » sends nothing and says why", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const sent = offers(page, "Mairie de Vitré");
    await page.goto(`/e/${id}`);
    await openForm(page);
    const group = form(page).getByRole("group", { name: FR.driver });
    await expect(group.getByLabel(FR.firstName, { exact: true })).toBeVisible();
    await numbersHidden(() => expect(group.getByLabel(FR.phone, { exact: true })).toBeVisible());
    await expect(form(page).getByLabel(FR.optional)).toHaveCount(0);
    await numbersHidden(() => expect(field(page, FR.phone)).toHaveAccessibleDescription(FR.hint));

    await field(page, FR.firstName).fill("Marc");
    await fillPlace(page, "Mairie de Vitré");
    await submit(page).click();
    await numbersHidden(() => expect(field(page, FR.phone)).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(field(page, FR.phone)).toHaveAccessibleDescription(`${FR.required} ${FR.hint}`));
    await numbersHidden(() => expect(field(page, FR.phone)).toBeFocused());
    await expect(field(page, FR.location)).toHaveValue("Mairie de Vitré");
    expect(sent.length).toBe(0);
    expect(await persons(db, id)).toEqual([]);
    expect(await rides(db, id)).toEqual([]);
  });

  test("T4.2: with a number, Marc's car is offered, his number stored, his tel: link on the card", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.firstName).fill("Marc");
    await field(page, FR.phone).fill(MARC_PHONE);
    await fillPlace(page, "Mairie de Vitré");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(car(page, "Marc").getByRole("link", { name: /^Appeler Marc au/ })).toHaveCount(1);
    expect(await rides(db, id)).toEqual([{ leg: "aller", location: "Mairie de Vitré" }]);
    expect(await storedAs(db, id, "Marc", MARC_PHONE)).toBe(true);
  });

  test("T4.3: a malformed number says what a valid one is, and nothing is offered", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.firstName).fill("Marc");
    await field(page, FR.phone).fill("06 12");
    await fillPlace(page, "Mairie de Vitré");
    await submit(page).click();
    await numbersHidden(() => expect(field(page, FR.phone)).toHaveAccessibleDescription(`${FR.invalid} ${FR.hint}`));
    await numbersHidden(() => expect(field(page, FR.phone)).toBeFocused());
    expect(await persons(db, id)).toEqual([]);
    expect(await rides(db, id)).toEqual([]);
  });

  test("T4.4: a person of the device without a number, chosen, gets « Téléphone de {prénom} » under the radios", async ({ db, page, seededEvent }) => {
    await device(db, page, seededEvent.id, [{ firstName: "Claire" }, { firstName: "Léa" }, { firstName: "Tom", phone: TOM_PHONE }]);
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await expect(phoneFields(page)).toHaveCount(0);

    await radio(page, "Claire").check();
    const claires = field(page, FR.driverPhone("Claire"));
    await numbersHidden(() => expect(claires).toHaveValue(""));
    await numbersHidden(() => expect(claires).toHaveAccessibleDescription(FR.hint));
    await expect(phoneFields(page)).toHaveCount(1);
    // In the group's box, under its last radio button.
    const box = choices(page).locator("xpath=..");
    await numbersHidden(() => expect(box.getByLabel(FR.driverPhone("Claire"), { exact: true })).toBeVisible());
    const last = (await radio(page, FR.newDriver).boundingBox())!;
    expect((await claires.boundingBox())!.y).toBeGreaterThanOrEqual(last.y + last.height);

    await claires.fill("06 11");
    await radio(page, "Léa").check();
    await numbersHidden(() => expect(field(page, FR.driverPhone("Léa"))).toHaveValue(""));
    await expect(field(page, FR.driverPhone("Claire"))).toHaveCount(0);

    // Léa's field left empty, « Valider »: her error. Claire chosen again: her field, empty, without it.
    const leas = field(page, FR.driverPhone("Léa"));
    await submit(page).click();
    await numbersHidden(() => expect(leas).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(leas).toHaveAccessibleDescription(`${FR.required} ${FR.hint}`));
    await radio(page, "Claire").check();
    await numbersHidden(() => expect(claires).toHaveValue(""));
    await numbersHidden(() => expect(claires).not.toHaveAttribute("aria-invalid"));
    await numbersHidden(() => expect(claires).toHaveAccessibleDescription(FR.hint));

    await radio(page, "Tom").check();
    await expect(phoneFields(page)).toHaveCount(0);

    await radio(page, FR.newDriver).check();
    await expect(field(page, FR.firstName)).toBeVisible();
    await numbersHidden(() => expect(field(page, FR.phone)).toBeVisible());
    await expect(phoneFields(page)).toHaveCount(1);
  });

  test("T4.5: Claire chosen, her field empty, nothing is offered; with her number, her car and her number together", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire" }, { firstName: "Tom", phone: TOM_PHONE }]);
    const sent = offers(page, "Gare de Vitré");
    await page.goto(`/e/${id}`);
    await openForm(page);
    await radio(page, "Claire").check();
    await fillPlace(page, "Gare de Vitré");
    await submit(page).click();
    const claires = field(page, FR.driverPhone("Claire"));
    await numbersHidden(() => expect(claires).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(claires).toHaveAccessibleDescription(`${FR.required} ${FR.hint}`));
    await numbersHidden(() => expect(claires).toBeFocused());
    expect(sent.length).toBe(0);
    expect(await rides(db, id)).toEqual([]);

    await claires.fill(CLAIRE_PHONE);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(car(page, "Claire")).toBeVisible();
    expect(await rides(db, id)).toEqual([{ leg: "aller", location: "Gare de Vitré" }]);
    expect(await hasNumber(db, claire, CLAIRE_PHONE)).toBe(true);
  });

  test("T4.6: offline, the sheet stays open, the number kept; neither car nor number stored", async ({ context, db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire" }]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await expect(radio(page, "Claire")).toBeChecked();
    await field(page, FR.driverPhone("Claire")).fill(CLAIRE_PHONE);
    await fillPlace(page, "Gare de Vitré");
    await context.setOffline(true);
    await submit(page).click();
    await expect(form(page).getByRole("alert")).toHaveText(FR.offline);
    await numbersHidden(() => expect(field(page, FR.driverPhone("Claire"))).toHaveValue(CLAIRE_PHONE));
    expect(await rides(db, id)).toEqual([]);
    expect(await hasNumber(db, claire, null)).toBe(true);
  });

  test("T4.8: Claire's number emptied elsewhere: the refusal brings her field, in error, the focus in it; her tel: link goes", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await expect(radio(page, "Claire")).toBeChecked();
    await expect(phoneFields(page)).toHaveCount(0);
    await fillPlace(page, "Gare de Vitré");
    await field(page, FR.time).fill("07:45");
    // As another device would.
    await db.updateTable("person").set({ phone: null }).where("id", "=", claire).execute();
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes("Gare de Vitré"));
    await submit(page).click();
    await answered;

    const claires = field(page, FR.driverPhone("Claire"));
    await numbersHidden(() => expect(claires).toHaveValue(""));
    await numbersHidden(() => expect(claires).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(claires).toHaveAccessibleDescription(`${FR.required} ${FR.hint}`));
    await numbersHidden(() => expect(claires).toBeFocused());
    await expect(form(page).getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(field(page, FR.location)).toHaveValue("Gare de Vitré");
    await expect(field(page, FR.time)).toHaveValue("07:45");

    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    const sheet = await nameSheet(page, "Claire");
    await expect(sheet.getByRole("link", { name: /^Appeler/ })).toHaveCount(0);
    expect(await rides(db, id)).toEqual([]);
  });

  test("T4.8: the same refusal, the form closed before its answer: the bar says it", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    const answer = await holdFirst(page, "Gare de Vitré", false);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await fillPlace(page, "Gare de Vitré");
    await db.updateTable("person").set({ phone: null }).where("id", "=", claire).execute();
    await submit(page).click();
    await expect(submit(page)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes("Gare de Vitré"));
    answer();
    await answered;
    await expect(bar(page)).toHaveText(FR.barRefused);
    expect(await rides(db, id)).toEqual([]);
  });

  test("T4.9: « Je ramène aussi des personnes », a new driver: one number for both cars; none without it", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.firstName).fill("Marc");
    await fillPlace(page, "Mairie de Vitré");
    await form(page).getByRole("radiogroup", { name: FR.retourTitle }).getByRole("radio", { name: FR.drive, exact: true }).check();
    await expect(field(page, FR.retourLocation)).toHaveValue("Mairie de Vitré");
    await submit(page).click();
    await numbersHidden(() => expect(field(page, FR.phone)).toBeFocused());
    expect(await rides(db, id)).toEqual([]);

    await field(page, FR.phone).fill(MARC_PHONE);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect(await rides(db, id)).toEqual([
      { leg: "aller", location: "Mairie de Vitré" },
      { leg: "retour", location: "Mairie de Vitré" },
    ]);
    expect(await storedAs(db, id, "Marc", MARC_PHONE)).toBe(true);
  });

  test("T4.11: a driver from before, without a number: « Modifier la voiture » asks for none, and saves", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire" }]);
    await seedRide(db, id, claire);
    await page.goto(`/e/${id}`);
    await car(page, "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
    const edit = form(page, FR.edit);
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel(/^(Téléphone|Phone)/)).toHaveCount(0);
    await edit.getByLabel(FR.note, { exact: true }).fill("Coffre plein");
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit).toHaveCount(0);
    const note = await db.selectFrom("ride").select("note").where("driver_id", "=", claire).executeTakeFirstOrThrow();
    expect(note).toEqual({ note: "Coffre plein" });
    await expect(car(page, "Claire")).toBeVisible();
    expect(await hasNumber(db, claire, null)).toBe(true);
  });
});

test.describe("a number to offer a car, in English", () => {
  test.use({ locale: "en-GB" });

  test("T4.10: « Phone », its help and its error; « Claire’s phone » for a person of the device", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await device(db, page, id, [{ firstName: "Claire" }]);
    await page.goto(`/e/${id}`);
    await openForm(page, "Offer a car");
    const sheet = page.getByRole("dialog", { name: "Offer a car" });
    const claires = sheet.getByLabel(EN.driverPhone, { exact: true });
    await numbersHidden(() => expect(claires).toHaveAccessibleDescription(EN.hint));

    await sheet.getByRole("radio", { name: "Someone new", exact: true }).check();
    const phone = sheet.getByLabel(EN.phone, { exact: true });
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(EN.hint));
    await sheet.getByLabel("First name", { exact: true }).fill("Marc");
    await sheet.getByRole("button", { name: "Confirm" }).click();
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(new RegExp(`^${EN.required} `)));
  });
});

// #778: a number is not removed while its person drives (event-board v4.8, rule 8, criteria T5).
const OTHER_PHONE = "07 55 66 77 88";
const WHILE_DRIVING = "Un numéro est requis tant que Claire conduit.";
const PERSON_HINT = "Visible seulement par l’organisateur et par les personnes de la même voiture.";

/** « Modifier {firstName} », opened from the sheet of her first name in « Vos inscriptions ». */
async function editPerson(page: Page, firstName: string) {
  const sheet = await nameSheet(page, firstName);
  await sheet.getByRole("button", { name: "Modifier", exact: true }).click();
  const edit = page.getByRole("dialog", { name: `Modifier ${firstName}`, exact: true });
  await expect(edit.getByLabel(FR.firstName, { exact: true })).toBeFocused();
  return edit;
}

test.describe("a number kept while driving", () => {
  test.use({ locale: "fr-FR" });

  test("T5.1: Claire drives: « Téléphone », the driver's help; emptied, « Valider » sends nothing and says why", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    await seedRide(db, id, claire);
    const sent = offers(page, claire);
    await page.goto(`/e/${id}`);
    const edit = await editPerson(page, "Claire");
    const phone = edit.getByLabel(FR.phone, { exact: true });
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(FR.hint));
    await expect(edit.getByLabel(FR.optional)).toHaveCount(0);

    await phone.clear();
    await edit.getByRole("button", { name: "Valider" }).click();
    await numbersHidden(() => expect(phone).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${WHILE_DRIVING} ${FR.hint}`));
    await numbersHidden(() => expect(phone).toBeFocused());
    await expect(edit).toBeVisible();
    expect(sent.length).toBe(0);
    expect(await hasNumber(db, claire, CLAIRE_PHONE)).toBe(true);
  });

  test("T5.2: Claire drives: another number is saved", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    await seedRide(db, id, claire);
    await page.goto(`/e/${id}`);
    const edit = await editPerson(page, "Claire");
    await edit.getByLabel(FR.phone, { exact: true }).fill(OTHER_PHONE);
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit).toHaveCount(0);
    expect(await hasNumber(db, claire, OTHER_PHONE)).toBe(true);
  });

  test("T5.3: a driver from before, without a number: « Téléphone », empty, and her first name changes", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire" }]);
    await seedRide(db, id, claire);
    await page.goto(`/e/${id}`);
    const edit = await editPerson(page, "Claire");
    await numbersHidden(() => expect(edit.getByLabel(FR.phone, { exact: true })).toHaveValue(""));
    await edit.getByLabel(FR.firstName, { exact: true }).fill("Clara");
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit).toHaveCount(0);
    await expect(section(page).getByRole("button", { name: "Clara", exact: true })).toBeVisible();
    expect(await persons(db, id)).toEqual([{ first_name: "Clara" }]);
    expect(await hasNumber(db, claire, null)).toBe(true);
  });

  test("T5.4: her car removed, « Téléphone (facultatif) » again, and emptied, the number goes", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    await seedRide(db, id, claire);
    await page.goto(`/e/${id}`);
    await car(page, "Claire").getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Retirer la voiture ?" });
    await confirmation.getByRole("button", { name: "Retirer la voiture", exact: true }).click();
    await expect(car(page, "Claire")).toHaveCount(0);

    const edit = await editPerson(page, "Claire");
    const phone = edit.getByLabel(FR.optional, { exact: true });
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(PERSON_HINT));
    await phone.clear();
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit).toHaveCount(0);
    expect(await hasNumber(db, claire, null)).toBe(true);
  });

  test("T5.7: Claire starts driving while her form is open: the refusal shows « Téléphone », in error, the focus in it", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    await page.goto(`/e/${id}`);
    const edit = await editPerson(page, "Claire");
    await numbersHidden(() => expect(edit.getByLabel(FR.optional, { exact: true })).toBeVisible());
    // As another device would.
    await seedRide(db, id, claire);
    await edit.getByLabel(FR.optional, { exact: true }).clear();
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(claire));
    await edit.getByRole("button", { name: "Valider" }).click();
    await answered;

    const phone = edit.getByLabel(FR.phone, { exact: true });
    await numbersHidden(() => expect(phone).toHaveAttribute("aria-invalid", "true"));
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${WHILE_DRIVING} ${FR.hint}`));
    await numbersHidden(() => expect(phone).toBeFocused());
    await expect(edit.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await hasNumber(db, claire, CLAIRE_PHONE)).toBe(true);
  });

  test("T5.7: the same refusal, the form closed before its answer: the bar says it", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }]);
    const answer = await holdFirst(page, claire, false);
    await page.goto(`/e/${id}`);
    const edit = await editPerson(page, "Claire");
    await seedRide(db, id, claire);
    await edit.getByLabel(FR.optional, { exact: true }).clear();
    await edit.getByRole("button", { name: "Valider" }).click();
    await expect(edit.getByRole("button", { name: "Valider" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(claire));
    answer();
    await answered;
    await expect(bar(page)).toHaveText(`Le téléphone de Claire n’a pas été enregistré. ${WHILE_DRIVING}`);
    expect(await hasNumber(db, claire, CLAIRE_PHONE)).toBe(true);
  });
});
