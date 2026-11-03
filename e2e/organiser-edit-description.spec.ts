import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { areaEditButton, expect, holdActionsWith, isAction, organiserPath, test } from "./organiser";

/*
 * #713, epic #654, event-description v3 (« Écrire »): the description in « Modifier l’événement »,
 * prefilled, one more field changed, locked while sent, and shown at once in the header of /admin.
 * Each test runs under `organiserTraffic` (O6.1, O2.10). Nothing here prints the token or the
 * admin link. The sheet's buttons are found by their role, wherever its bar puts them (#697).
 */

leaveNoToken();

const FR = {
  edit: "Modifier l’événement",
  label: "Description (facultatif)",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  sending: "Envoi en cours…",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
};

/** The marker of the leak tests (event-description v3, « Critères »). */
const MARKER = "Zorglub4729";
const SAVED = "Rendez-vous à 7 h 15.\n\nPrévoir un pique-nique.";

const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const area = (page: Page) => sheet(page).getByRole("textbox", { name: FR.label, exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const shown = (page: Page) => page.locator("header #event-description");

/** The changes sent from now on: the actions whose body carries the form's fields. Counted, never shown. */
function edits(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request) && (request.postData() ?? "").includes('"allerDate"')) sent.push(request);
  });
  return sent;
}

/** The organiser's page, then « Modifier l’événement » opened. */
async function openSheet(page: Page, path: string) {
  await page.goto(path);
  await areaEditButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

/** Whether `element` comes after `other` in the document. */
const isAfter = async (element: Locator, other: Locator) =>
  element.evaluate((node, before) => (before!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await other.elementHandle());

/** The description stored for event `id`. */
const stored = async (db: Kysely<Database>, id: string) =>
  (await db.selectFrom("event").select("description").where("id", "=", id).executeTakeFirstOrThrow()).description;

test.describe("with a saved description", () => {
  test.use({ locale: "fr-FR", eventFields: { description: SAVED } });

  test("DS1.9: the same field, the last of the body's, prefilled with the saved text and its line breaks", async ({ page, seededEvent }) => {
    await openSheet(page, organiserPath(seededEvent));
    await expect(area(page)).toHaveValue(SAVED);
    expect(await isAfter(area(page), sheet(page).getByLabel("Heure de fin", { exact: true }))).toBe(true);
    // No field after it, but the option « Points de RDV », which closes the body: what follows are its buttons.
    const after = await area(page).evaluate((textarea) =>
      [...(textarea as HTMLTextAreaElement).form!.querySelectorAll("input, textarea, select, [role=checkbox], [role=combobox]")]
        .filter(
          (control) => control !== textarea && (textarea.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && control.getAttribute("aria-hidden") !== "true",
        )
        .map((control) => control.getAttribute("aria-label") ?? control.id),
    );
    expect(after.length, `controls after the description: ${after.join(", ")}`).toBe(1);
    expect(await isAfter(sheet(page).getByRole("checkbox", { name: "Points de RDV", exact: true }), area(page))).toBe(true);
  });

  test("DS1.10: nothing changed, or put back as loaded, « Valider » closes with no request; emptied, it is removed, and /admin shows it gone at once", async ({
    page,
    db,
    seededEvent,
  }) => {
    const sent = edits(page);
    await openSheet(page, organiserPath(seededEvent));
    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);

    await areaEditButton(page).click();
    await area(page).fill("Autre chose");
    await area(page).fill(SAVED);
    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(sent.length).toBe(0);

    await areaEditButton(page).click();
    await area(page).fill("");
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);
    expect(sent.length).toBe(1);
    await expect(shown(page)).toHaveCount(0);
    expect(await stored(db, seededEvent.id)).toBeNull();
  });

  test("DS2.8: saved, /admin shows the new description at once, and an open /e/{id} at its reload", async ({ page, context, db, seededEvent }) => {
    const participant = await context.newPage();
    await participant.goto(`/e/${seededEvent.id}`);
    await expect(participant.locator("header #event-description")).toHaveText(SAVED);

    await openSheet(page, organiserPath(seededEvent));
    // Blanks at the ends of lines, and too many newlines: stored as the server normalises them.
    await area(page).fill("Rendez-vous à 8 h.   \n\n\n\nDevant le gymnase.");
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(shown(page)).toHaveText("Rendez-vous à 8 h.\n\nDevant le gymnase.");
    expect(await stored(db, seededEvent.id)).toBe("Rendez-vous à 8 h.\n\nDevant le gymnase.");

    await expect(participant.locator("header #event-description")).toHaveText(SAVED);
    await participant.reload();
    await expect(participant.locator("header #event-description")).toHaveText("Rendez-vous à 8 h.\n\nDevant le gymnase.");
  });

  test("DS1.12: while sent, the area is read-only and « Envoi en cours… » is above « Valider »; failed, the sentence says so, the text stays, nothing written", async ({
    page,
    db,
    seededEvent,
  }) => {
    const held = await holdActionsWith(page, '"allerDate"');
    await openSheet(page, organiserPath(seededEvent));
    await area(page).fill("Rendez-vous à 8 h.");
    await submit(page).click();
    await expect.poll(held.held).toBe(1);

    await expect(area(page)).toHaveAttribute("readonly", "");
    await area(page).pressSequentially(" Nord");
    await expect(area(page)).toHaveValue("Rendez-vous à 8 h.");
    const sending = sheet(page).getByText(FR.sending, { exact: true });
    await expect(sending).toBeVisible();
    expect((await sending.boundingBox())!.y).toBeLessThan((await submit(page).boundingBox())!.y);

    await held.fail();
    await expect(sheet(page).getByRole("alert")).toHaveText(FR.failed);
    await expect(area(page)).not.toHaveAttribute("readonly");
    await expect(area(page)).toHaveValue("Rendez-vous à 8 h.");
    expect(await stored(db, seededEvent.id)).toBe(SAVED);
  });
});

test.describe("written in the sheet", () => {
  test.use({ locale: "fr-FR" });

  test("DS5.7: while it is written and saved, no request's URL carries it", async ({ page, context, seededEvent }) => {
    const urls: string[] = [];
    context.on("request", (request) => urls.push(request.url()));
    await openSheet(page, organiserPath(seededEvent));
    await area(page).fill(`Pique-nique ${MARKER}`);
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(shown(page)).toHaveText(`Pique-nique ${MARKER}`);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => url.includes(MARKER))).toEqual([]);
  });

  test("DS1.13: no participant's sheet has a « Description » field", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const tab = page.getByRole("tabpanel");
    for (const [opener, title] of [
      [tab.getByRole("button", { name: "Ajouter une personne", exact: true }), "Ajouter une personne"],
      [tab.getByRole("button", { name: "Proposer une voiture", exact: true }), "Proposer une voiture"],
    ] as const) {
      await opener.click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox").first()).toBeVisible();
      await expect(dialog.getByLabel(/description/i)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  });
});
