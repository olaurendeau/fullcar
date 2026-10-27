import type { Locator, Page, Request } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test as base } from "./fixtures";
import { areaRefused, hideToken, keepAdminToken, organiserPath } from "./organiser";

leaveNoToken();

/*
 * #640: the shared footer, page by page, in one test each. What used to be checked again on
 * every page by four files is checked here once: the source code link (#489, G), « Nous
 * contacter » (#69, K), « Accueil » (#249, A3) and the language switch (#113, L1).
 * What each of those files tests once, not page by page, stays in it.
 * No assertion here may show the token: a path is named with it hidden, what a request
 * holds is searched for it as a boolean.
 */

const REPOSITORY = "https://github.com/olaurendeau/fullcar";
const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";
const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZQ";

const FR = {
  home: "Accueil",
  switch: "English",
  source: "Code source sur GitHub (s’ouvre dans un nouvel onglet)",
  contact: "Nous contacter (s’ouvre dans un nouvel onglet)",
  panel: "Espace organisateur",
};
type Words = typeof FR;
const EN: Words = {
  home: "Home",
  switch: "Français",
  source: "Source code on GitHub (opens in a new tab)",
  contact: "Contact us (opens in a new tab)",
  panel: "Organiser area",
};

/** G1, K1, L1.1, A3.1: the pages of the footer, the title that tells each is shown, and the admin token kept there (#597). */
const PAGES: [string, (event: SeededEvent) => string, string, ((event: SeededEvent) => string)?][] = [
  ["the home page", () => "/", "Fullcar"],
  ["the creation form", () => "/nouveau", "Créer un événement"],
  ["the event not found", () => `/e/${UNKNOWN_ID}`, "Événement introuvable"],
  ["the event's page", ({ id }) => `/e/${id}`, "Tournoi de Rennes"],
  ["the organiser's page", organiserPath, "Tournoi de Rennes", ({ token }) => token],
  // Refused, the screen of a pending event takes the board's place, and its title is the page's (#598).
  ["the organiser's page, wrong token", organiserPath, "Adresse pas encore confirmée", () => WRONG_TOKEN],
  ["the organiser's page, no token", organiserPath, "Adresse pas encore confirmée"],
];

/** G8: GitHub's hosts, the ones a badge, a logo or a script of GitHub would come from. */
const isGitHub = (url: URL) => /(^|\.)github\.com$|\.githubusercontent\.com$|\.githubassets\.com$/.test(url.hostname);
/** K5: Crisp's hosts. */
const isCrisp = (url: URL) => /(^|\.)crisp\.(chat|im)$/.test(url.hostname);

/**
 * No test of this file contacts GitHub or Crisp: the fixtures are automatic. Any request to
 * either is refused, and kept in `github` or `crisp` for the test to read.
 * Playwright's `use` is named `provide` here: the React hooks lint rule takes `use` for a hook.
 */
const test = base.extend<{ github: Request[]; crisp: Request[] }>({
  github: [
    async ({ context }, provide) => {
      const seen: Request[] = [];
      await context.route(isGitHub, (route) => {
        seen.push(route.request());
        return route.abort();
      });
      await provide(seen);
    },
    { auto: true },
  ],
  crisp: [
    async ({ context }, provide) => {
      const seen: Request[] = [];
      await context.route(isCrisp, (route) => {
        seen.push(route.request());
        return route.abort();
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
async function open(page: Page, path: string, heading: string, token: string) {
  try {
    await page.goto(path, { waitUntil: "networkidle" });
  } catch {
    throw new Error(`Could not open ${hideToken(path, token)}`);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(
      page.getByRole("region", { name: FR.panel }).or(areaRefused(page)),
    ).toBeVisible();
  }
  // Hydrated: the language switch is inactive until then.
  await expect(page.locator("footer button")).toBeEnabled();
}

const sourceLink = (page: Page, words: Words) => page.getByRole("link", { name: words.source, exact: true });
const contactLink = (page: Page, words: Words) => page.getByRole("link", { name: words.contact, exact: true });
const homeLink = (page: Page, words: Words) => page.getByRole("link", { name: words.home, exact: true });
const languageSwitch = (page: Page, words: Words) => page.getByRole("button", { name: words.switch, exact: true });

/** The footer's links and buttons, in the order of the document, by their text. */
function footerRow(page: Page) {
  return page
    .locator("footer")
    .evaluate((footer) =>
      [...footer.querySelectorAll("a, button")].map((element) => element.textContent?.replace(/\s+/g, " ").trim()),
    );
}

/** Exactly one link of that name, in the footer, to `href`, in a new tab, without opener or referrer. */
async function expectNewTabLink(page: Page, name: string, href: string) {
  const link = page.getByRole("link", { name, exact: true });
  await expect(link).toHaveCount(1);
  await expect(page.locator("footer").getByRole("link", { name, exact: true })).toHaveCount(1);
  await expect(link).toHaveAttribute("href", href);
  await expect(link).toHaveAttribute("target", "_blank");
  // The only check of `rel` for « Nous contacter »: K4 would pass without it, since Chromium
  // already opens a target="_blank" link without opener and the app sends no referrer.
  // Other browsers, or a later change to either, would not: do not remove this check.
  const rel = ((await link.getAttribute("rel")) ?? "").split(/\s+/);
  expect(rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
}

/** K1, K3: Crisp's link is the last link, no content of the page after it, discreet, and nothing scrolls sideways. */
async function expectLastAndDiscreet(page: Page, link: Locator) {
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

/** G4: the size and colour of « Nous contacter », smaller than the text, underlined, the hand. */
async function expectSourceAsContact(page: Page) {
  const [link, contact] = await Promise.all(
    [sourceLink(page, FR), contactLink(page, FR)].map((each) =>
      each.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          fontSize: parseFloat(style.fontSize),
          color: style.color,
          underlined: style.textDecorationLine.includes("underline"),
          cursor: style.cursor,
          textSize: parseFloat(getComputedStyle(document.body).fontSize),
        };
      }),
    ),
  );
  expect(link).toEqual(contact);
  expect(link.fontSize).toBeLessThan(link.textSize);
  expect(link.underlined).toBe(true);
  expect(link.cursor).toBe("pointer");
}

/** L1.1: one `<button>`, of exactly that name, in the language it names, in the footer, before Crisp's link. */
async function expectSwitch(button: Locator, lang: "fr" | "en") {
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute("lang", lang);
  expect(
    await button.evaluate((element, href) => {
      const link = document.querySelector(`a[href="${href}"]`);
      return {
        tag: element.tagName,
        inFooter: element.closest("footer") !== null,
        beforeLink: link !== null && (element.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      };
    }, CRISP_CHAT),
  ).toEqual({ tag: "BUTTON", inFooter: true, beforeLink: true });
}

/** A3.1: exactly one link « Accueil » in the page, in the footer, to `/`, in the same tab. */
async function expectHomeLink(page: Page) {
  const link = homeLink(page, FR);
  await expect(link).toHaveCount(1);
  await expect(page.locator("footer").getByRole("link", { name: FR.home, exact: true })).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/");
  expect(await link.getAttribute("target")).toBeNull();
}

/** A3.4: as small as « Nous contacter », 44 px high, on line 1 with the switch, and line 2 below them (G5). */
async function expectHomeOnFirstLine(page: Page) {
  const link = homeLink(page, FR);
  const [size, contactSize] = await Promise.all(
    [link, contactLink(page, FR)].map((each) => each.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))),
  );
  expect(size).toBe(contactSize);
  const [home, language, below] = await Promise.all(
    [link, languageSwitch(page, FR), contactLink(page, FR)].map(async (each) => (await each.boundingBox())!),
  );
  expect(home.height).toBeGreaterThanOrEqual(44);
  expect(language.y).toBe(home.y);
  expect(below.y - home.y).toBeGreaterThanOrEqual(44);
}

test.describe("the footer, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path, heading, kept] of PAGES) {
    // « Accueil » is on every page but the home page itself (A3.2, in home-link.spec.ts).
    const onHome = where === "the home page";
    const ids = ["G1", "G2", "G3", "G4", "G8", "K1", "K2", "K3", "K5"]
      .concat(onHome ? [] : ["A3.1", "A3.3", "A3.4"])
      .concat(["A3.6", "L1.1", "L1.2", "L3.6"]);

    test(`${ids.join(", ")}: on ${where}, the footer's row, its links and its switch, then the same once in English`, async ({
      page,
      github,
      crisp,
      seededEvent,
    }) => {
      if (kept) await keepAdminToken(page, seededEvent.id, kept(seededEvent));
      await open(page, path(seededEvent), heading, seededEvent.token);

      await test.step("G3, A3.3: « Accueil » (not on /), the language, the source code, « Nous contacter »", async () => {
        const home = onHome ? [] : [FR.home];
        expect(await footerRow(page)).toEqual([...home, FR.switch, FR.source, FR.contact]);
      });

      await test.step("G1, G2, G4: one link to the repository, in a new tab, not in the panel, as discreet as « Nous contacter »", async () => {
        await expectNewTabLink(page, FR.source, REPOSITORY);
        await expect(page.getByRole("region", { name: FR.panel }).getByRole("link", { name: FR.source })).toHaveCount(0);
        await expectSourceAsContact(page);
      });

      await test.step("K1, K2, K3: « Nous contacter », to Crisp in a new tab, the last link, discreet", async () => {
        await expectNewTabLink(page, FR.contact, CRISP_CHAT);
        await expectLastAndDiscreet(page, contactLink(page, FR));
      });

      await test.step("L1.1, L1.2: one button named English, in the footer, before « Nous contacter », as discreet", async () => {
        await expectSwitch(languageSwitch(page, FR), "en");
        await expectDiscreet(languageSwitch(page, FR));
      });

      if (!onHome) {
        await test.step("A3.1, A3.4: one link « Accueil » to /, on line 1 with the switch", async () => {
          await expectHomeLink(page);
          await expectHomeOnFirstLine(page);
        });
      }

      await test.step("A3.6: no <nav> and no aria-current", async () => {
        await expect(page.locator("nav")).toHaveCount(0);
        await expect(page.locator("[aria-current]")).toHaveCount(0);
      });

      await test.step("L1.2, L3.6: once in English, « Contact us » is still the last link, discreet, to the same Crisp", async () => {
        const before = await contactLink(page, FR).getAttribute("href");
        await languageSwitch(page, FR).click();
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(languageSwitch(page, EN)).toBeEnabled();

        const link = contactLink(page, EN);
        await expect(link).toHaveCount(1);
        expect(before).toBe(CRISP_CHAT);
        await expect(link).toHaveAttribute("href", before!);
        await expectLastAndDiscreet(page, link);
        await expectDiscreet(languageSwitch(page, EN));
      });

      // G8, K5: the page asked nothing of GitHub, nor of Crisp, in either language.
      expect(github.length, "requests to GitHub").toBe(0);
      expect(crisp.length, "requests to Crisp").toBe(0);
    });
  }
});
