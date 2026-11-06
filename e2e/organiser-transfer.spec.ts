import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import { POLL_MS } from "@/app/e/[id]/admin/screen-state";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSends, seedSession } from "@/db/test-accounts";
import { seedPendingSend } from "@/db/test-events";
import { CONFIRMATIONS_PER_ADDRESS, TRANSFERS_PER_EVENT } from "@/domain/send-limits";
import { startTransferInDb } from "./event-db";
import { expect, leaveNoToken, test, TAP_TARGET_MIN } from "./fixtures";
import { answerMail, mailTo, newAddress } from "./mailbox";
import { LEGS_EXAMPLE_PHONE, organiserPath, seedWithoutCar, unfoldLegs } from "./organiser";

/*
 * #947, epic #935: « Céder l'événement » in the organiser's panel (OT1.1 to OT1.6, OT2.2, OT5, OT8.4,
 * OT8.5): the section at the bottom, its sheet, and the notice « Cession en attente » at the top.
 * The events are the seeded one, confirmed by an account of the test's own whose session the
 * browser keeps; a handover waiting is seeded in the database, its dates in the past, no clock
 * moved forward. No assertion here prints a token nor an address.
 */

leaveNoToken();

test.use({ locale: "fr-FR" });

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  title: "Céder l’événement",
  body: "Une autre personne reprend l’organisation avec son adresse e-mail. Dès qu’elle ouvre le lien, l’événement quitte Mes événements et vous n’y avez plus accès.",
  start: "Choisir une adresse",
  note: "Tant que le lien n’est pas ouvert, vous gardez l’accès et vous pouvez annuler. Une fois ouvert, l’événement quitte Mes événements et vous n’y avez plus accès.",
  label: "Adresse e-mail de la personne qui reprend",
  hint: "Elle n’a pas besoin d’avoir un compte : il sera créé quand elle ouvrira le lien.",
  send: "Envoyer le lien",
  cancel: "Annuler",
  required: "Champ requis.",
  invalid: "Adresse e-mail non valide.",
  self: "C’est l’adresse de votre compte. Indiquez celle de la personne qui reprend.",
  offline: "L’e-mail n’est pas parti. Vérifiez la connexion, puis réessayez.",
  tooMany: "Trop d’envois. Réessayez dans une heure.",
  pendingTitle: "Cession en attente",
  sending: (email: string) => `Envoi du lien à ${email}…`,
  sent: (email: string) => `Nous avons envoyé un lien à ${email}. Tant qu’il n’est pas ouvert, vous gardez l’accès à cet événement.`,
  failedTitle: "L’e-mail n’a peut-être pas été envoyé",
  failed: (email: string) =>
    `Le lien pour ${email} n’a peut-être pas été envoyé. Utilisez « Renvoyer l’e-mail » : si le premier arrive quand même, les deux liens restent valables. Vous gardez l’accès.`,
  limitTitle: "L’e-mail n’est pas parti",
  limit: (email: string) =>
    `Trop d’e-mails sont partis vers ${email} cette heure-ci. Dans une heure, utilisez « Renvoyer l’e-mail ». Vous gardez l’accès.`,
  expiredTitle: "Le lien a expiré",
  expired: (email: string) => `Le lien envoyé à ${email} n’est plus valable. Envoyez-en un nouveau, ou annulez la cession. Vous gardez l’accès.`,
  confirm: "Confirmez votre adresse",
  erased: "Inscriptions effacées",
  orphan: "Cet événement n’a plus d’organisateur",
};

const DAY = 24 * 60 * 60_000;

let accounts: string[] = [];
test.afterEach(async ({ db }) => {
  // The database refuses an organiser-less event with a handover waiting (`event_transfer_open`): it is cancelled first.
  // The account's sessions go with it, by ON DELETE CASCADE; an event it holds is left without an organiser.
  if (accounts.length > 0) {
    await db
      .updateTable("event")
      .set({ transfer_email: null, transfer_status: null, transfer_status_at: null })
      .where("account_id", "in", accounts)
      .execute();
    await db.deleteFrom("account").where("id", "in", accounts).execute();
  }
  accounts = [];
});

/** Event `eventId` confirmed by an account of the test's own, whose session the browser keeps from the next document on. */
async function organise(page: Page, db: Kysely<Database>, eventId: string) {
  const email = newAddress();
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const session = await seedSession(db, accountId);
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", eventId).execute();
  await page.addInitScript((value) => localStorage.setItem("fullcar:session", value), session);
  return { email, accountId, session };
}

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const section = (page: Page) => panel(page).getByRole("region", { name: FR.title });
const start = (page: Page) => section(page).getByRole("button", { name: FR.start, exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.title });
const field = (page: Page) => sheet(page).getByLabel(FR.label, { exact: true });
const send = (page: Page) => sheet(page).getByRole("button", { name: FR.send, exact: true });
const notice = (page: Page) => page.locator("[data-transfer-notice]");
const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** What the database keeps of the handover of event `eventId`: nothing written is nothing here. */
async function kept(db: Kysely<Database>, eventId: string) {
  const event = await db
    .selectFrom("event")
    .select(["transfer_email", "transfer_status", "account_id"])
    .where("id", "=", eventId)
    .executeTakeFirstOrThrow();
  const links = await db.selectFrom("email_link").select("used_at").where("event_id", "=", eventId).where("kind", "=", "transfer").execute();
  return { ...event, links: links.length, used: links.filter((link) => link.used_at !== null).length };
}

/** The notice says `title` then `body`, in its one region. */
async function expectNotice(page: Page, title: string, body: string, timeout?: number) {
  await expect(notice(page).locator("p")).toHaveText([title, body], { timeout });
  await expect(notice(page)).toHaveAttribute("role", "status");
}

test("OT1.1: the section is the last of the panel, with its words and a button of 44 px; at 360 px nothing overflows", async ({
  page,
  db,
  seededEvent,
}) => {
  await organise(page, db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));

  await expect(section(page).getByRole("heading", { name: FR.title, level: 3 })).toBeVisible();
  await expect(section(page).getByText(FR.body, { exact: true })).toBeVisible();
  await expect(start(page)).toBeVisible();
  expect((await box(start(page))).height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
  // After « Personnes inscrites », the panel's last section, and inside the panel.
  const [persons, handover, region] = await Promise.all(
    [panel(page).getByRole("region", { name: "Personnes inscrites" }), section(page), panel(page)].map(box),
  );
  expect(handover.y).toBeGreaterThanOrEqual(persons.y + persons.height - 1);
  expect(handover.y + handover.height).toBeLessThanOrEqual(region.y + region.height);
  await expect(notice(page)).toHaveCount(0);
  expect(await overflow(page)).toBe(0);
});

test.describe("OT5: what cannot be handed over", () => {
  test("OT5.1: an event awaiting its creator's confirmation has no section, whoever opens it", async ({ page, db, seededEvent }) => {
    await seedPendingSend(db, seededEvent.id, { email: newAddress(), status: "sent" });
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`fullcar:admin-token:${seededEvent.id}`, seededEvent.token]);
    await page.goto(organiserPath(seededEvent));
    await expect(page.getByText(FR.confirm, { exact: true })).toBeVisible();
    await expect(page.getByText(FR.title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: FR.start })).toHaveCount(0);
  });

  test("OT5.2: an anonymised event has its own screen and no section", async ({ page, db, seededEvent }) => {
    await organise(page, db, seededEvent.id);
    await anonymiseEvent(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(page.getByRole("main").getByText(FR.erased, { exact: true })).toBeVisible();
    await expect(page.getByText(FR.title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: FR.start })).toHaveCount(0);
  });

  test.describe("an event over, not anonymised yet", () => {
    test.use({ eventFields: { allerAt: "2026-09-12 07:30:00", retourAt: "2026-09-12 18:00:00" } });

    test("OT5.2: the section stays, with the same sheet", async ({ page, db, seededEvent }) => {
      await organise(page, db, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      await expect(start(page)).toBeVisible();
      await start(page).click();
      await expect(field(page)).toBeFocused();
    });
  });

  test("OT5.3: an event without an organiser has its own screen and no section", async ({ page, db, seededEvent }) => {
    const { accountId } = await organise(page, db, seededEvent.id);
    await db.deleteFrom("account").where("id", "=", accountId).execute();
    await page.goto(organiserPath(seededEvent));
    await expect(page.getByRole("heading", { name: FR.orphan })).toBeVisible();
    await expect(page.getByText(FR.title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: FR.start })).toHaveCount(0);
  });
});

test.describe("the sheet", () => {
  test.beforeEach(async ({ page, db, seededEvent }) => {
    await organise(page, db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(start(page)).toBeVisible();
    await start(page).click();
    await expect(sheet(page)).toBeVisible();
  });

  test("OT1.2, OT8.5: empty, the focus in the field, its note and its hint; « Annuler » and Escape change nothing and the focus goes back", async ({
    page,
    db,
    seededEvent,
  }) => {
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue("");
    await expect(sheet(page).getByText(FR.note, { exact: true })).toBeVisible();
    await expect(sheet(page).getByText(FR.hint, { exact: true })).toBeVisible();
    await expect(send(page)).toBeVisible();
    for (const control of [send(page), sheet(page).getByRole("button", { name: FR.cancel, exact: true })]) {
      expect((await box(control)).height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
    }
    await sheet(page).getByRole("button", { name: FR.cancel, exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(start(page)).toBeFocused();

    await start(page).click();
    await expect(field(page)).toBeFocused();
    await field(page).fill(newAddress());
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(start(page)).toBeFocused();
    expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: null, links: 0 });
  });

  for (const [name, typed, message] of [
    ["empty", "", FR.required],
    ["not an address", "marie.dupont@", FR.invalid],
    ["300 characters", `${"x".repeat(289)}@exemple.fr`, FR.invalid],
  ] as const) {
    test(`OT1.3: ${name}: the error under the field, nothing sent, nothing written`, async ({ page, db, seededEvent }) => {
      await field(page).fill(typed);
      await send(page).click();
      await expect(sheet(page).getByText(message, { exact: true })).toBeVisible();
      await expect(field(page)).toHaveAttribute("aria-invalid", "true");
      await expect(field(page)).toBeFocused();
      // Under the field.
      expect((await box(sheet(page).getByText(message, { exact: true }))).y).toBeGreaterThan((await box(field(page))).y);
      await expect(sheet(page)).toBeVisible();
      await expect(notice(page)).toHaveCount(0);
      expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: null, links: 0 });
    });
  }

  test("OT1.3: a real field scrolls a long address, it does not cut it with an ellipsis; the sheet does not overflow", async ({ page }) => {
    await field(page).fill(`${"x".repeat(289)}@exemple.fr`);
    const shape = await field(page).evaluate((input: HTMLInputElement) => ({
      scrolls: input.scrollWidth > input.clientWidth,
      ellipsis: getComputedStyle(input).textOverflow === "ellipsis",
    }));
    expect(shape).toEqual({ scrolls: true, ellipsis: false });
    expect(await overflow(page)).toBe(0);
  });

  test("OT1.4: the account's own address is refused under the field, nothing sent", async ({ page, db, seededEvent }) => {
    const own = await db
      .selectFrom("account")
      .innerJoin("event", "event.account_id", "account.id")
      .select("account.email")
      .where("event.id", "=", seededEvent.id)
      .executeTakeFirstOrThrow();
    await field(page).fill(`  ${own.email.toUpperCase()} `);
    await send(page).click();
    await expect(sheet(page).getByText(FR.self, { exact: true })).toBeVisible();
    await expect(field(page)).toBeFocused();
    expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: null, links: 0 });
    expect(await mailTo(own.email)).toEqual([]);
  });

  test("OT1.6: offline, the sheet stays open with its words above « Envoyer le lien » and the typed address", async ({ page, context, db, seededEvent }) => {
    const address = newAddress();
    await field(page).fill(address);
    await context.setOffline(true);
    try {
      await send(page).click();
      await expect(sheet(page).getByRole("alert").filter({ hasText: FR.offline })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await expect(send(page)).toBeFocused();
    await expect(field(page)).toHaveValue(address);
    expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: null, links: 0 });
    expect(await mailTo(address)).toEqual([]);
  });

  test("OT1.6: the limit of the event, in the same place, the typed address kept, nothing written", async ({ page, db, seededEvent }) => {
    const address = newAddress();
    await seedSends(db, TRANSFERS_PER_EVENT, { kind: "transfer", email: newAddress(), eventId: seededEvent.id });
    await field(page).fill(address);
    await send(page).click();
    await expect(sheet(page).getByRole("alert").filter({ hasText: FR.tooMany })).toBeVisible();
    await expect(send(page)).toBeFocused();
    await expect(field(page)).toHaveValue(address);
    expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: null, links: 0 });
  });

  test("OT1.5, OT8.5: sent, the sheet closes, the notice announces it and has the focus, the section goes; the event keeps its account and its numbers", async ({
    page,
    db,
    seededEvent,
  }) => {
    const address = newAddress();
    const before = await kept(db, seededEvent.id);
    await field(page).fill(address);
    await send(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(notice(page)).toBeFocused();
    await expect(notice(page)).toHaveAttribute("role", "status");
    await expect(notice(page).locator("p").first()).toHaveText(FR.pendingTitle);
    await expect(notice(page)).toContainText(address);
    await expect(section(page)).toHaveCount(0);
    // Read again until the email's result is kept, without reloading.
    await expectNotice(page, FR.pendingTitle, FR.sent(address), 10_000 + 3 * POLL_MS);
    expect(await mailTo(address)).toHaveLength(1);
    expect(await kept(db, seededEvent.id)).toEqual({ ...before, transfer_email: address, transfer_status: "sent", links: 1, used: 0 });
    // The notice sits after the link to share.
    const [share, shown] = await Promise.all([panel(page).getByRole("group", { name: FR.shareLink }), notice(page)].map(box));
    expect(shown.y).toBeGreaterThanOrEqual(share.y + share.height);
    // Read again at a load.
    await page.reload();
    await expectNotice(page, FR.pendingTitle, FR.sent(address));
    await expect(section(page)).toHaveCount(0);
  });
});

test("OT1.5: the panel and the numbers stay readable for the one who hands over", async ({ page, db, seededEvent }) => {
  await organise(page, db, seededEvent.id);
  await seedWithoutCar(db, seededEvent.id, "Léa", ["aller"], LEGS_EXAMPLE_PHONE);
  await startTransferInDb(db, seededEvent.id, newAddress());
  await page.goto(organiserPath(seededEvent));
  await expect(notice(page)).toBeVisible();
  await unfoldLegs(page, ["aller"]);
  await expect(panel(page).getByRole("link", { name: new RegExp(LEGS_EXAMPLE_PHONE) })).toBeVisible();
});

test("OT1.6: an email that failed leaves the handover, said in the notice, the sheet closed", async ({ page, db, seededEvent }) => {
  await organise(page, db, seededEvent.id);
  const address = newAddress();
  await answerMail([address], { kind: "error" });
  await page.goto(organiserPath(seededEvent));
  await start(page).click();
  await field(page).fill(address);
  await send(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expectNotice(page, FR.failedTitle, FR.failed(address), 10_000 + 3 * POLL_MS);
  expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: address, transfer_status: "failed", links: 1 });
});

test("OT1.6: the limit of the address stops the email, said in the notice; the handover exists", async ({ page, db, seededEvent }) => {
  await organise(page, db, seededEvent.id);
  const address = newAddress();
  await seedSends(db, CONFIRMATIONS_PER_ADDRESS, { kind: "transfer", email: address });
  await page.goto(organiserPath(seededEvent));
  await start(page).click();
  await field(page).fill(address);
  await send(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expectNotice(page, FR.limitTitle, FR.limit(address));
  await expect(notice(page)).toBeFocused();
  expect(await mailTo(address)).toEqual([]);
  expect(await kept(db, seededEvent.id)).toMatchObject({ transfer_email: address, transfer_status: "address_limit" });
});

test.describe("OT2.2: the notice, in its five states, read at every load and on another device", () => {
  const address = newAddress();
  const seeded = [
    ["sending", FR.pendingTitle, FR.sending(address)],
    ["sent", FR.pendingTitle, FR.sent(address)],
    ["failed", FR.failedTitle, FR.failed(address)],
    ["addressLimit", FR.limitTitle, FR.limit(address)],
    ["expired", FR.expiredTitle, FR.expired(address)],
  ] as const;

  /** The handover in the state `send`, as the database keeps it. */
  async function hold(db: Kysely<Database>, eventId: string, send: (typeof seeded)[number][0]) {
    if (send === "sent") return startTransferInDb(db, eventId, address);
    if (send === "expired") return startTransferInDb(db, eventId, address, new Date(Date.now() - 8 * DAY));
    const status = { sending: "sending", failed: "failed", addressLimit: "address_limit" }[send] as "sending" | "failed" | "address_limit";
    const at = send === "failed" ? new Date(Date.now() - DAY) : new Date();
    await db.updateTable("event").set({ transfer_email: address, transfer_status: status, transfer_status_at: at }).where("id", "=", eventId).execute();
  }

  for (const [send, title, body] of seeded) {
    test(`${send}: at 1024 px, in the right column of the first row; again after a reload, and in another browser of the account`, async ({
      page,
      browser,
      baseURL,
      db,
      seededEvent,
    }) => {
      const { session } = await organise(page, db, seededEvent.id);
      await hold(db, seededEvent.id, send);
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(organiserPath(seededEvent));
      await expectNotice(page, title, body);
      await expect(section(page)).toHaveCount(0);
      const [share, shown, region] = await Promise.all([panel(page).getByRole("group", { name: FR.shareLink }), notice(page), panel(page)].map(box));
      expect(shown.x).toBeGreaterThan(share.x + share.width - 1);
      expect(shown.y).toBeLessThan(share.y + share.height);
      expect(shown.x + shown.width).toBeLessThanOrEqual(region.x + region.width);

      await page.reload();
      await expectNotice(page, title, body);

      const other = await browser.newContext({ baseURL, locale: "fr-FR" });
      try {
        await other.addInitScript((value) => localStorage.setItem("fullcar:session", value), session);
        const tab = await other.newPage();
        await tab.goto(organiserPath(seededEvent));
        await expectNotice(tab, title, body);
        await expect(section(tab)).toHaveCount(0);
      } finally {
        await other.close();
      }
    });
  }

  test("a 60-character address breaks and nothing overflows at 360 px; the notice is not in the tab order", async ({ page, db, seededEvent }) => {
    const long = `${"x".repeat(49)}@exemple.fr`;
    await organise(page, db, seededEvent.id);
    await startTransferInDb(db, seededEvent.id, long);
    await page.goto(organiserPath(seededEvent));
    await expect(notice(page)).toContainText(long);
    expect(await overflow(page)).toBe(0);
    const region = await box(panel(page));
    const shown = await box(notice(page));
    expect(shown.x + shown.width).toBeLessThanOrEqual(region.x + region.width);
    await expect(notice(page)).toHaveAttribute("tabindex", "-1");
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-GB" });

  test("OT8.4: the section, the sheet and the notice speak English", async ({ page, db, seededEvent }) => {
    await organise(page, db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const handover = page.getByRole("region", { name: "Hand over the event" });
    await expect(handover.getByText("Another person takes over the organising with their email address.", { exact: false })).toBeVisible();
    await handover.getByRole("button", { name: "Choose an address", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Hand over the event" });
    await expect(dialog.getByLabel("Email address of the person taking over", { exact: true })).toBeFocused();
    await expect(dialog.getByText("They do not need an account: it will be created when they open the link.", { exact: true })).toBeVisible();
    const address = newAddress();
    await dialog.getByLabel("Email address of the person taking over", { exact: true }).fill(address);
    await dialog.getByRole("button", { name: "Send the link", exact: true }).click();
    await expect(notice(page).locator("p").first()).toHaveText("Handover pending");
    await expect(notice(page)).toContainText(`${address}`);
  });
});
