import type { Page, Request, Response } from "@playwright/test";
import { seedAccount, seedSends, seedSession } from "@/db/test-accounts";
import { LOGINS_PER_ADDRESS } from "@/domain/send-limits";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerMail, mailTo, newAddress, releaseMail } from "./mailbox";

// A sign-in email holds its token, and OA4.6 keeps a session's: nothing a failure writes may show them.
leaveNoToken();

/*
 * /connexion and « Regardez vos e-mails » (#604, organizer-account OA4.1 to OA4.3, OA4.5 to
 * OA4.7, and « Le focus »). Each test its own address, on `.test`, through the slot's fake
 * Brevo; its sends are deleted after it, so that the global hourly cap never meets them.
 */

const FR = {
  title: "Se connecter",
  intro: "Pas de mot de passe : nous vous envoyons un lien de connexion par e-mail.",
  email: "Adresse e-mail",
  send: "Recevoir le lien",
  sending: "Envoi en cours…",
  noAccount: "Pas encore de compte ? Il se crée avec votre premier événement.",
  create: "Créer un événement",
  already: (email: string) => `Session ouverte avec ${email}.`,
  myEvents: "Mes événements",
  offline: "Le lien n’a pas été envoyé. Vérifiez la connexion, puis réessayez.",
  failed: "Le lien n’a peut-être pas été envoyé. Une erreur est survenue : réessayez dans quelques minutes.",
  tooMany: "Trop de demandes pour cette adresse. Réessayez dans une heure.",
  needsJavaScript: "Se connecter nécessite JavaScript : activez-le, puis rechargez la page.",
  required: "Champ requis.",
  invalid: "Adresse e-mail non valide.",
  check: "Regardez vos e-mails",
  body: (email: string) =>
    `Nous avons envoyé un e-mail à ${email}. Ouvrez le lien qu’il contient : la session s’ouvrira dans le navigateur qui l’ouvre. Il est valable 1 heure.`,
  spam: "Rien reçu ? Regardez dans les indésirables.",
  resend: "Renvoyer l’e-mail",
  change: "Changer d’adresse",
  resent: "E-mail renvoyé.",
};

const field = (page: Page) => page.getByLabel(FR.email, { exact: true });
const sendButton = (page: Page) => page.getByRole("button", { name: FR.send });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const alert = (page: Page) => page.getByRole("main").getByRole("alert");
const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
const isRequest = (response: Response) =>
  response.request().method() === "POST" && new URL(response.url()).pathname === "/connexion";

/** Every server action the page sends from now on: `requestLink`, and `signedInAs` with a session. */
function actionsOf(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isAction(request)) sent.push(request);
  });
  return sent;
}

test.use({ locale: "fr-FR" });

let addresses: string[] = [];
test.afterEach(async ({ db }) => {
  if (addresses.length === 0) return;
  // The sends, out of the hourly window of the next tests; an account's links and sessions go with it.
  await db.deleteFrom("email_send").where("email", "in", addresses).execute();
  await db.deleteFrom("account").where("email", "in", addresses).execute();
  addresses = [];
});

/** An address of the test's own, cleared after it. */
function address(): string {
  const email = newAddress();
  addresses.push(email);
  return email;
}

/** Opens /connexion, ready once the field takes input. */
async function open(page: Page) {
  await page.goto("/connexion");
  await expect(sendButton(page)).toBeEnabled();
}

async function ask(page: Page, email: string) {
  await field(page).fill(email);
  await sendButton(page).click();
}

test.describe("/connexion", () => {
  test("OA4.1: the title, the sentence, the field, the button of 44 px, and the way to create an event", async ({ page }) => {
    await open(page);
    await expect(heading(page)).toHaveText(FR.title);
    await expect(page.getByText(FR.intro)).toBeVisible();
    await expect(field(page)).toHaveAttribute("type", "email");
    await expect(field(page)).toHaveAttribute("autocomplete", "email");
    expect((await sendButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(FR.noAccount)).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: FR.create })).toHaveAttribute("href", "/nouveau");
    // Nothing above the title without a session (OA4.6).
    await expect(page.getByText("Session ouverte avec")).toHaveCount(0);
  });

  test("OA4.1: while sending, « Envoi en cours… », aria-disabled, and a second tap sends nothing", async ({ page }) => {
    const email = address();
    await answerMail([email], { kind: "hold" });
    await open(page);
    const actions = actionsOf(page);
    await ask(page, email);
    const button = page.getByRole("button", { name: FR.sending });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect.poll(async () => (await mailTo(email)).length).toBe(1);
    // Forced: Playwright waits for an aria-disabled button to be enabled, as long as Brevo would.
    await button.click({ force: true });
    await page.keyboard.press("Enter");
    expect(await releaseMail([email])).toBe(1);
    await expect(heading(page)).toHaveText(FR.check);
    // Next sends server actions one at a time, in order: a resend answered is one that left after
    // any second request, and a second request held by Brevo would keep « E-mail renvoyé. » unsaid.
    await answerMail([email], { kind: "ok" });
    await page.getByRole("button", { name: FR.resend }).click();
    await expect(page.getByRole("status")).toHaveText(FR.resent);
    expect(actions.length, "the request and the resend").toBe(2);
    expect((await mailTo(email)).length).toBe(2);
  });

  test("OA4.2: an address with an account and one without give the same screen, and the focus goes to its title", async ({
    page,
    db,
  }) => {
    const withAccount = address();
    await seedAccount(db, { email: withAccount });
    const shown: { status: number; text: string }[] = [];
    for (const email of [withAccount, address()]) {
      await open(page);
      const answered = page.waitForResponse(isRequest);
      await ask(page, email);
      const status = (await answered).status();
      await expect(heading(page)).toHaveText(FR.check);
      await expect(heading(page)).toBeFocused();
      await expect(page.getByText(FR.body(email))).toBeVisible();
      await expect(page.getByText(FR.spam)).toBeVisible();
      await expect(field(page)).toHaveCount(0);
      shown.push({ status, text: (await page.getByRole("main").innerText()).replace(email, "{email}") });
      expect((await mailTo(email)).length).toBe(1);
    }
    expect(shown[0]!.status).toBe(200);
    expect(shown[1]).toEqual(shown[0]);
  });

  test("OA4.3: « Renvoyer l’e-mail » sends one more and says so, the focus stays; « Changer d’adresse » goes back to the field", async ({
    page,
    db,
  }) => {
    const email = address();
    const accountId = await seedAccount(db, { email });
    await open(page);
    await ask(page, email);
    await expect(heading(page)).toHaveText(FR.check);

    const resend = page.getByRole("button", { name: FR.resend });
    await resend.click();
    await expect(page.getByRole("status")).toHaveText(FR.resent);
    await expect(resend).toBeFocused();
    expect((await mailTo(email)).length).toBe(2);
    // The line is under the buttons.
    const line = (await page.getByRole("status").boundingBox())!;
    expect(line.y).toBeGreaterThanOrEqual((await page.getByRole("button", { name: FR.change }).boundingBox())!.y);
    // Both links stay valid: neither is used, neither is replaced.
    const links = await db.selectFrom("email_link").select("used_at").where("account_id", "=", accountId).execute();
    expect(links).toEqual([{ used_at: null }, { used_at: null }]);

    await page.getByRole("button", { name: FR.change }).click();
    await expect(heading(page)).toHaveText(FR.title);
    await expect(field(page)).toHaveValue(email);
    await expect(field(page)).toBeFocused();
  });

  test("OA4.3: while a resend is held, a second tap on « Renvoyer l’e-mail » sends nothing", async ({ page }) => {
    const email = address();
    await open(page);
    await ask(page, email);
    await expect(heading(page)).toHaveText(FR.check);

    await answerMail([email], { kind: "hold" });
    const actions = actionsOf(page);
    const resend = page.getByRole("button", { name: FR.resend });
    await resend.click();
    await expect(resend).toHaveAttribute("aria-disabled", "true");
    await expect.poll(async () => (await mailTo(email)).length).toBe(2);
    // Forced: Playwright waits for an aria-disabled button to be enabled, as long as Brevo would.
    await resend.click({ force: true });
    await page.keyboard.press("Enter");
    await answerMail([email], { kind: "ok" });
    expect(await releaseMail([email])).toBe(1);
    await expect(page.getByRole("status")).toHaveText(FR.resent);

    // Next sends server actions one at a time, in order: the form's request, answered, left after
    // any second resend, and is the only one to show « Regardez vos e-mails » again.
    await page.getByRole("button", { name: FR.change }).click();
    await expect(heading(page)).toHaveText(FR.title);
    await sendButton(page).click();
    await expect(heading(page)).toHaveText(FR.check);
    expect(actions.length, "the resend and the request").toBe(2);
    expect((await mailTo(email)).length).toBe(3);
  });

  test("an empty or unreadable address: its error under the field, the focus on it, and nothing sent", async ({ page }) => {
    await open(page);
    const actions = actionsOf(page);
    await sendButton(page).click();
    await expect(field(page)).toHaveAccessibleDescription(FR.required);
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(field(page)).toBeFocused();
    await field(page).fill("abc");
    await sendButton(page).click();
    await expect(field(page)).toHaveAccessibleDescription(FR.invalid);
    await expect(field(page)).toHaveValue("abc");
    await expect(heading(page)).toHaveText(FR.title);
    expect(actions.length, "no request").toBe(0);
  });

  test("a resend Brevo refuses: Login.failed in place of « E-mail renvoyé. », the focus kept on the button", async ({ page }) => {
    const email = address();
    await open(page);
    await ask(page, email);
    await expect(heading(page)).toHaveText(FR.check);
    const resend = page.getByRole("button", { name: FR.resend });
    const status = page.getByRole("main").getByRole("status");
    await resend.click();
    await expect(status).toHaveText(FR.resent);

    await answerMail([email], { kind: "error" });
    await resend.click();
    await expect(alert(page)).toHaveText(FR.failed);
    await expect(status).toHaveText("");
    await expect(resend).toBeFocused();
    expect((await mailTo(email)).length).toBe(3);
  });

  test.describe("OA4.5: the alert above the button, the address kept", () => {
    test("offline: Login.offline", async ({ page, context }) => {
      const email = address();
      await open(page);
      await context.setOffline(true);
      await ask(page, email);
      await expect(alert(page)).toHaveText(FR.offline);
      await expect(field(page)).toHaveValue(email);
      const box = (await alert(page).boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual((await sendButton(page).boundingBox())!.y);
      await context.setOffline(false);
      await sendButton(page).click();
      await expect(heading(page)).toHaveText(FR.check);
    });

    test("the provider in error: Login.failed", async ({ page }) => {
      const email = address();
      await answerMail([email], { kind: "error" });
      await open(page);
      await ask(page, email);
      await expect(alert(page)).toHaveText(FR.failed);
      await expect(field(page)).toHaveValue(email);
      await expect(sendButton(page)).not.toHaveAttribute("aria-disabled", "true");
    });

    test("no answer from the provider in 10 s: Login.failed", async ({ page }) => {
      test.slow();
      const email = address();
      await answerMail([email], { kind: "never" });
      await open(page);
      await ask(page, email);
      await expect(alert(page)).toHaveText(FR.failed, { timeout: 15_000 });
      await expect(field(page)).toHaveValue(email);
    });

    test("the 6th request of the hour for an address: Login.tooMany, and no email", async ({ page, db }) => {
      const email = address();
      await seedSends(db, LOGINS_PER_ADDRESS, { kind: "login", email });
      await open(page);
      await ask(page, email);
      await expect(alert(page)).toHaveText(FR.tooMany);
      expect((await mailTo(email)).length).toBe(0);
    });
  });

  test("OA4.6: with a session, « Session ouverte avec … » and « Mes événements » above the form", async ({ page, db }) => {
    const email = address();
    const token = await seedSession(db, await seedAccount(db, { email }));
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), ["fullcar:session", token]);
    await open(page);
    const line = page.getByText(FR.already(email));
    await expect(line).toBeVisible();
    await expect(page.getByRole("link", { name: FR.myEvents })).toHaveAttribute("href", "/mes-evenements");
    expect((await line.boundingBox())!.y).toBeLessThan((await heading(page).boundingBox())!.y);
    // The form is still there, to sign in with another address.
    await expect(field(page)).toBeEditable();
  });

  test("OA4.7: without JavaScript, Login.needsJavaScript, with neither form nor button", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: "fr-FR", baseURL, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/connexion");
      await expect(heading(page)).toHaveText(FR.title);
      // Playwright's text engine skips what a <noscript> holds: its paragraph is reached by CSS.
      await expect(page.locator("main noscript > p")).toHaveText(FR.needsJavaScript);
      await expect(page.locator("main form")).toBeHidden();
      await expect(sendButton(page)).toBeHidden();
      await expect(field(page)).toBeHidden();
    } finally {
      await context.close();
    }
  });
});
