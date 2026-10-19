import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";

/*
 * The device of a test (#87, #162): its personal token, drawn here and seeded with its
 * persons, then set in `localStorage` before the page's scripts run, under the event's own
 * key; and the server actions held back or failed, for the states before the persons are known.
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
