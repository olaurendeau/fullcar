import { devices, type Locator, type Page, type Request } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test } from "./fixtures";
import { hideToken } from "./organiser";

leaveNoToken();

/*
 * #249, epic #232 (A3): a link to the home page, first of the footer's row, on every page but
 * the home page itself. From the organiser's page, it takes nothing of the organiser's link
 * along. No assertion here may show the token: a URL is compared with it hidden, a request
 * is searched for it and named by its path, the token hidden.
 */

const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";
const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZa";

const FR = {
  home: "Accueil",
  switch: "English",
  contact: "Nous contacter (s’ouvre dans un nouvel onglet)",
  panel: "Espace organisateur",
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
};
type Words = typeof FR;
const EN: Words = {
  home: "Home",
  switch: "Français",
  contact: "Contact us (opens in a new tab)",
  panel: "Organiser area",
  tagline: "Group carpooling, there and back, no account needed.",
};

/** A3.1: the pages that have the link, and the title that tells each is shown. */
const PAGES: [string, (event: SeededEvent) => string, string][] = [
  ["the creation form", () => "/nouveau", "Créer un événement"],
  ["the event not found", () => `/e/${UNKNOWN_ID}`, "Événement introuvable"],
  ["the event's page", ({ id }) => `/e/${id}`, "Tournoi de Rennes"],
  ["the organiser's page", ({ id, token }) => `/e/${id}/admin#${token}`, "Tournoi de Rennes"],
  ["the organiser's page, wrong token", ({ id }) => `/e/${id}/admin#${WRONG_TOKEN}`, "Tournoi de Rennes"],
  ["the organiser's page, no token", ({ id }) => `/e/${id}/admin`, "Tournoi de Rennes"],
];

/**
 * The page once it has settled: on the organiser's page, once the token has been checked.
 * A failure names the path with the token hidden: Playwright's own message would show it.
 */
async function open(page: Page, path: string, heading: string, token?: string) {
  try {
    await page.goto(path, { waitUntil: "networkidle" });
  } catch {
    throw new Error(`Could not open ${token ? hideToken(path, token) : path}`);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(
      page
        .getByRole("region", { name: FR.panel })
        .or(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })),
    ).toBeVisible();
  }
  // Hydrated: the language switch is inactive until then.
  await expect(page.locator("footer button")).toBeEnabled();
}

const homeLink = (page: Page, words: Words) => page.getByRole("link", { name: words.home, exact: true });
const languageSwitch = (page: Page, words: Words) => page.getByRole("button", { name: words.switch, exact: true });
const contactLink = (page: Page, words: Words) => page.getByRole("link", { name: words.contact, exact: true });

/** The footer's links and buttons, in the order of the document, by their text. */
function footerRow(page: Page) {
  return page
    .locator("footer")
    .evaluate((footer) =>
      [...footer.querySelectorAll("a, button")].map((element) => element.textContent?.replace(/\s+/g, " ").trim()),
    );
}

/** A3.1: exactly one link « Accueil » in the page, in the footer, to `/`, in the same tab. */
async function expectHomeLink(page: Page, words: Words) {
  const link = homeLink(page, words);
  await expect(link).toHaveCount(1);
  await expect(page.locator("footer").getByRole("link", { name: words.home, exact: true })).toHaveCount(1);
  await expect(link).toHaveAttribute("href", "/");
  expect(await link.getAttribute("target")).toBeNull();
}

/** A3.4: as small as « Nous contacter », smaller than the text, 44 px high, the three on one line, nothing sideways. */
async function expectOneDiscreetLine(page: Page, words: Words) {
  const link = homeLink(page, words);
  const contact = contactLink(page, words);
  const [size, contactSize, textSize] = await link.evaluate(
    (node, other) => [
      parseFloat(getComputedStyle(node).fontSize),
      parseFloat(getComputedStyle(document.querySelector(`a[href="${other}"]`)!).fontSize),
      parseFloat(getComputedStyle(document.body).fontSize),
    ],
    CRISP_CHAT,
  );
  expect(size).toBe(contactSize);
  expect(size).toBeLessThan(textSize);

  const boxes = await Promise.all([link, languageSwitch(page, words), contact].map((each) => each.boundingBox()));
  expect(boxes[0]!.height).toBeGreaterThanOrEqual(44);
  expect(new Set(boxes.map((box) => box!.y)).size).toBe(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBe(0);
}

/** A3.6: no `<nav>` and no `aria-current`, anywhere in the page. */
async function expectNoNavigation(page: Page) {
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(page.locator("[aria-current]")).toHaveCount(0);
}

/** The focus ring of `element`, reached by the keyboard: its box-shadow and outline style. */
function ringOf(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return { focused: document.activeElement === node, boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
}

/** A mark only the same document keeps: a document loaded again would lose it. */
function markWindow(page: Page) {
  return page.evaluate(() => {
    (window as Window & { notReloaded?: boolean }).notReloaded = true;
  });
}

function windowMarked(page: Page) {
  return page.evaluate(() => (window as Window & { notReloaded?: boolean }).notReloaded === true);
}

test.describe("the home link, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path, heading] of PAGES) {
    test(`A3.1, A3.3, A3.4, A3.6: on ${where}, one link « Accueil » to /, first of the footer's row`, async ({
      page,
      seededEvent,
    }) => {
      await open(page, path(seededEvent), heading, seededEvent.token);
      await expectHomeLink(page, FR);

      // A3.3: « Accueil », the language switch, « Nous contacter », still the page's last link.
      expect(await footerRow(page)).toEqual([FR.home, FR.switch, FR.contact]);
      expect(await page.locator("a").last().getAttribute("href")).toBe(CRISP_CHAT);

      await expectOneDiscreetLine(page, FR);
      await expectNoNavigation(page);
    });
  }

  test("A3.2, A3.6: on /, no link « Accueil »: the row is still the language, then « Nous contacter »", async ({
    page,
  }) => {
    await open(page, "/", "Fullcar");
    await expect(homeLink(page, FR)).toHaveCount(0);
    await expect(page.locator('footer a[href="/"]')).toHaveCount(0);
    expect(await footerRow(page)).toEqual([FR.switch, FR.contact]);
    await expectNoNavigation(page);
  });

  test("A3.3, A3.5: the keyboard goes « Accueil », the language, « Nous contacter », and « Accueil » shows the switch's ring", async ({
    page,
  }) => {
    await open(page, "/nouveau", "Créer un événement");
    const link = homeLink(page, FR);
    const button = languageSwitch(page, FR);

    // Reached from the switch, backwards, by the keyboard: the focus is visible.
    await button.focus();
    const switchRing = await ringOf(button);
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
    const ring = await ringOf(link);
    expect(ring.focused).toBe(true);
    expect(ring.boxShadow).not.toBe("none");
    expect(ring.outlineStyle).toBe("none");
    // The ring of the language switch, and only it.
    expect(switchRing.boxShadow).not.toBe("none");
    expect(ring.boxShadow).toBe(switchRing.boxShadow);

    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(contactLink(page, FR)).toBeFocused();
  });

  test("A3.7: from the organiser's link, the home page in the same tab, without the token, and Back brings the panel again", async ({
    page,
    context,
    seededEvent,
    baseURL,
  }) => {
    const { id, token } = seededEvent;
    const origin = new URL(baseURL!).origin;
    const adminPath = `/e/${id}/admin#${token}`;

    // Every request of the test, searched for the token and for a Referer, named by its path, token hidden.
    const phase = { name: "organiser" as "organiser" | "home" | "back" };
    const sent: { phase: string; path: string; inUrl: boolean; inHeaders: boolean; inBody: boolean; referer: boolean }[] =
      [];
    const watching: Promise<void>[] = [];
    const watch = (request: Request) => {
      const at = phase.name;
      watching.push(
        request.allHeaders().then((headers) => {
          const { pathname, search } = new URL(request.url());
          sent.push({
            phase: at,
            path: hideToken(`${request.method()} ${pathname}${search}`, token),
            inUrl: request.url().includes(token),
            inHeaders: JSON.stringify(headers).includes(token),
            inBody: (request.postData() ?? "").includes(token),
            referer: "referer" in headers,
          });
        }),
      );
    };
    context.on("request", watch);

    await open(page, adminPath, "Tournoi de Rennes", token);
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    await markWindow(page);

    phase.name = "home";
    await homeLink(page, FR).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fullcar");
    await expect(page.getByText(FR.tagline, { exact: true })).toBeVisible();
    // Exactly the origin's `/`, no fragment, in the same tab, by the same document.
    expect(hideToken(page.url(), token)).toBe(`${origin}/`);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
    expect(context.pages()).toHaveLength(1);
    expect(await windowMarked(page)).toBe(true);
    // Whatever the home page asks once there (its own prefetch included) is in the list.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    phase.name = "back";
    await page.goBack();
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    expect(page.url() === `${origin}${adminPath}`, "Back is on the organiser's link").toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");

    context.off("request", watch);
    await Promise.all(watching);
    // Not prefetched: the organiser's page asks nothing of `/` before the tap.
    const homePage = /^GET \/(\?|$)/;
    expect(sent.filter((each) => each.phase === "organiser" && homePage.test(each.path)).map((each) => each.path)).toEqual(
      [],
    );
    const home = sent.filter((each) => each.phase === "home");
    expect(home.length, "requests after the tap").toBeGreaterThan(0);
    expect(home.filter((each) => each.inUrl || each.inHeaders || each.inBody).map((each) => each.path)).toEqual([]);
    // Never a Referer, and never the token in a URL or a header, before the tap or after Back either.
    expect(sent.filter((each) => each.referer).map((each) => each.path)).toEqual([]);
    expect(sent.filter((each) => each.inUrl || each.inHeaders).map((each) => each.path)).toEqual([]);
  });

  test("A3.9: without JavaScript, on /nouveau, the footer shows « Accueil », the inactive switch and « Nous contacter », and « Accueil » leads to /", async ({
    page,
    browser,
    baseURL,
  }) => {
    const noScript = await browser.newContext({
      ...devices["Pixel 7"],
      viewport: page.viewportSize()!,
      locale: "fr-FR",
      baseURL,
      javaScriptEnabled: false,
    });
    try {
      const still = await noScript.newPage();
      await still.goto("/nouveau");
      await expect(still.getByRole("heading", { level: 1 })).toHaveText("Créer un événement");
      expect(await footerRow(still)).toEqual([FR.home, FR.switch, FR.contact]);
      await expect(languageSwitch(still, FR)).toBeDisabled();
      await expectHomeLink(still, FR);

      await homeLink(still, FR).click();
      await expect(still.getByRole("heading", { level: 1 })).toHaveText("Fullcar");
      expect(still.url()).toBe(`${new URL(baseURL!).origin}/`);
    } finally {
      await noScript.close();
    }
  });

  test("A3.8: once in English on the event's page, the link reads « Home », to /, and the home page opens in English", async ({
    page,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes", seededEvent.token);
    await languageSwitch(page, FR).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(languageSwitch(page, EN)).toBeEnabled();

    await expectHomeLink(page, EN);
    await expect(homeLink(page, FR)).toHaveCount(0);
    await homeLink(page, EN).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fullcar");
    await expect(page.getByText(EN.tagline, { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("the home link, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  for (const [where, path, heading] of [
    ["the creation form", "/nouveau", "Create an event"],
    ["the event not found", `/e/${UNKNOWN_ID}`, "Event not found"],
  ]) {
    test(`A3.1, A3.4: on ${where}, one link « Home » to /, the three on one line`, async ({ page }) => {
      await open(page, path, heading);
      await expectHomeLink(page, EN);
      expect(await footerRow(page)).toEqual([EN.home, EN.switch, EN.contact]);
      await expectOneDiscreetLine(page, EN);
    });
  }

  test("A3.2: on /, no link « Home »", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await expect(homeLink(page, EN)).toHaveCount(0);
    expect(await footerRow(page)).toEqual([EN.switch, EN.contact]);
  });
});
