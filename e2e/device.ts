import { randomBytes } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
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

/** The lines of the message bar, top to bottom: its list, a group named « Messages » (#216), once no sheet hides the page. */
export const messages = (page: Page) => page.getByRole("group", { name: "Messages" }).locator("p");

/** Records, as each alert or line of the bar fills, whether it was in a sheet or a confirmation, and whether the bar had an ancestor hidden. */
export async function watchAlerts(page: Page) {
  await page.evaluate(() => {
    const seen = ((window as unknown as { seenAlerts: object }).seenAlerts = { inSheet: false, barHidden: false });
    new MutationObserver(() => {
      for (const alert of document.querySelectorAll('[role="alert"], [data-message-bar] [role="group"] > p')) {
        if (!alert.textContent?.trim()) continue;
        if (alert.closest('[role="dialog"], [role="alertdialog"]')) seen.inSheet = true;
        else if (alert.closest('[aria-hidden="true"]')) seen.barHidden = true;
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { seenAlerts: object }).seenAlerts);
}

/** A change of one of the bar's two live regions: which, the text it holds since, and whether a sheet hid it then (Radix's `aria-hidden`). */
export type RegionWrite = { region: "alert" | "status"; text: string; hidden: boolean };

/**
 * Records, from now on, every change of the bar's two live regions in the order it came, each
 * watched by a `MutationObserver` of its own, and every text the bar's lines held (#222).
 */
export async function recordBar(page: Page) {
  await page.evaluate(() => {
    const record = { writes: [] as RegionWrite[], lines: [] as string[] };
    (window as unknown as { barRecord: typeof record }).barRecord = record;
    const alert = document.querySelector('[role="status"] + [role="alert"]')!;
    const regions = { alert, status: alert.previousElementSibling! };
    const watch = (element: Element, then: () => void) =>
      new MutationObserver(then).observe(element, { childList: true, subtree: true, characterData: true });
    for (const [region, element] of Object.entries(regions) as ["alert" | "status", Element][]) {
      watch(element, () => record.writes.push({ region, text: element.textContent ?? "", hidden: !!element.closest('[aria-hidden="true"]') }));
    }
    watch(alert.parentElement!, () => {
      for (const line of alert.parentElement!.querySelectorAll('[role="group"] > p')) record.lines.push(line.textContent ?? "");
    });
  });
  return () => page.evaluate(() => (window as unknown as { barRecord: { writes: RegionWrite[]; lines: string[] } }).barRecord);
}

/** The texts written in `region`, empty ones left out. */
export const said = (writes: RegionWrite[], region: "alert" | "status") =>
  writes.filter((write) => write.region === region && write.text).map((write) => write.text);

/**
 * Holds the first server action whose body carries `text` until `answer`, then fails it (500) or
 * lets it through. Any other request goes on to the routes set before, so that two can be held.
 */
export async function holdFirst(page: Page, text: string, fails: boolean) {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  let held = false;
  await page.route("**/e/**", async (route) => {
    if (held || !route.request().postData()?.includes(text)) return route.fallback();
    held = true;
    await answered;
    return fails ? route.fulfill({ status: 500, body: "" }) : route.continue();
  });
  return answer;
}

/** Holds the first server action whose body carries `text` until `lose()`, then aborts it: offline by then, the page says so. */
export async function loseFirst(page: Page, text: string) {
  let lose = () => {};
  const lost = new Promise<void>((resolve) => (lose = resolve));
  let held = false;
  await page.route("**/e/**", async (route) => {
    if (held || !route.request().postData()?.includes(text)) return route.fallback();
    held = true;
    await lost;
    return route.abort();
  });
  return lose;
}

/** Lets the action `holdFirst` holds fail, and waits for its 500. */
export async function failHeld(page: Page, answer: () => void) {
  const responded = page.waitForResponse((response) => response.status() === 500);
  answer();
  await responded;
}

/** A closing sheet's animation, paused: Radix keeps the sheet mounted until the style is removed. */
export const holdClose = '[role="dialog"][data-state="closed"] { animation-play-state: paused !important; }';

/**
 * Waits for the end of the animations `sheet` runs now, its opening's (200 ms) after a reopening
 * (#457): what happens at their end has happened. Fails if none runs, which waits for nothing.
 */
export async function animationsDone(sheet: Locator) {
  const running = await sheet.evaluate(async (element) => {
    const animations = element.getAnimations();
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    return animations.length;
  });
  if (running === 0) throw new Error("animationsDone: the sheet runs no animation to wait for");
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
