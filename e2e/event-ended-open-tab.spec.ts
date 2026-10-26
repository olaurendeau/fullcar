import type { Page } from "@playwright/test";
import { anonymiseEvent } from "@/db/day-thirty";
import { seedPerson } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #799, OA8.3: a tab opened before day 30 that reads the event again after it shows
 * « Événement terminé », and nothing of the event's place, which the board above showed. The
 * seed: « Tournoi de Rennes » at the « Gymnase des Gayeulles », on 2026-12-12 at 07:30.
 */

const PLACE = "Gymnase des Gayeulles";

/**
 * The server actions, in one route: answered with a 500 while `failing`, held back until
 * `release`, then sent, and what the server answered recorded, as sent (Chromium may discard
 * a streamed body it has delivered). One route: neither `fetch` nor `continue` reaches another.
 */
async function serverActions(page: Page, { failing }: { failing: boolean }) {
  const actions = { failing, answers: [] as string[], release: () => {} };
  const released = new Promise<void>((resolve) => (actions.release = resolve));
  await page.route("**/e/**", async (route) => {
    if (!(await route.request().headerValue("next-action"))) return route.continue();
    if (actions.failing) return route.fulfill({ status: 500, body: "" });
    await released;
    const response = await route.fetch();
    actions.answers.push(await response.text());
    await route.fulfill({ response });
  });
  return actions;
}

async function expectEnded(page: Page, answers: string[]) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement terminé");
  await expect(page.getByRole("main").getByText("Tournoi de Rennes", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  // What the page shows: its HTML still holds the data of its first render, before day 30.
  await expect(page.getByText(PLACE)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(PLACE);
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
    await expectEnded(page, actions.answers);
  });

  test("« Réessayer », after the anonymisation, shows « Événement terminé »", async ({ db, page, seededEvent }) => {
    const actions = await serverActions(page, { failing: true });
    actions.release();
    await page.goto(`/e/${seededEvent.id}`);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    await expect(page.getByText(PLACE).first()).toBeVisible();

    await anonymiseEvent(db, seededEvent.id);
    actions.failing = false;
    await retry.click();
    await expectEnded(page, actions.answers);
  });
});
