import type { Page, TestInfo } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { parisToday } from "@/domain/day-thirty";
import type { NewEvent } from "@/domain/event";
import { addDays } from "@/domain/wall-clock";
import { startTransferInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";
import { newAddress } from "./mailbox";

leaveNoToken();

/*
 * #607, organizer-account OA6.1 to OA6.9 at WIDTH px (`make shot`, 360 by default): the three
 * sorts of rows, no event, the failed read, and long texts, without scrolling sideways. The
 * addresses are drawn on `.test`: nothing of a real person in a capture.
 */

test.use({ locale: "fr-FR" });

let accounts: string[] = [];
let events: string[] = [];
test.afterEach(async ({ db }) => {
  if (events.length > 0) await db.deleteFrom("event").where("id", "in", events).execute();
  if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
  accounts = [];
  events = [];
});

const day = (days: number, time = "09:00:00") => `${addDays(parisToday(new Date()), days)} ${time}`;

async function signIn(page: Page, db: Kysely<Database>, email = newAddress()) {
  const accountId = await seedAccount(db, { email });
  accounts.push(accountId);
  const token = await seedSession(db, accountId);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), ["fullcar:session", token]);
  return accountId;
}

async function eventOf(db: Kysely<Database>, accountId: string, fields: Partial<NewEvent>, anonymised = false) {
  const { id } = await seedEvent(db, fields);
  events.push(id);
  await db.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", id).execute();
  if (anonymised) await anonymiseEvent(db, id);
  return id;
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({ path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`, fullPage: true, animations: "disabled" });
}

test("my events: upcoming, past, anonymised, and « Afficher les 2 autres »", async ({ page, db }, testInfo) => {
  const accountId = await signIn(page, db);
  const soon = await eventOf(db, accountId, {
    title: "Tournoi de Rennes",
    location: "Gymnase Colette-Besson, Rennes",
    allerAt: day(7, "08:00:00"),
    retourAt: day(7, "18:00:00"),
  });
  for (const leg of ["aller", "aller", "retour", "retour", "retour"] as const) {
    const person = await seedPerson(db, soon);
    await seedPlacement(db, { personId: person.id, eventId: soon, leg, rideId: null });
  }
  await eventOf(db, accountId, { title: "Week-end au ski", location: "Les Saisies", allerAt: day(40, "18:30:00"), retourAt: null });
  await eventOf(db, accountId, { title: "Match à Vitré", location: "Stade municipal, Vitré", allerAt: day(-9), retourAt: null });
  await eventOf(db, accountId, { title: "Rando d’automne", location: "Brocéliande", allerAt: day(-30), retourAt: null });
  for (let n = 1; n <= 10; n += 1) {
    const fields = { title: `Sortie scouts n° ${n}`, location: "Forêt de Paimpont", allerAt: day(-40 - n), retourAt: null };
    await eventOf(db, accountId, fields, true);
  }
  await page.goto("/mes-evenements");
  await expect(page.getByRole("button", { name: "Afficher les 2 autres" })).toBeVisible();
  await shoot(page, testInfo, "my-events");
});

test("my events: none yet", async ({ page, db }, testInfo) => {
  await signIn(page, db);
  await page.goto("/mes-evenements");
  await expect(page.getByRole("heading", { name: "Aucun événement pour l’instant" })).toBeVisible();
  await shoot(page, testInfo, "my-events-empty");
});

test("my events: the read failed", async ({ page, db }, testInfo) => {
  await signIn(page, db);
  await page.route("**/mes-evenements", (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback(),
  );
  await page.goto("/mes-evenements");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await shoot(page, testInfo, "my-events-failed");
});

test("my events: long texts", async ({ page, db }, testInfo) => {
  const accountId = await signIn(page, db, `${"c".repeat(60 - "@mailbox.test".length)}@mailbox.test`);
  await eventOf(db, accountId, { title: "T".repeat(80), location: "G".repeat(120), allerAt: day(7), retourAt: null });
  await page.goto("/mes-evenements");
  await expect(page.getByText("T".repeat(80))).toBeVisible();
  await shoot(page, testInfo, "my-events-long");
});

// Epic #935, screens 22 and 25 (OT2.8, OT8.3): a handover pending, then expired with an address of 60 characters.
test("my events: a handover pending", async ({ page, db }, testInfo) => {
  const accountId = await signIn(page, db);
  const ski = await eventOf(db, accountId, { title: "Week-end ski", location: "Les Gets", allerAt: day(7), retourAt: null });
  const camp = await eventOf(db, accountId, { title: "Camp d’été", location: "Annecy", allerAt: day(14), retourAt: null });
  const long = `${"d".repeat(60 - "@mailbox.test".length)}@mailbox.test`;
  await startTransferInDb(db, ski, "marie.dupont@mailbox.test");
  await startTransferInDb(db, camp, long, new Date(Date.now() - 8 * 24 * 60 * 60_000));
  await page.goto("/mes-evenements");
  await expect(page.getByText(`Cession en attente de ${long}`, { exact: true })).toBeVisible();
  await shoot(page, testInfo, "my-events-transfer");
});
