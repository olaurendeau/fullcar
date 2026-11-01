import type { Page } from "@playwright/test";
import { expect, expectUrl, leaveNoToken, creatorTest, test } from "./fixtures";
import { answerMail, mailTo, newAddress, releaseMail } from "./mailbox";

// The organiser's link is the page reached after « Créer »: nothing a failure writes may show it.
leaveNoToken();

/*
 * #614, epic #581, organizer-account OA1.1, OA1.2, OA1.4, OA1.6, the creation parts of OA1.7 and
 * OA1.10, OA2.2 and OA2.6: without a session, /nouveau asks for an address, and the event is
 * created pending on it. Each test creates its events through the form, with an address of its
 * own, and deletes them after. The server's side of OA1.4 is in create-event.test.ts.
 */

test.use({ locale: "fr-FR" });

const FR = {
  email: "Votre adresse e-mail",
  hint: "Pour retrouver vos événements, sans mot de passe. Les participants n’ont jamais à en donner.",
  privacy: "Confidentialité",
  create: "Créer",
  required: "Champ requis.",
  invalid: "Adresse e-mail non valide.",
  tooLong: "254 caractères au maximum.",
  newEvent: "Créer un événement",
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  sending: (email: string) => `Envoi du lien à ${email}…`,
  body: (email: string) =>
    `Nous avons envoyé un lien à ${email}. Ouvrez-le, sur n’importe quel appareil, pour retrouver cet événement dans Mes événements. D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur.`,
  failedTitle: "L’e-mail n’a peut-être pas été envoyé",
  refused: "Adresse pas encore confirmée",
  confirmButton: "Confirmer et se connecter",
};

const TITLE = "Sortie ski du club";
/** Where a new event lands: its organiser area, without a fragment (OA1.6). */
const ARRIVAL = /\/e\/([2-9A-HJ-NP-Za-km-z]{8})\/admin$/;
/** The confirmation link of an email, as written: the token after `#`. */
const LINK = /\/connexion\/confirmer#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/;

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const createButton = (page: Page) => page.getByRole("button", { name: FR.create, exact: true });
const notice = (page: Page) => page.locator("[data-pending-notice]");
const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const idOf = (page: Page) => ARRIVAL.exec(new URL(page.url()).pathname)![1]!;

let created: string[] = [];
test.afterEach(async ({ db }) => {
  if (created.length > 0) await db.deleteFrom("event").where("id", "in", created).execute();
  created = [];
});

/** The device's date, in a week, as an `<input type="date">` takes it. */
const inAWeek = (page: Page) =>
  page.evaluate(() => {
    const at = new Date();
    at.setDate(at.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  });

/** The form, once hydrated: « Créer » stays inactive until then. */
async function openForm(page: Page) {
  await page.goto("/nouveau");
  await expect(createButton(page)).toBeEnabled({ timeout: 15_000 });
}

/** Every field but the address: five actions with the end time. */
async function fillEvent(page: Page) {
  await field(page, "Titre").fill(TITLE);
  await field(page, "Lieu").fill("La Clusaz");
  await field(page, "Date de début").fill(await inAWeek(page));
  await field(page, "Heure de début").fill("07:30");
  await field(page, "Heure de fin").fill("18:00");
}

/** Creates an event with `address` from /nouveau, and waits for the organiser's area. */
async function createWith(page: Page, address: string): Promise<string> {
  await openForm(page);
  await fillEvent(page);
  await field(page, FR.email).fill(address);
  await createButton(page).click();
  await expectUrl(page, ARRIVAL, "the organiser's area");
  await expect(panel(page)).toBeVisible();
  const id = idOf(page);
  created.push(id);
  return id;
}

/** The token of the confirmation link of the one email to `address`: never printed. */
async function confirmationToken(address: string): Promise<string> {
  await expect.poll(async () => (await mailTo(address)).length).toBe(1);
  const match = LINK.exec((await mailTo(address))[0]!.text);
  if (!match) throw new Error("e2e: the email holds no confirmation link");
  return match[1]!;
}

test.describe("l’adresse, sans session", () => {
  test("OA1.1: the field is required, just above « Créer », described by its hint, which the link to Confidentialité follows", async ({ page }) => {
    await openForm(page);
    const email = field(page, FR.email);
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(email).toHaveAttribute("required", "");
    await expect(email).toHaveAccessibleDescription(FR.hint);
    const link = page.locator("form").getByRole("link", { name: FR.privacy, exact: true });
    await expect(link).toHaveAttribute("href", "/confidentialite");
    const [box, linkBox, buttonBox] = [await email.boundingBox(), await link.boundingBox(), await createButton(page).boundingBox()];
    expect(box!.y).toBeLessThan(linkBox!.y);
    expect(linkBox!.y).toBeLessThan(buttonBox!.y);
    // Nothing between the hint and « Créer ».
    expect(buttonBox!.y - (linkBox!.y + linkBox!.height)).toBeLessThan(40);
    await link.click();
    await expectUrl(page, /\/confidentialite$/, "the privacy page");
  });

  test("OA1.4: empty, « abc » and 255 characters: each error under the field, the first field in error focused, the values kept, nothing created", async ({
    page,
    db,
  }) => {
    const title = "Sortie sans adresse";
    const sent: string[] = [];
    page.on("request", (request) => request.method() === "POST" && request.headers()["next-action"] && sent.push(request.url()));
    await openForm(page);
    // Empty form: the title comes first.
    await createButton(page).click();
    await expect(field(page, "Titre")).toBeFocused();
    await expect(field(page, FR.email)).toHaveAccessibleDescription(`${FR.hint} ${FR.required}`);

    await fillEvent(page);
    await field(page, "Titre").fill(title);
    for (const [typed, message] of [
      ["", FR.required],
      ["abc", FR.invalid],
      [`${"a".repeat(250)}@b.fr`, FR.tooLong],
    ] as const) {
      await field(page, FR.email).fill(typed);
      await createButton(page).click();
      await expect(field(page, FR.email)).toBeFocused();
      await expect(field(page, FR.email)).toHaveAttribute("aria-invalid", "true");
      await expect(field(page, FR.email)).toHaveAccessibleDescription(`${FR.hint} ${message}`);
      await expect(field(page, "Titre")).toHaveValue(title);
      await expect(field(page, "Heure de fin")).toHaveValue("18:00");
    }
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    expect(sent, "nothing was sent to the server").toEqual([]);
    expect(await db.selectFrom("event").select("id").where("title", "=", title).execute()).toEqual([]);
  });

  test("OA1.2: from /, eight actions reach the link to share in less than 30 s, the provider answering never", async ({ page }) => {
    const address = newAddress();
    await answerMail([address], { kind: "never" });
    const start = Date.now();
    await page.goto("/");
    const actions = [
      () => page.getByRole("link", { name: FR.newEvent, exact: true }).click(),
      async () => {
        // Hydrated: waiting is not an action.
        await expect(createButton(page)).toBeEnabled({ timeout: 15_000 });
        await expectUrl(page, /\/nouveau$/, "the creation form");
        await field(page, "Titre").fill(TITLE);
      },
      () => field(page, "Lieu").fill("La Clusaz"),
      async () => field(page, "Date de début").fill(await inAWeek(page)),
      () => field(page, "Heure de début").fill("07:30"),
      () => field(page, "Heure de fin").fill("18:00"),
      () => field(page, FR.email).fill(address),
      () => createButton(page).click(),
    ];
    expect(actions.length).toBe(8);
    for (const action of actions) await action();
    await expectUrl(page, ARRIVAL, "the organiser's area");
    created.push(idOf(page));
    await expect(panel(page).getByRole("group", { name: FR.shareLink })).toBeVisible();
    expect(Date.now() - start).toBeLessThan(30_000);
    // The send is still waiting for the provider: the creation did not.
    await expect(notice(page)).toContainText(FR.sending(address));
  });

  test("OA1.6: one email to the address, with a link to confirm, and the arrival has no fragment", async ({ page, db }) => {
    const address = newAddress();
    const id = await createWith(page, address);
    expect(new URL(page.url()).hash, "the arrival's fragment").toBe("");
    const token = await confirmationToken(address);
    expect(token.length).toBe(22);
    expect((await mailTo(address)).length, "exactly one email").toBe(1);
    const row = await db.selectFrom("event").select(["account_id", "pending_email"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toEqual({ account_id: null, pending_email: address });
  });

  test("OA1.7: the provider held, « Envoi du lien… », then released, the notice says the link went", async ({ page }) => {
    const address = newAddress();
    await answerMail([address], { kind: "hold" });
    await createWith(page, address);
    await expect(notice(page)).toContainText(FR.sending(address));
    await releaseMail([address]);
    await expect(notice(page)).toContainText(FR.body(address), { timeout: 20_000 });
  });

  test("OA1.7: the provider never answering, the notice becomes « n’a peut-être pas été envoyé » within 15 s of the arrival, without a reload", async ({
    page,
  }) => {
    const address = newAddress();
    await answerMail([address], { kind: "never" });
    await createWith(page, address);
    await expect(notice(page)).toContainText(FR.sending(address));
    const arrived = Date.now();
    await expect(notice(page)).toContainText(FR.failedTitle, { timeout: 15_000 });
    expect(Date.now() - arrived).toBeLessThan(15_000);
    await expect(notice(page).getByRole("alert")).toBeVisible();
  });

  test("OA1.10: the tab closed while the send is held, the area reopened in the same context: released with success the notice says it went, released in error it says it may not", async ({
    page,
    context,
  }) => {
    const ok = newAddress();
    const failing = newAddress();
    await answerMail([ok, failing], { kind: "hold" });
    for (const [address, release, expected] of [
      [ok, { kind: "ok" }, FR.body(ok)],
      [failing, { kind: "error" }, FR.failedTitle],
    ] as const) {
      const id = await createWith(page, address);
      await page.close();
      await releaseMail([address], release);
      const reopened = await context.newPage();
      await reopened.goto(`/e/${id}/admin`);
      await expect(notice(reopened)).toContainText(expected, { timeout: 20_000 });
      page = reopened;
    }
  });

  test("OA2.2: the browser that created it finds the area from the link to share; another browser reads « Adresse pas encore confirmée »", async ({
    page,
    browser,
    baseURL,
  }) => {
    const address = newAddress();
    const id = await createWith(page, address);
    await page.goto(`/e/${id}`);
    const area = page.getByRole("link", { name: FR.panel, exact: true });
    await expect(area).toBeVisible();
    await area.click();
    await expectUrl(page, ARRIVAL, "the organiser's area");
    await expect(panel(page)).toBeVisible();

    const other = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const away = await other.newPage();
      await away.goto(`/e/${id}`);
      await expect(away.getByRole("link", { name: FR.panel, exact: true })).toHaveCount(0);
      await away.goto(`/e/${id}/admin`);
      await expect(away.getByText(FR.refused, { exact: true })).toBeVisible();
      await expect(panel(away)).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test("OA2.6: the confirmation link used in another browser puts the event in its Mes événements; the creation browser still opens the area, and the notice is gone at the next load", async ({
    page,
    browser,
    baseURL,
  }) => {
    const address = newAddress();
    const id = await createWith(page, address);
    const token = await confirmationToken(address);
    await expect(notice(page)).toBeVisible();

    const other = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const away = await other.newPage();
      await away.goto(`/connexion/confirmer#${token}`);
      await away.getByRole("button", { name: FR.confirmButton, exact: true }).click();
      // The link leads to the area of the event, with a session (OA5.3); the event is in Mes événements.
      await expectUrl(away, ARRIVAL, "the organiser's area");
      await away.goto("/mes-evenements");
      await expect(away.getByRole("link", { name: new RegExp(TITLE) })).toBeVisible();
    } finally {
      await other.close();
    }

    await page.goto(`/e/${id}/admin`);
    await expect(panel(page)).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });
});

test.describe("l’adresse, en anglais", () => {
  test.use({ locale: "en-US" });

  test("OA1.1: in English, the same field with its words", async ({ page }) => {
    await page.goto("/nouveau");
    const email = page.getByLabel("Your email address", { exact: true });
    await expect(email).toHaveAccessibleDescription("To find your events again, with no password. Participants never have to give one.");
    await expect(page.locator("form").getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  });
});

creatorTest.describe("les pages des participants", () => {
  creatorTest("OA1.1: no participant page has an email field", async ({ page, seededEvent }) => {
    const noEmailField = () => expect(page.locator('input[type="email"]')).toHaveCount(0);

    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("main")).toBeVisible();
    await noEmailField();

    // The sheets reachable from the page: each one open, none asks for an address.
    for (const name of ["Proposer une voiture", "Ajouter une personne"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("dialog", { name })).toBeVisible();
      await noEmailField();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name })).toBeHidden();
    }

    await page.goto(`/e/${seededEvent.id}/moi`);
    await expect(page.locator("body")).toBeVisible();
    await noEmailField();
  });
});
