import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, watchAlerts } from "./device";
import { DRIVER_PHONE, fillDriver } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #168: the driver removes their car from the page (C8.1, C8.6 to C8.8), after a confirmation.

type Db = Kysely<Database>;

const REMOVE = "Retirer la voiture";
const NOTIFIED = "Personne n’est prévenu : pensez à le leur dire.";
const FAILED = "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.";
/** In the bar, a failure names the car and its leg (C11.11, #226). */
const REMOVAL_FAILED = "La voiture de Claire pour l’aller n’a pas été retirée. Une erreur est survenue : réessayez dans un instant.";
const CHANGE_FAILED =
  "Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Une erreur est survenue : réessayez dans un instant.";
const GARE = "Gare de Cesson";

/**
 * The device holds Claire, Léa and Tom; Nina has a device of her own, Marc another.
 * Aller: Claire drives Léa and Nina; Marc drives nobody; Tom is without a car.
 * Retour: Claire drives Léa; Tom drives nobody; Nina is not concerned.
 */
async function seedScene(db: Db, eventId: string, token: string, ninasToken: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const persons = { claire: await mine("Claire"), lea: await mine("Léa"), tom: await mine("Tom") };
  const nina = (await seedPerson(db, eventId, { firstName: "Nina" }, ninasToken)).id;
  const marc = (await seedPerson(db, eventId, { firstName: "Marc" })).id;
  const cars = {
    claire: await seedRide(db, eventId, persons.claire, { departureTime: "07:00:00" }),
    marc: await seedRide(db, eventId, marc),
    claireRetour: await seedRide(db, eventId, persons.claire, { leg: "retour" }),
    tomRetour: await seedRide(db, eventId, persons.tom, { leg: "retour" }),
  };
  const place = (personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });
  await place(persons.lea, "aller", cars.claire);
  await place(nina, "aller", cars.claire);
  await place(persons.tom, "aller", null);
  await place(persons.lea, "retour", cars.claireRetour);
  return { persons, nina, cars };
}

/** The Rides of the event, by leg and driver's first name. */
const rides = (db: Db, eventId: string) =>
  db
    .selectFrom("ride")
    .innerJoin("person", "person.id", "ride.driver_id")
    .select(["ride.id", "ride.leg", "person.first_name"])
    .where("ride.event_id", "=", eventId)
    .orderBy("ride.leg")
    .orderBy("person.first_name")
    .execute();

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const removeButton = (scope: Locator) => scope.getByRole("button", { name: REMOVE, exact: true });
const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Retirer la voiture ?" });
const confirm = (page: Page) => confirmation(page).getByRole("button", { name: REMOVE, exact: true });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
const cell = (page: Page, name: string) => section(page).getByRole("button", { name, exact: true });
const banner = (page: Page) => panel(page).getByRole("status").filter({ hasText: /\S/ });
const withoutCar = (page: Page) => panel(page).getByRole("region", { name: "Sans voiture" }).getByRole("listitem");
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const alerts = (scope: Page | Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });
const overlay = (page: Page) => page.locator('[data-slot="alert-dialog-overlay"]');
// The confirmation and its overlay close together, each in its own portal: the one that ended its
// closing first comes back last in the page when reopened, and an overlay there covers the
// confirmation (#368). Both are held, as the page closes both at once: paused, Radix keeps them
// mounted until the style is removed.
const holdClose =
  '[role="alertdialog"][data-state="closed"], [data-slot="alert-dialog-overlay"][data-state="closed"] { animation-play-state: paused !important; }';

/** A computed colour in sRGB, whatever space the style writes it in (oklch). */
const rgb = (locator: Locator, property: string) =>
  locator.evaluate((element, name) => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = getComputedStyle(element).getPropertyValue(name);
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }, property);

async function selectTab(page: Page, leg: "Aller" | "Retour") {
  await expect(async () => {
    await tab(page, leg).click();
    await expect(tab(page, leg)).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

test.describe("remove a car", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  const ninasToken = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token, ninasToken);
    await holdToken(page, seededEvent.id, token);
  });

  test("C8.1: on the device's own cars alone, in outline and red", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const claires = removeButton(car(panel(page), "Claire"));
    await expect(claires).toBeVisible();
    await expect(removeButton(car(panel(page), "Marc"))).toHaveCount(0);
    expect(await rgb(claires, "color")).toBe("rgb(231, 0, 11)");
    expect((await claires.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await selectTab(page, "Retour");
    await expect(removeButton(car(panel(page), "Claire"))).toBeVisible();
    await expect(removeButton(car(panel(page), "Tom"))).toBeVisible();
  });

  test("C8.6, C9.4, C3.9: confirmed, the car goes, its persons are without a car, the focus on the driver's cell", async ({ db, page, seededEvent }) => {
    const sent: { url: string; body: string }[] = [];
    page.on("request", (request) => {
      if (request.headers()["next-action"] && request.postData()?.includes(scene.cars.claire)) sent.push({ url: request.url(), body: request.postData() ?? "" });
    });
    await page.goto(`/e/${seededEvent.id}`);
    await expect(banner(page)).toHaveText("1 sans voiture · 4 places libres");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");

    await removeButton(car(panel(page), "Claire")).click();
    await expect(confirmation(page)).toContainText("2 personnes redeviendront sans voiture.");
    await expect(confirmation(page)).toContainText(NOTIFIED);
    expect(await rgb(confirm(page), "background-color")).toBe("rgb(231, 0, 11)");
    expect(await rgb(confirm(page), "color")).toBe("rgb(255, 255, 255)");
    expect(await confirmation(page).getByRole("button").allTextContents()).toEqual([REMOVE, "Annuler"]);
    await confirm(page).click();

    await expect(confirmation(page)).toHaveCount(0);
    await expect(car(panel(page), "Claire")).toHaveCount(0);
    await expect(cell(page, "Claire, Aller : Ne fait pas l’aller")).toBeFocused();
    await expect(cell(page, "Léa, Aller : Sans voiture")).toBeVisible();
    await expect(withoutCar(page)).toHaveText(["Léa", "Nina", "Tom"]);
    await expect(banner(page)).toHaveText("3 sans voiture · 3 places libres");
    await expect(tab(page, "Aller")).toHaveAccessibleName("Aller 3 sans voiture");
    await expect(toggle(page)).toContainText("3 personnes · 2 sans voiture");
    // The retour has not changed.
    await expect(cell(page, "Claire, Retour : Conduit")).toBeVisible();
    await expect(cell(page, "Léa, Retour : Avec Claire")).toBeVisible();
    expect((await rides(db, seededEvent.id)).map((ride) => `${ride.leg} ${ride.first_name}`)).toEqual(["aller Marc", "retour Claire", "retour Tom"]);
    // The token went in the body, never in the URL.
    expect(sent.length).toBe(1);
    expect(sent[0].body.includes(token), "the removal's body carries the device's token").toBe(true);
    expect(sent[0].url.includes(token), "the removal's URL holds the device's token").toBe(false);
  });

  test("C8.6, C8.7: the confirmation counts 0 and 1 person; « Annuler » changes nothing", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Retour");
    for (const [driver, count] of [["Tom", "Personne ne redeviendra sans voiture."], ["Claire", "1 personne redeviendra sans voiture."]]) {
      const trigger = removeButton(car(panel(page), driver));
      await trigger.click();
      await expect(confirmation(page)).toContainText(count);
      await confirmation(page).getByRole("button", { name: "Annuler" }).click();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await expect(car(panel(page), "Claire").getByRole("listitem").first()).toHaveText("Léa");
    expect(await rides(db, seededEvent.id)).toHaveLength(4);
  });

  test("C3.9: the section folded, the focus on its button, which stays folded with its summary up to date", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await removeButton(car(panel(page), "Claire")).click();
    await confirm(page).click();

    // Hidden by the confirmation, the car is « gone » before the answer (#295).
    await expect(confirmation(page)).toHaveCount(0);
    await expect(car(panel(page), "Claire")).toHaveCount(0);
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page)).toHaveAccessibleName(/3 personnes · 2 sans voiture$/);
  });

  test("C8.8: the other device sees its passenger without a car at its next load", async ({ browser, baseURL, page, seededEvent }) => {
    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const other = await context.newPage();
      await holdToken(other, seededEvent.id, ninasToken);
      await other.goto(`/e/${seededEvent.id}`);
      await expect(toggle(other)).toContainText("1 personne · tout le monde a une place");

      await page.goto(`/e/${seededEvent.id}`);
      await removeButton(car(panel(page), "Claire")).click();
      await confirm(page).click();
      // Hidden by the confirmation, the car is « gone » before the answer: reloaded then, the other device would see it (#295).
      await expect(confirmation(page)).toHaveCount(0);
      await expect(car(panel(page), "Claire")).toHaveCount(0);

      await other.reload();
      await expect(cell(other, "Nina, Aller : Sans voiture")).toBeVisible();
      await other.goto("about:blank");
    } finally {
      await context.close();
    }
  });

  test("a failure, then offline: said in the confirmation, which stays open; nothing changes", async ({ context, db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.cars.claire, true);
    await page.goto(`/e/${seededEvent.id}`);
    await removeButton(car(panel(page), "Claire")).click();
    await confirm(page).click();
    await expect(confirm(page)).toBeDisabled();
    answer();
    await expect(alerts(confirmation(page))).toHaveText(FAILED);
    // Inactive while it was sent, it gets the focus back.
    await expect(confirm(page)).toBeFocused();
    await context.setOffline(true);
    await confirm(page).click();
    await expect(alerts(confirmation(page))).toHaveText("Action impossible, vérifiez la connexion");
    await context.setOffline(false);
    await confirmation(page).getByRole("button", { name: "Annuler" }).click();
    await expect(car(panel(page), "Claire")).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
    expect(await rides(db, seededEvent.id)).toHaveLength(4);
  });

  // Radix keeps a closing confirmation mounted until its animation ends: held here until the answer
  // has come, however long it takes (#398). Reopened, even while the first one closes, the confirmation is a new one.
  for (const when of ["closed", "closing", "reopened", "reopened while closing"] as const) {
    test(`a failure once the confirmation is ${when}: in the bar, once nothing hides the page`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, scene.cars.claire, true);
      await page.goto(`/e/${seededEvent.id}`);
      const closing = when.endsWith("closing");
      const held = closing ? await page.addStyleTag({ content: holdClose }) : undefined;
      const trigger = removeButton(car(panel(page), "Claire"));
      await trigger.click();
      await confirm(page).click();
      await page.keyboard.press("Escape");
      if (closing) {
        await expect(page.locator('[role="alertdialog"]')).toHaveAttribute("data-state", "closed");
        await expect(overlay(page)).toHaveAttribute("data-state", "closed");
      } else await expect(trigger).toBeFocused();
      if (when.startsWith("reopened")) {
        // Hidden from role queries while the first one closes: found by its card.
        await page.locator(`article[aria-labelledby="car-${scene.cars.claire}"] button`, { hasText: REMOVE }).focus();
        await page.keyboard.press("Enter");
        await expect(confirmation(page)).toHaveAttribute("data-state", "open");
        await expect(overlay(page)).toHaveAttribute("data-state", "open");
        // Still on its way: the new confirmation cannot send it again.
        await expect(confirm(page)).toBeDisabled();
      }
      const seen = await watchAlerts(page);
      const responded = page.waitForResponse((response) => response.status() === 500);
      answer();
      await responded;
      // Answered, and reopened if it is: the first confirmation may end its closing.
      await held?.evaluate((style) => style.parentNode?.removeChild(style));
      if (when.startsWith("reopened")) {
        await expect(alerts(confirmation(page))).toHaveCount(0);
        await confirmation(page).getByRole("button", { name: "Annuler" }).click();
      }
      await expect(bar(page)).toHaveText(REMOVAL_FAILED);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(car(panel(page), "Claire")).toBeVisible();
    });
  }

  for (const when of ["closed", "reopened"] as const) {
    test(`a success once the confirmation is ${when}: the focus on the driver's cell, not lost with the car`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, scene.cars.claire, false);
      await page.goto(`/e/${seededEvent.id}`);
      const trigger = removeButton(car(panel(page), "Claire"));
      await trigger.click();
      await confirm(page).click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      if (when === "reopened") await trigger.click();
      answer();
      // Reopened, the confirmation hides the car from role queries until it closes (#295).
      await expect(confirmation(page)).toHaveCount(0);
      await expect(car(panel(page), "Claire")).toHaveCount(0);
      await expect(cell(page, "Claire, Aller : Ne fait pas l’aller")).toBeFocused();
      await expect(alerts(page)).toHaveCount(0);
    });
  }

  // Tom alone is without a car at the aller, Claire drives: one tap sends him, with no sheet (C5.2, C5.6, #92).
  const seatTom = async (page: Page) => {
    await car(panel(page), "Claire").getByRole("button", { name: /^Place libre/ }).click();
  };
  const changeClaire = async (page: Page) => {
    await car(panel(page), "Claire").getByRole("button", { name: "Modifier", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Modifier la voiture" });
    await form.getByLabel("Lieu de départ").fill(GARE);
    await form.getByRole("button", { name: "Valider" }).click();
  };
  const removeClaire = async (page: Page) => {
    await removeButton(car(panel(page), "Claire")).click();
    await confirm(page).click();
  };

  // #221: the car removed, nothing sent about it says anything any more, success or failure,
  // waiting, in the bar or still to come: a seat asked in it (`seats:{id}`), or its change
  // (`ride:{id}:edit`). Next sends the page's actions one at a time: one sent before the removal
  // answers while the confirmation hides the page; one sent after leaves once the car is gone.
  const pending: Record<string, { send: (page: Page) => Promise<void>; fails?: boolean; shown?: boolean; after?: boolean }> = {
    "a seat sent before, its success waiting under the confirmation": { send: seatTom },
    "a seat sent before, its failure waiting under the confirmation": { send: seatTom, fails: true },
    "a seat that failed, in the bar": { send: seatTom, fails: true, shown: true },
    "a seat sent after, refused once the car is gone": { send: seatTom, after: true },
    "a change sent after, refused once the car is gone": { send: changeClaire, after: true },
  };
  for (const [what, { send, fails = false, shown = false, after = false }] of Object.entries(pending)) {
    test(`#221: ${what}: once the car is removed, no message about it stays in the bar`, async ({ page, seededEvent }) => {
      const text = send === seatTom ? scene.persons.tom : GARE;
      const answer = await holdFirst(page, after ? scene.cars.claire : text, fails);
      await page.goto(`/e/${seededEvent.id}`);
      if (after) {
        await removeClaire(page);
        await page.keyboard.press("Escape");
      }
      await send(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (shown) {
        await failHeld(page, answer);
        await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Claire. Une erreur est survenue : réessayez dans un instant."]);
      }
      if (!after) await removeClaire(page);
      if (!shown) {
        const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(text));
        answer();
        await answered;
      }
      await expect(confirmation(page)).toHaveCount(0);
      await expect(car(panel(page), "Claire")).toHaveCount(0);
      // A message left would be written by now.
      await page.waitForTimeout(500);
      await expect(messages(page)).toHaveCount(0);
      await expect(alerts(page)).toHaveCount(0);
      await expect(cell(page, "Claire, Aller : Ne fait pas l’aller")).toBeFocused();
    });
  }

  // « Le sujet d'un échec »: a change of a car and its removal are two subjects (#213, #218).
  test("#221, C11.10: a change of the car does not withdraw its removal's failure", async ({ page, seededEvent }) => {
    const removal = await holdFirst(page, scene.cars.claire, true);
    await page.goto(`/e/${seededEvent.id}`);
    await removeClaire(page);
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);
    await failHeld(page, removal);
    await expect(messages(page)).toHaveText([REMOVAL_FAILED]);

    await changeClaire(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(car(panel(page), "Claire")).toContainText(GARE);
    await expect(messages(page)).toHaveText([REMOVAL_FAILED]);
  });

  test("#221, C11.10: a removal of the car that fails does not withdraw its change's failure", async ({ page, seededEvent }) => {
    const change = await holdFirst(page, GARE, true);
    await page.goto(`/e/${seededEvent.id}`);
    await changeClaire(page);
    await page.keyboard.press("Escape");
    await failHeld(page, change);
    await expect(messages(page)).toHaveText([CHANGE_FAILED]);

    const removal = await holdFirst(page, scene.cars.claire, true);
    await removeClaire(page);
    await failHeld(page, removal);
    await expect(alerts(confirmation(page))).toHaveText(FAILED);
    await confirmation(page).getByRole("button", { name: "Annuler" }).click();
    await expect(messages(page)).toHaveText([CHANGE_FAILED]);
  });
});

// The remark of 18/10 on #90: the same offer sent again once its car is removed.
test.describe("an offer sent again after a removal", () => {
  test.use({ locale: "fr-FR" });

  const form = (page: Page) => page.getByRole("dialog", { name: "Proposer une voiture" });
  async function offer(page: Page) {
    await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
    await form(page).getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
    await form(page).getByRole("button", { name: "Valider" }).click();
  }
  // While the confirmation is open, Radix hides the page from role queries: the car is « gone »
  // before the removal is answered (#295). The confirmation closes once it is: only then is a car not found a car removed.
  async function remove(page: Page) {
    await removeButton(car(panel(page), "Marc")).click();
    await confirm(page).click();
    await expect(confirmation(page)).toHaveCount(0);
    await expect(car(panel(page), "Marc")).toHaveCount(0);
  }

  test("after a success, the next offer is a new car, with a new id", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await offer(page);
    await expect(form(page)).toHaveCount(0);
    const [first] = await rides(db, seededEvent.id);
    await remove(page);
    await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    await form(page).getByRole("radio", { name: "Marc" }).check();
    await form(page).getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
    await form(page).getByRole("button", { name: "Valider" }).click();

    await expect(car(panel(page), "Marc")).toBeVisible();
    const now = await rides(db, seededEvent.id);
    expect(now).toHaveLength(1);
    expect(now[0].id).not.toBe(first.id);
  });

  // Decision (#168): sent again from a page that never got the answer showing the car, the offer recreates it.
  test("an answer lost, the car removed from another page of the device, then sent again: one car, recreated", async ({ context, db, page, seededEvent }) => {
    let lost = false;
    await page.route("**/e/**", async (route) => {
      if (!lost && route.request().headers()["next-action"] && route.request().postData()?.includes("Mairie de Vitré")) {
        lost = true;
        await route.fetch();
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await offer(page);
    await expect(alerts(form(page))).toHaveText(FAILED);
    const [written] = await rides(db, seededEvent.id);

    const other = await context.newPage();
    await other.goto(`/e/${seededEvent.id}`);
    await remove(other);
    await other.goto("about:blank");
    expect(await rides(db, seededEvent.id)).toHaveLength(0);

    await form(page).getByRole("button", { name: "Valider" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(car(panel(page), "Marc")).toBeVisible();
    expect(await rides(db, seededEvent.id)).toEqual([written]);
  });
});
