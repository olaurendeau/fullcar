import type { Locator, Page, Request } from "@playwright/test";
import { POLL_MS } from "@/app/e/[id]/admin/screen-state";
import type { SendStatusColumn } from "@/db/schema";
import { anonymiseEvent } from "@/db/day-thirty";
import { seedSends } from "@/db/test-accounts";
import { seedPendingSend } from "@/db/test-events";
import { CONFIRMATIONS_PER_EVENT } from "@/domain/send-limits";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { answerMail, mailTo, newAddress, releaseMail } from "./mailbox";
import { areaEditButton, expect, organiserPath, test } from "./organiser";

/*
 * #600, epic #581: the notice « Confirmez votre adresse » of a pending event, in the browser
 * that created it, and the result kept of its confirmation email, read at every load (OA1.7,
 * OA1.10, OA2.1, OA2.8, OA7.8). The events are seeded pending, their result dated in the past:
 * no clock moved forward. Each test runs under `organiserTraffic` (O6.1, O2.10). No assertion
 * here prints the token.
 */

leaveNoToken();

test.use({ locale: "fr-FR" });

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  title: "Confirmez votre adresse",
  sending: (email: string) => `Envoi du lien à ${email}…`,
  body: (email: string) =>
    `Nous avons envoyé un lien à ${email}. Ouvrez-le, sur n’importe quel appareil, pour retrouver cet événement dans Mes événements. D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur.`,
  failedTitle: "L’e-mail n’a peut-être pas été envoyé",
  failedBody: (email: string) =>
    `Votre événement est créé, mais le lien pour confirmer ${email} n’a peut-être pas été envoyé. Utilisez « Renvoyer l’e-mail » : si le premier arrive quand même, les deux liens restent valables. D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur.`,
  limitTitle: "L’e-mail n’est pas parti",
  limitBody: (email: string) =>
    `Votre événement est créé, mais trop d’e-mails sont partis vers ${email} cette heure-ci. Dans une heure, utilisez « Renvoyer l’e-mail ». D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur.`,
  resend: "Renvoyer l’e-mail",
  fix: "Corriger l’adresse",
  resent: (email: string) => `E-mail renvoyé à ${email}.`,
  offline: "L’e-mail n’a pas été renvoyé. Vérifiez la connexion, puis réessayez.",
  tooMany: "Trop d’envois. Réessayez dans une heure.",
};

const HOUR = 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const notice = (page: Page) => page.locator("[data-pending-notice]");
const polite = (page: Page) => notice(page).locator('[aria-live="polite"]');
const alert = (page: Page) => notice(page).getByRole("alert");
const button = (page: Page, name: string) => notice(page).getByRole("button", { name, exact: true });
/** The id of Next's route announcer, a `role="alert"` that is not the bar's nor the panel's. */
const ROUTE_ANNOUNCER = "#__next-route-announcer__";
/** Shown, the alerts of the page that say something: the bar's and the panel's regions are there empty. */
const saidAlerts = (page: Page) =>
  page
    .getByRole("alert")
    .filter({ hasText: /\S/ })
    .and(page.locator(`:not(${ROUTE_ANNOUNCER})`));
const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** What the notice says: its title and its body, in the region that announces them. */
async function expectNotice(page: Page, region: "polite" | "alert", title: string, body: string, timeout?: number) {
  const said = region === "polite" ? polite(page) : alert(page);
  const silent = region === "polite" ? alert(page) : polite(page);
  await expect(said.locator("p")).toHaveText([title, body], { timeout });
  await expect(silent).toHaveText("");
}

test("OA2.1: after the link to share, the notice with the address, then « Renvoyer l’e-mail » and « Corriger l’adresse », 44 px; a 60-character address breaks without overflow at 360 px", async ({
  page,
  db,
  seededEvent,
}) => {
  // 60 characters, without a point where a line may break.
  const email = `${"x".repeat(49)}@exemple.fr`;
  expect(email).toHaveLength(60);
  await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
  await page.goto(organiserPath(seededEvent));

  await expectNotice(page, "polite", FR.title, FR.body(email));
  const [share, shown, region] = await Promise.all(
    [panel(page).getByRole("group", { name: FR.shareLink }), notice(page), panel(page)].map(box),
  );
  expect(shown.y).toBeGreaterThanOrEqual(share.y + share.height);
  expect(shown.x + shown.width).toBeLessThanOrEqual(region.x + region.width);
  for (const name of [FR.resend, FR.fix]) {
    await expect(button(page, name)).toBeVisible();
    expect((await box(button(page, name))).height).toBeGreaterThanOrEqual(44);
    expect((await box(button(page, name))).x + (await box(button(page, name))).width).toBeLessThanOrEqual(shown.x + shown.width);
  }
  await expect(panel(page).getByText("Lien d’organisateur")).toHaveCount(0);
  await expect(panel(page).getByText("Gardez ce lien")).toHaveCount(0);
  expect(await overflow(page)).toBe(0);
});

for (const [name, status, at, region, title, body] of [
  ["sent, while the tab was closed", "sent", ago(HOUR), "polite", FR.title, FR.body],
  ["failed, yesterday", "failed", ago(24 * HOUR), "alert", FR.failedTitle, FR.failedBody],
  ["the limit of the address, yesterday", "address_limit", ago(24 * HOUR), "alert", FR.limitTitle, FR.limitBody],
  ["still sending, since 1 hour", "sending", ago(HOUR), "alert", FR.failedTitle, FR.failedBody],
] as const satisfies readonly (readonly [string, SendStatusColumn, Date, "polite" | "alert", string, (email: string) => string])[]) {
  test(`OA1.7, OA1.10: the result kept, at every load: ${name}`, async ({ page, db, seededEvent }) => {
    const email = newAddress();
    await seedPendingSend(db, seededEvent.id, { email, status, at });
    await page.goto(organiserPath(seededEvent));
    await expectNotice(page, region, title, body(email));
    await page.reload();
    await expectNotice(page, region, title, body(email));
    // Never « Nous avons envoyé » for an email that did not go, never « Envoi du lien… » that does not end.
    if (status !== "sent") await expect(notice(page)).not.toContainText("Nous avons envoyé");
    await expect(notice(page)).not.toContainText("Envoi du lien");
  });
}

test("OA1.7: « Envoi du lien… », both buttons inactive, then the result once kept, without reloading the page", async ({
  page,
  db,
  seededEvent,
}) => {
  const email = newAddress();
  await seedPendingSend(db, seededEvent.id, { email, status: "sending" });
  await page.goto(organiserPath(seededEvent));
  await expectNotice(page, "polite", FR.title, FR.sending(email));
  for (const name of [FR.resend, FR.fix]) await expect(button(page, name)).toHaveAttribute("aria-disabled", "true");

  await seedPendingSend(db, seededEvent.id, { email, status: "sent" });
  await expectNotice(page, "polite", FR.title, FR.body(email));
  await expect(page).toHaveURL(new RegExp(`${organiserPath(seededEvent)}$`));
});

test("OA1.7: a send left « sending » reads as a failure once 30 s have passed, without reloading the page", async ({
  page,
  db,
  seededEvent,
}) => {
  const email = newAddress();
  // Its function killed 18 s ago: nothing will write its result.
  await seedPendingSend(db, seededEvent.id, { email, status: "sending", at: ago(18_000) });
  await page.goto(organiserPath(seededEvent));
  await expectNotice(page, "polite", FR.title, FR.sending(email));
  // 30 s after the send, and the next read 2 s later at most.
  await expectNotice(page, "alert", FR.failedTitle, FR.failedBody(email), 20_000);
});

test("OA1.7: a change while a sheet hides the page is said once the sheet is closed", async ({ page, db, seededEvent }) => {
  const email = newAddress();
  await seedPendingSend(db, seededEvent.id, { email, status: "sending" });
  await page.goto(organiserPath(seededEvent));
  await expectNotice(page, "polite", FR.title, FR.sending(email));

  await areaEditButton(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // A read ends finished, or aborted by the page once it has its answer (net::ERR_ABORTED): Chromium
  // may abort it just after its headers, and `response.finished()` then never resolves. The listener is set
  // before the read leaves, so a `requestfailed` right after the response cannot be missed.
  const readEnds = () =>
    new Promise<void>((resolve) => {
      const end = (request: Request) => {
        if (request.method() !== "POST" || new URL(request.url()).pathname !== organiserPath(seededEvent)) return;
        page.off("requestfinished", end).off("requestfailed", end);
        resolve();
      };
      page.on("requestfinished", end).on("requestfailed", end);
    });
  // One read ends « sending »: the poll is still running, and the next read leaves POLL_MS after that
  // answer is applied. Keeping the failure now, that next read is the one that sees it.
  await readEnds();
  const seedStart = Date.now();
  await seedPendingSend(db, seededEvent.id, { email, status: "failed" });
  // Slower than POLL_MS, the next read would leave before the failure is kept: the test would prove nothing.
  expect(Date.now() - seedStart).toBeLessThan(POLL_MS);
  await readEnds();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Under the sheet, Radix's aria-hidden: the regions keep what they said.
  const regions = notice(page).locator('[aria-live="polite"], [role="alert"]');
  expect(await regions.allTextContents()).toEqual([`${FR.title}${FR.sending(email)}`, ""]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNotice(page, "alert", FR.failedTitle, FR.failedBody(email));
});

test("OA2.8: folded, the notice is hidden with the rest, and stays so after a reload", async ({ page, db, seededEvent }) => {
  const email = newAddress();
  await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
  await page.goto(organiserPath(seededEvent));
  await expect(notice(page)).toBeVisible();
  const toggle = page.getByRole("button", { name: FR.panel, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(notice(page)).toBeHidden();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(notice(page)).toBeHidden();
  await toggle.click();
  await expectNotice(page, "polite", FR.title, FR.body(email));
});

for (const width of [1024, 1280]) {
  test.describe(`at ${width} × 800`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("OA7.8: the link to share on the left, the notice on the right, « Modifier l’événement » under the row", async ({
      page,
      db,
      seededEvent,
    }) => {
      await seedPendingSend(db, seededEvent.id, { email: newAddress(), status: "failed", at: ago(HOUR) });
      await page.goto(organiserPath(seededEvent));
      await expect(alert(page)).not.toHaveText("");
      const [share, shown, edit, aller] = await Promise.all(
        [
          panel(page).getByRole("group", { name: FR.shareLink }),
          notice(page),
          areaEditButton(page),
          panel(page).getByRole("region", { name: "Aller", exact: true }),
        ].map(box),
      );
      expect(shown.x).toBeGreaterThanOrEqual(share.x + share.width);
      expect(Math.abs(shown.y - share.y)).toBeLessThanOrEqual(1);
      // The link keeps its column's width, Aller's.
      expect(Math.abs(share.width - aller.width)).toBeLessThanOrEqual(1);
      expect(edit.y).toBeGreaterThanOrEqual(Math.max(share.y + share.height, shown.y + shown.height));
      expect(await overflow(page)).toBe(0);
    });
  });
}

test.describe("OA2.4: « Renvoyer l’e-mail »", () => {
  // Each test its own address; its sends are deleted after it, so that the global hourly cap never meets them.
  let addresses: string[] = [];
  const address = () => {
    const email = newAddress();
    addresses.push(email);
    return email;
  };
  test.afterEach(async ({ db }) => {
    if (addresses.length > 0) await db.deleteFrom("email_send").where("email", "in", addresses).execute();
    addresses = [];
  });

  test("one more email to the address, the bar says so, the notice says it was sent, the focus stays on the button", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "failed", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await expectNotice(page, "alert", FR.failedTitle, FR.failedBody(email));

    await button(page, FR.resend).click();
    await expect(messages(page)).toHaveText([FR.resent(email)]);
    await expectNotice(page, "polite", FR.title, FR.body(email));
    await expect(button(page, FR.resend)).toBeFocused();
    expect(await mailTo(email)).toHaveLength(1);
    // The result kept is the new one: it is the same after a reload.
    await page.reload();
    await expectNotice(page, "polite", FR.title, FR.body(email));
  });

  test("a failure of Brevo is the notice's alert: no « E-mail renvoyé »", async ({ page, db, seededEvent }) => {
    const email = address();
    await answerMail([email], { kind: "error" });
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.resend).click();
    await expectNotice(page, "alert", FR.failedTitle, FR.failedBody(email));
    await expect(messages(page)).toHaveCount(0);
    expect(await mailTo(email)).toHaveLength(1);
  });

  test("past 3 emails in the hour for the event, the bar says « Trop d’envois », nothing goes, the notice is as it was", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await seedSends(db, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: seededEvent.id });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.resend).click();
    await expect(messages(page)).toHaveText([FR.tooMany]);
    await expectNotice(page, "polite", FR.title, FR.body(email));
    expect(await mailTo(email)).toEqual([]);
  });

  test("offline, the bar says the email was not sent again, nothing is sent, the notice is as it was", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await expectNotice(page, "polite", FR.title, FR.body(email));
    await context.setOffline(true);
    try {
      await button(page, FR.resend).click();
      await expect(messages(page)).toHaveText([FR.offline]);
    } finally {
      await context.setOffline(false);
    }
    await expectNotice(page, "polite", FR.title, FR.body(email));
    expect(await mailTo(email)).toEqual([]);
  });

  test("while the email is on its way, the notice keeps its height, the buttons stay where they are and inactive, and a second tap sends nothing and opens nothing", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "failed", at: ago(HOUR) });
    await answerMail([email], { kind: "hold" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(organiserPath(seededEvent));
    await expectNotice(page, "alert", FR.failedTitle, FR.failedBody(email));
    const resend = await box(button(page, FR.resend));
    const spot = { x: resend.x + resend.width / 2, y: resend.y + resend.height / 2 };

    await page.mouse.click(spot.x, spot.y);
    await expect.poll(async () => (await mailTo(email)).length).toBe(1);
    await expectNotice(page, "polite", FR.title, FR.sending(email));
    for (const name of [FR.resend, FR.fix]) await expect(button(page, name)).toHaveAttribute("aria-disabled", "true");
    // The button is under the finger still: « Modifier l’événement » did not move up to its place.
    expect(Math.abs((await box(button(page, FR.resend))).y - resend.y)).toBeLessThanOrEqual(1);

    await page.mouse.click(spot.x, spot.y);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button(page, FR.resend)).toHaveAttribute("aria-disabled", "true");
    expect(Math.abs((await box(button(page, FR.resend))).y - resend.y)).toBeLessThanOrEqual(1);
    expect(await mailTo(email)).toHaveLength(1);

    expect(await releaseMail([email])).toBe(1);
    await expect(messages(page)).toHaveText([FR.resent(email)]);
    await expectNotice(page, "polite", FR.title, FR.body(email));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mailTo(email)).toHaveLength(1);
  });

  // The panel is shown still; the server says the event ended, and the page is read again: the creation
  // browser's token, revoked by the anonymisation, opens nothing, and `EndedOrganiserScreen` comes.
  test("the event anonymised meanwhile: the page switches to the refused screen, nothing is sent", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await expectNotice(page, "polite", FR.title, FR.body(email));
    const resend = button(page, FR.resend);

    await anonymiseEvent(db, seededEvent.id);
    await resend.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Espace organisateur");
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(resend).toHaveCount(0);
    // The bar stays silent: the event ended, not a failure of sending.
    await expect(saidAlerts(page)).toHaveCount(0);
    expect(await mailTo(email)).toEqual([]);
  });
});

test.describe("OA2.5: « Corriger l’adresse »", () => {
  // Each test its own addresses; their sends are deleted after it, so that the global hourly cap never meets them.
  let addresses: string[] = [];
  const address = () => {
    const email = newAddress();
    addresses.push(email);
    return email;
  };
  test.afterEach(async ({ db }) => {
    if (addresses.length > 0) await db.deleteFrom("email_send").where("email", "in", addresses).execute();
    addresses = [];
  });

  const sheet = (page: Page) => page.getByRole("dialog", { name: FR.fix });
  const field = (page: Page) => sheet(page).getByLabel("Votre adresse e-mail", { exact: true });
  const send = (page: Page) => sheet(page).getByRole("button", { name: "Envoyer le lien", exact: true });
  const cancel = (page: Page) => sheet(page).getByRole("button", { name: "Annuler", exact: true });
  const sheetAlerts = (page: Page) => sheet(page).getByRole("alert").filter({ hasText: /\S/ });
  const note = (email: string) => `Le lien envoyé à ${email} ne marchera plus.`;

  test("opens on the address, the field has the focus, with the note, « Envoyer le lien » and « Annuler »", async ({ page, db, seededEvent }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();

    await expect(sheet(page)).toBeVisible();
    await expect(field(page)).toHaveValue(email);
    await expect(field(page)).toBeFocused();
    await expect(sheet(page).getByText(note(email))).toBeVisible();
    for (const control of [send(page), cancel(page)]) expect((await box(control)).height).toBeGreaterThanOrEqual(44);
    await expect(sheet(page).getByRole("button", { name: "Fermer" })).toHaveCount(0);
  });

  test("sends the link to the new address: the sheet closes, the focus is back on the button, the notice shows the address, after a reload too", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    const fixed = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "failed", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill(fixed);
    await send(page).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button(page, FR.fix)).toBeFocused();
    await expectNotice(page, "polite", FR.title, FR.body(fixed));
    expect(await mailTo(fixed)).toHaveLength(1);
    expect(await mailTo(email)).toEqual([]);
    await page.reload();
    await expectNotice(page, "polite", FR.title, FR.body(fixed));
  });

  test("« Annuler » and Escape change nothing, send nothing, and give the focus back to the button", async ({ page, db, seededEvent }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    for (const close of [() => cancel(page).click(), () => page.keyboard.press("Escape")]) {
      await button(page, FR.fix).click();
      await field(page).fill(address());
      await close();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(button(page, FR.fix)).toBeFocused();
      await expectNotice(page, "polite", FR.title, FR.body(email));
    }
    expect(await mailTo(email)).toEqual([]);
    // Reopened, the field is loaded with the address again.
    await button(page, FR.fix).click();
    await expect(field(page)).toHaveValue(email);
  });

  test("an address that is not one: the error under the field, which has the focus, the sheet open, nothing sent", async ({ page, db, seededEvent }) => {
    const email = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill("camille.exemple.fr");
    await send(page).click();

    await expect(sheet(page).getByText("Adresse e-mail non valide.")).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    expect(await mailTo(email)).toEqual([]);
  });

  test("offline: « L’e-mail n’est pas parti » above « Envoyer le lien », which has the focus, the sheet open with what was typed", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const email = address();
    const fixed = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill(fixed);
    await context.setOffline(true);
    try {
      await send(page).click();
      await expect(sheetAlerts(page)).toHaveText(["L’e-mail n’est pas parti. Vérifiez la connexion, puis réessayez."]);
    } finally {
      await context.setOffline(false);
    }
    await expect(send(page)).toBeFocused();
    await expect(field(page)).toHaveValue(fixed);
    expect((await box(sheetAlerts(page))).y).toBeLessThan((await box(send(page))).y);
    expect(await mailTo(fixed)).toEqual([]);
  });

  test("a failure of Brevo: the sheet stays open with « L’e-mail n’est pas parti » and what was typed, the retry from the sheet sends and closes it, one link serves", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    const fixed = address();
    await answerMail([fixed], { kind: "error" });
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill(fixed);
    await send(page).click();

    await expect(sheetAlerts(page)).toHaveText(["L’e-mail n’est pas parti. Vérifiez la connexion, puis réessayez."]);
    await expect(sheet(page)).toBeVisible();
    await expect(send(page)).toBeFocused();
    await expect(field(page)).toHaveValue(fixed);
    expect(await mailTo(fixed)).toHaveLength(1);

    await answerMail([fixed], { kind: "ok" });
    await send(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button(page, FR.fix)).toBeFocused();
    await expectNotice(page, "polite", FR.title, FR.body(fixed));
    expect(await mailTo(fixed)).toHaveLength(2);
    // The failed attempt's link is gone with the first email's: the last email's alone serves.
    const links = await db.selectFrom("email_link").select("kind").where("event_id", "=", seededEvent.id).execute();
    expect(links).toEqual([{ kind: "confirmation" }]);
  });

  test("past 3 emails in the hour for the event: « Trop d’envois » in the same place, nothing sent, the notice as it was", async ({
    page,
    db,
    seededEvent,
  }) => {
    const email = address();
    const fixed = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await seedSends(db, CONFIRMATIONS_PER_EVENT, { kind: "confirmation", email, eventId: seededEvent.id });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill(fixed);
    await send(page).click();

    await expect(sheetAlerts(page)).toHaveText([FR.tooMany]);
    await expect(send(page)).toBeFocused();
    expect(await mailTo(fixed)).toEqual([]);
    await cancel(page).click();
    await expectNotice(page, "polite", FR.title, FR.body(email));
  });

  test("a correction counts in the limit of OA2.4: « Renvoyer l’e-mail » is then stopped", async ({ page, db, seededEvent }) => {
    const email = address();
    const fixed = address();
    await seedPendingSend(db, seededEvent.id, { email, status: "sent", at: ago(HOUR) });
    await seedSends(db, CONFIRMATIONS_PER_EVENT - 2, { kind: "confirmation", email, eventId: seededEvent.id });
    await page.goto(organiserPath(seededEvent));
    await button(page, FR.fix).click();
    await field(page).fill(fixed);
    await send(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The third email of the hour is this resend's; the fourth would not go.
    await button(page, FR.resend).click();
    await expect(messages(page)).toHaveText([FR.resent(fixed)]);
    await button(page, FR.resend).click();
    await expect(messages(page).filter({ hasText: FR.tooMany })).toHaveCount(1);
    expect(await mailTo(fixed)).toHaveLength(2);
  });
});
