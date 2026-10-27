import type { Locator, Page } from "@playwright/test";
import { expect, expectUrl, leaveNoToken, test } from "./fixtures";

/*
 * #713, epic #654, event-description v3 (« Écrire »): the description written at the creation,
 * on /nouveau. The page reached is the organiser's link: nothing here prints its URL, only the
 * event's id is read from it.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const FR = {
  label: "Description (facultatif)",
  hint: "Ce que le groupe doit savoir. Visible par toutes les personnes qui ont le lien, effacée 30 jours après l’événement.",
  tooLong: "1000 caractères au maximum.",
  failed: "Impossible de créer l’événement. Vérifiez la connexion, puis réessayez.",
};

/** The marker of the leak tests (event-description v3, « Critères »). */
const MARKER = "Zorglub4729";

/** Where a new event lands: its organiser's link, the secret in the fragment only. */
const ARRIVAL = /\/e\/[2-9A-HJ-NP-Za-km-z]{8}\/admin#[A-Za-z0-9_-]{22}$/;

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const area = (page: Page) => page.getByRole("textbox", { name: FR.label, exact: true });
const createButton = (page: Page) => page.getByRole("button", { name: "Créer", exact: true });

/** The form, once hydrated: « Créer » stays inactive until then, slower on a loaded machine. */
async function openForm(page: Page) {
  await page.goto("/nouveau");
  await expect(createButton(page)).toBeEnabled({ timeout: 15_000 });
}

/** The device's date in a week, as an `<input type="date">` takes it. */
const inAWeek = (page: Page) =>
  page.evaluate(() => {
    const at = new Date();
    at.setDate(at.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  });

/** The required fields: title, place, start date and time, end time. */
async function fillRequired(page: Page, title: string) {
  await field(page, "Titre").fill(title);
  await field(page, "Lieu").fill("Gymnase des Fins, Annecy");
  await field(page, "Date de début").fill(await inAWeek(page));
  await field(page, "Heure de début").fill("07:30");
  await field(page, "Heure de fin").fill("18:00");
}

/** « Créer », then the organiser's link reached: the event's id, read from its path. */
async function create(page: Page): Promise<string> {
  await createButton(page).click();
  await expectUrl(page, ARRIVAL, "the organiser's link");
  return new URL(page.url()).pathname.split("/")[2];
}

/** Whether `element` comes after `other` in the document. */
const isAfter = async (element: Locator, other: Locator) =>
  element.evaluate((node, before) => (before!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await other.elementHandle());

/** The colour `text-destructive` paints, as the page computes it. */
const errorColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("p"));
    probe.className = "text-destructive";
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  });

test("DS1.1: an empty text area named « Description (facultatif) », after « Heure de fin » (or Retour unchecked) and before « Options », described by its sentence", async ({
  page,
}) => {
  await openForm(page);
  await expect(area(page)).toBeVisible();
  await expect(area(page)).toHaveValue("");
  await expect(area(page)).toHaveAccessibleDescription(FR.hint);
  const options = page.getByRole("group", { name: "Options" });
  expect(await isAfter(area(page), field(page, "Heure de fin"))).toBe(true);
  expect(await isAfter(options, area(page))).toBe(true);

  await field(page, "Retour").uncheck();
  await expect(field(page, "Heure de fin")).toHaveCount(0);
  expect(await isAfter(area(page), field(page, "Retour"))).toBe(true);
  expect(await isAfter(options, area(page))).toBe(true);
});

test("DS1.2: the shortest path leaves the field untouched: the event has no description, and its header nothing more", async ({ page, db }) => {
  await openForm(page);
  await fillRequired(page, "Tournoi sans description");
  const id = await create(page);
  try {
    const stored = await db.selectFrom("event").select("description").where("id", "=", id).executeTakeFirstOrThrow();
    expect(stored.description).toBeNull();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi sans description");
    await expect(page.locator("#event-description")).toHaveCount(0);
  } finally {
    await db.deleteFrom("event").where("id", "=", id).execute();
  }
});

test("DS1.3, DS5.7: written at the creation, /e/{id} shows its two lines, and no request's URL carries it", async ({ page, context, db }) => {
  const urls: string[] = [];
  context.on("request", (request) => urls.push(request.url()));
  await openForm(page);
  await fillRequired(page, "Tournoi avec description");
  await area(page).fill(`Rendez-vous 7 h 15. ${MARKER}\nPrévoir un pique-nique.`);
  const id = await create(page);
  try {
    await page.goto(`/e/${id}`);
    const lines = (await page.locator("header #event-description").innerText()).split("\n");
    expect(lines).toEqual([`Rendez-vous 7 h 15. ${MARKER}`, "Prévoir un pique-nique."]);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => url.includes(MARKER))).toEqual([]);
  } finally {
    await db.deleteFrom("event").where("id", "=", id).execute();
  }
});

test("DS1.6: 1000 characters, an emoji counting as one, are created; 1001 are refused under the field, which takes the focus, and nothing is created", async ({
  page,
  db,
}) => {
  const title = "Tournoi de 1001 caractères";
  await openForm(page);
  await fillRequired(page, title);
  const tooLong = "a".repeat(1000) + "🚗";
  await area(page).fill(tooLong);
  await createButton(page).click();
  await expect(area(page)).toBeFocused();
  await expect(area(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(FR.tooLong, { exact: true })).toBeVisible();
  await expect(area(page)).toHaveAccessibleDescription(new RegExp(`^${FR.tooLong} `));
  await expect(area(page)).toHaveValue(tooLong);
  await expect(page).toHaveURL(/\/nouveau$/);
  expect(await db.selectFrom("event").select("id").where("title", "=", title).execute()).toEqual([]);

  const exact = "a".repeat(999) + "🚗";
  await area(page).fill(exact);
  const id = await create(page);
  try {
    const stored = await db.selectFrom("event").select("description").where("id", "=", id).executeTakeFirstOrThrow();
    expect(stored.description).toBe(exact);
  } finally {
    await db.deleteFrom("event").where("id", "=", id).execute();
  }
});

test("DS1.7: no counter below 900; from 900, the length the server would count, described, in no live region; beyond 1000, in the error colour; a paste stays whole", async ({
  page,
}) => {
  await openForm(page);
  await area(page).fill("a".repeat(899));
  await expect(page.getByText(/caractères sur 1000/)).toHaveCount(0);
  await expect(area(page)).toHaveAccessibleDescription(FR.hint);

  // 899 « a », four newlines, « b », three blanks: the server keeps 899 + 2 + 1.
  await area(page).fill(`${"a".repeat(899)}\n\n\n\nb   `);
  const count = page.getByText("902 caractères sur 1000", { exact: true });
  await expect(count).toBeVisible();
  await expect(area(page)).toHaveAccessibleDescription(`${FR.hint} 902 caractères sur 1000`);
  expect(await count.evaluate((element) => element.closest('[aria-live], [role="status"], [role="alert"], [role="log"]'))).toBeNull();
  expect(await isAfter(count, page.getByText(FR.hint, { exact: true }))).toBe(true);
  await expect(count).not.toHaveCSS("color", await errorColour(page));

  // A paste of 1200: no maxlength cuts it.
  await area(page).fill("");
  await area(page).focus();
  await page.keyboard.insertText("b".repeat(1200));
  await expect(area(page)).toHaveValue("b".repeat(1200));
  await expect(page.getByText("1200 caractères sur 1000", { exact: true })).toHaveCSS("color", await errorColour(page));
});

test("DS1.12: offline, the creation's sentence above « Créer », the description typed kept, and nothing written", async ({ page, context, db }) => {
  const title = "Tournoi hors ligne";
  await openForm(page);
  await fillRequired(page, title);
  const text = "Rendez-vous 7 h 15.\nPrévoir un pique-nique.";
  await area(page).fill(text);
  await context.setOffline(true);
  await createButton(page).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toHaveText(FR.failed);
  expect((await alert.boundingBox())!.y).toBeLessThan((await createButton(page).boundingBox())!.y);
  await expect(area(page)).toHaveValue(text);
  await context.setOffline(false);
  expect(await db.selectFrom("event").select("id").where("title", "=", title).execute()).toEqual([]);
});

/** A text of 1000 characters, in words and lines, as an organiser writes it. */
const LONG = Array.from({ length: 40 }, (_, n) => `Ligne ${n + 1} : prévoir gourde et goûter.`)
  .join("\n")
  .slice(0, 1000);

for (const [viewport, height] of [
  [{ width: 360, height: 780 }, 162],
  [{ width: 1024, height: 768 }, 138],
] as const) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test(`DS1.14: with 1000 characters, the area stops at 6 lines, ${height} px, and scrolls inside to the cursor at the end`, async ({ page }) => {
      await openForm(page);
      // The last character typed: the cursor at the end, where the area scrolls to show it.
      await area(page).fill(LONG.slice(0, -1));
      await area(page).press("End");
      await area(page).pressSequentially(LONG.slice(-1));
      await expect(area(page)).toHaveValue(LONG);
      const box = await area(page).evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        overflowY: getComputedStyle(element).overflowY,
        scrolls: element.scrollHeight > element.clientHeight,
      }));
      expect(box.height).toBeCloseTo(height, 0);
      expect(box).toEqual({ height: box.height, overflowY: "auto", scrolls: true });
      // Scrolled to the cursor's line: below what shows, less than the padding and half a line,
      // where the browser stops as it brings the cursor into view.
      await expect
        .poll(() =>
          area(page).evaluate((element) => {
            const { paddingBottom, lineHeight } = getComputedStyle(element);
            const below = element.scrollHeight - element.scrollTop - element.clientHeight;
            return below < parseFloat(paddingBottom) + parseFloat(lineHeight) / 2 && element.scrollTop > 0;
          }),
        )
        .toBe(true);
    });
  });
}
