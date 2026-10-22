import type { Page, Request } from "@playwright/test";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, isAction, oneCharOff, organiserPath, test } from "./organiser";

/*
 * #269, epic #250 (organizer-view v3.3.6, « Modifier l’événement »): what the sheet does with the
 * answers of `updateEvent` (M6, M8), and the sheet on every screen (M9). Each test runs under the
 * fixture `organiserTraffic` (O6.1, O2.10). Decision: the two devices of M6 are two pages of the
 * test's context. Reason: `leaveNoToken()` and `organiserTraffic` watch that context only, and
 * nothing a page keeps of the change is shared between its pages. Nothing here prints the token,
 * the admin link or a number: a request is named or counted, a string that may carry the token is a
 * boolean.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

// The seed (src/db/test-events.ts): « Tournoi de Rennes », Gymnase des Gayeulles, 2026-12-12 from 07:30 to 18:00.
const WORDS = {
  fr: {
    edit: "Modifier l’événement",
    submit: "Valider",
    cancel: "Annuler",
    saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
    changed: [
      "L’événement vient d’être modifié depuis un autre appareil.",
      "Rien n’a été enregistré. Les champs que vous n’aviez pas changés montrent maintenant la version enregistrée : vérifiez, puis validez de nouveau.",
    ],
    invalid: ["Ce lien d’organisateur n’est pas valide.", "Vérifiez qu’il a été copié en entier."],
    gone: ["L’événement n’a pas été modifié.", "Cet événement est introuvable : il a peut-être été supprimé."],
    stale: "L’espace organisateur n’est plus à jour. Utilisez « Actualiser » pour le relire.",
  },
  en: { edit: "Edit the event", submit: "Confirm", cancel: "Cancel", saved: "Event updated. Nobody is notified: remember to tell the group." },
};
const FR = WORDS.fr;
const U13 = "Tournoi de Rennes U13";

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const editButton = (page: Page, name = FR.edit) => page.getByRole("button", { name, exact: true });
const sheet = (page: Page, name = FR.edit) => page.getByRole("dialog", { name });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: FR.submit, exact: true });
const cancel = (page: Page) => sheet(page).getByRole("button", { name: FR.cancel, exact: true });
/** The alert of the sheet, its title then its body. */
const notice = (page: Page) => sheet(page).getByRole("alert").locator("p");
// Under an open sheet, the page is `aria-hidden`: read by its elements, not by their roles.
const header = (page: Page) => page.locator("main header").first();
const legSections = (page: Page) => page.locator('section[aria-labelledby^="organiser-leg-"]');

/** The changes sent from now on: the server actions whose body carries the form's fields. Counted, never shown. */
function edits(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"allerDate"')) sent.push(request);
  });
  return sent;
}

/** A saves `title` from a sheet opened anew, and the bar says so. */
async function saveTitle(page: Page, title: string) {
  await page.bringToFront();
  await editButton(page).click();
  await field(page, "Titre").fill(title);
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

/**
 * The organiser's page, then the sheet opened once its panel shows. Each device of M6 is brought
 * to the front before it acts: the browser throttles a page behind another, whose sheet then
 * takes seconds to open or close.
 */
async function openSheet(page: Page, path: string, name = FR.edit) {
  await page.bringToFront();
  await page.goto(path);
  await editButton(page, name).click();
  await expect(sheet(page, name)).toBeVisible();
}

test.describe("M6: two devices", () => {
  for (const variant of ["the place changed", "the title changed then put back, and the place changed"]) {
    test(`M6.1: ${variant} on B after A saved the title: nothing written, the alert, A's title, B's place; again, both saved`, async ({
      page,
      context,
      db,
      seededEvent,
    }) => {
      const stored = () => db.selectFrom("event").select(["title", "location"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
      const other = await context.newPage();
      await openSheet(page, organiserPath(seededEvent));
      await openSheet(other, organiserPath(seededEvent));
      await page.bringToFront();
      await field(page, "Titre").fill(U13);
      await submit(page).click();
      await expect(messages(page)).toHaveText([FR.saved]);

      await other.bringToFront();
      if (variant !== "the place changed") {
        await field(other, "Titre").fill("Tournoi de Vannes");
        await field(other, "Titre").fill("Tournoi de Rennes");
      }
      await field(other, "Lieu").fill("Salle Carrel");
      await submit(other).click();
      await expect(notice(other)).toHaveText(FR.changed);
      await expect(submit(other)).toBeFocused();
      expect(await stored()).toEqual({ title: U13, location: "Gymnase des Gayeulles" });
      await expect(field(other, "Titre")).toHaveValue(U13);
      await expect(field(other, "Lieu")).toHaveValue("Salle Carrel");
      await expect(other.locator("h1")).toHaveText(U13);

      await submit(other).click();
      await expect(sheet(other)).toHaveCount(0);
      await expect(messages(other)).toHaveText([FR.saved]);
      expect(await stored()).toEqual({ title: U13, location: "Salle Carrel" });
    });
  }

  test("M6.1, twice: A saves a title, then another; each `changed` gives B A's newest title, and B's place stays", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const stored = () => db.selectFrom("event").select(["title", "location"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
    const other = await context.newPage();
    await openSheet(other, organiserPath(seededEvent));
    await page.goto(organiserPath(seededEvent));
    await saveTitle(page, U13);
    await other.bringToFront();
    await field(other, "Lieu").fill("Salle Carrel");
    await submit(other).click();
    await expect(notice(other)).toHaveText(FR.changed);
    await expect(field(other, "Titre")).toHaveValue(U13);

    // The title B now shows is the one loaded, not B's typing: the next `changed` replaces it.
    await saveTitle(page, "Tournoi de Rennes U15");
    await other.bringToFront();
    await submit(other).click();
    await expect(field(other, "Titre")).toHaveValue("Tournoi de Rennes U15");
    await expect(field(other, "Lieu")).toHaveValue("Salle Carrel");
    await expect(submit(other)).toBeFocused();
    expect(await stored()).toEqual({ title: "Tournoi de Rennes U15", location: "Gymnase des Gayeulles" });

    await submit(other).click();
    await expect(sheet(other)).toHaveCount(0);
    expect(await stored()).toEqual({ title: "Tournoi de Rennes U15", location: "Salle Carrel" });
  });

  test("M6.1, then M2.5: after `changed`, B puts its place back: « Valider » closes the sheet, with no request and no message", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const other = await context.newPage();
    await openSheet(other, organiserPath(seededEvent));
    await page.goto(organiserPath(seededEvent));
    await saveTitle(page, U13);
    await other.bringToFront();
    await field(other, "Lieu").fill("Salle Carrel");
    await submit(other).click();
    await expect(notice(other)).toHaveText(FR.changed);

    const sent = edits(other);
    await field(other, "Lieu").fill("Gymnase des Gayeulles");
    await submit(other).click();
    await expect(sheet(other)).toHaveCount(0);
    await expect(editButton(other)).toBeFocused();
    await other.waitForLoadState("networkidle");
    expect(sent.length).toBe(0);
    await expect(messages(other)).toHaveCount(0);
    const stored = await db.selectFrom("event").select(["title", "location"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
    expect(stored).toEqual({ title: U13, location: "Gymnase des Gayeulles" });
  });

  test("M6.2: A removed the empty retour, B changed the title: B's box unchecks; again, B's title saved, still no retour", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const stored = () => db.selectFrom("event").select(["title", "retour_at"]).where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
    const other = await context.newPage();
    await openSheet(page, organiserPath(seededEvent));
    await openSheet(other, organiserPath(seededEvent));
    await page.bringToFront();
    await retourBox(page).click();
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);
    expect(await stored()).toEqual({ title: "Tournoi de Rennes", retour_at: null });

    await other.bringToFront();
    await field(other, "Titre").fill(U13);
    await submit(other).click();
    await expect(notice(other)).toHaveText(FR.changed);
    await expect(retourBox(other)).not.toBeChecked();
    await expect(field(other, "Date de fin")).toHaveCount(0);
    await expect(field(other, "Heure de fin")).toHaveCount(0);
    // The panel, read again after `changed`, has one section at once. The tabs and « Fin » wait
    // for the sheet to close: a sheet open on the page keeps the legs it opened with (decision 41).
    await expect(legSections(other)).toHaveCount(1);

    await submit(other).click();
    await expect(sheet(other)).toHaveCount(0);
    await expect(other.getByRole("tab")).toHaveCount(0);
    await expect(header(other).locator("dt")).toHaveText(["Début"]);
    await expect(panel(other).getByRole("heading", { level: 3 })).toHaveCount(1);
    expect(await stored()).toEqual({ title: U13, retour_at: null });
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    test("M6.2: A added a retour at 18:00, B changed the title: B's box checks with « Heure de fin » at 18:00, and B's page has the tabs", async ({
      page,
      context,
      seededEvent,
    }) => {
      const other = await context.newPage();
      await openSheet(page, organiserPath(seededEvent));
      await openSheet(other, organiserPath(seededEvent));
      await page.bringToFront();
      await retourBox(page).click();
      await field(page, "Heure de fin").fill("18:00");
      await submit(page).click();
      await expect(messages(page)).toHaveText([FR.saved]);

      await other.bringToFront();
      await field(other, "Titre").fill(U13);
      await submit(other).click();
      await expect(notice(other)).toHaveText(FR.changed);
      await expect(retourBox(other)).toBeChecked();
      await expect(field(other, "Heure de fin")).toHaveValue("18:00");
      await expect(field(other, "Date de fin")).toHaveValue("2026-12-12");

      await cancel(other).click();
      await expect(sheet(other)).toHaveCount(0);
      await expect(other.getByRole("tab")).toHaveCount(2);
      await expect(header(other).locator("dt")).toHaveText(["Début", "Fin"]);
      await expect(panel(other).getByRole("heading", { level: 3 })).toHaveCount(2);
    });
  });
});

test.describe("M8: the failures", () => {
  test("M8.2: the token altered on the way: the sheet says the link is not valid, the focus on « Valider »; nothing written, nothing answered", async ({
    page,
    db,
    seededEvent,
    organiserTraffic,
  }) => {
    const { token } = seededEvent;
    await openSheet(page, organiserPath(seededEvent));
    await page.route(
      (url) => url.pathname.endsWith("/admin"),
      (route) => {
        const body = route.request().postData() ?? "";
        if (!isAction(route.request()) || !body.includes('"allerDate"')) return route.fallback();
        return route.fallback({ postData: body.replace(token, oneCharOff(token)) });
      },
    );
    await field(page, "Titre").fill(U13);
    await submit(page).click();

    await expect(notice(page)).toHaveText(FR.invalid);
    await expect(submit(page)).toBeFocused();
    await expect(submit(page)).toBeEnabled();
    await expect(field(page, "Titre")).toHaveValue(U13);
    const stored = await db.selectFrom("event").select("title").where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
    expect(stored).toEqual({ title: "Tournoi de Rennes" });
    const answers = (await organiserTraffic.exchanges())
      .filter((each) => each.action && each.requestBody.includes('"allerDate"'))
      .map((each) => each.answer);
    expect(answers.length).toBe(1);
    expect(answers[0].includes('{"ok":false,"error":"invalid"}'), "the answer is the refusal").toBe(true);
    expect(/Tournoi|Gymnase|2026-12-12/.test(answers[0]), "the answer holds the event's data").toBe(false);
  });

  test("M8.3: the event deleted while the sheet is open: the sheet says so, « Valider » disabled, the focus on « Annuler »", async ({
    page,
    db,
    seededEvent,
    organiserTraffic,
  }) => {
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Titre").fill(U13);
    await organiserTraffic.keepNumbers();
    await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
    await submit(page).click();

    await expect(notice(page)).toHaveText(FR.gone);
    await expect(submit(page)).toBeDisabled();
    await expect(cancel(page)).toBeFocused();
    await expect(field(page, "Titre")).toHaveValue(U13);
  });

  test("M8.4: saved, then the panel's read fails: the header and the bar say it, the panel is out of date, the focus on « Modifier l’événement »", async ({
    page,
    seededEvent,
  }) => {
    const { token } = seededEvent;
    await openSheet(page, organiserPath(seededEvent));
    // The read of the panel, the only action but the change that carries the token, fails.
    await page.route(
      (url) => url.pathname.endsWith("/admin"),
      (route) => {
        const body = route.request().postData() ?? "";
        const read = isAction(route.request()) && body.includes(token) && !body.includes('"allerDate"');
        return read ? route.fulfill({ status: 500, contentType: "text/plain", body: "" }) : route.fallback();
      },
    );
    await field(page, "Titre").fill(U13);
    await submit(page).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(U13);
    await expect(page).toHaveTitle(U13);
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(panel(page).getByText(FR.stale, { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
  });
});

test.describe("M9: readable everywhere", () => {
  for (const [locale, words] of [
    ["fr-FR", WORDS.fr],
    ["en-GB", WORDS.en],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test(`M9.1: at 360 px, then at 125 %: nothing sideways, no button wrapped, each target 44 px at least`, async ({ page, seededEvent }) => {
        await page.setViewportSize({ width: 360, height: 780 });
        await page.goto(organiserPath(seededEvent));
        for (const size of ["100%", "125%"]) {
          await page.evaluate((size) => (document.documentElement.style.fontSize = size), size);
          await editButton(page, words.edit).click();
          const dialog = sheet(page, words.edit);
          await expect(dialog).toBeVisible();
          const sideways = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(sideways, `the sheet scrolls sideways at ${size}`).toBe(0);
          const pageSideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(pageSideways, `the page scrolls sideways at ${size}`).toBe(0);

          const buttons = dialog.getByRole("button");
          expect(await buttons.count()).toBe(2);
          for (const button of await buttons.all()) {
            const name = await button.innerText();
            const { lines, clipped } = await button.evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
              return { lines: tops.size, clipped: element.scrollWidth > element.clientWidth };
            });
            expect(lines, `« ${name} » on one line at ${size}`).toBe(1);
            expect(clipped, `« ${name} » cut at ${size}`).toBe(false);
            expect((await button.boundingBox())!.height, `« ${name} » at ${size}`).toBeGreaterThanOrEqual(44);
          }
          const box = dialog.locator("label").filter({ has: page.getByRole("checkbox") });
          expect((await box.boundingBox())!.height, `the box's row at ${size}`).toBeGreaterThanOrEqual(44);
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
        }
      });
    });
  }

  test.describe("en-GB", () => {
    test.use({ locale: "en-GB" });

    test("M9.2: the sheet speaks English, with no French word; saved, the header has « Start » and « End »", async ({ page, seededEvent }) => {
      const { en } = WORDS;
      await openSheet(page, organiserPath(seededEvent), en.edit);
      const dialog = sheet(page, en.edit);
      for (const label of ["Title", "Place", "Start date", "Start time", "End date", "End time"]) {
        await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
      }
      await expect(dialog.getByRole("checkbox", { name: "Return", exact: true })).toHaveAccessibleDescription(
        "Untick if no return trip is organised.",
      );
      await expect(dialog.getByRole("button")).toHaveText([en.submit, en.cancel]);
      const text = await dialog.innerText();
      for (const french of ["Modifier", "Titre", "Lieu", "Date de", "Heure de", "Retour", "Décochez", "Valider", "Annuler", "événement"]) {
        expect(text.includes(french), `« ${french} » in the sheet`).toBe(false);
      }

      await dialog.getByLabel("Start time", { exact: true }).fill("14:00");
      await dialog.getByLabel("End time", { exact: true }).fill("21:00");
      await dialog.getByRole("button", { name: en.submit, exact: true }).click();
      await expect(messages(page)).toHaveText([en.saved]);
      await expect(header(page).locator("dt")).toHaveText(["Start", "End"]);
      await expect(header(page).locator("dd")).toHaveText([/^Saturday, December 12, 2026 at 2:00\sPM$/, /^9:00\sPM$/]);
    });
  });

  test("M9.3: at 1280 × 800, the sheet is 448 px wide at most, centred", async ({ page, seededEvent }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSheet(page, organiserPath(seededEvent));
    const box = (await sheet(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(448);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);
  });
});
