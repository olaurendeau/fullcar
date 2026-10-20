import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #221: the bar keeps the last success and every failure still waiting (« La barre de messages », v4.2.3, C11.10, C5.10).

// Each failure names who could not get in, and why (C11.11, #223).
const FAILED = "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
/** A cell's failure names the person, the leg and the button touched (C11.11, #224). */
const CELL_FAILED = "Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
const PAUL = "Tom n’a pas pu monter dans la voiture de Paul. Une erreur est survenue : réessayez dans un instant.";
const HUGO = "Hugo est dans la voiture de Marc";

/**
 * The device holds Tom, Léa and Hugo. Aller: Sophie and Marc drive nobody (3 seats each); Tom
 * and Léa are without a car; Hugo is not concerned. Retour: Paul drives nobody; Tom is without a car.
 */
async function seedScene(db: Kysely<Database>, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo") };
  const cars = {
    sophie: await seedRide(db, eventId, await other("Sophie")),
    marc: await seedRide(db, eventId, await other("Marc"), { departureTime: "07:30:00" }),
    paul: await seedRide(db, eventId, await other("Paul"), { leg: "retour" }),
  };
  for (const personId of [persons.tom, persons.lea]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: persons.tom, eventId, leg: "retour", rideId: null });
  return { persons, cars };
}

const panel = (page: Page) => page.getByRole("tabpanel");
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });

/**
 * Opens the sheet of `driver`'s car, ticks or unticks `toggled`, sends it unless `toggled` is
 * null, and closes it before the answer. Next sends the page's actions one at a time: one sent
 * after another leaves once the first has its answer.
 */
async function sendThenClose(page: Page, driver: string, toggled: string[] | null = []) {
  await panel(page).getByRole("article", { name: `Voiture de ${driver}` }).getByRole("button", { name: /^Place libre/ }).first().click();
  const sheet = page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
  for (const name of toggled ?? []) await sheet.getByRole("checkbox", { name }).click();
  if (toggled) await sheet.getByRole("button", { name: /^Placer/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("the bar's messages", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  // The case of #216: Tom and Léa to Sophie's car, Hugo to Marc's, each sheet closed before its
  // answer; Sophie's fails, Marc's succeeds. In either order, the bar shows both, the failure first.
  for (const [order, closing] of [["the failure first", "« Fermer »"], ["the success first", "Escape"]] as const) {
    test(`C11.10, C5.10: the case of #216, ${order}: both stay, still 10 s later, until ${closing} takes them all`, async ({ page, seededEvent }) => {
      await page.clock.install();
      const sophie = await holdFirst(page, scene.cars.sophie, true);
      const marc = await holdFirst(page, scene.cars.marc, false);
      await page.goto(`/e/${seededEvent.id}`);
      const toSophie = () => sendThenClose(page, "Sophie");
      const toMarc = () => sendThenClose(page, "Marc", ["Tom", "Léa", "Hugo"]);
      for (const send of order === "the failure first" ? [toSophie, toMarc] : [toMarc, toSophie]) await send();
      const seen = await watchAlerts(page);
      if (order === "the failure first") await failHeld(page, sophie);
      marc();
      await expect(barStatus(page)).toHaveText(HUGO);
      if (order === "the success first") await failHeld(page, sophie);

      await expect(messages(page)).toHaveText([FAILED, HUGO]);
      await page.clock.fastForward(10_000);
      await expect(messages(page)).toHaveText([FAILED, HUGO]);
      // Each region says the last line written there, and nothing was written under a sheet.
      await expect(bar(page)).toHaveText(FAILED);
      await expect(barStatus(page)).toHaveText(HUGO);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });

      // The focus goes to the landmark of the line written last: Marc's car, or Sophie's.
      if (closing === "Escape") {
        await barClose(page).focus();
        await page.keyboard.press("Escape");
      } else await barClose(page).click();
      await expect(messages(page)).toHaveCount(0);
      await expect(bar(page)).toBeEmpty();
      await expect(barStatus(page)).toBeEmpty();
      await expect(title(page, order === "the failure first" ? "Marc" : "Sophie")).toBeFocused();
    });
  }

  test("C11.10, rule 8: « Fermer », the most recent line's landmark on the other tab: the next line's, on this one", async ({ page, seededEvent }) => {
    const paul = await holdFirst(page, scene.cars.paul, true);
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(async () => {
      await tab(page, "Retour").click();
      await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true", { timeout: 500 });
    }).toPass();
    await sendThenClose(page, "Paul");
    await tab(page, "Aller").click();
    await sendThenClose(page, "Sophie");
    await tab(page, "Retour").click();
    await failHeld(page, paul);
    await expect(messages(page)).toHaveText([PAUL]);
    await failHeld(page, sophie);
    await expect(messages(page)).toHaveText([FAILED, PAUL]);

    await barClose(page).click();
    await expect(messages(page)).toHaveCount(0);
    // Sophie's car is on the Aller tab, mounted but hidden: the focus goes to Paul's, and the tab stays.
    await expect(title(page, "Paul")).toBeFocused();
    await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");
  });

  // #222: a line moves the focus only when the element that had it is gone (« Le focus après une
  // action », rule 8); a focus put on nothing, as a tap on the page's text does on a phone, stays.
  test("a cell's failure from a sheet closed since, the focus put on nothing: it stays there, and the page does not scroll", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, scene.persons.tom, true);
    await page.goto(`/e/${seededEvent.id}`);
    const tomAller = page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Tom, Aller : / });
    await tomAller.click();
    await page.getByRole("dialog", { name: "Tom · Aller" }).getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tomAller).toBeFocused();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).blur();
      window.scrollTo(0, document.body.scrollHeight);
    });
    const scrolled = await page.evaluate(() => window.scrollY);

    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([CELL_FAILED]);
    await expect(bar(page)).toHaveText(CELL_FAILED);
    expect(await page.evaluate(() => [document.activeElement === document.body, window.scrollY])).toEqual([true, scrolled]);
  });

  // #222: the second tap sends nothing while the first is on its way, so it covers nothing either.
  test("a cell's action tapped twice before its answer, the sheet closed, the first send failing: the failure is said", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, scene.persons.tom, true);
    const sent: string[] = [];
    page.on("request", (request) => void (request.postData()?.includes(scene.persons.tom) && sent.push(request.method())));
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Tom, Aller : / }).click();
    const action = page.getByRole("dialog", { name: "Tom · Aller" }).getByRole("button", { name: "Ne fait pas l’aller" });
    await action.click();
    await action.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([CELL_FAILED]);
    await expect(bar(page)).toHaveText(CELL_FAILED);
    expect(sent).toEqual(["POST"]);
  });

  test("C11.10: a failure offline stays once the connection and the `online` event are back", async ({ context, page, seededEvent }) => {
    let lose = () => {};
    const lost = new Promise<void>((resolve) => (lose = resolve));
    await page.route("**/e/**", async (route) => {
      if (!route.request().postData()?.includes(scene.cars.sophie)) return route.fallback();
      await lost;
      return route.abort();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    await context.setOffline(true);
    lose();
    const offline = "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez.";
    await expect(messages(page)).toHaveText([offline]);
    await expect(messages(page).locator("svg.lucide-wifi-off")).toHaveCount(1);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    // Once more around a sheet: by then, anything the network's return took away would be gone.
    await sendThenClose(page, "Marc", null);
    await expect(messages(page)).toHaveText([offline]);
  });
});
