import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";

/*
 * The device of a test (#87, #162): its personal token, drawn here and seeded with its
 * persons, then set in `localStorage` before the page's scripts run, under the event's own
 * key; the server actions held back or failed, for the states before the persons are known
 * and for a sheet that closes meanwhile; and the message bar.
 */

/** A well-formed personal token, of a test's own. */
export const newToken = () => personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));

/** Puts the device's token for event `id` in `localStorage` before any script of the page runs. */
export async function holdToken(page: Page, id: string, token: string) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`fullcar:personal-token:${id}`, token]);
}

/** Holds back every server action until `release` is called. */
export async function holdActions(page: Page) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/e/**", async (route) => {
    if (await route.request().headerValue("next-action")) await released;
    await route.continue();
  });
  return release;
}

/**
 * The message bar's alert, after its status region, where a failure goes once no sheet hides
 * the page. Found by its CSS, as Radix hides the page from the accessibility tree while a sheet
 * is mounted: it proves the message is shown, not that it is announced (see `watchAlerts`).
 */
export const bar = (page: Page) => page.locator('[role="status"] + [role="alert"]');

/** Records, as each alert fills, whether it was in a sheet, and whether the bar had an ancestor hidden. */
export async function watchAlerts(page: Page) {
  await page.evaluate(() => {
    const seen = ((window as unknown as { seenAlerts: object }).seenAlerts = { inSheet: false, barHidden: false });
    new MutationObserver(() => {
      for (const alert of document.querySelectorAll('[role="alert"]')) {
        if (!alert.textContent?.trim()) continue;
        if (alert.closest('[role="dialog"]')) seen.inSheet = true;
        else if (alert.closest('[aria-hidden="true"]')) seen.barHidden = true;
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { seenAlerts: object }).seenAlerts);
}

/** Holds the first server action whose body carries `text` until `answer`, then fails it (500) or lets it through. */
export async function holdFirst(page: Page, text: string, fails: boolean) {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  let held = false;
  await page.route("**/e/**", async (route) => {
    if (held || !route.request().postData()?.includes(text)) return route.continue();
    held = true;
    await answered;
    return fails ? route.fulfill({ status: 500, body: "" }) : route.continue();
  });
  return answer;
}

/** Answers every server action with a 500 while `failing.on`; the page and its scripts load. */
export async function failActions(page: Page) {
  const failing = { on: true };
  await page.route("**/e/**", async (route) =>
    failing.on && (await route.request().headerValue("next-action"))
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  return failing;
}
