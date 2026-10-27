import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { animationsDone, holdFirst, holdToken, messages, newToken, recordBar } from "./device";
import { editEventInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";
import { areaEditButton, holdActionsWith, organiserPath, test as organiserTest } from "./organiser";
import { answerFor } from "./photon";
import { namedPlace, textOf } from "./place-field";

leaveNoToken();
test.use({ locale: "fr-FR" });
organiserTest.use({ locale: "fr-FR" });

// #768 (event-board v4.7, G1): « back » closes the open sheet as Escape does, or leaves its step; closed otherwise, it leaves no entry.

type Db = Kysely<Database>;
const CLAIRE_PHONE = "06 11 22 33 44";
const SEATS = "Places, sans compter qui conduit";
const NOTE = "Note (facultatif)";
const STEP = "Qui sort de la voiture ?";
const SOPHIE = "Qui monte dans la voiture de Sophie ?";

/**
 * The device holds Claire (a number), Tom and Léa. Aller: Claire drives Nina and Paul (3 seats), Sophie drives nobody
 * (3 seats), Tom and Léa are without a car. Retour: Zoé drives nobody, Léa is without a car. The others are of other devices.
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string, phone: string | null = null) => (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const claire = await mine("Claire", CLAIRE_PHONE);
  const tom = await mine("Tom");
  const lea = await mine("Léa");
  const car = await seedRide(db, eventId, claire, { departureTime: "07:00:00", note: "Coffre plein" });
  await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:15:00" });
  await seedRide(db, eventId, await other("Zoé"), { leg: "retour", departureTime: "18:30:00" });
  for (const firstName of ["Nina", "Paul"]) await seedPlacement(db, { personId: await other(firstName), eventId, leg: "aller", rideId: car });
  for (const personId of [tom, lea]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea, eventId, leg: "retour", rideId: null });
  return { claire, tom, lea, car, paul: await personNamed(db, eventId, "Paul") };
}

async function personNamed(db: Db, eventId: string, firstName: string) {
  return (await db.selectFrom("person").select("id").where("event_id", "=", eventId).where("first_name", "=", firstName).executeTakeFirstOrThrow()).id;
}

const dialogs = (page: Page) => page.locator('[role="dialog"], [role="alertdialog"]');
const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });
const panel = (page: Page) => page.getByRole("tabpanel");
const card = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const nameButton = (page: Page, firstName: string) => section(page).getByRole("button", { name: firstName, exact: true });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const freeSeat = (page: Page, driver: string) => card(page, driver).getByRole("button", { name: /^Place libre : / }).first();
const button = (scope: Locator, name: string | RegExp) => scope.getByRole("button", { name, exact: typeof name === "string" });

type Marked = { __g1?: number };
/** On `/` first, then `path`: leaving the page means `/` again. Marked, to tell a reload. */
async function arrive(page: Page, path: string) {
  await page.goto("/");
  await page.goto(path);
  // Hydrated: Next has written its state, which an opening adds to.
  await page.waitForFunction(() => history.state?.__NA === true);
  await page.evaluate(() => ((window as Marked).__g1 = 1));
}

/** Neither reloaded since `arrive`, nor any document, RSC read or server action among `requests`. */
async function stayed(page: Page, requests: string[]) {
  expect(await page.evaluate(() => (window as Marked).__g1), "the page was reloaded").toBe(1);
  expect(requests, "a document, an RSC read or an action was requested").toEqual([]);
}

/** The documents, RSC reads and server actions requested from now on, by kind: never their address. */
function requests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (headers["next-router-prefetch"]) return;
    const rsc = headers.rsc !== undefined || new URL(request.url()).searchParams.has("_rsc");
    if (request.resourceType() === "document" || rsc || headers["next-action"]) seen.push(headers["next-action"] ? "action" : request.resourceType());
  });
  return seen;
}

/** Back, the sheet closed, the page where it was: its address, without a reload or a request. */
async function backCloses(page: Page) {
  const url = page.url();
  const seen = requests(page);
  await page.goBack();
  await expect(dialogs(page)).toHaveCount(0);
  expect(page.url() === url, "the address changed").toBe(true);
  await stayed(page, seen);
}

/** Back leaves the page: `/` again. */
async function backLeaves(page: Page) {
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname, { message: "the page was not left" }).toBe("/");
  await page.waitForLoadState("networkidle"); // Its scripts read whole: the organiser's checks read every answer.
}

const length = (page: Page) => page.evaluate(() => history.length);
const historyState = (page: Page) => page.evaluate(() => history.state as Record<string, unknown>);

/** G1.7, G1.14: opened by `open`, the address is the same, and one key more in `history.state`, which says nothing of `secrets`. */
async function opensOneEntry(page: Page, open: () => Promise<unknown>, secrets: string[]) {
  const url = page.url();
  const before = await historyState(page);
  await open();
  await expect.poll(async () => Object.keys(await historyState(page)).length).toBe(Object.keys(before).length + 1);
  const after = await historyState(page);
  expect(page.url() === url, "the address changed").toBe(true);
  for (const [key, value] of Object.entries(before)) expect(after[key]).toEqual(value);
  const added = Object.keys(after).find((key) => !(key in before))!;
  const kept = JSON.stringify(after[added]);
  for (const secret of secrets) expect(kept.includes(secret), "the history holds a person's data").toBe(false);
}

/** The element that has the focus: its tag and its accessible text. */
const focused = (page: Page) =>
  page.evaluate(() => (({ tagName, ariaLabel, textContent }: HTMLElement) => `${tagName} ${ariaLabel ?? textContent?.trim().slice(0, 60)}`)(document.activeElement as HTMLElement));

/** « Modifier Claire », from the sheet of her first name. */
async function editClaire(page: Page, firstName = "Claire") {
  await nameButton(page, firstName).click();
  await button(dialog(page, firstName), "Modifier").click();
  await expect(dialog(page, `Modifier ${firstName}`).getByLabel("Prénom")).toBeFocused();
}

/** A new number for `firstName`, in her open « Modifier » form, then « Valider ». */
async function savePhone(page: Page, firstName: string, phone: string) {
  await dialog(page, `Modifier ${firstName}`).getByLabel("Téléphone (facultatif)").fill(phone);
  await button(dialog(page, `Modifier ${firstName}`), "Valider").click();
}

/** The sheets of G1.1: each opened from the page, with something typed or changed. */
const SHEETS: { name: string; open: (page: Page) => Promise<unknown> }[] = [
  { name: "« Tom · Aller »", open: (page) => cell(page, "Tom", "Aller").click() },
  { name: "« Claire »", open: (page) => nameButton(page, "Claire").click() },
  { name: "« Modifier Claire »", open: async (page) => (await editClaire(page), await dialog(page, "Modifier Claire").getByLabel("Prénom").fill("Clara")) },
  {
    name: "« Ajouter une personne », from the Aller tab",
    open: async (page) => (await button(panel(page), "Ajouter une personne").click(), await dialog(page, "Ajouter une personne").getByLabel("Prénom").fill("Inès")),
  },
  { name: SOPHIE, open: (page) => freeSeat(page, "Sophie").click() },
  {
    name: "« Proposer une voiture »",
    open: async (page) => {
      await button(panel(page), "Proposer une voiture").first().click();
      await dialog(page, "Proposer une voiture").getByLabel("Une nouvelle personne").check();
      await dialog(page, "Proposer une voiture").getByLabel("Prénom").fill("Marc");
    },
  },
  {
    name: "« Modifier la voiture »",
    open: async (page) => (await button(card(page, "Claire"), "Modifier").click(), await dialog(page, "Modifier la voiture").getByLabel(NOTE).fill("Gilets jaunes")),
  },
];

test.describe("the back gesture on the event's page", () => {
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
  });

  const visit = async (page: Page, eventId: string) => {
    await holdToken(page, eventId, token);
    await arrive(page, `/e/${eventId}`);
  };

  test("G1.1, G1.7, G1.14: each sheet, one entry with nothing of a person; back closes it, without a reload or a request", async ({ db, page, seededEvent }) => {
    await visit(page, seededEvent.id);
    for (const { name, open } of SHEETS) {
      await test.step(name, async () => {
        await opensOneEntry(page, () => open(page), ["Clara", "Claire", "Inès", "Marc", "Gilets", "11 22 33", token]);
        await backCloses(page);
      });
    }
    expect(await db.selectFrom("person").select("first_name").where("id", "=", scene.claire).executeTakeFirstOrThrow()).toEqual({ first_name: "Claire" });
    expect(await db.selectFrom("ride").select("note").where("id", "=", scene.car).executeTakeFirstOrThrow()).toEqual({ note: "Coffre plein" });
    await backLeaves(page);
  });

  test("G1.18, G1.1: without a sheet, the first back leaves the page; the first registration from a free seat", async ({ page, seededEvent }) => {
    await arrive(page, `/e/${seededEvent.id}`);
    await expect(freeSeat(page, "Sophie")).toBeVisible();
    await backLeaves(page);
    await arrive(page, `/e/${seededEvent.id}`);
    await freeSeat(page, "Sophie").click();
    await dialog(page, "Ajouter une personne").getByLabel("Prénom").fill("Inès");
    await backCloses(page);
    await backLeaves(page);
  });

  test("G1.2: as Escape: the same focus, the page where it was, the bar untouched", async ({ page, seededEvent }) => {
    await visit(page, seededEvent.id);
    const record = await recordBar(page);
    const shown = await messages(page).allTextContents();
    const opening: [string, (page: Page) => Promise<unknown>, Locator][] = [
      ["« Tom · Aller »", (page) => cell(page, "Tom", "Aller").click(), cell(page, "Tom", "Aller")],
      ["« Claire »", (page) => nameButton(page, "Claire").click(), nameButton(page, "Claire")],
      ["« Modifier Claire »", SHEETS[2].open, nameButton(page, "Claire")],
      ["« Proposer une voiture »", SHEETS[5].open, button(panel(page), "Proposer une voiture").first()],
      [SOPHIE, SHEETS[4].open, freeSeat(page, "Sophie")],
    ];
    for (const [name, open, opener] of opening) {
      await test.step(name, async () => {
        const closed = async (close: () => Promise<unknown>) => {
          await opener.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
          const scrolled = await page.evaluate(() => window.scrollY);
          await open(page);
          await expect(dialogs(page)).toHaveCount(1);
          await close();
          await expect(dialogs(page)).toHaveCount(0);
          expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThanOrEqual(1);
          return focused(page);
        };
        const escaped = await closed(() => page.keyboard.press("Escape"));
        const back = await closed(() => page.goBack());
        expect(back).toBe(escaped);
      });
    }
    await expect(messages(page)).toHaveText(shown);
    expect((await record()).writes).toEqual([]);
    await backLeaves(page);
  });

  test("G1.4: one back, one step; two at once leave the page, and forward comes back without a sheet", async ({ page, seededEvent }) => {
    await visit(page, seededEvent.id);
    await SHEETS[2].open(page);
    await page.goBack();
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe(`/e/${seededEvent.id}`);
    await expect(dialogs(page)).toHaveCount(0);
    await backLeaves(page);

    await page.goForward();
    await SHEETS[2].open(page);
    await page.goBack();
    await backLeaves(page);
    await page.goForward();
    await expect(nameButton(page, "Claire")).toBeVisible();
    await expect(dialogs(page)).toHaveCount(0);
  });

  /** The action `name` of the cell `title`, then `target`, in view and with the focus 1 000 ms later. */
  async function actionStays(page: Page, [title, name]: [string, string], target: Locator) {
    const [firstName, leg] = title.split(" · ") as [string, "Aller" | "Retour"];
    await cell(page, firstName, leg).click();
    await button(dialog(page, title), name).click();
    await page.waitForTimeout(1_000);
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport({ ratio: 1 });
  }

  test("G1.5, G1.10: closed otherwise, a sheet leaves no entry, and what its action did stays", async ({ page, seededEvent }) => {
    const tom = (page: Page) => dialog(page, "Tom · Aller");
    const ways: [string, (page: Page) => Promise<unknown>][] = [
      ["« Fermer »", async (page) => (await SHEETS[0].open(page), await button(tom(page), "Fermer").click())],
      ["Escape", async (page) => (await SHEETS[0].open(page), await page.keyboard.press("Escape"))],
      ["the overlay", async (page) => (await SHEETS[0].open(page), await animationsDone(tom(page)), await page.mouse.click(180, 10))],
      ["« Valider » without a change", async (page) => (await editClaire(page), await button(dialog(page, "Modifier Claire"), "Valider").click())],
      ["« Valider » that saves", async (page) => (await editClaire(page), await savePhone(page, "Claire", "07 12 12 12 12"))],
      // G1.10: 1 000 ms after, what the action scrolled to is still whole in view, with the focus.
      ["« Trouver une place »", (page) => actionStays(page, ["Léa · Retour", "Trouver une place"], freeSeat(page, "Zoé"))],
      ["« Voir la voiture »", (page) => actionStays(page, ["Claire · Aller", "Voir la voiture"], page.getByRole("heading", { name: "Voiture de Claire" }))],
      ["« Placer 2 personnes »", async (page) => (await SHEETS[4].open(page), await button(dialog(page, SOPHIE), "Placer 2 personnes").click())],
      ["« Ne fait pas l’aller »", async (page) => (await SHEETS[0].open(page), await button(tom(page), "Ne fait pas l’aller").click())],
    ];
    for (const [name, close] of ways) {
      await test.step(name, async () => {
        await visit(page, seededEvent.id);
        await close(page);
        await expect(dialogs(page)).toHaveCount(0);
        await backLeaves(page);
      });
    }
  });

  test("G1.6, G1.9: no more than one entry at a time, reopened at once included; tabs and the fold add none", async ({ page, seededEvent }) => {
    await visit(page, seededEvent.id);
    const start = await length(page);
    const tom = () => cell(page, "Tom", "Aller").click();
    const closings: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
      ["« Fermer »", tom, () => button(dialog(page, "Tom · Aller"), "Fermer").click()],
      ["Escape", tom, () => page.keyboard.press("Escape")],
      ["the overlay", tom, () => page.mouse.click(180, 10)],
      ["« Valider »", () => editClaire(page), () => button(dialog(page, "Modifier Claire"), "Valider").click()],
      ["back", tom, () => page.goBack()],
    ];
    for (const [name, open, close] of closings) {
      await test.step(name, async () => {
        await open();
        await expect(dialogs(page)).toHaveCount(1);
        await animationsDone(dialogs(page));
        expect(await length(page)).toBeLessThanOrEqual(start + 1);
        await close();
        await expect(dialogs(page)).toHaveCount(0);
        expect(await length(page)).toBeLessThanOrEqual(start + 1);
      });
    }
    const now = await length(page);
    await page.getByRole("tab", { name: /^Retour/ }).click();
    await page.getByRole("tab", { name: /^Aller/ }).click();
    await section(page).getByRole("button", { name: /^Vos inscriptions/ }).click();
    await section(page).getByRole("button", { name: /^Vos inscriptions/ }).click();
    expect(await length(page)).toBe(now);
    // G1.9: closed then reopened at once, it stays open; back closes it, the next leaves.
    await tom();
    await button(dialog(page, "Tom · Aller"), "Fermer").click();
    await cell(page, "Tom", "Aller").click({ force: true });
    await page.waitForTimeout(1_000);
    await expect(dialog(page, "Tom · Aller")).toBeVisible();
    await backCloses(page);
    await backLeaves(page);
  });

  test("G1.3, G1.11: offline, back says nothing; failed then saved, no entry left; back while it sends, as Escape", async ({ context, db, page, seededEvent }) => {
    await visit(page, seededEvent.id);
    await SHEETS[2].open(page);
    await context.setOffline(true);
    await page.goBack();
    await expect(dialogs(page)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    await expect(page.getByText("Action impossible, vérifiez la connexion")).toHaveCount(0);
    await SHEETS[2].open(page);
    await button(dialog(page, "Modifier Claire"), "Valider").click();
    await expect(dialog(page, "Modifier Claire").getByRole("alert").filter({ hasText: /\S/ })).not.toHaveCount(0);
    await context.setOffline(false);
    await button(dialog(page, "Modifier Claire"), "Valider").click();
    await expect(dialogs(page)).toHaveCount(0);
    await backLeaves(page);

    // The number changed, its answer held: closed while it is sent, by Escape, then by back.
    const sent = async (close: () => Promise<unknown>, phone: string) => {
      await visit(page, seededEvent.id);
      const answer = await holdFirst(page, phone, false);
      const answered = page.waitForResponse((response) => (response.request().postData() ?? "").includes(phone));
      await editClaire(page, "Clara");
      await savePhone(page, "Clara", phone);
      await close();
      await expect(dialogs(page)).toHaveCount(0);
      answer();
      await answered;
      // Saved, and what the page does of it done: the answer was not dropped.
      await expect.poll(async () => (await db.selectFrom("person").select("phone").where("id", "=", scene.claire).executeTakeFirstOrThrow()).phone).toBe(phone);
      await page.waitForTimeout(500);
      return messages(page).allTextContents();
    };
    const escaped = await sent(() => page.keyboard.press("Escape"), "07 12 12 12 12");
    const back = await sent(() => page.goBack(), "07 34 34 34 34");
    expect(back).toEqual(escaped);
    await backLeaves(page);
  });

  test("G1.12, G1.13: reloaded, or forward after a back: no sheet; one back without effect, then the next leaves", async ({ page, seededEvent }) => {
    await visit(page, seededEvent.id);
    await SHEETS[2].open(page);
    await page.reload();
    await expect(nameButton(page, "Claire")).toBeVisible();
    await expect(dialogs(page)).toHaveCount(0);
    await page.evaluate(() => ((window as Marked).__g1 = 1));
    await backCloses(page);
    expect(new URL(page.url()).pathname).toBe(`/e/${seededEvent.id}`);
    await backLeaves(page);

    await visit(page, seededEvent.id);
    await SHEETS[2].open(page);
    await backCloses(page);
    const seen = requests(page);
    await page.goForward();
    await expect(dialogs(page)).toHaveCount(0);
    await stayed(page, seen);
    await backCloses(page);
    await backLeaves(page);
  });

  test("G1.16: back from a list of places closes the list and the sheet", async ({ page, seededEvent }) => {
    await visit(page, seededEvent.id);
    const text = textOf("Gare");
    await answerFor(text, { features: [namedPlace("Gare", 45.73, 4.66).feature] });
    await button(panel(page), "Proposer une voiture").first().click();
    await dialog(page, "Proposer une voiture").getByRole("combobox", { name: "Lieu de départ" }).fill(text);
    await expect(page.getByRole("listbox")).toBeVisible();
    await backCloses(page);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test.describe("G1.17: a step goes back to the step before", () => {

    /** « Modifier la voiture » of Claire, 1 seat, the note changed, « Valider »: the step. */
    async function openStep(page: Page) {
      await button(card(page, "Claire"), "Modifier").click();
      const form = dialog(page, "Modifier la voiture");
      await form.getByLabel(SEATS).fill("1");
      await form.getByLabel(NOTE).fill("Gilets jaunes");
      await button(form, "Valider").click();
      await expect(dialog(page, STEP)).toBeVisible();
    }

    test("back: the form again, its changes kept, nothing sent; then the sheet closes, then the page", async ({ db, page, seededEvent }) => {
      await visit(page, seededEvent.id);
      const start = await length(page);
      await openStep(page);
      const seen = requests(page);
      await page.goBack();
      const form = dialog(page, "Modifier la voiture");
      await expect(form.getByLabel(SEATS)).toHaveValue("1");
      await expect(form.getByLabel(SEATS)).toBeFocused();
      await expect(form.getByLabel(NOTE)).toHaveValue("Gilets jaunes");
      await stayed(page, seen);
      expect(await db.selectFrom("ride").select(["seats", "note"]).where("id", "=", scene.car).executeTakeFirstOrThrow()).toEqual({ seats: 3, note: "Coffre plein" });
      expect(await length(page)).toBeLessThanOrEqual(start + 2);
      await backCloses(page);
      await backLeaves(page);
    });

    test("closed from the step, by Escape or its « Valider », no entry is left; after its « Annuler », back closes the sheet", async ({ page, seededEvent }) => {
      await visit(page, seededEvent.id);
      await openStep(page);
      await button(dialog(page, STEP), "Annuler").click();
      await expect(dialog(page, "Modifier la voiture")).toBeVisible();
      await backCloses(page);
      await backLeaves(page);
      const closings = [
        () => page.keyboard.press("Escape"),
        async () => (await dialog(page, STEP).getByRole("checkbox", { name: "Nina" }).check(), await button(dialog(page, STEP), "Valider").click()),
      ];
      for (const close of closings) {
        await visit(page, seededEvent.id);
        await openStep(page);
        await close();
        await expect(dialogs(page)).toHaveCount(0);
        await backLeaves(page);
      }
    });

    test("opened by the answer, and opened again for a new round: back goes back to the form", async ({ db, page, seededEvent }) => {
      await visit(page, seededEvent.id);
      await button(card(page, "Claire"), "Modifier").click();
      const form = dialog(page, "Modifier la voiture");
      await form.getByLabel(SEATS).fill("2");
      // Another device boards a third passenger: the server counts more than 2.
      const hugo = (await seedPerson(db, seededEvent.id, { firstName: "Hugo" })).id;
      await seedPlacement(db, { personId: hugo, eventId: seededEvent.id, leg: "aller", rideId: scene.car });
      await button(form, "Valider").click();
      const step = dialog(page, STEP);
      await expect(step).toBeVisible();
      const opened = await length(page);
      // Paul leaves and Inès boards, on another device: « Valider » of the step is refused, a new round of the same step.
      await db.updateTable("placement").set({ ride_id: null }).where("person_id", "=", scene.paul).where("leg", "=", "aller").execute();
      const ines = (await seedPerson(db, seededEvent.id, { firstName: "Inès" })).id;
      await seedPlacement(db, { personId: ines, eventId: seededEvent.id, leg: "aller", rideId: scene.car });
      await step.getByRole("checkbox", { name: "Nina" }).check();
      await button(step, "Valider").click();
      await expect(step.getByRole("alert")).toHaveText(/entre-temps/);
      await expect(step.getByRole("checkbox", { name: "Inès" })).toBeVisible();
      expect(await length(page)).toBe(opened);
      await page.goBack();
      await expect(form.getByLabel(SEATS)).toHaveValue("2");
      await backCloses(page);
      await backLeaves(page);
    });

    test("« Ajouter une personne » in a seat's sheet: back goes back to the list, Inès not created; registered, back closes", async ({ db, page, seededEvent }) => {
      const addInes = async () => {
        await visit(page, seededEvent.id);
        await freeSeat(page, "Sophie").click();
        await button(dialog(page, SOPHIE), "Ajouter une personne").click();
        await dialog(page, "Ajouter une personne").getByLabel("Prénom").fill("Inès");
      };
      await addInes();
      await page.goBack();
      await expect(dialog(page, SOPHIE).getByRole("checkbox", { name: "Tom" })).toBeVisible();
      await expect(button(dialog(page, SOPHIE), "Ajouter une personne")).toBeFocused();
      const ines = () => db.selectFrom("person").select("id").where("event_id", "=", seededEvent.id).where("first_name", "=", "Inès").execute();
      expect(await ines()).toEqual([]);
      await backCloses(page);
      await backLeaves(page);

      await addInes();
      await button(dialog(page, "Ajouter une personne"), "Valider").click();
      await expect(dialog(page, SOPHIE).getByRole("checkbox", { name: "Inès" })).toBeFocused();
      await backCloses(page);
      await backLeaves(page);
    });
  });

  test.describe("at 1280 × 800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
    test("G1.18: G1.1 and G1.5 (Escape) for « Modifier Claire »", async ({ page, seededEvent }) => {
      await visit(page, seededEvent.id);
      await SHEETS[2].open(page);
      await backCloses(page);
      await SHEETS[2].open(page);
      await page.keyboard.press("Escape");
      await expect(dialogs(page)).toHaveCount(0);
      await backLeaves(page);
    });
  });
});

/** M3.2's retour, shortened: Sophie drives Léa, Tom is without a car. Unchecked, it asks « Supprimer le retour ? » first. */
async function seedRetour(db: Db, eventId: string) {
  const sophie = (await seedPerson(db, eventId, { firstName: "Sophie" })).id;
  const rideId = await seedRide(db, eventId, sophie, { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: (await seedPerson(db, eventId, { firstName: "Léa" })).id, eventId, leg: "retour", rideId });
  await seedPlacement(db, { personId: (await seedPerson(db, eventId, { firstName: "Tom" })).id, eventId, leg: "retour", rideId: null });
}

organiserTest.describe("the back gesture in the organiser's area", () => {
  const editSheet = (page: Page) => dialog(page, "Modifier l’événement");
  const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Supprimer le retour ?" });
  const titleField = (page: Page) => editSheet(page).getByLabel("Titre", { exact: true });
  const retourBox = (page: Page) => editSheet(page).getByRole("checkbox", { name: "Retour", exact: true });
  const submit = (page: Page) => button(editSheet(page), "Valider");

  // G1.8 is in #860.
  organiserTest("G1.5: « Annuler » of « Modifier l’événement » leaves no entry", async ({ page, seededEvent }) => {
    await arrive(page, organiserPath(seededEvent));
    await areaEditButton(page).click();
    await button(editSheet(page), "Annuler").click();
    await expect(dialogs(page)).toHaveCount(0);
    await backLeaves(page);
  });

  organiserTest.describe("G1.15: « Supprimer le retour ? »", () => {
    organiserTest.beforeEach(async ({ db, seededEvent }) => seedRetour(db, seededEvent.id));

    /** « Retour » unchecked, the title changed, « Valider »: the confirmation, after the answer. */
    async function askRemoval(page: Page, path: string) {
      await arrive(page, path);
      await areaEditButton(page).click();
      await titleField(page).fill("Sortie au lac");
      await retourBox(page).click();
      await submit(page).click();
      await expect(confirmation(page)).toBeVisible();
    }

    organiserTest("back closes the confirmation alone, then the sheet, then leaves the page", async ({ page, seededEvent }) => {
      await askRemoval(page, organiserPath(seededEvent));
      const start = await length(page);
      await page.goBack();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(retourBox(page)).not.toBeChecked();
      await expect(titleField(page)).toHaveValue("Sortie au lac");
      await expect(submit(page)).toBeFocused();
      await backCloses(page);
      expect(await length(page)).toBe(start);
      await backLeaves(page);
    });

    organiserTest("« Annuler » of the confirmation: back closes the sheet; removed, `saved`: one back leaves the page", async ({ page, seededEvent }) => {
      await askRemoval(page, organiserPath(seededEvent));
      await button(confirmation(page), "Annuler").click();
      await expect(confirmation(page)).toHaveCount(0);
      await backCloses(page);
      await backLeaves(page);
      await askRemoval(page, organiserPath(seededEvent));
      await button(confirmation(page), "Supprimer le retour").click();
      await expect(dialogs(page)).toHaveCount(0);
      await backLeaves(page);
    });

    organiserTest("`changed` elsewhere meanwhile: the confirmation closes, the sheet says so; back closes it, the next leaves", async ({ db, page, seededEvent }) => {
      await askRemoval(page, organiserPath(seededEvent));
      await editEventInDb(db, seededEvent.id, { title: "Changé ailleurs" });
      await button(confirmation(page), "Supprimer le retour").click();
      await expect(confirmation(page)).toHaveCount(0);
      await expect(editSheet(page).getByText("L’événement vient d’être modifié depuis un autre appareil.")).toBeVisible();
      await backCloses(page);
      await backLeaves(page);
    });

    organiserTest("while the removal is sent, back leaves the confirmation open and sends nothing again", async ({ page, seededEvent }) => {
      await askRemoval(page, organiserPath(seededEvent));
      const held = await holdActionsWith(page, '"persons"');
      await button(confirmation(page), "Supprimer le retour").click();
      await expect.poll(held.held).toBe(1);
      await page.goBack();
      await page.waitForTimeout(500);
      await expect(confirmation(page)).toBeVisible();
      expect(held.held()).toBe(1);
      await held.release();
      await expect(dialogs(page)).toHaveCount(0);
    });
  });
});
