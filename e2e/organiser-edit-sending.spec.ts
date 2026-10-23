import type { Kysely } from "kysely";
import type { Page, Request, Route } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { messages } from "./device";
import { editEventInDb } from "./event-db";
import { leaveNoToken } from "./fixtures";
import { expect, isAction, oneCharOff, organiserPath, test, type OrganiserTraffic } from "./organiser";

/*
 * #272, epic #250 (organizer-view v3.3.8, « Enregistrer », « Une réponse qui arrive feuille
 * fermée »): while the change is sent, the sheet is locked and says so (M2.6), and
 * « Modifier l’événement » is inactive (M2.11); closed before the answer, the bar says what came
 * of it (M2.8, M2.9), and the next change takes that failure away (M2.10). Each test runs under
 * `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number: a
 * request is counted, a body that holds the token is only rewritten.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const NOT_DONE = "L’événement n’a pas été modifié.";
const FR = {
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  sending: "Envoi en cours…",
  offline: `${NOT_DONE} Vérifiez la connexion, puis réessayez.`,
  failed: `${NOT_DONE} Une erreur est survenue : réessayez dans un instant.`,
  gone: `${NOT_DONE} Cet événement est introuvable : il a peut-être été supprimé.`,
  errors: `${NOT_DONE} Un champ n’a pas été accepté : utilisez de nouveau « Modifier l’événement ».`,
  changed: `${NOT_DONE} Il venait d’être modifié depuis un autre appareil : la page montre la version enregistrée.`,
  notConfirmed: `${NOT_DONE} La suppression du retour n’a pas été confirmée : utilisez de nouveau « Modifier l’événement ».`,
};

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const editButton = (page: Page) => page.getByRole("button", { name: FR.edit, exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const header = (page: Page) => page.locator("main header").first();

/** The changes sent from now on: the actions whose body carries the form's fields. Counted, never shown. */
function edits(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"allerDate"')) sent.push(request);
  });
  return sent;
}

/** Holds every change until it is released, its body rewritten first if asked, failed, or lost offline. */
async function holdEdits(page: Page) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes('"allerDate"') ? void held.push(route) : route.fallback()),
  );
  const each = async (then: (route: Route) => Promise<void>) => {
    for (const route of held.splice(0)) await then(route);
  };
  return {
    held: () => held.length,
    release: (rewrite: (body: string) => string = (body) => body) =>
      each((route) => route.fallback({ postData: rewrite(route.request().postData() ?? "") })),
    fail: () => each((route) => route.fulfill({ status: 500, contentType: "text/plain", body: "" })),
    lose: () => each((route) => route.abort("internetdisconnected")),
  };
}
type Held = Awaited<ReturnType<typeof holdEdits>>;

/** The place changed and sent, the request held, then the sheet closed by Escape: the focus is back on « Modifier l’événement ». */
async function sendThenClose(page: Page, held: Held, change: (page: Page) => Promise<void> = (page) => field(page, "Lieu").fill("Salle Carrel")) {
  await editButton(page).click();
  await change(page);
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
}

/** The header as seeded. */
async function expectHeaderKept(page: Page) {
  await expect(title(page)).toHaveText("Tournoi de Rennes");
  await expect(header(page)).toContainText("Gymnase des Gayeulles");
}

test("M2.6, M2.11: while the change is sent, the sheet is locked and says so, then « Modifier l’événement » is inactive until the answer", async ({
  page,
  seededEvent,
}) => {
  const held = await holdEdits(page);
  const sent = edits(page);
  await page.goto(organiserPath(seededEvent));
  await editButton(page).click();
  await field(page, "Lieu").fill("Salle Carrel");
  await submit(page).click();
  await expect.poll(held.held).toBe(1);

  // « Valider »: aria-disabled, the same words, the focus; neither a second tap nor Enter sends.
  await expect(submit(page)).toHaveAttribute("aria-disabled", "true");
  await expect(submit(page)).toBeFocused();
  await expect(submit(page)).toHaveAccessibleDescription(FR.sending);
  await expect(sheet(page).getByText(FR.sending, { exact: true })).toBeVisible();
  await submit(page).click({ force: true });
  await page.keyboard.press("Enter");
  await field(page, "Titre").press("Enter");

  // The fields: read-only, and nothing typed changes them; the box: aria-disabled, and nothing ticks it.
  for (const label of ["Titre", "Lieu", "Date de début", "Heure de début", "Date de fin", "Heure de fin"]) {
    await expect(field(page, label), label).toHaveAttribute("readonly", "");
  }
  await field(page, "Lieu").pressSequentially(" Nord");
  await expect(field(page, "Lieu")).toHaveValue("Salle Carrel");
  await field(page, "Date de début").fill("2026-12-20", { force: true, timeout: 1_000 }).catch(() => undefined);
  await field(page, "Date de début").pressSequentially("20122026");
  await expect(field(page, "Date de début")).toHaveValue("2026-12-12");
  await expect(retourBox(page)).toHaveAttribute("aria-disabled", "true");
  await retourBox(page).click({ force: true });
  await sheet(page).getByText("Retour", { exact: true }).click({ force: true });
  await sheet(page).getByText("Décochez s’il n’y a pas de retour organisé.", { exact: true }).click({ force: true });
  await retourBox(page).press("Space");
  await expect(retourBox(page)).toBeChecked();
  expect(sent.length).toBe(1);

  // M2.11: closed, the button is inactive until the answer, and opens nothing.
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(editButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(editButton(page)).toHaveText(FR.edit);
  await editButton(page).click({ force: true });
  await expect(sheet(page)).toHaveCount(0);

  await held.release();
  await expect(messages(page)).toHaveText([FR.saved]);
  await expect(header(page)).toContainText("Salle Carrel");
  await expect(editButton(page)).not.toHaveAttribute("aria-disabled");
  await editButton(page).click();
  await expect(field(page, "Lieu")).toHaveValue("Salle Carrel");
  await expect(field(page, "Lieu")).not.toHaveAttribute("readonly");
  await expect(sheet(page).getByText(FR.sending, { exact: true })).toHaveCount(0);
  await expect(submit(page)).toHaveAccessibleDescription("");
  expect(sent.length).toBe(1);
});

/** Each case of M2.8: what happens before the answer is let go, and what the bar then says. */
const CLOSED: Record<string, { text: string; answer: (held: Held, scene: { page: Page; db: Kysely<Database>; id: string; token: string; traffic: OrganiserTraffic }) => Promise<void> }> = {
  offline: {
    text: FR.offline,
    answer: async (held, { page }) => {
      await page.context().setOffline(true);
      await held.lose();
    },
  },
  "a 500": { text: FR.failed, answer: (held) => held.fail() },
  "the token altered": {
    text: FR.failed,
    answer: (held, { token }) => held.release((body) => body.replace(token, oneCharOff(token))),
  },
  "the event deleted": {
    text: FR.gone,
    answer: async (held, { db, id, traffic }) => {
      await traffic.keepNumbers();
      await db.deleteFrom("event").where("id", "=", id).execute();
      await held.release();
    },
  },
  // Decision: a week ago, not yesterday. Reason: the server takes a day more than the device,
  // for any time zone (`serverBounds`): yesterday is still accepted there.
  "the start forged to a week ago (`errors`)": {
    text: FR.errors,
    answer: async (held, { page }) => {
      const past = await page.evaluate(() => {
        const at = new Date();
        at.setDate(at.getDate() - 7);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
      });
      const forged = (body: string) => body.replace(/"allerDate":\s*"[^"]*"/, `"allerDate":"${past}"`);
      await held.release((body) => {
        expect(forged(body) !== body, "the start date found in the body").toBe(true);
        return forged(body);
      });
    },
  },
  "the title changed on another device (`changed`)": {
    text: FR.changed,
    answer: async (held, { db, id }) => {
      await editEventInDb(db, id, { title: "Tournoi de Vannes" });
      await held.release();
    },
  },
};

test.describe("M2.8: the sheet closed before an answer that is not `ok`", () => {
  for (const [name, { text, answer }] of Object.entries(CLOSED)) {
    test(`${name}: the bar says it word for word, the focus stays, the header is ${name.includes("changed") ? "the stored one" : "kept"}`, async ({
      page,
      db,
      seededEvent,
      organiserTraffic,
    }) => {
      const held = await holdEdits(page);
      await page.goto(organiserPath(seededEvent));
      await sendThenClose(page, held);
      try {
        await answer(held, { page, db, id: seededEvent.id, token: seededEvent.token, traffic: organiserTraffic });

        await expect(messages(page)).toHaveText([text]);
        await expect(editButton(page)).toBeFocused();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (name.includes("changed")) await expect(title(page)).toHaveText("Tournoi de Vannes");
        else await expectHeaderKept(page);
      } finally {
        await page.context().setOffline(false);
      }
    });
  }
});

test("M2.9: the retour unchecked and the title changed, closed before `confirmRetour`: no confirmation, the bar says it, nothing changed", async ({
  page,
  db,
  seededEvent,
}) => {
  const { id } = seededEvent;
  for (const [n, firstName] of ["Sophie", "Marc"].entries()) {
    const driver = (await seedPerson(db, id, { firstName })).id;
    const ride = await seedRide(db, id, driver, { leg: "retour", departureTime: "18:30:00" });
    for (const passenger of n === 0 ? ["Léa", "Hugo", "Nina"] : []) {
      await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName: passenger })).id, eventId: id, leg: "retour", rideId: ride });
    }
  }
  for (const firstName of ["Tom", "Inès", "Paul", "Zoé"]) {
    await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName })).id, eventId: id, leg: "retour", rideId: null });
  }
  const stored = async () => ({
    event: await db.selectFrom("event").select(["title", "retour_at"]).where("id", "=", id).executeTakeFirstOrThrow(),
    rides: (await db.selectFrom("ride").select("id").where("event_id", "=", id).where("leg", "=", "retour").execute()).length,
    placements: (await db.selectFrom("placement").select("person_id").where("event_id", "=", id).where("leg", "=", "retour").execute()).length,
  });
  const before = await stored();
  const held = await holdEdits(page);
  await page.goto(organiserPath(seededEvent));
  await sendThenClose(page, held, async (page) => {
    await field(page, "Titre").fill("Tournoi de Rennes U13");
    await retourBox(page).click();
  });
  await held.release();

  await expect(messages(page)).toHaveText([FR.notConfirmed]);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(header(page).locator("dt")).toHaveText(["Début", "Fin"]);
  await expectHeaderKept(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  expect(await stored()).toEqual(before);
  expect(before).toEqual({ event: { title: "Tournoi de Rennes", retour_at: "2026-12-12 18:00:00" }, rides: 2, placements: 7 });
});

test("the sheet open, its answer stays in it: nothing in the bar", async ({ page, seededEvent }) => {
  const held = await holdEdits(page);
  await page.goto(organiserPath(seededEvent));
  await editButton(page).click();
  await field(page, "Lieu").fill("Salle Carrel");
  await submit(page).click();
  await expect.poll(held.held).toBe(1);
  await held.fail();
  await expect(sheet(page).getByRole("alert")).toHaveText("Une erreur est survenue et rien n’a changé. Réessayez dans un instant.");
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  // Once the sheet has given the focus back: a failure for the bar would be written by then.
  await expect(editButton(page)).toBeFocused();
  await expect(messages(page)).toHaveCount(0);
});

test("M2.10: « Actualiser » leaves the failure; « Fermer » gives the focus to « Modifier l’événement », folded to the active tab; the next change takes the failure away as it leaves", async ({
  page,
  seededEvent,
}) => {
  const held = await holdEdits(page);
  await page.goto(organiserPath(seededEvent));
  await sendThenClose(page, held);
  await held.fail();
  await expect(messages(page)).toHaveText([FR.failed]);

  await panel(page).getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(panel(page).getByRole("status", { includeHidden: true })).toHaveText("Espace organisateur actualisé.");
  await expect(messages(page)).toHaveText([FR.failed]);

  // The landmark of the failure (rule 8): « Modifier l’événement ».
  await page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" }).click();
  await expect(messages(page)).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
  await sendThenClose(page, held);
  await held.fail();
  await expect(messages(page)).toHaveText([FR.failed]);

  // Folded, « Modifier l’événement » is not shown: the next landmark, the active tab (rule 8).
  await page.getByRole("button", { name: "Espace organisateur", exact: true }).click();
  await expect(editButton(page)).toBeHidden();
  await page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" }).click();
  await expect(messages(page)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Aller/ })).toBeFocused();

  await page.getByRole("button", { name: "Espace organisateur", exact: true }).click();
  await sendThenClose(page, held);
  await held.fail();
  await expect(messages(page)).toHaveText([FR.failed]);
  await sendThenClose(page, held, (page) => field(page, "Lieu").fill("Salle Colette-Besson"));
  await expect(messages(page)).toHaveCount(0);
  await held.release();
  await expect(messages(page)).toHaveText([FR.saved]);
});
