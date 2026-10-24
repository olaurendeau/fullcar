import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Response } from "@playwright/test";
import { mapName, openMap, test } from "./event-map-points";
import { expect } from "./fixtures";
import { answerTiles, requestsForTile, tileAt } from "./tiles";

/*
 * #554, event-map v27, CA3.5: Geoapify's key never leaves the server. `web` has the slot's test
 * key in its environment (compose.yaml), where `next build` runs too: the build would put it in
 * `.next/static` if any client code read it. The fake receiving that very key is what makes the
 * searches below worth something.
 */

test.use({ locale: "fr-FR" });

/** `web`'s GEOAPIFY_API_KEY (compose.yaml): nothing else could be mistaken for it. */
const KEY = "fullcar-test-key-7f3a9c2e";
/** The build `next start` serves, in the repository both containers share. */
const STATIC = join(process.cwd(), ".next", "static");
/** The flag alone frames the view at zoom 14. */
const ZOOM = 14;

test("CA3.5: the key is in no file of .next/static", async () => {
  const entries = await readdir(STATIC, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    expect.soft((await readFile(file)).includes(KEY), file).toBe(false);
  }
});

test("CA3.5: neither the HTML, nor a response of our origin (a 502 included), nor a URL the browser asks for holds the key; the fake received it", async ({ page, placed }) => {
  // A tile of the view refused by the fake: our route's 502 is read too.
  const tile = tileAt(placed.place, ZOOM);
  await answerTiles([tile], { kind: "unauthorized" });
  const urls: string[] = [];
  const responses: Response[] = [];
  page.on("request", (request) => urls.push(request.url()));
  page.on("response", (response) => responses.push(response));
  const refused = page.waitForResponse((response) => new URL(response.url()).pathname === `/tuiles/${tile}`);

  const document = await page.goto(`/e/${placed.id}`);
  expect(await document!.text()).not.toContain(KEY);
  await openMap(page, mapName("aller", "aucune voiture"));
  expect((await refused).status()).toBe(502);
  await page.waitForLoadState("networkidle");

  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((url) => url.includes(KEY))).toEqual([]);
  const origin = new URL(page.url()).origin;
  const ours = responses.filter((response) => new URL(response.url()).origin === origin);
  expect(ours.some((response) => response.status() === 502)).toBe(true);
  for (const response of ours) {
    expect.soft(JSON.stringify(await response.allHeaders()).includes(KEY), response.url()).toBe(false);
    // A redirect has no body to read.
    const body = await response.body().catch(() => Buffer.alloc(0));
    expect.soft(body.includes(KEY), response.url()).toBe(false);
  }

  // The key searched for is the one `web` has: the fake received it, as the only query.
  expect((await requestsForTile(tile)).at(-1)?.query).toBe(`apiKey=${KEY}`);
});
