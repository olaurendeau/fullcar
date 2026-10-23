import type { Kysely } from "kysely";
import type { Page, Request, Route } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, isAction, organiserPath, test } from "./organiser";

/*
 * #273, epic #250 (organizer-view v3.3.8, decisions 39, 49 to 51): a change that gets no answer
 * for 10 s no longer shuts the organiser in. The confirmation of the retour's removal lets go
 * (M3.7, points 2 to 5), « Modifier l’événement » becomes active again (M2.11), and the late
 * answer is said where the organiser is: the sheet, or the bar. The clock is Playwright's
 * (`page.clock`). The focus is never on `<body>` (decisions 12 and 50). Each test runs under
 * `organiserTraffic` (O6.1, O2.10); nothing here prints the token, the admin link or a number.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const NOT_REMOVED = "L’événement n’a pas été modifié et le retour n’a pas été supprimé.";
const FR = {
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  offline: "Vérifiez la connexion, puis réessayez.",
  retourChanged: "Le retour a changé pendant la confirmation : il compte maintenant 3 voitures et 10 personnes. Utilisez de nouveau « Valider » pour confirmer.",
  gone: "Cet événement est introuvable : il a peut-être été supprimé.",
  body3: "Les 3 voitures proposées pour le retour seront retirées. 10 personnes ne seront plus inscrites au retour.",
};

const editButton = (page: Page) => page.getByRole("button", { name: FR.edit, exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const confirmation = (page: Page) => page.getByRole("alertdialog", { name: "Supprimer le retour ?" });
const confirmButton = (page: Page) => confirmation(page).getByRole("button", { name: "Supprimer le retour", exact: true });
const cancelButton = (page: Page) => confirmation(page).getByRole("button", { name: "Annuler", exact: true });
/** The sheet's alert: what was not done, then why. */
const notice = (page: Page) => sheet(page).getByRole("alert").locator("p");

/** The sends whose body carries `text` from now on: counted, never shown. */
function sends(page: Page, text: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes(text)) sent.push(request);
  });
  return sent;
}

/** A change, its body carrying the form's fields; a removal, the numbers confirmed too. */
const CHANGE = '"allerDate"';
const REMOVAL = '"persons"';

/** Holds every send whose body carries `text` until it is released, or lost offline. */
async function holdEdits(page: Page, text: string) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes(text) ? void held.push(route) : route.fallback()),
  );
  const each = async (then: (route: Route) => Promise<void>) => {
    for (const route of held.splice(0)) await then(route);
  };
  return {
    held: () => held.length,
    release: () => each((route) => route.fallback()),
    lose: () => each((route) => route.abort("internetdisconnected")),
  };
}

/**
 * Watches, from now on, for a moment the focus is lost: on `<body>`, or on a button disabled
 * under it, which the browser leaves it on and moves it from once out of its tab order. Checked
 * between every two tasks, on a channel the clock does not fake. `seen()` says whether it was,
 * and stops watching.
 */
async function watchBody(page: Page) {
  await page.evaluate(() => {
    const watched = window as unknown as { onBody?: boolean; stopWatching?: boolean };
    watched.onBody = false;
    watched.stopWatching = false;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const active = document.activeElement;
      if (active === document.body || (active instanceof HTMLButtonElement && active.disabled)) watched.onBody = true;
      if (!watched.stopWatching) channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });
  return {
    seen: () =>
      page.evaluate(() => {
        const watched = window as unknown as { onBody?: boolean; stopWatching?: boolean };
        watched.stopWatching = true;
        return watched.onBody;
      }),
  };
}

/** M3.2's retour on event `eventId`: 2 cars and 9 persons. */
async function seedRetour(db: Kysely<Database>, eventId: string) {
  for (const [driver, passengers] of [
    ["Sophie", ["Léa", "Hugo", "Nina"]],
    ["Marc", []],
  ] as const) {
    const rideId = await seedRide(db, eventId, (await seedPerson(db, eventId, { firstName: driver })).id, { leg: "retour", departureTime: "18:30:00" });
    for (const firstName of passengers) {
      await seedPlacement(db, { personId: (await seedPerson(db, eventId, { firstName })).id, eventId, leg: "retour", rideId });
    }
  }
  for (const firstName of ["Tom", "Inès", "Paul", "Zoé"]) {
    await seedPlacement(db, { personId: (await seedPerson(db, eventId, { firstName })).id, eventId, leg: "retour", rideId: null });
  }
}

/** The place changed and the retour unchecked, « Valider », then « Supprimer le retour », its request held 10 s; then « Annuler ». */
async function confirmThenWait(page: Page, path: string) {
  await page.clock.install();
  const held = await holdEdits(page, REMOVAL);
  await page.goto(path);
  await editButton(page).click();
  await field(page, "Lieu").fill("Salle Carrel");
  await retourBox(page).click();
  await submit(page).click();
  await expect(confirmation(page)).toBeVisible();
  await confirmButton(page).click();
  await expect.poll(held.held).toBe(1);
  await expect(cancelButton(page)).toHaveAttribute("aria-disabled", "true");
  await page.clock.fastForward(10_000);
  await expect(cancelButton(page)).not.toHaveAttribute("aria-disabled");
  await expect(confirmButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(confirmButton(page)).toBeFocused();
  const body = await watchBody(page);
  await cancelButton(page).click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(submit(page)).toBeFocused();
  await expect(submit(page)).toHaveAttribute("aria-disabled", "true");
  expect(await body.seen(), "the focus lost as the confirmation closed").toBe(false);
  return held;
}

const stored = (db: Kysely<Database>, id: string) =>
  db.selectFrom("event").select(["location", "retour_at"]).where("id", "=", id).executeTakeFirstOrThrow();

test.describe("M3.7: the confirmation lets go after 10 s", () => {
  test("points 2 and 4: « Annuler » comes back, the sheet stays locked, then the late `ok` closes it and the bar says so", async ({ page, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    const held = await confirmThenWait(page, organiserPath(seededEvent));
    await expect(field(page, "Lieu")).toHaveAttribute("readonly", "");
    await field(page, "Lieu").pressSequentially(" Nord");
    await expect(field(page, "Lieu")).toHaveValue("Salle Carrel");
    await expect(retourBox(page)).toHaveAttribute("aria-disabled", "true");

    await held.release();
    await expect(sheet(page)).toHaveCount(0);
    await expect(messages(page)).toHaveText([FR.saved]);
    expect(await stored(db, seededEvent.id)).toEqual({ location: "Salle Carrel", retour_at: null });
  });

  test("point 2, offline: the sheet says the retour was not removed; the focus on « Valider »", async ({ page, context, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    const held = await confirmThenWait(page, organiserPath(seededEvent));
    await context.setOffline(true);
    try {
      await held.lose();
      await expect(notice(page)).toHaveText([NOT_REMOVED, FR.offline]);
      await expect(submit(page)).toBeFocused();
      await expect(submit(page)).not.toHaveAttribute("aria-disabled");
      await expect(confirmation(page)).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  test("points 3 and 5: the numbers changed meanwhile: no confirmation, the sheet says them; « Valider » opens it again; « Retour » checked again, nothing is removed", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedRetour(db, seededEvent.id);
    const held = await confirmThenWait(page, organiserPath(seededEvent));
    const julie = (await seedPerson(db, seededEvent.id, { firstName: "Julie" })).id;
    await seedRide(db, seededEvent.id, julie, { leg: "retour", departureTime: "19:00:00" });
    await held.release();

    await expect(notice(page)).toHaveText([NOT_REMOVED, FR.retourChanged]);
    await expect(confirmation(page)).toHaveCount(0);
    await expect(submit(page)).toBeFocused();
    await expect(submit(page)).not.toHaveAttribute("aria-disabled");

    const sent = sends(page, CHANGE);
    await submit(page).click();
    await expect(confirmation(page).getByText(FR.body3, { exact: true })).toBeVisible();
    expect(sent.length, "a request to open the confirmation again").toBe(0);
    // Escape is the confirmation's once it has grown in (#415): before, the sheet's.
    await confirmation(page).evaluate((element) => Promise.all(element.getAnimations().map((each) => each.finished)));
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);

    // Point 5: the fields are free again; « Retour » checked again, the change goes without removal.
    const removals = sends(page, REMOVAL);
    await retourBox(page).click();
    await expect(retourBox(page)).toBeChecked();
    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(confirmation(page)).toHaveCount(0);
    expect(removals.length).toBe(0);
    expect(await stored(db, seededEvent.id)).toEqual({ location: "Salle Carrel", retour_at: "2026-12-12 18:00:00" });
    const rides = await db.selectFrom("ride").select("id").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    expect(rides.length).toBe(3);
  });

  test("the sheet closed too: the late failure is in the bar, with the removal's words", async ({ page, context, db, seededEvent }) => {
    await seedRetour(db, seededEvent.id);
    const held = await confirmThenWait(page, organiserPath(seededEvent));
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await context.setOffline(true);
    try {
      await held.lose();
      await expect(messages(page)).toHaveText([`${NOT_REMOVED} ${FR.offline}`]);
    } finally {
      await context.setOffline(false);
    }
  });
});

test("M3.7, the event deleted in the confirmation: the focus goes to « Annuler », never by <body>", async ({ page, db, seededEvent, organiserTraffic }) => {
  await seedRetour(db, seededEvent.id);
  const held = await holdEdits(page, REMOVAL);
  await page.goto(organiserPath(seededEvent));
  await editButton(page).click();
  await retourBox(page).click();
  await submit(page).click();
  await expect(confirmation(page)).toBeVisible();
  await confirmButton(page).click();
  await expect.poll(held.held).toBe(1);
  await organiserTraffic.keepNumbers();
  await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
  const body = await watchBody(page);
  await held.release();

  await expect(confirmButton(page)).toBeDisabled();
  await expect(cancelButton(page)).toBeFocused();
  expect(await body.seen(), "the focus lost as « Supprimer le retour » was disabled").toBe(false);
});

test("M2.11, after 10 s: « Modifier l’événement » is active again; the late `ok` updates the sheet opened since, with no alert, and its « Valider » saves without `changed`", async ({
  page,
  db,
  seededEvent,
}) => {
  await page.clock.install();
  const held = await holdEdits(page, CHANGE);
  await page.goto(organiserPath(seededEvent));
  await editButton(page).click();
  await field(page, "Titre").fill("Tournoi de Rennes U13");
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(editButton(page)).toHaveAttribute("aria-disabled", "true");

  await page.clock.fastForward(10_000);
  await expect(editButton(page)).not.toHaveAttribute("aria-disabled");
  await editButton(page).click();
  await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes");
  await field(page, "Lieu").fill("Salle Carrel");
  await held.release();

  await expect(field(page, "Titre")).toHaveValue("Tournoi de Rennes U13");
  await expect(field(page, "Lieu")).toHaveValue("Salle Carrel");
  await expect(sheet(page).getByRole("alert")).toHaveCount(0);
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await held.release();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
  const event = await db.selectFrom("event").select(["title", "location"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
  expect(event).toEqual({ title: "Tournoi de Rennes U13", location: "Salle Carrel" });
});
