import type { Locator, Page, Request } from "@playwright/test";
import { expect, leaveNoToken, test as base } from "./fixtures";
import { expectRing, press, pressUntil, rgba } from "./focus-ring";
import { hideToken } from "./organiser";

leaveNoToken();

/*
 * #489, design github-link v1.2: a link to the public repository, in the footer of every
 * page, on its second line, before « Nous contacter ». No assertion here may show the token:
 * a path is named with it hidden, what GitHub receives is searched for it as a boolean.
 * On each page, the link and the footer's row (G1 to G4, G8) are in footer.spec.ts (#640).
 */

const REPOSITORY = "https://github.com/olaurendeau/fullcar";

const FR = {
  source: "Code source sur GitHub (s’ouvre dans un nouvel onglet)",
  contact: "Nous contacter (s’ouvre dans un nouvel onglet)",
  home: "Accueil",
  switch: "English",
  panel: "Espace organisateur",
};
type Words = typeof FR;
const EN: Words = {
  source: "Source code on GitHub (opens in a new tab)",
  contact: "Contact us (opens in a new tab)",
  home: "Home",
  switch: "Français",
  panel: "Organiser area",
};

/** G8: GitHub's hosts, the ones a badge, a logo or a script of GitHub would come from. */
const isGitHub = (url: URL) => /(^|\.)github\.com$|\.githubusercontent\.com$|\.githubassets\.com$/.test(url.hostname);

/**
 * No test of this file contacts GitHub (G7): the fixture is automatic. The repository's page
 * is answered here, any other GitHub address is refused, and every request to GitHub is kept
 * in `github` for the test to read.
 * Playwright's `use` is named `provide` here: the React hooks lint rule takes `use` for a hook.
 */
const test = base.extend<{ github: Request[] }>({
  github: [
    async ({ context }, provide) => {
      const seen: Request[] = [];
      await context.route(isGitHub, async (route) => {
        seen.push(route.request());
        if (route.request().url() !== REPOSITORY) return route.abort();
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>GitHub</title>" });
      });
      await provide(seen);
    },
    { auto: true },
  ],
});

/**
 * The page once it has settled and is hydrated: on the organiser's page, once the token has
 * been checked. A failure names the path with the token hidden.
 */
async function open(page: Page, path: string, heading: string, token = "") {
  try {
    await page.goto(path, { waitUntil: "networkidle" });
  } catch {
    throw new Error(`Could not open ${token ? hideToken(path, token) : path}`);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(
      page.getByRole("region", { name: FR.panel }).or(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })),
    ).toBeVisible();
  }
  await expect(page.locator("footer button")).toBeEnabled();
}

const sourceLink = (page: Page, words: Words) => page.getByRole("link", { name: words.source, exact: true });
const contactLink = (page: Page, words: Words) => page.getByRole("link", { name: words.contact, exact: true });
const homeLink = (page: Page, words: Words) => page.getByRole("link", { name: words.home, exact: true });
const languageSwitch = (page: Page, words: Words) => page.getByRole("button", { name: words.switch, exact: true });

/** G1, G2: exactly one link of that name, in the footer, to the repository, in a new tab, without opener or referrer. */
async function expectSourceLink(page: Page, words: Words) {
  const link = sourceLink(page, words);
  await expect(link).toHaveCount(1);
  await expect(page.locator("footer").getByRole("link", { name: words.source, exact: true })).toHaveCount(1);
  await expect(link).toHaveAttribute("href", REPOSITORY);
  await expect(link).toHaveAttribute("target", "_blank");
  const rel = ((await link.getAttribute("rel")) ?? "").split(/\s+/);
  expect(rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
}

/** The text of the element's first text node, as one line: the tops of its boxes, all the same (G5). */
const lineTops = (element: Locator) =>
  element.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => (text.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const text = walker.nextNode();
    if (!text) return [];
    const range = document.createRange();
    range.selectNodeContents(text);
    return [...new Set([...range.getClientRects()].map((rect) => rect.top))];
  });

/** G5, G6: line 1 is « Accueil » (not on `/`) and the switch, line 2 the source code and « Nous contacter », 44 px lower at least. */
async function expectTwoLines(page: Page, words: Words, withHome: boolean) {
  const first = [...(withHome ? [homeLink(page, words)] : []), languageSwitch(page, words)];
  const second = [sourceLink(page, words), contactLink(page, words)];
  const [line1, line2] = await Promise.all(
    [first, second].map((line) => Promise.all(line.map(async (each) => (await each.boundingBox())!))),
  );
  expect(new Set(line1.map((box) => box.y)).size, "line 1 on one y").toBe(1);
  expect(new Set(line2.map((box) => box.y)).size, "line 2 on one y").toBe(1);
  expect(line2[0].y - line1[0].y).toBeGreaterThanOrEqual(44);
  for (const [index, box] of [...line1, ...line2].entries()) {
    expect(box.height, `the height of command ${index + 1}`).toBeGreaterThanOrEqual(44);
  }
  for (const each of [...first, ...second]) {
    expect((await lineTops(each)).length, `the label of ${each} on one line`).toBe(1);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBe(0);
}

/** The outline of `element`, its colour read in sRGB: what makes its focus ring. */
async function outlineOf(element: Locator) {
  const style = await element.evaluate((node) => {
    const { outlineStyle, outlineWidth, outlineOffset } = getComputedStyle(node);
    return { outlineStyle, outlineWidth, outlineOffset };
  });
  return { ...style, outlineColor: await rgba(element, "outline-color") };
}

test.describe("the source code link, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  test("G3, G10: the keyboard goes « English », the source code, « Nous contacter », and the link shows the ring of « Nous contacter »", async ({
    page,
  }) => {
    await open(page, "/nouveau", "Créer un événement");
    await pressUntil(page, "Tab", languageSwitch(page, FR));
    await press(page, "Tab");
    const link = sourceLink(page, FR);
    await expect(link).toBeFocused();
    // G10: a solid outline of 2 px, #737373, 2 px out (`expectRing`), and the one of « Nous contacter ».
    await expectRing(link);
    const ring = await outlineOf(link);
    await press(page, "Tab");
    await expect(contactLink(page, FR)).toBeFocused();
    await expectRing(contactLink(page, FR));
    expect(await outlineOf(contactLink(page, FR))).toEqual(ring);
  });

  for (const [path, heading, first] of [
    ["/nouveau", "Créer un événement", FR.home],
    ["/", "Fullcar", FR.switch],
  ] as const) {
    test(`G3: on ${path}, the language's failure message comes before « ${first} », above line 1`, async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "cookieEnabled", { configurable: true, get: () => false });
      });
      await open(page, path, heading);
      await languageSwitch(page, FR).click();
      const alert = page.locator("footer").getByRole("alert");
      await expect(alert).toHaveCount(1);

      const firstOfFooter = page.locator("footer").locator("a, button").first();
      await expect(firstOfFooter).toHaveText(first);
      const before = await alert.evaluate(
        (element, other) => (element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        await firstOfFooter.elementHandle(),
      );
      expect(before).toBe(true);
      const [message, line1, line2] = await Promise.all(
        [alert, firstOfFooter, sourceLink(page, FR)].map(async (each) => (await each.boundingBox())!),
      );
      expect(message.y + message.height).toBeLessThanOrEqual(line1.y);
      expect(line2.y - line1.y).toBeGreaterThanOrEqual(44);
    });
  }

  test("G7: from the organiser's link, the repository alone in a new tab, and the organiser's tab stays", async ({
    page,
    context,
    github,
    seededEvent,
    baseURL,
  }) => {
    const { id, token } = seededEvent;
    const path = `/e/${id}/admin#${token}`;
    await open(page, path, "Tournoi de Rennes", token);
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();

    const [tab] = await Promise.all([context.waitForEvent("page"), sourceLink(page, FR).click()]);
    await tab.waitForLoadState();

    expect(tab.url() === REPOSITORY, "the new tab is the repository").toBe(true);
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(github.length).toBe(1);
    const [request] = github;
    expect(request.url() === REPOSITORY, "the request is for the repository").toBe(true);
    expect(await request.headerValue("referer")).toBeNull();
    const sent = `${request.url()} ${JSON.stringify(await request.allHeaders())} ${request.postData() ?? ""}`;
    expect(sent.includes(token), "what GitHub receives holds the token").toBe(false);
    expect(sent.includes(id), "what GitHub receives holds the event's id").toBe(false);

    // The organiser's tab has not moved, its fragment included.
    expect(page.url() === `${new URL(baseURL!).origin}${path}`, "the organiser's tab is still on the organiser's link").toBe(
      true,
    );
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
  });

  test("G9: once in English on the page, the link is named in English, to the same address", async ({
    page,
    github,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes");
    const before = await sourceLink(page, FR).getAttribute("href");
    await languageSwitch(page, FR).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(languageSwitch(page, EN)).toBeEnabled();

    await expect(sourceLink(page, EN)).toHaveCount(1);
    expect(before).toBe(REPOSITORY);
    await expect(sourceLink(page, EN)).toHaveAttribute("href", before!);
    await expect(sourceLink(page, FR)).toHaveCount(0);
    expect(github.length, "requests to GitHub").toBe(0);
  });

  test("G6: at 1280 × 800, on the event's page, the same two lines", async ({ page, seededEvent }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes");
    await expectTwoLines(page, FR, true);
  });
});

for (const [locale, words] of [
  ["fr-FR", FR],
  ["en-GB", EN],
] as const) {
  test.describe(`the footer at 360 × 780, in a browser set to ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 780 } });

    test("G5: on /, the switch alone on line 1, the source code and « Nous contacter » on line 2, each label on one line", async ({
      page,
    }) => {
      await open(page, "/", "Fullcar");
      await expect(homeLink(page, words)).toHaveCount(0);
      await expectTwoLines(page, words, false);
    });

    test("G5: on the event's page, « Accueil » and the switch on line 1, the source code and « Nous contacter » on line 2", async ({
      page,
      seededEvent,
    }) => {
      await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes");
      await expectTwoLines(page, words, true);
    });
  });
}

test.describe("the source code link, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("G9: named in English on the home page", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await expectSourceLink(page, EN);
  });

  test("G9: named in English on the event's page", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes");
    await expectSourceLink(page, EN);
  });
});

test.describe("the source code link, without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("G11: on /nouveau, the link is there, to the repository, in a new tab, without opener or referrer", async ({
    page,
    github,
  }) => {
    await page.goto("/nouveau");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer un événement");
    await expectSourceLink(page, FR);
    expect(github.length, "requests to GitHub").toBe(0);
  });
});
