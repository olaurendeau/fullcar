import type { Page } from "@playwright/test";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// RP5.4 (docs/design/remove-person/, v2, state 22): a page still showing a person removed since,
// by another device or the organiser. The server refuses its action by `personGone`, with the
// state: the bar says what was not done, then `Actions.why.personGone`, and her row goes.

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const names = (page: Page) => section(page).locator("[data-person-name]");
const car = (page: Page, driver: string) => page.getByRole("tabpanel").getByRole("article", { name: `Voiture de ${driver}` });

test.describe("RP5.4: an action on a person removed meanwhile", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let tom: string;
  let lea: string;

  // The device holds Tom, without a car at the aller, and Léa, not concerned by it. Claire, of
  // another device, drives Sophie, and has one seat left.
  test.beforeEach(async ({ db, page, seededEvent }) => {
    const eventId = seededEvent.id;
    tom = (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id;
    lea = (await seedPerson(db, eventId, { firstName: "Léa" }, token)).id;
    const claire = await seedPerson(db, eventId, { firstName: "Claire" });
    const sophie = await seedPerson(db, eventId, { firstName: "Sophie" });
    const ride = await seedRide(db, eventId, claire.id, { seats: 2 });
    await seedPlacement(db, { personId: sophie.id, eventId, leg: "aller", rideId: ride });
    await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
    await holdToken(page, eventId, token);
    await page.goto(`/e/${eventId}`);
    await expect(names(page)).toHaveText(["Tom", "Léa"]);
  });

  test("RP5.4: a tap on a free seat for Tom, removed since: personGone, and his row goes", async ({ db, page, seededEvent }) => {
    await deleteSeededPerson(db, seededEvent.id, tom);
    await car(page, "Claire").getByRole("button", { name: /^Place libre/ }).click();

    const text = "Tom n’a pas pu monter dans la voiture de Claire. Tom ne fait plus partie de l’événement.";
    await expect(messages(page)).toHaveText([text]);
    await expect(bar(page)).toHaveText(text);
    await expect(names(page)).toHaveText(["Léa"]);
    await expect(car(page, "Claire").getByRole("button", { name: /^Place libre/ })).toHaveCount(1);
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("RP5.4: a cell's action on Léa, removed while her sheet is open: it closes, and the bar says why", async ({ db, page, seededEvent }) => {
    await section(page).getByRole("button", { name: /^Léa, Aller : / }).click();
    const sheet = page.getByRole("dialog", { name: "Léa · Aller" });
    await deleteSeededPerson(db, seededEvent.id, lea);
    await sheet.getByRole("button", { name: "Je cherche une place" }).click();

    const text = "Léa · Aller : « Je cherche une place » n’a pas été enregistré. Léa ne fait plus partie de l’événement.";
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText([text]);
    await expect(names(page)).toHaveText(["Tom"]);
  });
});
