import type { Page } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, test } from "./fixtures";

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  adminLink: "Lien d’organisateur",
  keep: "Gardez ce lien",
  keepWhy: "C’est le seul moyen de modifier l’événement. Sans compte ni e-mail, nous ne pouvons pas vous le renvoyer.",
  doNotShare: "Ne le partagez pas : il permet de tout modifier.",
  copy: "Copier",
  copied: "Copié",
  copyFailed: "Copie impossible : sélectionnez le lien et copiez-le à la main.",
  share: "Partager",
  invalid: "Ce lien d’organisateur n’est pas valide.",
  invalidWhy: "Vérifiez qu’il a été copié en entier.",
  checkFailed: "Le lien d’organisateur n’a pas pu être vérifié.",
};

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

/** The organiser's link of a seeded event, as a path: the token in the fragment only. */
function adminPath({ id, token }: SeededEvent): string {
  return `/e/${id}/admin#${token}`;
}

function oneCharOff(token: string): string {
  return `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
}

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const linkGroup = (page: Page, name: string) => panel(page).getByRole("group", { name });
// Within the page's content: Next's route announcer is an alert as well.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("organiser's arrival", () => {
  test.use({ locale: "fr-FR" });

  test("C4.1, C4.3: the share link, then the organiser's link as personal, then the warning", async ({
    page,
    seededEvent,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    await page.goto(adminPath(seededEvent));

    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(FR.panel);
    const share = linkGroup(page, FR.shareLink);
    const admin = linkGroup(page, FR.adminLink);
    const warning = panel(page).getByRole("note");
    await expect(share.getByTestId("link")).toHaveText(`${origin}/e/${seededEvent.id}`);
    await expect(admin.getByTestId("link")).toHaveText(`${origin}/e/${seededEvent.id}/admin#${seededEvent.token}`);
    await expect(admin).toContainText("Personnel");
    await expect(admin).toContainText(FR.doNotShare);
    await expect(warning).toContainText(FR.keep);
    await expect(warning).toContainText(FR.keepWhy);

    // In this order, top to bottom.
    const tops = await Promise.all([share, admin, warning].map(async (part) => (await part.boundingBox())!.y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

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

  test("C4.2: both links and the warning are visible without scrolling at 360 × 780", async ({
    page,
    seededEvent,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    await page.goto(adminPath(seededEvent));
    await expect(panel(page)).toBeVisible();
    await expect(linkGroup(page, FR.shareLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(linkGroup(page, FR.adminLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(panel(page).getByRole("note")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("C4.4: each link is copied, and the button says so", async ({ page, context, seededEvent, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const origin = new URL(baseURL!).origin;
    await page.goto(adminPath(seededEvent));

    for (const [name, url] of [
      [FR.shareLink, `${origin}/e/${seededEvent.id}`],
      [FR.adminLink, `${origin}/e/${seededEvent.id}/admin#${seededEvent.token}`],
    ]) {
      const button = linkGroup(page, name).getByRole("button", { name: FR.copy });
      await button.click();
      await expect(linkGroup(page, name).getByRole("button", { name: FR.copied })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
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
    const admin = linkGroup(page, FR.adminLink);
    await admin.getByRole("button", { name: FR.copy }).click();
    await expect(admin.getByText(FR.copyFailed)).toBeVisible();
    await expect(admin.getByRole("button", { name: FR.copy })).toBeVisible();
    await expect(linkGroup(page, FR.shareLink).getByText(FR.copyFailed)).toHaveCount(0);

    const link = admin.getByTestId("link");
    await link.click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(await link.innerText());
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
      .poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared))
      .toEqual([{ url: `${new URL(baseURL!).origin}/e/${seededEvent.id}` }]);
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

  test("C4.7: reloading, or opening the link again later, shows the same panel", async ({
    page,
    context,
    seededEvent,
  }) => {
    await page.goto(adminPath(seededEvent));
    const shown = await linkGroup(page, FR.adminLink).getByTestId("link").innerText();
    await page.reload();
    await expect(linkGroup(page, FR.adminLink).getByTestId("link")).toHaveText(shown);
    expect(new URL(page.url()).hash).toBe(`#${seededEvent.token}`);

    const later = await context.newPage();
    await later.goto(adminPath(seededEvent));
    await expect(linkGroup(later, FR.adminLink).getByTestId("link")).toHaveText(shown);
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
    expect(bodies[0]).toContain(seededEvent.token);

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
    expect(await response!.text()).not.toContain(seededEvent.token);
    await expect(panel(page)).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(panel(page)).toBeVisible();

    const texts = await Promise.all(seen);
    // The check itself was seen: a POST to the page, the token in its body only.
    expect(texts.filter((text) => text.includes("next-action")).length).toBeGreaterThan(0);
    expect(texts.filter((text) => text.includes(seededEvent.token))).toEqual([]);
  });

  test("C5.8: no referrer from the public page nor from the organiser's page", async ({ page, seededEvent }) => {
    for (const path of [`/e/${seededEvent.id}`, adminPath(seededEvent)]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(response?.headers()["referrer-policy"], path).toBe("no-referrer");
    }
  });
});

test.describe("organiser's link, not valid", () => {
  test.use({ locale: "fr-FR" });

  for (const [what, fragment] of [
    ["a wrong token", () => "#q3Vx9kLmN2pR7sT1uW4yZa"],
    ["a token one character off", (token: string) => `#${oneCharOff(token)}`],
    ["no fragment", () => ""],
    ["an empty fragment", () => "#"],
  ] as const) {
    test(`C6.5: with ${what}, the public page, preceded by the message, without any organiser's link`, async ({
      page,
      seededEvent,
    }) => {
      await page.goto(`/e/${seededEvent.id}/admin${fragment(seededEvent.token)}`);
      const message = alert(page);
      await expect(message).toContainText(FR.invalid);
      await expect(message).toContainText(FR.invalidWhy);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
      await expect(page.getByRole("tab", { name: "Aller" })).toBeVisible();
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByText(FR.adminLink, { exact: true })).toHaveCount(0);
      await expect(page.getByText(/\/admin/)).toHaveCount(0);
      // The message comes before the event.
      expect((await message.boundingBox())!.y).toBeLessThan(
        (await page.getByRole("heading", { level: 1 }).boundingBox())!.y,
      );
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }

  test("C6.5, C4.7: pasting the right link over a wrong one shows the panel, without a reload", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}/admin`);
    await expect(alert(page)).toContainText(FR.invalid);
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));
    await page.goto(adminPath(seededEvent));
    await expect(panel(page)).toBeVisible();
    await expect(page.getByText(FR.invalid)).toHaveCount(0);

    await page.goto(`/e/${seededEvent.id}/admin#${oneCharOff(seededEvent.token)}`);
    await expect(alert(page)).toContainText(FR.invalid);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
  });

  test("when the check fails, says so instead of calling the link invalid", async ({ page, seededEvent }) => {
    await page.route(`**/e/${seededEvent.id}/admin`, (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await page.goto(adminPath(seededEvent));
    await expect(alert(page)).toContainText(FR.checkFailed);
    await expect(page.getByText(FR.invalid)).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
  });
});

test.describe("organiser's link of an unknown event", () => {
  test.use({ locale: "fr-FR" });

  test("C6.4: answers the same 404 as the public page", async ({ page, seededEvent }) => {
    const seen = async (path: string) => {
      // From another document: a change of fragment alone would not load the page.
      await page.goto("about:blank");
      const response = await page.goto(path);
      return {
        status: response?.status(),
        title: await page.title(),
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
      expect(await seen(path), path).toEqual(unknown);
    }
  });
});

test.describe("organiser's arrival, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C7.1: speaks English", async ({ page, seededEvent }) => {
    await page.goto(adminPath(seededEvent));
    const area = page.getByRole("region", { name: "Organiser area" });
    await expect(area.getByRole("group", { name: "Link to share" })).toBeVisible();
    await expect(area.getByRole("group", { name: "Organiser link" })).toContainText("Personal");
    await expect(area.getByRole("note")).toContainText("Keep this link");
    await expect(area.getByRole("button", { name: "Copy" })).toHaveCount(2);

    await page.goto(`/e/${seededEvent.id}/admin`);
    await expect(alert(page)).toContainText("This organiser link is not valid.");
  });
});
