import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { deleteSeededPerson, seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { hashToken } from "@/domain/token-hash";
import { holdFirst, holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #668 (docs/design/remove-person/, v2, sections 1 to 4, 7, 8 and 10): a person removes herself
// from the event, from her sheet on the device that signed her up, after a confirmation.

type Db = Kysely<Database>;

const REMOVE = "Retirer de l’événement";
const ERASED = "Son prénom, son numéro s’il y en a un et ses inscriptions seront effacés.";
const FINAL = "C’est définitif.";
const PHONES = { marc: "06 11 22 33 44", lea: "06 12 34 56 78", tom: "06 98 76 54 32" };

/**
 * The example of the page, the device holding Marc, Léa and Tom. Aller: Marc drives Inès, Hugo
 * and Léa, in his 3 seats; Claire drives Sophie, one seat left; Tom is without a car. Retour:
 * Sophie drives Marc; Léa, Inès and Hugo are without a car; Tom is not concerned.
 */
async function seedExample(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string, phone: string) => (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const device = { marc: await mine("Marc", PHONES.marc), lea: await mine("Léa", PHONES.lea), tom: await mine("Tom", PHONES.tom) };
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const others = { claire: await other("Claire"), sophie: await other("Sophie"), ines: await other("Inès"), hugo: await other("Hugo") };
  const cars = {
    marc: await seedRide(db, eventId, device.marc, { seats: 3, departureTime: "08:00:00" }),
    claire: await seedRide(db, eventId, others.claire, { seats: 2, departureTime: "08:15:00" }),
    sophie: await seedRide(db, eventId, others.sophie, { leg: "retour", seats: 3 }),
  };
  const place = (personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });
  await place(others.ines, "aller", cars.marc);
  await place(others.hugo, "aller", cars.marc);
  await place(device.lea, "aller", cars.marc);
  await place(others.sophie, "aller", cars.claire);
  await place(device.tom, "aller", null);
  await place(device.marc, "retour", cars.sophie);
  await place(device.lea, "retour", null);
  await place(others.ines, "retour", null);
  await place(others.hugo, "retour", null);
  return { device, others, cars };
}

/** The persons of the event, by first name. */
const persons = async (db: Db, eventId: string) =>
  (await db.selectFrom("person").select("first_name").where("event_id", "=", eventId).orderBy("first_name").execute()).map((row) => row.first_name);

const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
const names = (page: Page) => section(page).locator("[data-person-name]");
const nameButton = (page: Page, firstName: string) => names(page).filter({ hasText: firstName });
const sheet = (page: Page, firstName: string) => page.getByRole("dialog", { name: firstName, exact: true });
const removeButton = (scope: Page | Locator) => scope.getByRole("button", { name: REMOVE, exact: true });
const confirmation = (page: Page, firstName: string) => page.getByRole("alertdialog", { name: `Retirer ${firstName} de l’événement ?` });
const confirm = (page: Page, firstName: string) => removeButton(confirmation(page, firstName));
const cancel = (page: Page, firstName: string) => confirmation(page, firstName).getByRole("button", { name: "Annuler" });
const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const banner = (page: Page) => panel(page).getByRole("status").filter({ hasText: /\S/ });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const registration = (page: Page) => page.getByRole("dialog", { name: "Ajouter une personne" });

/** A computed colour in sRGB, whatever space the style writes it in (oklch). */
const rgb = (locator: Locator, property: string) =>
  locator.evaluate((element, name) => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = getComputedStyle(element).getPropertyValue(name);
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }, property);

/** Records every server action the page sends from now on. */
function actionsSent(page: Page) {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"]) sent.push(request);
  });
  return sent;
}

/** The removals sent: the server actions whose body carries `personId`. */
const removals = (sent: Request[], personId: string) => sent.filter((request) => request.postData()?.includes(personId));

/** Everything `localStorage` and `sessionStorage` hold, keys and values. */
const storage = (page: Page) =>
  page.evaluate(() => {
    const all = (store: Storage) => Object.fromEntries(Array.from({ length: store.length }, (_, index) => store.key(index)!).map((key) => [key, store.getItem(key)]));
    return { local: all(localStorage), session: all(sessionStorage) };
  });

/** Opens the sheet of `firstName`, then its confirmation. */
async function openConfirmation(page: Page, firstName: string) {
  await nameButton(page, firstName).click();
  await removeButton(sheet(page, firstName)).click();
  await expect(confirmation(page, firstName)).toBeVisible();
}

test.describe("remove a person from the device", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let example: Awaited<ReturnType<typeof seedExample>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    example = await seedExample(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("RP1.1: under « Modifier » in the person's sheet, in outline and red, full width, 44 px; nowhere else", async ({ browser, baseURL, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await nameButton(page, "Léa").click();
    const button = removeButton(sheet(page, "Léa"));
    expect(await sheet(page, "Léa").getByRole("button").allTextContents()).toEqual(expect.arrayContaining(["Modifier", REMOVE]));
    const modify = await sheet(page, "Léa").getByRole("button", { name: "Modifier" }).boundingBox();
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThan(modify!.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.round(box.width)).toBe(Math.round(modify!.width));
    expect(await rgb(button, "color")).toBe("rgb(231, 0, 11)");
    expect(await rgb(button, "background-color")).not.toBe("rgb(231, 0, 11)");
    await page.keyboard.press("Escape");

    // Neither a cell's sheet nor a car's card shows it.
    await section(page).getByRole("button", { name: /^Léa, Aller : / }).click();
    await expect(page.getByRole("dialog", { name: "Léa · Aller" })).toBeVisible();
    await expect(removeButton(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(car(page, "Marc")).toBeVisible();
    await expect(removeButton(page)).toHaveCount(0);

    // Nor a page without the device's token.
    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await other.goto(`/e/${seededEvent.id}`);
      await expect(car(other, "Marc")).toBeVisible();
      await expect(section(other)).toHaveCount(0);
      await expect(removeButton(other)).toHaveCount(0);
      await other.goto("about:blank");
    } finally {
      await context.close();
    }
  });

  test("RP1.2: the confirmation, word for word, for Léa, Marc and Tom", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const expected = {
      Léa: [
        "Sa place dans la voiture de Marc à l’aller sera libérée.",
        "Personne n’est prévenu : pensez à le dire aux personnes de cette voiture.",
        ERASED,
        FINAL,
      ],
      Marc: [
        "Sa voiture pour l’aller sera retirée. 3 personnes redeviendront sans voiture.",
        "Sa place dans la voiture de Sophie au retour sera libérée.",
        "Personne n’est prévenu : pensez à le dire aux personnes de ces voitures.",
        ERASED,
        FINAL,
      ],
      Tom: [ERASED, FINAL],
    };
    for (const [firstName, lines] of Object.entries(expected)) {
      await openConfirmation(page, firstName);
      const dialog = confirmation(page, firstName);
      await expect(dialog.getByRole("heading")).toHaveText(`Retirer ${firstName} de l’événement ?`);
      await expect(dialog.locator("p")).toHaveText(lines);
      expect(await dialog.getByRole("button").allTextContents()).toEqual([REMOVE, "Annuler"]);
      await cancel(page, firstName).click();
      await expect(removeButton(sheet(page, firstName))).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(nameButton(page, firstName)).toBeFocused();
    }
  });

  test("RP1.2: a driver without passengers, no number at 0, and nobody to tell", async ({ db, page, seededEvent }) => {
    await seedRide(db, seededEvent.id, example.device.tom, { leg: "retour", seats: 2 });
    await page.goto(`/e/${seededEvent.id}`);
    await openConfirmation(page, "Tom");
    await expect(confirmation(page, "Tom").locator("p")).toHaveText(["Sa voiture pour le retour sera retirée.", ERASED, FINAL]);
  });

  test("RP1.3: the focus on « Annuler »; « Annuler » or Escape sends nothing, and gives it back", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    const sent = actionsSent(page);
    await openConfirmation(page, "Léa");
    await expect(cancel(page, "Léa")).toBeFocused();
    await cancel(page, "Léa").click();
    await expect(confirmation(page, "Léa")).toHaveCount(0);
    await expect(removeButton(sheet(page, "Léa"))).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(cancel(page, "Léa")).toBeFocused();
    // Just opened, Radix may not hear Escape yet: pressed again until the confirmation closes.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(confirmation(page, "Léa")).toHaveCount(0, { timeout: 1_000 });
    }).toPass();
    await expect(sheet(page, "Léa")).toBeVisible();
    await expect(removeButton(sheet(page, "Léa"))).toBeFocused();

    expect(sent.length).toBe(0);
    await page.keyboard.press("Escape");
    await expect(nameButton(page, "Léa")).toBeFocused();
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    expect(await persons(db, seededEvent.id)).toHaveLength(7);
  });

  test("RP1.4: one request; while it is sent, the button is inactive and keeps its words", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, example.device.lea, false);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(names(page)).toHaveText(["Marc", "Léa", "Tom"]);
    const sent = actionsSent(page);
    await openConfirmation(page, "Léa");
    await confirm(page, "Léa").click();
    await expect(confirm(page, "Léa")).toBeDisabled();
    await expect(confirm(page, "Léa")).toHaveText(REMOVE);
    await confirm(page, "Léa").click({ force: true });
    await confirm(page, "Léa").press("Enter");
    answer();

    await expect(names(page)).toHaveText(["Marc", "Tom"]);
    expect(removals(sent, example.device.lea).length).toBe(1);
    expect(sent.length).toBe(1);
    expect(await persons(db, seededEvent.id)).not.toContain("Léa");
  });

  test("RP1.5: removed, the sheet closes, the page shows the state answered, the bar says it, the focus on Tom", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(toggle(page)).toContainText("3 personnes · 2 sans voiture");
    await expect(tab(page, "Retour")).toHaveAccessibleName("Retour 3 sans voiture");
    const sent = actionsSent(page);
    await openConfirmation(page, "Léa");
    await confirm(page, "Léa").click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(names(page)).toHaveText(["Marc", "Tom"]);
    await expect(nameButton(page, "Tom")).toBeFocused();
    await expect(toggle(page)).toContainText("2 personnes · 1 sans voiture");
    await expect(car(page, "Marc").getByRole("listitem")).toHaveText(["Inès", "Hugo", /^Place libre/]);
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 1 sans voiture");
    await expect(tab(page, "Retour")).toHaveAccessibleName("Retour 2 sans voiture");
    await expect(banner(page)).toHaveText("1 sans voiture · 2 places libres");
    await expect(messages(page)).toHaveText(["Léa ne fait plus partie de l’événement"]);
    await expect(barStatus(page)).toHaveText("Léa ne fait plus partie de l’événement");
    await expect(page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" })).toHaveCount(0);

    // The state came with the answer: no other request.
    expect(sent.length).toBe(1);
    expect(sent[0].postData()?.includes(token), "the removal's body carries the device's token").toBe(true);
    expect(sent[0].url().includes(token), "the removal's URL holds the device's token").toBe(false);
    expect(await persons(db, seededEvent.id)).toEqual(["Claire", "Hugo", "Inès", "Marc", "Sophie", "Tom"]);
  });

  test("RP1.5: the last row removed, the focus on the one before", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openConfirmation(page, "Tom");
    await confirm(page, "Tom").click();
    await expect(names(page)).toHaveText(["Marc", "Léa"]);
    await expect(nameButton(page, "Léa")).toBeFocused();
    await expect(messages(page)).toHaveText(["Tom ne fait plus partie de l’événement"]);
  });

  test("RP1.6, RP6.3: the last person of the device gone, the section goes, the token stays and serves again", async ({ db, page, seededEvent }) => {
    const eventId = seededEvent.id;
    const key = `fullcar:personal-token:${eventId}`;
    await deleteSeededPerson(db, eventId, example.device.marc);
    await deleteSeededPerson(db, eventId, example.device.lea);
    await page.goto(`/e/${eventId}`);
    await expect(names(page)).toHaveText(["Tom"]);
    const before = await storage(page);
    expect(before.local[key] === token, "the device's token is stored").toBe(true);

    await openConfirmation(page, "Tom");
    await confirm(page, "Tom").click();
    await expect(section(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-add-person="aller"]')).toBeFocused();
    await expect(messages(page)).toHaveText(["Tom ne fait plus partie de l’événement"]);

    // Nothing of a person in the browser's storage, before or after; the token kept, as it was (Q3 = a).
    const after = await storage(page);
    expect(after.local[key] === token, "the device's token is kept, as it was").toBe(true);
    for (const stored of [before, after]) {
      const text = JSON.stringify(stored);
      const kept = ["Marc", "Léa", "Tom", ...Object.values(PHONES), ...Object.values(example.device)].filter((value) => text.includes(value));
      // Compared by their number: the storage holds the token, and what was seeded a number.
      expect(kept.length, "something of a person is in the browser's storage").toBe(0);
    }

    // A device without a person: a tap on a free seat opens the first registration, which uses the same token.
    await car(page, "Claire").getByRole("button", { name: /^Place libre/ }).click();
    await registration(page).getByLabel("Prénom").fill("Zoé");
    await registration(page).getByRole("button", { name: "Valider" }).click();
    await expect(names(page)).toHaveText(["Zoé"]);
    expect((await storage(page)).local[key] === token, "the new registration kept the token").toBe(true);
    const zoe = await db.selectFrom("person").select("token_hash").where("event_id", "=", eventId).where("first_name", "=", "Zoé").executeTakeFirstOrThrow();
    expect(zoe.token_hash.toString("hex") === hashToken(token), "Zoé was registered with the device's token").toBe(true);
  });

  test("RP1.8: the answer lost, then the removal sent again: alreadyRemoved, a success", async ({ db, page, seededEvent }) => {
    let lost = false;
    await page.route("**/e/**", async (route) => {
      if (lost || !route.request().postData()?.includes(example.device.lea)) return route.fallback();
      lost = true;
      // Written, then the answer lost on its way back.
      await route.fetch();
      return route.abort();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await openConfirmation(page, "Léa");
    await confirm(page, "Léa").click();
    await expect(confirmation(page, "Léa").getByRole("alert")).toHaveText(/\S/);
    expect(await persons(db, seededEvent.id)).not.toContain("Léa");

    await confirm(page, "Léa").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(names(page)).toHaveText(["Marc", "Tom"]);
    await expect(messages(page)).toHaveText(["Léa ne faisait déjà plus partie de l’événement"]);
    await expect(barStatus(page)).toHaveText("Léa ne faisait déjà plus partie de l’événement");
  });

  test("RP1.8: removed by the organiser meanwhile: alreadyRemoved, a success", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openConfirmation(page, "Léa");
    await deleteSeededPerson(db, seededEvent.id, example.device.lea);
    await confirm(page, "Léa").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(names(page)).toHaveText(["Marc", "Tom"]);
    await expect(messages(page)).toHaveText(["Léa ne faisait déjà plus partie de l’événement"]);
    await expect(nameButton(page, "Tom")).toBeFocused();
  });
});
