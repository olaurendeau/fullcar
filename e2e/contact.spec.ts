import type { Page, Request } from "@playwright/test";
import { expect, leaveNoToken, test as base } from "./fixtures";

leaveNoToken();

// #69: a discreet "contact us" link, at the bottom of the pages, to the chat Crisp hosts.
// Nothing of Crisp runs in the app's origin: the link opens Crisp's own page in a new tab.
// On each page, the link, last and discreet (K1, K2, K3, K5, L1.2, L3.6), is in footer.spec.ts (#640).
const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";
const FR = "Nous contacter (s’ouvre dans un nouvel onglet)";
const EN = "Contact us (opens in a new tab)";
const PANEL = "Espace organisateur";
/** The language switch (#113), named in the language it offers. */
const SWITCH = { fr: "English", en: "Français" };

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
test.describe("contact link", () => {
  test.use({ locale: "fr-FR" });

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
