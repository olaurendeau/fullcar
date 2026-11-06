import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { contrast } from "./contrast";
import { DRIVER_PHONE, numbersHidden } from "./driver";
import { failActions, holdActions, holdToken, loseFirst, messages, newToken, recordBar, said } from "./device";
import { expect, leaveNoToken, test, TAP_TARGET_MIN } from "./fixtures";
import { keepAdminToken, organiserPath } from "./organiser";

leaveNoToken();

// #982, event-board v5.2 (« N’importe qui place n’importe qui »), epic #973: the first name of each
// passenger on the card of her car opens her sheet, whoever's device (PL1.3), « Dans la voiture de
// {conducteur} » (PL3.2), « Sortir de la voiture » by `undoSeats` (PL3.6, PL3.7, PL4.5), her number
// when the state carries it (PL3.5), « Modifier » and « Retirer » for the device's own (PL1.3b).

type Db = Kysely<Database>;

const PHONE_OF_LEA = "06 98 76 54 32";
const LONG = "MWMWMWMWMW".repeat(4);

/**
 * Aller. The device holds Camille, who drives (3 seats), and Max, who is in her car with Léa (of
 * another device, with a number). Sophie, of another device, drives a second car with Tom (another
 * device's too) in it. Marc drives a third one, empty.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName, phone: DRIVER_PHONE }, token)).id;
  const other = async (firstName: string, phone: string | null = DRIVER_PHONE) => (await seedPerson(db, eventId, { firstName, phone })).id;
  const persons = {
    camille: await mine("Camille"),
    max: await mine("Max"),
    lea: await other("Léa", PHONE_OF_LEA),
    sophie: await other("Sophie"),
    tom: await other("Tom"),
    marc: await other("Marc"),
  };
  const rides = {
    camille: await seedRide(db, eventId, persons.camille, { departureTime: "07:00:00" }),
    sophie: await seedRide(db, eventId, persons.sophie, { departureTime: "08:00:00" }),
    marc: await seedRide(db, eventId, persons.marc, { departureTime: "09:00:00" }),
  };
  await seedPlacement(db, { personId: persons.max, eventId, leg: "aller", rideId: rides.camille });
  await seedPlacement(db, { personId: persons.lea, eventId, leg: "aller", rideId: rides.camille });
  await seedPlacement(db, { personId: persons.tom, eventId, leg: "aller", rideId: rides.sophie });
  return { ...persons, rides };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const car = (page: Page, driver: string) => page.getByRole("article", { name: `Voiture de ${driver}` });
const passenger = (page: Page, driver: string, firstName: string) => car(page, driver).getByRole("button", { name: firstName, exact: true });
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const fold = (page: Page, leg: "l’aller" | "le retour") => page.getByRole("button", { name: new RegExp(`^Ne font pas ${leg} `) });
const NOTE = "Seul l’appareil qui a inscrit cette personne peut changer son prénom ou son numéro, ou la retirer.";

/** The names of a sheet's buttons in order, « Fermer » left out. */
async function actionsOf(dialog: Locator) {
  const names = await dialog.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ""));
  return names.filter((name) => name !== "" && name !== "Fermer");
}

/** The page has nothing to say: no line in the bar, nothing written in its live regions. */
async function silent(page: Page, record: Awaited<ReturnType<typeof recordBar>>) {
  await expect(messages(page)).toHaveCount(0);
  const { writes } = await record();
  expect(said(writes, "status")).toEqual([]);
  expect(said(writes, "alert")).toEqual([]);
}

test.describe("the sheet of a passenger, from the card of her car", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    // The device's persons are known: a name button is active, and a sheet knows whose she is.
    await expect(passenger(page, "Camille", "Max")).toBeEnabled();
  });

  test("PL1.3: each passenger's first name is a button of 44 px with a dialog and a chevron of 14 px; the driver's is not one", async ({ page }) => {
    for (const [driver, name] of [["Camille", "Max"], ["Camille", "Léa"], ["Sophie", "Tom"]]) {
      const button = passenger(page, driver, name);
      await expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
      const chevron = button.locator("svg");
      await expect(chevron).toHaveAttribute("aria-hidden", "true");
      expect((await chevron.boundingBox())!.width).toBeCloseTo(14, 0);
      // The colour of the decorative icons of the card, `text-muted-foreground`.
      const muted = await car(page, driver).locator("svg").first().evaluate((svg) => getComputedStyle(svg).color);
      expect(await chevron.evaluate((svg) => getComputedStyle(svg).color)).toBe(muted);
    }
    for (const driver of ["Camille", "Sophie", "Marc"]) {
      await expect(car(page, driver).getByRole("button", { name: driver, exact: true })).toHaveCount(0);
      await expect(car(page, driver).getByRole("heading", { name: `Voiture de ${driver}` })).toBeVisible();
    }
  });

  test("PL3.1, PL3.2, PL3.4, PL3.5: Tom, of another device, in Sophie's car: the state, « Sortir de la voiture » and « Ne fait pas l’aller », the sentence, and no number", async ({ page }) => {
    await passenger(page, "Sophie", "Tom").click();
    const dialog = sheet(page, "Tom · Aller");
    await expect(dialog).toContainText("Dans la voiture de Sophie");
    expect(await actionsOf(dialog)).toEqual(["Sortir de la voiture", "Ne fait pas l’aller"]);
    await expect(dialog.getByRole("button", { name: "Voir la voiture" })).toHaveCount(0);
    await expect(dialog.getByText(NOTE)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^Retirer/ })).toHaveCount(0);
    // State 10: Tom is not in the car of a person of the device.
    await expect(dialog.getByRole("link")).toHaveCount(0);
  });

  test("PL1.3b: the same card, Max of the device has « Modifier » and « Retirer », Léa of another has the sentence", async ({ page }) => {
    await passenger(page, "Camille", "Max").click();
    const mine = sheet(page, "Max · Aller");
    await expect(mine).toContainText("Dans la voiture de Camille");
    expect(await actionsOf(mine)).toEqual(["Sortir de la voiture", "Ne fait pas l’aller", "Modifier", "Retirer de l’événement"]);
    await expect(mine.getByText(NOTE)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await passenger(page, "Camille", "Léa").click();
    const other = sheet(page, "Léa · Aller");
    expect(await actionsOf(other)).toEqual(["Sortir de la voiture", "Ne fait pas l’aller"]);
    await expect(other.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(other.getByText(NOTE)).toBeVisible();
  });

  test("PL3.5: Léa, in the car of Camille, of the device: her number is a link of 44 px under the state", async ({ page }) => {
    await passenger(page, "Camille", "Léa").click();
    const dialog = sheet(page, "Léa · Aller");
    const link = dialog.getByRole("link", { name: /^Appeler Léa/ });
    await numbersHidden(async () => {
      await expect(link).toHaveAttribute("href", "tel:0698765432");
      await expect(link).toHaveText(PHONE_OF_LEA);
    });
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
    // Under the state, not under the actions.
    const state = (await dialog.getByText("Dans la voiture de Camille").boundingBox())!;
    expect((await link.boundingBox())!.y).toBeGreaterThan(state.y);
    expect((await link.boundingBox())!.y).toBeLessThan((await dialog.getByRole("button", { name: "Sortir de la voiture" }).boundingBox())!.y);
  });

  test("PL3.6, PL4.2: « Sortir de la voiture » closes the sheet with no message; Tom is without a car, the focus on his name", async ({ page }) => {
    const record = await recordBar(page);
    await passenger(page, "Sophie", "Tom").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
    const without = page.getByRole("region", { name: "Sans voiture" });
    await expect(without.getByRole("button", { name: "Tom", exact: true })).toBeFocused();
    await silent(page, record);
  });

  test("PL3.6: « Ne fait pas l’aller » from a car closes the sheet with no message; Max is out of the leg", async ({ page }) => {
    const record = await recordBar(page);
    await passenger(page, "Camille", "Max").click();
    await sheet(page, "Max · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(passenger(page, "Camille", "Max")).toHaveCount(0);
    await silent(page, record);
  });

  // #981: a first name that goes into « Ne font pas l’aller » (closed) sends the focus to the fold, never to the page or elsewhere.
  for (const [driver, name] of [["Sophie", "Tom"], ["Camille", "Max"]]) {
    test(`PL4.2: « Ne fait pas l’aller » of ${name} from his sheet, ${name === "Tom" ? "of another device" : "of the device"}: the focus goes to the fold « Ne font pas l’aller »`, async ({ page }) => {
      await passenger(page, driver, name).click();
      await sheet(page, `${name} · Aller`).getByRole("button", { name: "Ne fait pas l’aller" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(fold(page, "l’aller")).toHaveText("Ne font pas l’aller (1)");
      await expect(fold(page, "l’aller")).toBeFocused();
    });
  }

  test("PL4.2: « Ne fait pas le retour » of Léa, of another device, from her sheet on the retour: the focus goes to the fold « Ne font pas le retour »", async ({ db, page, seededEvent }) => {
    const retour = await seedRide(db, seededEvent.id, scene.sophie, { leg: "retour", departureTime: "17:30:00" });
    await seedPlacement(db, { personId: scene.lea, eventId: seededEvent.id, leg: "retour", rideId: retour });
    await page.reload();
    await page.getByRole("tab", { name: "Retour" }).click();
    await expect(page.getByRole("tab", { name: "Retour" })).toHaveAttribute("aria-selected", "true");
    await passenger(page, "Sophie", "Léa").click();
    await sheet(page, "Léa · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(fold(page, "le retour")).toBeFocused();
  });

  test("PL3.7: Tom already out in the database: the bar says « Tom n’était déjà plus… », with no « Annuler »", async ({ db, page }) => {
    await passenger(page, "Sophie", "Tom").click();
    await db.deleteFrom("placement").where("person_id", "=", scene.tom).where("leg", "=", "aller").execute();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Tom n’était déjà plus dans la voiture de Sophie"]);
    await expect(page.getByRole("button", { name: "Annuler" })).toHaveCount(0);
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
  });

  test("PL4.5: Tom placed in Marc's car meanwhile: he stays there, and the bar says he was no longer in Sophie's", async ({ db, page, seededEvent }) => {
    await passenger(page, "Sophie", "Tom").click();
    await seedPlacement(db, { personId: scene.tom, eventId: seededEvent.id, leg: "aller", rideId: scene.rides.marc });
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Tom n’était déjà plus dans la voiture de Sophie"]);
    await expect(passenger(page, "Marc", "Tom")).toBeVisible();
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
    const placed = await db.selectFrom("placement").select("ride_id").where("person_id", "=", scene.tom).where("leg", "=", "aller").execute();
    expect(placed).toEqual([{ ride_id: scene.rides.marc }]);
  });

  test("PL3.6: offline, the sheet stays open with « Action impossible… » and the words of the cell; back online, it goes through", async ({ context, page }) => {
    const record = await recordBar(page);
    await passenger(page, "Sophie", "Tom").click();
    const dialog = sheet(page, "Tom · Aller");
    const action = dialog.getByRole("button", { name: "Sortir de la voiture" });
    await context.setOffline(true);
    await action.click();
    await expect(dialog.getByRole("alert")).toHaveText("Action impossible, vérifiez la connexion");
    await expect(action).toBeFocused();
    await expect(messages(page)).toHaveCount(0);

    await context.setOffline(false);
    await action.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
    await silent(page, record);
  });

  test("PL3.6: on a server error, the sheet stays open with « Une erreur est survenue… »; Tom is still in the car", async ({ page }) => {
    const failing = await failActions(page);
    await passenger(page, "Sophie", "Tom").click();
    const dialog = sheet(page, "Tom · Aller");
    await dialog.getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Une erreur est survenue et rien n’a changé. Réessayez dans un instant.");
    await expect(messages(page)).toHaveCount(0);
    failing.on = false;
    await dialog.getByRole("button", { name: "Sortir de la voiture" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
  });

  test("PL3.6: a failure after the sheet is closed goes to the bar with the cell's words, not those of « Annuler »", async ({ context, page }) => {
    const lose = await loseFirst(page, scene.tom);
    await passenger(page, "Sophie", "Tom").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Sortir de la voiture" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    lose();
    await expect(messages(page)).toHaveText(["Tom n’a pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis réessayez."]);
    await expect(page.getByRole("button", { name: "Annuler" })).toHaveCount(0);
  });

  test("Escape gives the focus back to the passenger's name", async ({ page }) => {
    await passenger(page, "Sophie", "Tom").click();
    await expect(sheet(page, "Tom · Aller")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(passenger(page, "Sophie", "Tom")).toBeFocused();
  });
});

test.describe("a passenger moved to another car while her sheet is open", () => {
  test.use({ locale: "fr-FR" });

  test("PL3.6: the sheet closes as soon as the page shows Tom in Marc's car, so that no action applies to Sophie's", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, newToken());
    await keepAdminToken(page, seededEvent.id, seededEvent.token);
    await page.goto(organiserPath(seededEvent));
    await expect(passenger(page, "Sophie", "Tom")).toBeVisible();
    await passenger(page, "Sophie", "Tom").click();
    const dialog = sheet(page, "Tom · Aller");
    await expect(dialog).toContainText("Dans la voiture de Sophie");

    await db.deleteFrom("placement").where("person_id", "=", scene.tom).where("leg", "=", "aller").execute();
    await seedPlacement(db, { personId: scene.tom, eventId: seededEvent.id, leg: "aller", rideId: scene.rides.marc });
    // « Actualiser » is behind the sheet: its read is what another device's move reaches the page by.
    await page.locator("button", { hasText: "Actualiser" }).dispatchEvent("click");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(passenger(page, "Marc", "Tom")).toBeVisible();
    await expect(passenger(page, "Sophie", "Tom")).toHaveCount(0);
  });
});

test.describe("while the device's persons are not known", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test("C5.9: the passengers' names are inactive while the read is pending, then Max has his own sheet", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" })).toBeVisible();
    for (const [driver, name] of [["Camille", "Max"], ["Sophie", "Tom"]]) await expect(passenger(page, driver, name)).toBeDisabled();
    await passenger(page, "Camille", "Max").click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    release();
    await expect(passenger(page, "Camille", "Max")).toBeEnabled();
    await passenger(page, "Camille", "Max").click();
    await expect(sheet(page, "Max · Aller").getByRole("button", { name: "Modifier" })).toBeVisible();
  });
});

test.describe("360 px", () => {
  test.use({ locale: "fr-FR" });

  test("PL6.3: a first name of 40 characters without a space wraps in a passenger's line with a number, and in the sheet", async ({ db, page, seededEvent }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const token = newToken();
    const camille = (await seedPerson(db, seededEvent.id, { firstName: "Camille", phone: DRIVER_PHONE }, token)).id;
    const long = (await seedPerson(db, seededEvent.id, { firstName: LONG, phone: PHONE_OF_LEA })).id;
    const ride = await seedRide(db, seededEvent.id, camille);
    await seedPlacement(db, { personId: long, eventId: seededEvent.id, leg: "aller", rideId: ride });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const button = passenger(page, "Camille", LONG);
    await expect(button).toBeEnabled();
    const box = (await button.boundingBox())!;
    // On two lines: a second line clears the 44 px minimum of a name on one line by more than a rounding error.
    expect(box.height).toBeGreaterThan(TAP_TARGET_MIN + 5);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await button.click();
    const dialog = sheet(page, `${LONG} · Aller`);
    await expect(dialog.getByText(NOTE)).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await contrast(dialog.getByText(NOTE), dialog)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-US" });
  const token = newToken();

  test("PL6.1: the state and the actions of a passenger's sheet are in English", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const button = page.getByRole("article", { name: "Sophie’s car" }).getByRole("button", { name: "Tom", exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    const dialog = sheet(page, "Tom · Outbound");
    await expect(dialog).toContainText("In Sophie’s car");
    await expect(dialog.getByRole("button", { name: "Leave the car" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Not on the outbound trip" })).toBeVisible();
    await expect(dialog.getByText("Only the device that signed this person up can change their name or number, or remove them.")).toBeVisible();
  });
});
