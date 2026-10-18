import type { BrowserContext, Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * #113, #129: when the language could not be changed, the footer says why, in the language
 * asked for, above its row. Nothing else changes: not the page, not the document (no reload),
 * not the URL, not the choice a reload reads.
 */

const FR = {
  switch: "English",
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
  // What a page in French says, written in English, the language asked for (decision 4).
  failed: "The language could not be changed. Check your connection, then try again.",
  cookiesBlocked:
    "Your browser blocks cookies, which keep the language choice. Allow them for this site, then try again.",
};
const EN = {
  switch: "Français",
  tagline: "Group carpooling, there and back, no account needed.",
  failed: "La langue n’a pas pu être changée. Vérifiez la connexion, puis réessayez.",
  cookiesBlocked:
    "Votre navigateur bloque les cookies, qui retiennent le choix de la langue. Autorisez-les pour ce site, puis réessayez.",
};
type Words = typeof FR;
type Lang = "fr" | "en";

/** What makes the change fail, and what lets it work again. */
type Cause = {
  on: (page: Page, context: BrowserContext) => Promise<unknown>;
  off: (page: Page, context: BrowserContext) => Promise<unknown>;
};

const offline: Cause = {
  on: (_page, context) => context.setOffline(true),
  off: (_page, context) => context.setOffline(false),
};

const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

const serverError: Cause = {
  on: (page) =>
    page.route("**/*", (route) =>
      isAction(route.request()) ? route.fulfill({ status: 500, body: "" }) : route.fallback(),
    ),
  off: (page) => page.unrouteAll(),
};

const languageSwitch = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const footerAlert = (page: Page) => page.locator("footer").getByRole("alert");

async function open(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fullcar");
  await expect(languageSwitch(page, FR.switch).or(languageSwitch(page, EN.switch))).toBeEnabled();
}

/** A mark only the same document keeps: a reload would lose it. */
function markWindow(page: Page) {
  return page.evaluate(() => {
    (window as Window & { notReloaded?: boolean }).notReloaded = true;
  });
}

function windowMarked(page: Page) {
  return page.evaluate(() => (window as Window & { notReloaded?: boolean }).notReloaded === true);
}

/** The page is as it was: its language, its document, its URL, and its button, active again. */
async function expectUnchanged(page: Page, from: Words, lang: Lang, url: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.getByText(from.tagline, { exact: true })).toBeVisible();
  await expect(languageSwitch(page, from.switch)).toBeEnabled();
  expect(page.url()).toBe(url);
  expect(await windowMarked(page)).toBe(true);
}

/** One alert in the footer, of exactly that text, in that language, before the button and above it. */
async function expectMessage(page: Page, from: Words, text: string, lang: Lang) {
  const alert = footerAlert(page);
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveText(text, { useInnerText: true });
  await expect(alert).toHaveAttribute("lang", lang);
  const button = languageSwitch(page, from.switch);
  expect(
    await alert.evaluate(
      (element, other) => (element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      await button.elementHandle(),
    ),
  ).toBe(true);
  const [above, below] = [await alert.boundingBox(), await button.boundingBox()];
  expect(above!.y + above!.height).toBeLessThanOrEqual(below!.y);
}

/** Taps the button while the change cannot succeed, and checks that only the message came of it. */
async function failOnce(page: Page, context: BrowserContext, cause: Cause, from: Words, langs: [Lang, Lang]) {
  await markWindow(page);
  const url = page.url();
  await cause.on(page, context);
  await languageSwitch(page, from.switch).click();
  await expectMessage(page, from, from.failed, langs[1]);
  await expectUnchanged(page, from, langs[0], url);
  await cause.off(page, context);
  return url;
}

async function expectFailure(page: Page, context: BrowserContext, cause: Cause, from: Words, to: Words, langs: [Lang, Lang]) {
  await open(page);
  const url = await failOnce(page, context, cause, from, langs);

  // Nothing was remembered: a reload is still in the page's language.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", langs[0]);
  await expect(page.getByText(from.tagline, { exact: true })).toBeVisible();
  expect(page.url()).toBe(url);

  // Once it can, a new tap changes the language, in place, and the message goes away.
  await failOnce(page, context, cause, from, langs);
  await languageSwitch(page, from.switch).click();
  await expect(page.locator("html")).toHaveAttribute("lang", langs[1]);
  await expect(page.getByText(to.tagline, { exact: true })).toBeVisible();
  await expect(languageSwitch(page, to.switch)).toBeEnabled();
  await expect(footerAlert(page)).toHaveCount(0);
  expect(page.url()).toBe(url);
  expect(await windowMarked(page)).toBe(true);
}

test.describe("a failed change, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  test("L4.1: offline, the message says so in English, and the page stays in French", async ({ page, context }) => {
    await expectFailure(page, context, offline, FR, EN, ["fr", "en"]);
  });

  test("L4.1: when the server fails, the message says so in English, and the page stays in French", async ({
    page,
    context,
  }) => {
    await expectFailure(page, context, serverError, FR, EN, ["fr", "en"]);
  });
});

test.describe("a failed change, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("L4.1: offline, the message says so in French, and the page stays in English", async ({ page, context }) => {
    await expectFailure(page, context, offline, EN, FR, ["en", "fr"]);
  });
});

for (const [locale, from, langs] of [
  ["fr-FR", FR, ["fr", "en"]],
  ["en-GB", EN, ["en", "fr"]],
] as const) {
  test.describe(`a browser set to ${locale} that refuses cookies`, () => {
    test.use({ locale });

    test("L4.2: the message says to allow them, nothing changes, and nothing is sent", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "cookieEnabled", { configurable: true, get: () => false });
      });
      await open(page);
      await markWindow(page);
      const url = page.url();
      const sent: string[] = [];
      page.on("request", (request) => sent.push(`${request.method()} ${new URL(request.url()).pathname}`));

      await languageSwitch(page, from.switch).click();
      await expectMessage(page, from, from.cookiesBlocked, langs[1]);
      await page.waitForLoadState("networkidle");
      await expectUnchanged(page, from, langs[0], url);
      expect(sent).toEqual([]);

      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", langs[0]);
    });
  });
}
