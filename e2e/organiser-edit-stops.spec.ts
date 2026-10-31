import type { Kysely } from "kysely";
import type { Page, Request } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide, seedStop } from "@/db/test-participants";
import { contrast } from "./contrast";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { areaEditButton, areaEditByText, expect, holdActionsWith, isAction, organiserPath, test } from "./organiser";

/*
 * #888, epic #881 (meeting-points v2, section 1 bis, RV9, D1): the option « Points de RDV » in
 * « Modifier l’événement ». It can be turned on, and off only while no car has Stops: then the box
 * stays checked, `aria-disabled` and never `disabled`, and says why. Each test runs under the
 * fixture `organiserTraffic` (O6.1, O2.10).
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const FR = {
  edit: "Modifier l’événement",
  hint: "Les conducteurs de l’aller peuvent ajouter des points de RDV à leur voiture.",
  locked: (cars: number) => `${cars} voitures ont des points de RDV : l’option reste active tant qu’ils existent.`,
  stillLocked: "L’option « Points de RDV » reste active : des voitures ont des points de RDV.",
  notChanged: "L’option « Points de RDV » n’a pas été modifiée.",
  offline: "Action impossible, vérifiez la connexion",
  checkConnection: "Vérifiez la connexion, puis réessayez.",
  failed: "Une erreur est survenue : réessayez dans un instant.",
};

const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const stopsBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Points de RDV", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
/** The reason under the box: the second description the box points at. */
const reason = (page: Page) => sheet(page).locator('[id$="-stops-reason"]');
/** What `stops_enabled` is in the database now. */
const stored = async (db: Kysely<Database>, id: string) =>
  (await db.selectFrom("event").select("stops_enabled").where("id", "=", id).executeTakeFirstOrThrow()).stops_enabled;

/** The changes sent from now on: the server actions whose body carries the form's fields. Counted. */
function edits(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"allerDate"')) sent.push(request);
  });
  return sent;
}

async function openSheet(page: Page, id: string) {
  await page.goto(organiserPath({ id }));
  await areaEditButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

/** `n` cars on the aller, each with one Stop. */
async function seedCarsWithStops(db: Kysely<Database>, eventId: string, n: number) {
  for (let car = 0; car < n; car++) {
    const driver = await seedPerson(db, eventId, { firstName: `Conducteur ${car + 1}` });
    await seedStop(db, eventId, await seedRide(db, eventId, driver.id, { leg: "aller" }));
  }
}

test("RV9.1: the option off: the box is unchecked with its help; checked then « Valider », it is on", async ({ page, db, seededEvent }) => {
  await openSheet(page, seededEvent.id);
  await expect(stopsBox(page)).not.toBeChecked();
  await expect(stopsBox(page)).not.toHaveAttribute("aria-disabled");
  await expect(stopsBox(page)).toHaveAccessibleDescription(FR.hint);

  await stopsBox(page).click();
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText(["Événement modifié. Personne n’est prévenu : pensez à le dire au groupe."]);
  expect(await stored(db, seededEvent.id)).toBe(true);

  await areaEditButton(page).click();
  await expect(stopsBox(page)).toBeChecked();
});

test.describe("the option on, no car has Stops", () => {
  test.use({ eventFields: { stopsEnabled: true } });

  test("RV9.2: the box is checked and free; unchecked then « Valider », the option is off and nothing is deleted", async ({
    page,
    db,
    seededEvent,
  }) => {
    const driver = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
    await seedRide(db, seededEvent.id, driver.id, { leg: "aller" });
    await openSheet(page, seededEvent.id);
    await expect(stopsBox(page)).toBeChecked();
    await expect(stopsBox(page)).not.toHaveAttribute("aria-disabled");

    await stopsBox(page).click();
    await expect(stopsBox(page)).not.toBeChecked();
    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await stored(db, seededEvent.id)).toBe(false);
    const rides = await db.selectFrom("ride").select("id").where("event_id", "=", seededEvent.id).execute();
    expect(rides).toHaveLength(1);
  });

  test("RV9.3 (race): a car got Stops while the sheet was open: refused, the box shows locked with the reason, the option stays on", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openSheet(page, seededEvent.id);
    await stopsBox(page).click();
    await expect(stopsBox(page)).not.toBeChecked();
    await seedCarsWithStops(db, seededEvent.id, 2);

    await submit(page).click();

    await expect(sheet(page).getByRole("alert")).toHaveText(FR.stillLocked);
    await expect(stopsBox(page)).toBeChecked();
    await expect(stopsBox(page)).toHaveAttribute("aria-disabled", "true");
    await expect(reason(page)).toHaveText(FR.locked(2));
    await expect(submit(page)).toBeFocused();
    expect(await stored(db, seededEvent.id)).toBe(true);
    expect(await db.selectFrom("stop").select("id").where("event_id", "=", seededEvent.id).execute()).toHaveLength(2);
  });

  test("RV9.3 (race), sheet closed before the answer: the bar says the option stays on; reopened, the box is locked", async ({
    page,
    db,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await areaEditButton(page).click();
    await stopsBox(page).click();
    await seedCarsWithStops(db, seededEvent.id, 1);
    const held = await holdActionsWith(page, '"allerDate"');
    await submit(page).click();
    await expect.poll(held.held).toBe(1);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await held.release();

    await expect(messages(page)).toHaveText([FR.stillLocked]);
    expect(await stored(db, seededEvent.id)).toBe(true);
    await areaEditButton(page).click();
    await expect(stopsBox(page)).toBeChecked();
    await expect(stopsBox(page)).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("the option on, cars have Stops", () => {
  test.use({ eventFields: { stopsEnabled: true } });

  test("RV9.3: the box stays checked and locked, `aria-disabled` and never `disabled`, read with its reason; touching it changes nothing", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedCarsWithStops(db, seededEvent.id, 2);
    const sent = edits(page);
    await openSheet(page, seededEvent.id);

    await expect(stopsBox(page)).toBeChecked();
    await expect(stopsBox(page)).toHaveAttribute("aria-disabled", "true");
    await expect(stopsBox(page)).not.toHaveAttribute("disabled");
    await expect(stopsBox(page)).toHaveAccessibleDescription(`${FR.hint} ${FR.locked(2)}`);

    // Playwright takes `aria-disabled` for not enabled: forced, as a finger would touch it.
    await stopsBox(page).click({ force: true });
    await expect(stopsBox(page)).toBeChecked();
    await stopsBox(page).focus();
    await expect(stopsBox(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(stopsBox(page)).toBeChecked();

    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(sent, "requests sent: nothing changed").toHaveLength(0);
    expect(await stored(db, seededEvent.id)).toBe(true);
    expect(await db.selectFrom("stop").select("id").where("event_id", "=", seededEvent.id).execute()).toHaveLength(2);
  });

  test("RV9.3: the box is reached with the keyboard, after « Retour » and the description", async ({ page, db, seededEvent }) => {
    await seedCarsWithStops(db, seededEvent.id, 1);
    await openSheet(page, seededEvent.id);
    await sheet(page).getByLabel("Description (facultatif)", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(stopsBox(page)).toBeFocused();
    await expect(reason(page)).toHaveText("1 voiture a des points de RDV : l’option reste active tant qu’ils existent.");
  });

  test("RV7.3: the reason measures 4.5:1 at least on its grey", async ({ page, db, seededEvent }) => {
    await seedCarsWithStops(db, seededEvent.id, 2);
    await openSheet(page, seededEvent.id);
    expect(await contrast(reason(page), reason(page))).toBeGreaterThanOrEqual(4.5);
  });
});

test("RV9.4: offline, the sheet open: it says so, keeps the box, and nothing is written", async ({ page, context, db, seededEvent }) => {
  await openSheet(page, seededEvent.id);
  await stopsBox(page).click();
  await context.setOffline(true);
  await submit(page).click();
  await expect(sheet(page).getByRole("alert")).toHaveText(FR.offline);
  await expect(stopsBox(page)).toBeChecked();
  await expect(submit(page)).toBeFocused();
  await context.setOffline(false);
  expect(await stored(db, seededEvent.id)).toBe(false);
});

test("RV9.4: offline, the sheet closed before the answer: the bar says the option was not changed, then why; the option shown is the stored one", async ({
  page,
  context,
  db,
  seededEvent,
}) => {
  await page.goto(organiserPath(seededEvent));
  await areaEditButton(page).click();
  await stopsBox(page).click();
  const held = await holdActionsWith(page, '"allerDate"');
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await context.setOffline(true);
  await held.lose();

  await expect(messages(page)).toHaveText([`${FR.notChanged} ${FR.checkConnection}`]);
  await context.setOffline(false);
  expect(await stored(db, seededEvent.id)).toBe(false);
  await areaEditByText(page).click();
  await expect(stopsBox(page)).not.toBeChecked();
});

test("RV9.4: a server error, the sheet closed: the bar says the option was not changed and the generic reason", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await areaEditButton(page).click();
  await stopsBox(page).click();
  const held = await holdActionsWith(page, '"allerDate"');
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await held.fail();
  await expect(messages(page)).toHaveText([`${FR.notChanged} ${FR.failed}`]);
});
