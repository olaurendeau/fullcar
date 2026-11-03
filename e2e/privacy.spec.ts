import { readFileSync } from "node:fs";
import type { Page, Request } from "@playwright/test";
import { POLICY } from "@/app/confidentialite/policy";
import { expect, test as base } from "./fixtures";

/*
 * #612, organizer-account OA10.4 and privacy-policy PP1 to PP6, PP9: `/confidentialite`, the
 * text of the owner, in French and in English. The footer's link to it (OA10.3) is in
 * footer.spec.ts.
 */

const load = (locale: string): object => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
const fr = load("fr");
const en = load("en");

const CNIL = "https://www.cnil.fr/fr/plaintes";
const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";

const WORDS = {
  fr: { messages: fr, newTab: "(s’ouvre dans un nouvel onglet)" },
  en: { messages: en, newTab: "(opens in a new tab)" },
};

/** A message, by its full key (`Privacy.keep.title`). */
function message(messages: object, key: string): string {
  return key.split(".").reduce<unknown>((at, part) => (at as Record<string, unknown>)[part], messages) as string;
}

/** The hosts of Crisp and of the CNIL: nothing may be asked of them before a tap. */
const isCrisp = (url: URL) => /(^|\.)crisp\.(chat|im)$/.test(url.hostname);
const isCnil = (url: URL) => /(^|\.)cnil\.fr$/.test(url.hostname);

const test = base.extend<{ outside: Request[] }>({
  outside: [
    async ({ context }, provide) => {
      const seen: Request[] = [];
      for (const matches of [isCrisp, isCnil]) {
        await context.route(matches, (route) => {
          seen.push(route.request());
          return route.abort();
        });
      }
      await provide(seen);
    },
    { auto: true },
  ],
});

/** What the page shows, block by block, in the order of the document, its footer left aside. */
function shown(page: Page) {
  return page.locator("main").evaluate((main) =>
    [...main.querySelectorAll("h1, h2, h3, p, li")]
      .filter((element) => !element.closest("footer"))
      .map((element) => [element.tagName.toLowerCase(), element.textContent?.replace(/\s+/g, " ").trim()]),
  );
}

for (const locale of ["fr", "en"] as const) {
  const { messages, newTab } = WORDS[locale];

  test.describe(`/confidentialite, in a browser set to ${locale}`, () => {
    test.use({ locale: locale === "fr" ? "fr-FR" : "en-GB" });

    test(`OA10.4, PP1: answers 200, with a title, eleven sections, and every message in its order (${locale})`, async ({
      page,
    }) => {
      const response = await page.goto("/confidentialite");
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(message(messages, "Privacy.title"));
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(
        POLICY.filter(({ role }) => role === "h2").map(({ key }) => message(messages, key)),
      );

      const expected = POLICY.map(({ key, role }) => [
        role === "chat" || role === "cnil" ? "p" : role === "li" ? "li" : role,
        role === "chat" || role === "cnil" ? `${message(messages, key)} ${newTab}` : message(messages, key),
      ]);
      expect(await shown(page)).toEqual(expected);
    });

    test(`OT8.4: "What we keep" says what is kept of a pending handover, under the event (${locale})`, async ({
      page,
    }) => {
      await page.goto("/confidentialite");
      const event = page.getByRole("heading", { level: 3, name: message(messages, "Privacy.keep.event.title") });
      const items = event.locator("xpath=following-sibling::ul[1]/li");
      await expect(items.nth(5)).toHaveText(message(messages, "Privacy.keep.event.transfer"));
      await expect(items).toHaveCount(6);
    });

    test(`OA10.4: the title of the tab is the page's (${locale})`, async ({ page }) => {
      await page.goto("/confidentialite");
      await expect(page).toHaveTitle(message(messages, "Privacy.title"));
    });

    test(`PP3: asks nothing of another host than the app's, and sets no cookie (${locale})`, async ({
      page,
      context,
      baseURL,
      outside,
    }) => {
      const origins = new Set<string>();
      page.on("request", (request) => origins.add(new URL(request.url()).origin));
      await page.goto("/confidentialite", { waitUntil: "networkidle" });
      expect([...origins]).toEqual([new URL(baseURL!).origin]);
      expect(await context.cookies()).toEqual([]);
      expect(outside.length, "requests to Crisp or to the CNIL").toBe(0);
    });

    test(`PP4: has two links in its text, to Crisp and to the CNIL, in a new tab, 44 px at least (${locale})`, async ({
      page,
    }) => {
      await page.goto("/confidentialite");
      // The links of the text, not those of the footer, which closes `main`.
      const inText = page.locator("main > p > a");
      await expect(inText).toHaveCount(2);

      const cnil = inText.filter({ hasText: message(messages, "Privacy.rights.cnilLink") });
      const chat = inText.filter({ hasText: message(messages, "Contact.link") });
      for (const [link, href] of [
        [cnil, CNIL],
        [chat, CRISP_CHAT],
      ] as const) {
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute("href", href);
        await expect(link).toHaveAttribute("target", "_blank");
        const rel = ((await link.getAttribute("rel")) ?? "").split(/\s+/);
        expect(rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test(`PP5: nothing scrolls sideways at 360 px (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto("/confidentialite");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      ).toBe(0);
    });
  });
}

test.describe("/confidentialite, without JavaScript, and for the search engines", () => {
  test.use({ locale: "fr-FR" });

  test("PP6: the HTML served already holds the last section", async ({ request }) => {
    const response = await request.get("/confidentialite");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(message(fr, "Privacy.updates.body"));
  });

  test("PP9: is in the sitemap, names itself as canonical, and is not kept from the index", async ({
    page,
    request,
  }) => {
    // The site's own origin (`siteOrigin`), not the address the test reaches the app by.
    expect(await (await request.get("/sitemap.xml")).text()).toMatch(/<loc>https?:\/\/[^<]+\/confidentialite<\/loc>/);

    const response = await page.goto("/confidentialite");
    expect(response?.headers()["x-robots-tag"] ?? "").not.toMatch(/noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/confidentialite$/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});
