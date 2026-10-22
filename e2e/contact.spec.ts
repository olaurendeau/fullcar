import type { Locator, Page, Request } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test as base } from "./fixtures";

leaveNoToken();

// #69: a discreet "contact us" link, at the bottom of the pages, to the chat Crisp hosts.
// Nothing of Crisp runs in the app's origin: the link opens Crisp's own page in a new tab.
const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";
const FR = "Nous contacter (s’ouvre dans un nouvel onglet)";
const EN = "Contact us (opens in a new tab)";
const PANEL = "Espace organisateur";
/** The language switch (#113), named in the language it offers. */
const SWITCH = { fr: "English", en: "Français" };

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

/** The pages the link is on: which, where, and the title that tells it is shown. */
const PAGES: [string, (event: SeededEvent) => string, string][] = [
  ["the home page", () => "/", "Fullcar"],
  ["the creation form", () => "/nouveau", "Créer un événement"],
  ["the event not found", () => `/e/${UNKNOWN_ID}`, "Événement introuvable"],
  ["the event's page", ({ id }) => `/e/${id}`, "Tournoi de Rennes"],
  ["the organiser's page", ({ id, token }) => `/e/${id}/admin#${token}`, "Tournoi de Rennes"],
  ["the organiser's page, wrong token", ({ id }) => `/e/${id}/admin#q3Vx9kLmN2pR7sT1uW4yZa`, "Tournoi de Rennes"],
  ["the organiser's page, no token", ({ id }) => `/e/${id}/admin`, "Tournoi de Rennes"],
];

const isCrisp = (url: URL) => /(^|\.)crisp\.(chat|im)$/.test(url.hostname);

/**
 * No test of this file contacts Crisp, whether it asks for `crisp` or not: the fixture is
 * automatic. Crisp's chat page is answered here, any other Crisp address is refused, and
 * every request to Crisp is kept in `crisp` for the test to read.
 * Playwright's `use` is named `provide` here: the React hooks lint rule takes `use` for a hook.
 */
const test = base.extend<{ crisp: Request[] }>({
  crisp: [
    async ({ context }, provide) => {
      const seen: Request[] = [];
      await context.route(isCrisp, async (route) => {
        seen.push(route.request());
        if (route.request().url() !== CRISP_CHAT) return route.abort();
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Crisp</title>" });
      });
      await provide(seen);
    },
    { auto: true },
  ],
});

/** The page once it has settled: on the organiser's page, once the token has been checked. */
async function open(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(page.getByRole("region", { name: PANEL }).or(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ }))).toBeVisible();
  }
}

const contactLink = (page: Page, name = FR) => page.getByRole("link", { name, exact: true });
const languageSwitch = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** K1, K3: Crisp's link is the last link, nothing comes after it, discreet, and nothing scrolls sideways. */
async function expectLastAndDiscreet(page: Page, link: Locator) {
  // K1: the last link, and no content after it, in the order of the document.
  expect(await page.locator("a").last().getAttribute("href")).toBe(CRISP_CHAT);
  const contentAfter = await link.evaluate((a) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    walker.currentNode = a;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!a.contains(node) && node.textContent?.trim() && node.parentElement?.closest("main")) return true;
    }
    return false;
  });
  expect(contentAfter).toBe(false);

  // K3: smaller than the text, a 44 px target, nothing scrolls sideways at 360 px.
  await expectDiscreet(link);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBe(0);
}

/** K3, L1.2: smaller than the page's text, and a tap target of 44 px at least. */
async function expectDiscreet(element: Locator) {
  const [size, textSize] = await element.evaluate((node) => [
    parseFloat(getComputedStyle(node).fontSize),
    parseFloat(getComputedStyle(document.body).fontSize),
  ]);
  expect(size).toBeLessThan(textSize);
  expect((await element.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}

test.describe("contact link", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path, heading] of PAGES) {
    test(`K1, K2, K3, K5: on ${where}, the last link, discreet, to Crisp in a new tab, and nothing from Crisp`, async ({
      page,
      crisp,
      seededEvent,
    }) => {
      await open(page, path(seededEvent), heading);

      const link = contactLink(page);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", CRISP_CHAT);
      await expect(link).toHaveAttribute("target", "_blank");
      // The only test that protects `rel`: K4 below would pass without it, since Chromium
      // already opens a target="_blank" link without opener and the app sends no referrer.
      // Other browsers, or a later change to either, would not: do not remove this check.
      const rel = ((await link.getAttribute("rel")) ?? "").split(/\s+/);
      expect(rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));

      await expectLastAndDiscreet(page, link);

      // L1.2: the language switch beside it is as discreet, with the same 44 px target.
      const button = languageSwitch(page, SWITCH.fr);
      await expect(button).toHaveCount(1);
      await expectDiscreet(button);

      // K5: the page asked nothing of Crisp.
      expect(crisp.length, "requests to Crisp").toBe(0);
    });
  }

  for (const [where, path, heading] of PAGES) {
    test(`L1.2, L3.6: on ${where}, once in English, the contact link is still the last link, discreet, to the same Crisp`, async ({
      page,
      crisp,
      seededEvent,
    }) => {
      await open(page, path(seededEvent), heading);
      const before = await contactLink(page).getAttribute("href");
      const button = languageSwitch(page, SWITCH.fr);
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(languageSwitch(page, SWITCH.en)).toBeEnabled();

      const link = contactLink(page, EN);
      await expect(link).toHaveCount(1);
      // L3.6: the very same address, not one rebuilt for the new language.
      expect(before).toBe(CRISP_CHAT);
      await expect(link).toHaveAttribute("href", before!);
      await expectLastAndDiscreet(page, link);
      await expectDiscreet(languageSwitch(page, SWITCH.en));
      expect(crisp.length, "requests to Crisp").toBe(0);
    });
  }

  test("K1: not in the organiser's panel, and no header added", async ({ page, crisp, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}/admin#${seededEvent.token}`, "Tournoi de Rennes");
    await expect(page.getByRole("region", { name: PANEL })).toBeVisible();
    await expect(page.getByRole("region", { name: PANEL }).getByRole("link", { name: FR })).toHaveCount(0);
    await expect(page.getByRole("region", { name: PANEL }).getByRole("button", { name: SWITCH.fr })).toHaveCount(0);
    await expect(page.getByRole("banner")).toHaveCount(0);
    expect(crisp.length, "requests to Crisp").toBe(0);
  });

  test("K4, K6: from the organiser's page, opens Crisp alone in a new tab, and the page stays", async ({
    page,
    context,
    crisp,
    seededEvent,
    baseURL,
  }) => {
    const path = `/e/${seededEvent.id}/admin#${seededEvent.token}`;
    await open(page, path, "Tournoi de Rennes");
    await expect(page.getByRole("region", { name: PANEL })).toBeVisible();

    const [tab] = await Promise.all([context.waitForEvent("page"), contactLink(page).click()]);
    await tab.waitForLoadState();

    expect(tab.url() === CRISP_CHAT, "the new tab is Crisp's chat").toBe(true);
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(crisp.length).toBe(1);
    const request = crisp[0];
    expect(request.url() === CRISP_CHAT, "the request is for Crisp's chat").toBe(true);
    expect(await request.headerValue("referer")).toBeNull();
    const sent = `${request.url()} ${JSON.stringify(await request.allHeaders())} ${request.postData() ?? ""}`;
    expect(sent.includes(seededEvent.token), "what Crisp receives holds the token").toBe(false);
    expect(sent.includes(seededEvent.id), "what Crisp receives holds the event's id").toBe(false);

    // K6: the organiser's tab has not moved.
    expect(page.url() === `${new URL(baseURL!).origin}${path}`, "the organiser's tab is still on the organiser's link").toBe(true);
    await expect(page.getByRole("region", { name: PANEL })).toBeVisible();
  });

  test("K5: / asks nothing of another host than the app's", async ({ page, crisp, baseURL }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto("/", { waitUntil: "networkidle" });
    expect([...origins]).toEqual([new URL(baseURL!).origin]);
    expect(crisp.length, "requests to Crisp").toBe(0);
  });
});

test.describe("contact link, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("K7: speaks English on the home page", async ({ page }) => {
    await page.goto("/");
    await expect(contactLink(page, EN)).toHaveAttribute("href", CRISP_CHAT);
  });

  test("K7: speaks English on the event's page", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(contactLink(page, EN)).toHaveAttribute("href", CRISP_CHAT);
  });
});
