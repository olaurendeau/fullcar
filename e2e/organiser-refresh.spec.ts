import type { Locator, Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { leaveNoToken } from "./fixtures";
import { digitsOf, expect, organiserPath, SCENE_PHONES, seedOrganiserScene, test } from "./organiser";

/*
 * #182, epic #154: « Actualiser » reads the panel and the board again, and applies both or
 * nothing (O1.9). Another device's changes are written in the database. The fixture
 * `organiserTraffic` checks every test for the token (O6.1) and the storage (O2.10).
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  refreshing: "Actualisation…",
  refreshed: "Espace organisateur actualisé.",
  failedTitle: "L’espace organisateur n’a pas pu être actualisé.",
  failedBody:
    "Ce qui est affiché date du dernier chargement. Vérifiez la connexion, puis utilisez de nouveau « Actualiser ».",
};

/** Who another device declares without a car at the aller. */
const NEWCOMER = "Gaspard";

// `includeHidden`: found under a sheet's aria-hidden too, where a test says nothing is written.
const panel = (page: Page) => page.getByRole("region", { name: FR.panel, includeHidden: true });
const refresh = (page: Page) => panel(page).getByRole("button", { name: FR.refresh, includeHidden: true });
const status = (page: Page) => panel(page).getByRole("status", { includeHidden: true });
const alertRegion = (page: Page) => panel(page).getByRole("alert", { includeHidden: true });
const board = (page: Page) => page.getByRole("tabpanel");
const allerSection = (page: Page) => panel(page).getByRole("region", { name: "Aller", exact: true });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("no box");
  return found;
}

/** A server action: a POST with a `next-action` header. */
function isAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

/** Which read an action is: the panel's carries the admin token in its body, the board's does not. */
function readOf(request: Request, { token }: SeededEvent): "panel" | "board" {
  return (request.postData() ?? "").includes(token) ? "panel" : "board";
}

const adminPage = (url: URL) => url.pathname.endsWith("/admin");

/**
 * Fails, from now on, every action whose request `failing` picks while it does: the server
 * answers, and a 500 reaches the browser instead (`"500"`), or the connection is lost
 * (`"abort"`). The others go on to the fixture's route.
 */
async function failActionWhere(page: Page, failing: (request: Request) => boolean, how: "500" | "abort" = "500") {
  await page.route(adminPage, async (route) => {
    const request = route.request();
    if (!isAction(request) || !failing(request)) return route.fallback();
    if (how === "abort") return route.abort("failed");
    await route.fetch();
    await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
  });
}

/** Holds, from now on, every action `holding` picks, until it is let through or lost. */
async function holdActionWhere(page: Page, holding: (request: Request) => boolean) {
  const held: Route[] = [];
  await page.route(adminPage, async (route) => {
    if (!isAction(route.request()) || !holding(route.request())) return route.fallback();
    held.push(route);
  });
  return {
    held: () => held.length,
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
    lose: async () => {
      for (const route of held.splice(0)) await route.abort("failed");
    },
  };
}

/** Counts the reads the page sends from now on, by what they read. */
function countReads(page: Page, event: SeededEvent) {
  const sent = { panel: 0, board: 0 };
  page.on("request", (request) => {
    if (isAction(request)) sent[readOf(request, event)] += 1;
  });
  return sent;
}

/** A person without a car at the aller, written as another device would. */
async function newcomer(db: Kysely<Database>, eventId: string) {
  const { id } = await seedPerson(db, eventId, { firstName: NEWCOMER, phone: "06 44 21 87 30" });
  await seedPlacement(db, { personId: id, eventId, leg: "aller", rideId: null });
}

/** The panel's text, its alert left out. */
const panelText = (page: Page) =>
  panel(page).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const region of copy.querySelectorAll("[role=alert]")) region.remove();
    return copy.textContent;
  });

/** Marks « Actualiser », then says whether that very element has the focus: never `<body>`, never a new button. */
async function watchFocus(page: Page): Promise<() => Promise<boolean>> {
  await refresh(page).evaluate((button) => Object.assign(window, { refreshButton: button }));
  return () => page.evaluate(() => document.activeElement === (window as unknown as { refreshButton: Element }).refreshButton);
}

/** Every text the panel's alert region holds, recorded from now on. */
async function recordAlert(page: Page): Promise<() => Promise<string[]>> {
  await alertRegion(page).evaluate((region) => {
    const texts: string[] = [];
    Object.assign(window, { alertTexts: texts });
    new MutationObserver(() => texts.push(region.textContent ?? "")).observe(region, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { alertTexts: string[] }).alertTexts);
}

test.use({ locale: "fr-FR" });

test.beforeEach(async ({ db, page, seededEvent }) => {
  await seedOrganiserScene(db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));
  await expect(refresh(page)).toBeVisible();
});

for (const viewport of [
  { width: 360, height: 780 },
  { width: 1280, height: 800 },
]) {
  test(`O1.8, O7.4: at ${viewport.width} px, while the read runs nothing moves and a second press sends nothing; then the newcomer is in the panel and the board`, async ({
    page,
    db,
    seededEvent,
  }) => {
    await page.setViewportSize(viewport);
    await newcomer(db, seededEvent.id);
    const reads = countReads(page, seededEvent);
    const hold = await holdActionWhere(page, (request) => readOf(request, seededEvent) === "panel");
    const button = await box(refresh(page));
    const height = (await box(panel(page))).height;
    expect(button.height).toBeGreaterThanOrEqual(44);

    await refresh(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(hold.held).toBe(1);
    await expect(refresh(page)).toHaveAttribute("aria-disabled", "true");
    await expect(refresh(page)).toHaveText(FR.refresh);
    await expect(refresh(page).locator("svg.animate-spin")).toHaveCount(1);
    await expect(refresh(page)).toBeFocused();
    await expect(status(page)).toHaveText(FR.refreshing);
    expect(await box(refresh(page))).toEqual(button);
    expect((await box(panel(page))).height).toBe(height);

    await page.keyboard.press("Enter");
    // A tap: Playwright waits for an aria-disabled button to be enabled, which a person does not.
    await refresh(page).click({ force: true });
    await expect(refresh(page)).toBeFocused();
    await expect(page.getByText(NEWCOMER)).toHaveCount(0);

    await hold.release();
    await expect(status(page)).toHaveText(FR.refreshed);
    await expect(allerSection(page).getByText(NEWCOMER)).toBeVisible();
    await expect(board(page).getByText(NEWCOMER)).toBeVisible();
    await expect(refresh(page)).not.toHaveAttribute("aria-disabled");
    await expect(refresh(page)).toBeFocused();
    await page.waitForLoadState("networkidle");
    expect(reads).toEqual({ panel: 1, board: 1 });
  });
}

for (const failing of ["board", "panel"] as const) {
  for (const how of ["500", "abort"] as const) {
    test(`O1.9, O5.4, O5.8: the ${failing}'s read fails (${how}), the other answers: nothing changes, the alert once, the focus stays after a click`, async ({
      page,
      db,
      seededEvent,
    }) => {
      const panelBefore = await panelText(page);
      const boardBefore = await board(page).innerText();
      await newcomer(db, seededEvent.id);
      const reads = countReads(page, seededEvent);
      await failActionWhere(page, (request) => readOf(request, seededEvent) === failing, how);
      const focused = await watchFocus(page);

      await refresh(page).click();
      await expect(alertRegion(page)).toContainText(FR.failedTitle);
      await expect(alertRegion(page)).toContainText(FR.failedBody);
      await expect(page.getByText(FR.failedTitle)).toHaveCount(1);
      await expect(alertRegion(page).getByRole("button")).toHaveCount(0);
      expect(await focused()).toBe(true);
      await expect(refresh(page)).not.toHaveAttribute("aria-disabled");
      expect(reads).toEqual({ panel: 1, board: 1 });

      expect(await panelText(page)).toBe(panelBefore);
      expect(await board(page).innerText()).toBe(boardBefore);
      await expect(page.getByText(NEWCOMER)).toHaveCount(0);
      await expect(status(page)).toHaveText("");
    });
  }
}

test("O1.9, O5.4, O5.8: two failures announced twice, under the title; the next success clears the alert and says so; the focus stays", async ({
  page,
  seededEvent,
}) => {
  let failing = true;
  await failActionWhere(page, (request) => failing && readOf(request, seededEvent) === "board");
  const texts = await recordAlert(page);
  const focused = await watchFocus(page);
  const said = `${FR.failedTitle}${FR.failedBody}`;

  await refresh(page).focus();
  await page.keyboard.press("Enter");
  await expect(alertRegion(page)).toHaveText(said);
  const title = await box(panel(page).getByRole("heading", { level: 2 }));
  const alert = await box(alertRegion(page));
  expect(alert.y).toBeGreaterThan(title.y + title.height);
  expect(alert.y).toBeLessThan((await box(panel(page).getByRole("group").first())).y);
  expect(await focused()).toBe(true);

  await page.keyboard.press("Enter");
  await expect.poll(texts).toEqual([said, "", said]);
  expect(await focused()).toBe(true);

  failing = false;
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(FR.refreshed);
  await expect(alertRegion(page)).toHaveText("");
  expect(await focused()).toBe(true);
});

test("O2.7: once C has a seat at the aller, the answers to « Actualiser » hold no number of hers", async ({
  page,
  db,
  seededEvent,
  organiserTraffic,
}) => {
  const hers = digitsOf(SCENE_PHONES.c);
  const holdsHers = (answer: string) => hers.some((form) => answer.includes(form));
  const answers = async () => (await organiserTraffic.exchanges()).filter((each) => each.action).map((each) => each.answer);
  const before = await answers();
  expect(before.filter(holdsHers).length, "first reads with C's number").toBe(1);

  // C takes the free seat in Anaïs's car, as another device would.
  const { id: rideId } = await db
    .selectFrom("ride")
    .select("id")
    .where("event_id", "=", seededEvent.id)
    .executeTakeFirstOrThrow();
  const { id: chloe } = await db
    .selectFrom("person")
    .select("id")
    .where("event_id", "=", seededEvent.id)
    .where("first_name", "=", "Chloé")
    .executeTakeFirstOrThrow();
  await db
    .updateTable("placement")
    .set({ ride_id: rideId })
    .where("event_id", "=", seededEvent.id)
    .where("leg", "=", "aller")
    .where("person_id", "=", chloe)
    .execute();

  await refresh(page).click();
  await expect(status(page)).toHaveText(FR.refreshed);
  const after = (await answers()).slice(before.length);
  expect(after.length, "answers to « Actualiser »").toBe(2);
  expect(after.filter(holdsHers).length, "answers with C's number").toBe(0);
  await expect(allerSection(page)).not.toContainText("Chloé");
});

test("O5.4: a read that ends under a sheet writes nothing there; its alert comes once the sheet is closed", async ({
  page,
  seededEvent,
}) => {
  const hold = await holdActionWhere(page, (request) => readOf(request, seededEvent) === "panel");
  await refresh(page).click();
  await expect.poll(hold.held).toBe(1);
  await board(page).getByRole("button", { name: "Ajouter une personne" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await panel(page).evaluate((element) => element.closest("[aria-hidden=true]") !== null)).toBe(true);
  const texts = await recordAlert(page);

  await hold.lose();
  await expect(refresh(page)).not.toHaveAttribute("aria-disabled");
  await expect(alertRegion(page)).toHaveText("");
  expect(await texts()).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(alertRegion(page)).toHaveText(`${FR.failedTitle}${FR.failedBody}`);
  expect(await panel(page).evaluate((element) => element.closest("[aria-hidden=true]") === null)).toBe(true);
});

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("O7.5: the alert's frame has the panel's width, its text is narrower", async ({ page, seededEvent }) => {
    await failActionWhere(page, (request) => readOf(request, seededEvent) === "board");
    await refresh(page).click();
    await expect(alertRegion(page)).toContainText(FR.failedTitle);
    const line = await box(panel(page).getByRole("heading", { level: 2 }).locator(".."));
    const frame = await box(alertRegion(page).locator(".."));
    const text = await box(alertRegion(page));
    expect(Math.abs(frame.width - line.width)).toBeLessThanOrEqual(2);
    expect(text.width).toBeLessThan(frame.width - 100);
  });
});
