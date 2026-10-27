import type { Page } from "@playwright/test";
import { anonymiseEvent } from "@/db/day-thirty";
import { seedPerson } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath, test as organiserTest } from "./organiser";

leaveNoToken();

/*
 * #799, OA8.3: a tab opened before day 30 that reads the event again after it shows
 * « Événement terminé », and nothing of the event's place, which the board above showed. Until
 * that page comes, nothing says a failure: the read is still under way. The seed: « Tournoi de
 * Rennes » at the « Gymnase des Gayeulles », on 2026-12-12 at 07:30.
 */

const PLACE = "Gymnase des Gayeulles";

/**
 * The page's requests, in one route: a server action answered with a 500 while `failing`,
 * held back until `release`, then sent, and what the server answered recorded as sent when
 * `record` (Chromium may discard a streamed body it has delivered); otherwise it goes on to the
 * context's routes. The page read again by `router.refresh()` is held until `releaseRefresh`.
 * One route: neither `fetch` nor `continue` reaches another.
 */
async function serverActions(page: Page, { failing, record = true }: { failing: boolean; record?: boolean }) {
  const actions = { failing, answers: [] as string[], refreshes: 0, release: () => {}, releaseRefresh: () => {} };
  const released = new Promise<void>((resolve) => (actions.release = resolve));
  const refreshReleased = new Promise<void>((resolve) => (actions.releaseRefresh = resolve));
  await page.route("**/e/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && (await request.headerValue("rsc"))) {
      actions.refreshes += 1;
      await refreshReleased;
      return route.fallback();
    }
    if (!(await request.headerValue("next-action"))) return route.fallback();
    if (actions.failing) return route.fulfill({ status: 500, body: "" });
    await released;
    if (!record) return route.fallback();
    const response = await route.fetch();
    actions.answers.push(await response.text());
    await route.fulfill({ response });
  });
  return actions;
}

/**
 * Next's route announcer, an `alert` of its own (#866): the page read again, it says its
 * `document.title` if it changed, or, when the read's `<title>` is not there yet as the page
 * shows, its h1, « Événement terminé ». A page that changes, not a failure.
 */
const ROUTE_ANNOUNCER = "#__next-route-announcer__";

/** Shown, the alerts of the page that say something: the bar's and the panel's regions are there empty. */
const saidAlerts = (page: Page) =>
  page
    .getByRole("alert")
    .filter({ hasText: /\S/ })
    .and(page.locator(`:not(${ROUTE_ANNOUNCER})`));

/** While the page is read again: the read still under way, no failure said, no « Réessayer ». */
async function expectNoFailure(page: Page, actions: { refreshes: number }, underWay: string) {
  await expect.poll(() => actions.refreshes, { message: "the page is read again" }).toBeGreaterThan(0);
  await expect(page.getByText(underWay, { exact: true }).first()).toBeVisible();
  await expect(saidAlerts(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Réessayer" })).toHaveCount(0);
}

async function expectEnded(page: Page, answers?: string[]) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement terminé");
  await expect(page.getByRole("main").getByText("Tournoi de Rennes", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  // What the page shows: its HTML still holds the data of its first render, before day 30.
  await expect(page.getByText(PLACE)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(PLACE);
  await expect(saidAlerts(page)).toHaveCount(0);
  // Nothing, or the page that came: never a failure, nor the place.
  await expect(page.locator(ROUTE_ANNOUNCER)).toHaveText(/^(|Événement terminé|Tournoi de Rennes)$/);
  if (!answers) return;
  expect(answers.length, "loadEventState was answered").toBeGreaterThan(0);
  for (const answer of answers) expect(answer).not.toContain(PLACE);
}

test.describe("OA8.3: a tab open while the event is anonymised", () => {
  test.use({ locale: "fr-FR" });

  test.beforeEach(async ({ db, page, seededEvent }) => {
    const token = newToken();
    await seedPerson(db, seededEvent.id, { firstName: "Camille" }, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("its first read, answered after the anonymisation, shows « Événement terminé »", async ({ db, page, seededEvent }) => {
    const actions = await serverActions(page, { failing: false });
    await page.goto(`/e/${seededEvent.id}`);
    // Rendered before day 30: the place above the board.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(page.getByText(PLACE).first()).toBeVisible();

    await anonymiseEvent(db, seededEvent.id);
    actions.release();
    await expectNoFailure(page, actions, "Chargement de vos inscriptions…");
    actions.releaseRefresh();
    await expectEnded(page, actions.answers);
  });

  test("« Réessayer », after the anonymisation, shows « Événement terminé »", async ({ db, page, seededEvent }) => {
    const actions = await serverActions(page, { failing: true });
    actions.release();
    await page.goto(`/e/${seededEvent.id}`);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    // The section's failure, which `saidAlerts` sees: only the route announcer is left out.
    await expect(saidAlerts(page)).toHaveCount(1);
    await expect(page.getByText(PLACE).first()).toBeVisible();

    await anonymiseEvent(db, seededEvent.id);
    actions.failing = false;
    await retry.click();
    await expectNoFailure(page, actions, "Chargement de vos inscriptions…");
    actions.releaseRefresh();
    await expectEnded(page, actions.answers);
  });
});

organiserTest.describe("OA8.3: the organiser's screen open while the event is anonymised", () => {
  organiserTest.use({ locale: "fr-FR" });

  // `BoardHandle.read`: « Actualiser » reads the board again, and it says the event ended.
  organiserTest("« Actualiser », after the anonymisation, shows « Événement terminé »", async ({ db, page, seededEvent }) => {
    const actions = await serverActions(page, { failing: false, record: false });
    actions.release();
    await page.goto(organiserPath(seededEvent));
    const refresh = page.getByRole("button", { name: "Actualiser" });
    await expect(refresh).toBeVisible();
    await expect(page.getByText(PLACE).first()).toBeVisible();

    await anonymiseEvent(db, seededEvent.id);
    await refresh.click();
    await expectNoFailure(page, actions, "Actualisation…");
    actions.releaseRefresh();
    await expectEnded(page);
  });
});
