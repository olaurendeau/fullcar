import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #780, epic #766: « Ajouter une personne » opens with the number of the device's last person
// who has one, and from a free seat, the help says why (event-board v4.8, rules 4 and 5,
// criteria T2 and T3). The numbers are the test's own: an assertion that could print one goes
// through `numbersHidden`, the input a failure prints included; a stored one is compared, never
// printed.

type Db = Kysely<Database>;

const MARC_PHONE = "06 12 34 56 78";
const CLAIRE_PHONE = "06 98 76 54 32";
const TOM_PHONE = "07 11 22 33 44";
const INES_PHONE = "06 55 44 33 22";

const FR = {
  add: "Ajouter une personne",
  firstName: "Prénom",
  phone: "Téléphone (facultatif)",
  hint: "Visible seulement par l’organisateur et par les personnes de la même voiture.",
  same: (firstName: string) => `Même numéro que ${firstName}. Modifiez-le si besoin.`,
  forSeat: (driver: string) => `Pour que ${driver} puisse vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture.`,
  offer: "Proposer une voiture",
  newDriver: "Une nouvelle personne",
  driverPhone: "Téléphone",
};

const panel = (page: Page) => page.getByRole("tabpanel");
const form = (page: Page) => page.getByRole("dialog", { name: FR.add });
const phoneField = (scope: Locator) => scope.getByLabel(FR.phone, { exact: true });
const seat = (page: Page, driver: string) =>
  panel(page).getByRole("article", { name: `Voiture de ${driver}` }).getByRole("button", { name: `Place libre : prendre une place dans la voiture de ${driver}` }).first();
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });

/** The device holds these persons, with their number or none, under one token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, fields: { firstName: string; phone?: string }[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const person of fields) ids[person.firstName] = (await seedPerson(db, eventId, person, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

/** Whether the person stored by the first name `firstName` has the number `phone`, `null` for none. Only the boolean is printed. */
async function storedWith(db: Db, eventId: string, firstName: string, phone: string | null) {
  const row = await db.selectFrom("person").select("phone").where("event_id", "=", eventId).where("first_name", "=", firstName).executeTakeFirstOrThrow();
  return row.phone === phone;
}

/** Marc, of another device, drives the aller with three free seats. */
async function marcDrives(db: Db, eventId: string) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc", phone: MARC_PHONE });
  return seedRide(db, eventId, marc.id);
}

/** « Ajouter une personne » of the active tab: the button waits until the device is known (C5.9). */
async function openForm(page: Page) {
  await panel(page).getByRole("button", { name: FR.add, exact: true }).click();
  await expect(form(page)).toBeVisible();
}

async function submit(page: Page) {
  await form(page).getByRole("button", { name: "Valider" }).click();
  await expect(form(page)).toHaveCount(0);
}

test.describe("« Ajouter une personne » takes the device's number", () => {
  test.use({ locale: "fr-FR" });

  test("T2.1: Claire's number, said under the field, before the help; the first name has the focus, and Inès gets it", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom" }]);
    await page.goto(`/e/${id}`);
    await expect(section(page)).toBeVisible();
    await openForm(page);

    await expect(form(page).getByLabel(FR.firstName)).toBeFocused();
    const phone = phoneField(form(page));
    await numbersHidden(() => expect(phone).toHaveValue(CLAIRE_PHONE));
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${FR.same("Claire")} ${FR.hint}`));

    await form(page).getByLabel(FR.firstName).fill("Inès");
    await submit(page);
    await expect.poll(() => storedWith(db, id, "Inès", CLAIRE_PHONE)).toBe(true);
  });

  test("T2.2: the last person who has one, in the order of « Vos inscriptions »", async ({ db, page, seededEvent }) => {
    await device(db, page, seededEvent.id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom", phone: TOM_PHONE }]);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page)).toBeVisible();
    await openForm(page);
    const phone = phoneField(form(page));
    await numbersHidden(() => expect(phone).toHaveValue(TOM_PHONE));
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${FR.same("Tom")} ${FR.hint}`));
  });

  test("T2.3: changed, the line goes; typed back, it comes back; emptied, Inès has no number", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom" }]);
    await page.goto(`/e/${id}`);
    await expect(section(page)).toBeVisible();
    await openForm(page);
    const phone = phoneField(form(page));

    await phone.fill(INES_PHONE);
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(FR.hint));
    await phone.fill(CLAIRE_PHONE);
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${FR.same("Claire")} ${FR.hint}`));

    await phone.clear();
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(FR.hint));
    await form(page).getByLabel(FR.firstName).fill("Inès");
    await submit(page);
    await expect.poll(() => storedWith(db, id, "Inès", null)).toBe(true);
  });

  test("T2.4: nothing to take: an empty field and today's help", async ({ db, page, seededEvent }) => {
    await device(db, page, seededEvent.id, [{ firstName: "Claire" }, { firstName: "Léa" }]);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page)).toBeVisible();
    await openForm(page);
    const phone = phoneField(form(page));
    await expect(phone).toHaveValue("");
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(FR.hint));
  });

  test("T2.4: neither « Une nouvelle personne » of « Proposer une voiture » nor « Modifier Léa » takes it", async ({ db, page, seededEvent }) => {
    await device(db, page, seededEvent.id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom" }]);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page)).toBeVisible();

    await panel(page).getByRole("button", { name: FR.offer, exact: true }).click();
    const offer = page.getByRole("dialog", { name: FR.offer });
    await offer.getByRole("radio", { name: FR.newDriver, exact: true }).check();
    const driverPhone = offer.getByLabel(FR.driverPhone, { exact: true });
    await expect(driverPhone).toHaveValue("");
    await numbersHidden(() => expect(driverPhone).not.toHaveAccessibleDescription(/Même numéro/));
    await page.keyboard.press("Escape");
    await expect(offer).toHaveCount(0);

    const toggle = section(page).getByRole("button", { name: /^Vos inscriptions/ });
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await section(page).getByRole("button", { name: "Léa", exact: true }).click();
    await page.getByRole("dialog", { name: "Léa", exact: true }).getByRole("button", { name: "Modifier", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Modifier Léa" });
    await expect(phoneField(edit)).toHaveValue("");
    await expect(phoneField(edit)).not.toHaveAccessibleDescription(/Même numéro/);
  });

  test("T2.5: from a seat's sheet, the number and the help for Marc's car", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await marcDrives(db, id);
    const ids = await device(db, page, id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom" }]);
    for (const personId of [ids.Léa, ids.Tom]) await seedPlacement(db, { personId, eventId: id, leg: "aller", rideId: null });
    await page.goto(`/e/${id}`);
    await expect(section(page)).toBeVisible();

    await seat(page, "Marc").click();
    const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Marc ?" });
    await sheet.getByRole("button", { name: FR.add }).click();
    const phone = phoneField(form(page));
    await numbersHidden(() => expect(phone).toHaveValue(CLAIRE_PHONE));
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(`${FR.same("Claire")} ${FR.forSeat("Marc")}`));
  });

  test.describe("in English", () => {
    test.use({ locale: "en-GB" });

    test("T2.6: « Same number as Claire. Change it if needed. », then the help", async ({ db, page, seededEvent }) => {
      await device(db, page, seededEvent.id, [{ firstName: "Claire", phone: CLAIRE_PHONE }, { firstName: "Léa" }, { firstName: "Tom" }]);
      await page.goto(`/e/${seededEvent.id}`);
      await expect(page.getByRole("region", { name: "Your sign-ups" })).toBeVisible();
      await panel(page).getByRole("button", { name: "Add a person", exact: true }).click();
      const phone = page.getByRole("dialog", { name: "Add a person" }).getByLabel("Phone (optional)", { exact: true });
      await numbersHidden(() => expect(phone).toHaveAccessibleDescription(
        "Same number as Claire. Change it if needed. Only visible to the organiser and to the people in the same car.",
      ));
    });
  });
});

test.describe("the help from a free seat", () => {
  test.use({ locale: "fr-FR" });

  test("T3.1: the first registration says why, keeps « Téléphone (facultatif) », and places Inès in three actions", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marcsCar = await marcDrives(db, id);
    await page.goto(`/e/${id}`);

    await seat(page, "Marc").click();
    const phone = phoneField(form(page));
    await expect(phone).toHaveValue("");
    await numbersHidden(() => expect(phone).toHaveAccessibleDescription(FR.forSeat("Marc")));
    await form(page).getByLabel(FR.firstName).fill("Inès");
    await submit(page);

    await expect
      .poll(async () => (await db.selectFrom("placement").innerJoin("person", "person.id", "placement.person_id").select("ride_id").where("person.event_id", "=", id).where("first_name", "=", "Inès").where("leg", "=", "aller").executeTakeFirst())?.ride_id)
      .toBe(marcsCar);
    await expect.poll(() => storedWith(db, id, "Inès", null)).toBe(true);
  });

  test("T3.2: from the leg's button, a device without a person keeps today's help", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await expect(phoneField(form(page))).toHaveAccessibleDescription(FR.hint);
  });
});
