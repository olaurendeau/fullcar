import type { Page, Route } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { creatorTest as test, expect, expectText, leaveNoToken } from "./fixtures";
import { areaRefused, hideToken, keepAdminToken, oneCharOff } from "./organiser";

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  copy: "Copier",
  copied: "Copié",
  copyFailed: "Copie impossible : sélectionnez le lien et copiez-le à la main.",
  share: "Partager",
  checkFailed: "L’espace organisateur n’a pas pu être chargé.",
  checkFailedWhy: "Vérifiez la connexion, puis réessayez.",
};

/** Words of the organiser's link, gone with it (OA7.3). */
const GONE = /Lien d’organisateur|Gardez ce lien|n’est pas valide/;

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

/** The organiser area of a seeded event, as a path: nothing after it (OA1.6); this browser keeps the token (#597). */
function adminPath({ id }: SeededEvent): string {
  return `/e/${id}/admin`;
}

/** The bodies of the actions posted to the organiser's page of `id`, from now on. */
function actionBodies(page: Page, id: string): string[] {
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === `/e/${id}/admin`) bodies.push(request.postData() ?? "");
  });
  return bodies;
}

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const linkGroup = (page: Page, name: string) => panel(page).getByRole("group", { name });
// Within the page's content: Next's route announcer is an alert as well. With text: the bar of
// messages keeps its own alert region, empty, on the page (#87).
const alert = (page: Page) => page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ });

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("organiser's arrival", () => {
  test.use({ locale: "fr-FR" });

  test("C4.1, C4.3, OA7.3: the share link, and no organiser's link nor « Gardez ce lien »", async ({
    page,
    seededEvent,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    await page.goto(adminPath(seededEvent));

    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(FR.panel);
    const share = linkGroup(page, FR.shareLink);
    await expectText(share.getByTestId("link"), `${origin}/e/${seededEvent.id}`, "the share link is shown");
    await expect(panel(page).getByTestId("link")).toHaveCount(1);
    await expect(panel(page).getByRole("note")).toHaveCount(0);
    await expect(page.getByText(GONE)).toHaveCount(0);

    // Then the event, as its participants see it.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(page.getByRole("tab", { name: "Aller" })).toHaveAttribute("aria-selected", "true");
  });

  test("C4.3: the share link leads to the event's public page", async ({ page, seededEvent }) => {
    await page.goto(adminPath(seededEvent));
    const shown = await linkGroup(page, FR.shareLink).getByTestId("link").innerText();
    await page.goto(shown);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(panel(page)).toHaveCount(0);
  });

  test("C4.2: the share link is visible without scrolling at 360 × 780", async ({
    page,
    seededEvent,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    await page.goto(adminPath(seededEvent));
    await expect(panel(page)).toBeVisible();
    await expect(linkGroup(page, FR.shareLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("C4.4: the share link is copied, and the button says so", async ({ page, context, seededEvent, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const origin = new URL(baseURL!).origin;
    await page.goto(adminPath(seededEvent));

    for (const [name, url] of [[FR.shareLink, `${origin}/e/${seededEvent.id}`]]) {
      const button = linkGroup(page, name).getByRole("button", { name: FR.copy });
      await button.click();
      await expect(linkGroup(page, name).getByRole("button", { name: FR.copied })).toBeVisible();
      expect((await page.evaluate(() => navigator.clipboard.readText())) === url, `${name}: the clipboard holds the link`).toBe(true);
      expect((await linkGroup(page, name).getByRole("button").first().boundingBox())!.height).toBeGreaterThanOrEqual(
        44,
      );
    }
    await expect(page.getByText(FR.copyFailed)).toHaveCount(0);
  });

  test("C4.4: when copying fails, says to select the link by hand, and the link stays selectable", async ({
    page,
    seededEvent,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });
    await page.goto(adminPath(seededEvent));
    const share = linkGroup(page, FR.shareLink);
    await share.getByRole("button", { name: FR.copy }).click();
    await expect(share.getByText(FR.copyFailed)).toBeVisible();
    await expect(share.getByRole("button", { name: FR.copy })).toBeVisible();

    const link = share.getByTestId("link");
    await link.click();
    const selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection === (await link.innerText()), "the whole link is selected").toBe(true);
  });

  test("C4.5: Share opens the native sheet with the share link only", async ({ page, seededEvent, baseURL }) => {
    await page.addInitScript(() => {
      const shared: unknown[] = [];
      Object.assign(window, { shared });
      Object.defineProperty(navigator, "share", {
        value: async (data: unknown) => {
          shared.push(data);
        },
      });
    });
    await page.goto(adminPath(seededEvent));
    const share = panel(page).getByRole("button", { name: FR.share });
    await expect(share).toHaveCount(1);
    await expect(linkGroup(page, FR.shareLink).getByRole("button", { name: FR.share })).toBeVisible();
    expect((await share.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await share.click();
    await expect
      .poll(async () => {
        const shared = await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);
        return hideToken(JSON.stringify(shared), seededEvent.token);
      })
      .toBe(JSON.stringify([{ url: `${new URL(baseURL!).origin}/e/${seededEvent.id}` }]));
  });

  test("C4.5: without native sharing, there is no Share button and Copy takes the whole width", async ({
    page,
    seededEvent,
  }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as Partial<Navigator>).share;
    });
    await page.goto(adminPath(seededEvent));
    const share = linkGroup(page, FR.shareLink);
    await expect(share.getByRole("button", { name: FR.copy })).toBeVisible();
    await expect(page.getByRole("button", { name: FR.share })).toHaveCount(0);
    const copy = (await share.getByRole("button", { name: FR.copy }).boundingBox())!;
    const link = (await share.getByTestId("link").boundingBox())!;
    expect(copy.width).toBeCloseTo(link.width, 0);
  });

  test("C4.7: reloading, or opening the area again in another tab of this browser, shows the same panel", async ({
    page,
    context,
    seededEvent,
  }) => {
    await page.goto(adminPath(seededEvent));
    const shown = await linkGroup(page, FR.shareLink).getByTestId("link").innerText();
    await page.reload();
    await expectText(linkGroup(page, FR.shareLink).getByTestId("link"), shown, "the same link after a reload");
    expect(new URL(page.url()).hash, "OA1.6: the URL has no fragment").toBe("");

    const later = await context.newPage();
    await later.goto(adminPath(seededEvent));
    await expectText(linkGroup(later, FR.shareLink).getByTestId("link"), shown, "the same link in another tab");
  });

  test("C4.9: the panel appears only once the server has checked the token, sent in a request's body", async ({
    page,
    seededEvent,
  }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const bodies: string[] = [];
    await page.route(`**/e/${seededEvent.id}/admin`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      bodies.push(route.request().postData() ?? "");
      await released;
      await route.continue();
    });

    await page.goto(adminPath(seededEvent));
    await expect.poll(() => bodies.length).toBe(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(panel(page)).toHaveCount(0);
    expect(bodies[0].includes(seededEvent.token), "the check's body carries the token").toBe(true);

    release();
    await expect(panel(page)).toBeVisible();
  });

  test("C4.8: the token is in no request URL, no header, and not in the page's HTML", async ({
    page,
    seededEvent,
  }) => {
    // What leaves the browser: a URL's path and query string, never its fragment.
    const sent = (url: string) => {
      const { origin, pathname, search } = new URL(url);
      return Promise.resolve(`${origin}${pathname}${search}`);
    };
    const seen: Promise<string>[] = [];
    page.on("request", (request) => {
      seen.push(sent(request.url()), request.allHeaders().then((headers) => JSON.stringify(headers)));
    });
    page.on("response", (response) => {
      seen.push(sent(response.url()), response.allHeaders().then((headers) => JSON.stringify(headers)));
    });

    const response = await page.goto(adminPath(seededEvent), { waitUntil: "networkidle" });
    expect((await response!.text()).includes(seededEvent.token), "the page's HTML holds the token").toBe(false);
    await expect(panel(page)).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(panel(page)).toBeVisible();

    const texts = await Promise.all(seen);
    // The check itself was seen: a POST to the page, the token in its body only.
    expect(texts.filter((text) => text.includes("next-action")).length).toBeGreaterThan(0);
    expect(texts.filter((text) => text.includes(seededEvent.token)).length, "URLs and headers holding the token").toBe(0);
  });

  test("C5.8: no referrer from the public page nor from the organiser's page", async ({ page, seededEvent }) => {
    for (const [name, path] of [
      ["the public page", `/e/${seededEvent.id}`],
      ["the organiser's page", adminPath(seededEvent)],
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), name).toBe(200);
      expect(response?.headers()["referrer-policy"], name).toBe("no-referrer");
    }
  });
});

test.describe("organiser area, refused", () => {
  test.use({ locale: "fr-FR" });

  for (const [what, kept] of [
    ["a wrong token", () => "q3Vx9kLmN2pR7sT1uW4yZQ"],
    ["a token one character off", (token: string) => oneCharOff(token)],
    ["no token", () => null],
  ] as const) {
    test(`#596, #598, OA7.7: with ${what} kept, the screen of a pending event, in place of the panel and the board`, async ({
      page,
      seededEvent,
    }) => {
      await keepAdminToken(page, seededEvent.id, kept(seededEvent.token));
      await page.goto(adminPath(seededEvent));
      await expect(areaRefused(page)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByText(GONE)).toHaveCount(0);
      await expect(page.getByText(/\/admin/)).toHaveCount(0);
      // « Voir l’événement » leads to the board.
      await expect(page.getByRole("main").getByRole("link", { name: "Voir l’événement" })).toHaveAttribute("href", `/e/${seededEvent.id}`);
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }

  // OA7.5, end to end: a browser that keeps no token, the old link's token in the fragment alone.
  test("OA7.5: an old link /e/{id}/admin#{token} gives no access, its fragment never sent nor read", async ({ page, seededEvent }) => {
    await keepAdminToken(page, seededEvent.id, null);
    const bodies = actionBodies(page, seededEvent.id);
    await page.goto(`${adminPath(seededEvent)}#${seededEvent.token}`, { waitUntil: "networkidle" });
    await expect(areaRefused(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    // The check was made, without the token.
    expect(bodies.length, "checks of the area").toBe(1);
    expect(bodies.some((body) => body.includes(seededEvent.token)), "a check carrying the fragment's token").toBe(false);

    // Pasting it again changes only the fragment: nothing is checked again, nothing opens.
    await page.evaluate((token) => (window.location.hash = token), seededEvent.token);
    await page.waitForLoadState("networkidle");
    expect(bodies.length, "checks after the fragment changed").toBe(1);
    await expect(panel(page)).toHaveCount(0);
  });

  test("OA7.5: in the browser that keeps the token, a wrong fragment changes nothing", async ({ page, seededEvent }) => {
    await page.goto(`${adminPath(seededEvent)}#${oneCharOff(seededEvent.token)}`);
    await expect(panel(page)).toBeVisible();
  });

  for (const [what, fail] of [
    ["the request fails", (route: Route) => route.abort()],
    ["the server answers 500", (route: Route) => route.fulfill({ status: 500, body: "Internal Server Error" })],
  ] as const) {
    test(`OA7.3: when ${what}, says the area could not be loaded instead of refusing it`, async ({
      page,
      seededEvent,
    }) => {
      await page.route(`**/e/${seededEvent.id}/admin`, (route) =>
        route.request().method() === "POST" ? fail(route) : route.continue(),
      );
      await page.goto(adminPath(seededEvent));
      await expect(alert(page)).toContainText(FR.checkFailed);
      await expect(alert(page)).toContainText(FR.checkFailedWhy);
      await expect(areaRefused(page)).toHaveCount(0);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    });
  }
});

test.describe("organiser's link of an unknown event", () => {
  test.use({ locale: "fr-FR" });

  test("C6.4: answers the same 404 as the public page", async ({ page, seededEvent }) => {
    const seen = async (path: string) => {
      // From another document: a change of fragment alone would not load the page.
      await page.goto("about:blank");
      const response = await page.goto(path);
      // The title is streamed after the page's content: waited for, not read at once.
      await expect(page, hideToken(path, seededEvent.token)).toHaveTitle("Événement introuvable");
      return {
        status: response?.status(),
        text: await page.locator("main").innerText(),
      };
    };
    const unknown = await seen(`/e/${UNKNOWN_ID}`);
    expect(unknown.status).toBe(404);
    for (const path of [
      `/e/${UNKNOWN_ID}/admin`,
      `/e/${UNKNOWN_ID}/admin#${seededEvent.token}`,
      "/e/Ab3dEf7/admin",
      "/e/Ab3dEf70/admin",
    ]) {
      expect(await seen(path), hideToken(path, seededEvent.token)).toEqual(unknown);
    }
  });
});

test.describe("organiser's arrival, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C7.1: speaks English", async ({ page, seededEvent }) => {
    await page.goto(adminPath(seededEvent));
    const area = page.getByRole("region", { name: "Organiser area" });
    await expect(area.getByRole("group", { name: "Link to share" })).toBeVisible();
    await expect(page.getByText(/Organiser link|Keep this link/)).toHaveCount(0);
    await expect(area.getByRole("button", { name: "Copy" })).toHaveCount(1);

    await keepAdminToken(page, seededEvent.id, null);
    await page.goto(adminPath(seededEvent));
    await expect(areaRefused(page, "Email address not confirmed yet")).toBeVisible();
  });
});
