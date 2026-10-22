import type { Locator, Page, Request, Route } from "@playwright/test";
import { messages } from "./device";
import { editEventInDb } from "./event-db";
import { leaveNoToken } from "./fixtures";
import { expect, holdActionsWith, isAction, oneCharOff, organiserPath, seedOrganiserScene, test } from "./organiser";

/*
 * #268, epic #250 (organizer-view v3.3.6, « Modifier l’événement »): the button in the organiser's
 * card, and its sheet, which saves the title, the place and the dates. Each test runs under the
 * fixture `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a
 * number: a request is named or counted, a string that may carry the token is a boolean.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

// The seed (src/db/test-events.ts): « Tournoi de Rennes », Gymnase des Gayeulles, 2026-12-12 from 07:30 to 18:00.
const FR = {
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  notAfter: "La fin doit être après le début.",
  offline: "Action impossible, vérifiez la connexion",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
};

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const editButton = (page: Page) => page.getByRole("button", { name: FR.edit, exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const header = (page: Page) => page.locator("header").first();
const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));

/** The changes sent from now on: the server actions whose body carries the form's fields. Counted, never shown. */
function edits(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"allerDate"')) sent.push(request);
  });
  return sent;
}

/** The organiser's page, then the sheet opened once its panel shows. */
async function openSheet(page: Page, path: string) {
  await page.goto(path);
  await editButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

/** The device's date, `days` from today, as an `<input type="date">` takes it. */
function deviceDate(page: Page, days: number): Promise<string> {
  return page.evaluate((days) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  }, days);
}

for (const viewport of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
  test(`M1.1, O4.1: at ${viewport.width} px, one « Modifier l’événement », after « Gardez ce lien » and before the sections`, async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedOrganiserScene(db, seededEvent.id);
    await page.setViewportSize(viewport);
    await page.goto(organiserPath(seededEvent));
    await expect(editButton(page)).toHaveCount(1);
    await expect(panel(page).getByRole("button", { name: FR.edit, exact: true })).toBeVisible();
    const button = await box(editButton(page));
    expect(button.height).toBeGreaterThanOrEqual(44);

    const handle = await editButton(page).elementHandle();
    const follows = (locator: Locator) =>
      locator.evaluate((element, button) => !!(element.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_FOLLOWING), handle);
    const precedes = (locator: Locator) =>
      locator.evaluate((element, button) => !!(element.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_PRECEDING), handle);
    expect(await follows(panel(page).getByRole("note"))).toBe(true);
    expect(await precedes(panel(page).getByRole("heading", { level: 3 }).first())).toBe(true);

    const share = await box(panel(page).getByRole("group", { name: "Lien à partager" }));
    const admin = await box(panel(page).getByRole("group", { name: "Lien d’organisateur" }));
    const note = await box(panel(page).getByRole("note"));
    const section = await box(panel(page).getByRole("heading", { level: 3 }).first());
    // The panel's left edge, inside its padding: where the links start.
    expect(Math.abs(button.x - share.x)).toBeLessThanOrEqual(1);
    expect(button.y + button.height).toBeLessThanOrEqual(section.y);
    if (viewport.width === 360) {
      expect(Math.abs(button.width - share.width)).toBeLessThanOrEqual(1);
      expect(button.y).toBeGreaterThanOrEqual(note.y + note.height);
    } else {
      expect(button.width).toBeLessThan(share.width);
      expect(button.y).toBeGreaterThanOrEqual(Math.max(share.y + share.height, admin.y + admin.height, note.y + note.height));
    }
  });
}

test("M1.3: no « Modifier l’événement » while the panel loads, on an invalid link, after a failed check, nor on /e/{id}", async ({
  page,
  seededEvent,
}) => {
  const held = await holdActionsWith(page, seededEvent.token);
  await page.goto(organiserPath(seededEvent));
  await expect(page.getByText("Chargement de l’espace organisateur…")).toBeVisible();
  await expect.poll(held.held).toBe(1);
  await expect(editButton(page)).toHaveCount(0);
  await held.fail();
  await expect(page.getByText("Le lien d’organisateur n’a pas pu être vérifié.")).toBeVisible();
  await expect(editButton(page)).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await page.goto(`/e/${seededEvent.id}/admin#${oneCharOff(seededEvent.token)}`);
  await expect(page.getByText("Ce lien d’organisateur n’est pas valide.")).toBeVisible();
  await expect(editButton(page)).toHaveCount(0);

  await page.goto(`/e/${seededEvent.id}`);
  await expect(page.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true })).toBeEnabled();
  await expect(editButton(page)).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("M1.3: the page of /admin does not hold « Modifier l’événement »", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(page.locator("main noscript [role=note]")).toHaveCount(1);
    // Decision: the server's HTML, its scripts left out. Reason: every page's scripts carry all the
    // client's messages (`NextIntlClientProvider`), this one's words included, shown or not.
    const shown = await page.evaluate(() => {
      const html = document.documentElement.cloneNode(true) as HTMLElement;
      for (const script of html.querySelectorAll("script")) script.remove();
      return html.outerHTML;
    });
    expect(shown.includes(FR.edit)).toBe(false);
    await expect(editButton(page)).toHaveCount(0);
  });
});

test("M1.5: the sheet opens with no request, on the saved values, no option, the focus on « Titre »", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await expect(editButton(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  let sent = 0;
  page.on("request", () => (sent += 1));
  await editButton(page).click();

  await expect(sheet(page)).toBeVisible();
  await expect(field(page, "Titre")).toBeFocused();
  for (const [label, value] of [
    ["Titre", "Tournoi de Rennes"],
    ["Lieu", "Gymnase des Gayeulles"],
    ["Date de début", "2026-12-12"],
    ["Heure de début", "07:30"],
    ["Date de fin", "2026-12-12"],
    ["Heure de fin", "18:00"],
  ]) {
    await expect(field(page, label)).toHaveValue(value);
  }
  await expect(retourBox(page)).toBeChecked();
  await expect(sheet(page).getByText(/Rehausseurs|Participation aux frais|Points de RDV|Options/)).toHaveCount(0);
  await expect(sheet(page).getByRole("checkbox")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect(sent, "requests sent by opening the sheet").toBe(0);
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("M1.6: the box unchecked, no end; checked, the end date is the start's and follows it, the end time empty", async ({
    page,
    seededEvent,
  }) => {
    await openSheet(page, organiserPath(seededEvent));
    await expect(retourBox(page)).not.toBeChecked();
    await expect(field(page, "Date de fin")).toHaveCount(0);
    await expect(field(page, "Heure de fin")).toHaveCount(0);
    await retourBox(page).click();
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-12");
    await expect(field(page, "Heure de fin")).toHaveValue("");
    await field(page, "Date de début").fill("2026-12-13");
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-13");
  });
});

test.describe("M1.7: the end date follows the start date as the event loaded", () => {
  test("start and end on the 12th: the end follows until it is changed", async ({ page, seededEvent }) => {
    const sent = edits(page);
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Date de début").fill("2026-12-13");
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-13");
    await field(page, "Date de fin").fill("2026-12-14");
    await field(page, "Date de début").fill("2026-12-15");
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-14");
    await submit(page).click();
    await expect(field(page, "Date de fin")).toHaveAccessibleDescription(FR.notAfter);
    expect(sent.length).toBe(0);
  });

  test("start on the 12th, end on the 13th: the end does not follow", async ({ page, db, seededEvent }) => {
    await editEventInDb(db, seededEvent.id, { retourAt: "2026-12-13 18:00:00" });
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Date de début").fill("2026-12-14");
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-13");
    await submit(page).click();
    await expect(field(page, "Date de fin")).toHaveAccessibleDescription(FR.notAfter);
  });
});

test("M2.1, M2.2: the title, the place and the start saved: the sheet closes, the page shows them, the bar says so", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedOrganiserScene(db, seededEvent.id);
  const options = () =>
    db
      .selectFrom("event")
      .select(["boosters_enabled", "participation_enabled", "stops_enabled"])
      .where("id", "=", seededEvent.id)
      .executeTakeFirstOrThrow();
  const before = await options();
  const sent = edits(page);
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Titre").fill("Tournoi de Rennes U13");
  await field(page, "Lieu").fill("Salle Carrel");
  await field(page, "Heure de début").fill("14:00");
  // The read of the screen that follows, held: the page shows the answer's values before it.
  const reads = { held: [] as Route[], on: true };
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) =>
      reads.on && isAction(route.request()) && !(route.request().postData() ?? "").includes('"allerDate"')
        ? void reads.held.push(route)
        : route.fallback(),
  );
  await submit(page).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
  // Next sends one action at a time: the board's read waits for the panel's.
  await expect.poll(() => reads.held.length).toBe(1);
  const shown = async () => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes U13");
    await expect(header(page)).toContainText("Salle Carrel");
    await expect(header(page).locator("dd").first()).toHaveText(/à 14:00$/);
    await expect(panel(page).getByRole("region", { name: "Aller", exact: true })).toContainText("14:00");
    await expect(page).toHaveTitle("Tournoi de Rennes U13");
  };
  await shown();
  await expect(messages(page)).toHaveText([FR.saved]);
  reads.on = false;
  for (const route of reads.held) await route.fallback();

  // M2.2: the token in the body of the request, once, and nowhere else (`organiserTraffic` checks the rest).
  expect(sent.length).toBe(1);
  const [request] = sent;
  const { token } = seededEvent;
  expect((request.postData() ?? "").split(token).length - 1, "times the token is in the request's body").toBe(1);
  expect(request.url().includes(token), "the token in the request's URL").toBe(false);
  expect(JSON.stringify(await request.allHeaders()).includes(token), "the token in the request's headers").toBe(false);
  const response = await request.response();
  expect(JSON.stringify(await response!.allHeaders()).includes(token), "the token in the answer's headers").toBe(false);

  await page.reload();
  await shown();
  expect(await options()).toEqual(before);
});

test("M2.3: the creation's rules, in the browser: each error under its field, the focus on the first, and no request", async ({
  page,
  seededEvent,
}) => {
  const sent = edits(page);
  await openSheet(page, organiserPath(seededEvent));
  for (const [title, error] of [
    ["", "Champ requis."],
    ["x".repeat(81), "80 caractères au maximum."],
  ]) {
    await field(page, "Titre").fill(title);
    await submit(page).click();
    await expect(field(page, "Titre")).toHaveAccessibleDescription(error);
    await expect(field(page, "Titre")).toBeFocused();
  }
  await field(page, "Titre").fill("Tournoi de Rennes U13");

  await field(page, "Heure de fin").fill("07:00");
  await submit(page).click();
  await expect(field(page, "Heure de fin")).toHaveAccessibleDescription(FR.notAfter);
  await expect(field(page, "Heure de fin")).toBeFocused();
  await field(page, "Heure de fin").fill("18:00");
  await field(page, "Date de fin").fill("2026-12-11");
  await field(page, "Lieu").fill("");
  await submit(page).click();
  await expect(field(page, "Date de fin")).toHaveAccessibleDescription(FR.notAfter);
  await expect(field(page, "Lieu")).toHaveAccessibleDescription("Champ requis.");
  await expect(field(page, "Lieu")).toBeFocused();
  expect(sent.length).toBe(0);
});

test("M2.4: an event of yesterday: a kept date passes; a date changed follows the creation's bounds", async ({ page, db, seededEvent }) => {
  await page.goto("/icon.svg");
  const yesterday = await deviceDate(page, -1);
  await editEventInDb(db, seededEvent.id, { allerAt: `${yesterday} 10:00:00`, retourAt: `${yesterday} 18:00:00` });
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Lieu").fill("Salle Carrel");
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
  const stored = () => db.selectFrom("event").select(["location", "aller_at"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
  expect(await stored()).toEqual({ location: "Salle Carrel", aller_at: `${yesterday} 10:00:00` });

  await editButton(page).click();
  await field(page, "Date de début").fill(await deviceDate(page, -2));
  await submit(page).click();
  await expect(field(page, "Date de début")).toHaveAccessibleDescription("Cette date est déjà passée.");
  await field(page, "Date de début").fill(await deviceDate(page, 366));
  await submit(page).click();
  await expect(field(page, "Date de début")).toHaveAccessibleDescription("Pas plus d’un an à l’avance.");
});

test("M2.5: « Valider » with nothing changed, or a title changed then put back: the sheet closes, no request, no message", async ({
  page,
  seededEvent,
}) => {
  const sent = edits(page);
  await openSheet(page, organiserPath(seededEvent));
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);

  await editButton(page).click();
  await field(page, "Titre").fill("Tournoi de Vannes");
  await field(page, "Titre").fill("Tournoi de Rennes");
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
  await page.waitForLoadState("networkidle");
  expect(sent.length).toBe(0);
  await expect(messages(page)).toHaveCount(0);
});

for (const close of ["Annuler", "Escape"] as const) {
  test(`M2.7: ${close} after a change: no request, the focus on « Modifier l’événement », the saved title again`, async ({
    page,
    seededEvent,
  }) => {
    const sent = edits(page);
    await page.goto(organiserPath(seededEvent));
    // A click that does not focus the button, as Safari's: the focus still comes back to it.
    await editButton(page).evaluate((button: HTMLElement) => button.click());
    await field(page, "Titre").fill("Tournoi de Vannes");
    if (close === "Escape") await page.keyboard.press("Escape");
    else await sheet(page).getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    await editButton(page).click();
    await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes");
    expect(sent.length).toBe(0);
  });
}

test("M7.4: once changed, /e/{id} says nothing of it, and no request goes to another origin", async ({ page, context, seededEvent }) => {
  const origins = new Set<string>();
  context.on("request", (request) => origins.add(new URL(request.url()).origin));
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Titre").fill("Tournoi de Rennes U13");
  await submit(page).click();
  await expect(messages(page)).toHaveText([FR.saved]);

  const participant = await context.newPage();
  await participant.goto(`/e/${seededEvent.id}`);
  await expect(participant.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes U13");
  await expect(participant.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true })).toBeEnabled();
  await expect(participant.getByText(/modifié/i)).toHaveCount(0);
  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test("M8.1: offline, then a server error: the sheet says so, keeps what was typed, the focus on « Valider »; nothing written", async ({
  page,
  context,
  db,
  seededEvent,
}) => {
  const title = () => db.selectFrom("event").select("title").where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
  await openSheet(page, organiserPath(seededEvent));
  await field(page, "Titre").fill("Tournoi de Rennes U13");
  await context.setOffline(true);
  await submit(page).click();
  await expect(sheet(page).getByRole("alert")).toHaveText(FR.offline);
  await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes U13");
  await expect(submit(page)).toBeFocused();
  await expect(submit(page)).not.toHaveAttribute("aria-disabled");
  await context.setOffline(false);

  const held = await holdActionsWith(page, '"allerDate"');
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await expect(submit(page)).toHaveAttribute("aria-disabled", "true");
  await held.fail();
  await expect(sheet(page).getByRole("alert")).toHaveText(FR.failed);
  await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes U13");
  await expect(submit(page)).toBeFocused();
  await expect(submit(page)).not.toHaveAttribute("aria-disabled");
  expect(await title()).toEqual({ title: "Tournoi de Rennes" });
});
