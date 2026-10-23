import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * #412: what a search engine is offered. The public pages are in the sitemap, each with its
 * canonical URL; an event's pages are in noindex, out of the sitemap and out of robots.txt's
 * reach, as is the Sentry tunnel.
 */

/** The URLs the sitemap lists, in its order. */
async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/xml/);
  return [...(await response.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url);
}

const canonical = (page: Page) => page.locator('head link[rel="canonical"]');

test("/robots.txt lets crawlers in the public pages, not in the events nor in /monitoring, and names the sitemap", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const lines = (await response.text()).split("\n").map((line) => line.trim());
  expect(lines).toEqual(expect.arrayContaining(["User-Agent: *", "Allow: /", "Disallow: /e/", "Disallow: /monitoring"]));
  const sitemap = lines.filter((line) => line.startsWith("Sitemap: ")).map((line) => line.slice("Sitemap: ".length));
  expect(sitemap.length).toBe(1);
  expect(new URL(sitemap[0]).pathname).toBe("/sitemap.xml");
});

test("/sitemap.xml lists the home page and the creation form, and no event", async ({ request, seededEvent }) => {
  const urls = await sitemapUrls(request);
  expect(urls.map((url) => new URL(url).pathname)).toEqual(["/", "/nouveau"]);
  // An event exists while the sitemap is read: none of its pages is listed.
  expect(urls.filter((url) => url.includes("/e/") || url.includes(seededEvent.id)).length).toBe(0);
});

for (const path of ["/", "/nouveau"]) {
  test(`${path} names as canonical its own URL, the one the sitemap lists`, async ({ page, request }) => {
    await page.goto(path);
    await expect(canonical(page)).toHaveCount(1);
    // Normalised: Next writes the home page's without its trailing slash, the same URL.
    const href = new URL((await canonical(page).getAttribute("href")) ?? "").href;
    expect(new URL(href).pathname).toBe(path);
    expect(await sitemapUrls(request)).toContain(href);
  });
}

for (const [where, path] of [
  ["the event", (id: string) => `/e/${id}`],
  ["the organiser's page, without its token", (id: string) => `/e/${id}/admin`],
] as const) {
  test(`${where} is in noindex, nofollow, and names no canonical URL`, async ({ page, seededEvent }) => {
    await page.goto(path(seededEvent.id));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(canonical(page)).toHaveCount(0);
  });
}
