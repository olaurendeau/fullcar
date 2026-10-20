import type { BrowserContext, Page, Request } from "@playwright/test";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * #113, #130: the language chosen is kept by the device, in the cookie NEXT_LOCALE, and
 * nowhere else: never in a URL, so that a shared link opens in the language of whoever
 * receives it. Without a tap, nothing is kept, and the browser's language decides.
 *
 * The organiser's secret is never written in a message here: a failed check names the
 * request and the part, compares a URL as a boolean, and never prints what it compared.
 */

const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_SECRET = "q3Vx9kLmN2pR7sT1uW4yZa";

const FR = {
  switch: "English",
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
  notFound: "Événement introuvable",
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  adminLink: "Lien d’organisateur",
};
const EN = {
  switch: "Français",
  tagline: "Group carpooling, there and back, no account needed.",
  notFound: "Event not found",
  panel: "Organiser area",
  shareLink: "Link to share",
  adminLink: "Organiser link",
};
type Words = typeof FR;

/** The pages of the footer (contact.spec.ts): which, where, and their title in each language. */
const PAGES: [string, (event: SeededEvent) => string, Record<"fr" | "en", string>][] = [
  ["the home page", () => "/", { fr: "Fullcar", en: "Fullcar" }],
  ["the event not found", () => `/e/${UNKNOWN_ID}`, { fr: FR.notFound, en: EN.notFound }],
  ["the event's page", ({ id }) => `/e/${id}`, { fr: "Tournoi de Rennes", en: "Tournoi de Rennes" }],
  [
    "the organiser's page",
    ({ id, token }) => `/e/${id}/admin#${token}`,
    { fr: "Tournoi de Rennes", en: "Tournoi de Rennes" },
  ],
  [
    "the organiser's page, wrong secret",
    ({ id }) => `/e/${id}/admin#${WRONG_SECRET}`,
    { fr: "Tournoi de Rennes", en: "Tournoi de Rennes" },
  ],
  ["the organiser's page, no secret", ({ id }) => `/e/${id}/admin`, { fr: "Tournoi de Rennes", en: "Tournoi de Rennes" }],
];

/** The page once it has settled: on the organiser's page, once its link has been checked. */
async function open(page: Page, path: string, heading: string, words: Words = FR) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(
      page.getByRole("region", { name: words.panel }).or(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })),
    ).toBeVisible();
  }
}

const languageSwitch = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** The page is in this language, and offers the other one. */
async function expectLanguage(page: Page, lang: "fr" | "en") {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(languageSwitch(page, lang === "fr" ? FR.switch : EN.switch)).toHaveCount(1);
}

/** Taps the button once the page is hydrated, and waits for the page to be in the other language. */
async function switchTo(page: Page, lang: "fr" | "en") {
  const button = languageSwitch(page, lang === "en" ? FR.switch : EN.switch);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(languageSwitch(page, lang === "en" ? EN.switch : FR.switch)).toBeEnabled();
}

/** The names of the context's cookies: what a failure may print, unlike their values. */
async function cookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).map(({ name }) => name);
}

/** The one cookie the context holds: NEXT_LOCALE, and its value. */
async function localeCookie(context: BrowserContext): Promise<string> {
  expect(await cookieNames(context)).toEqual(["NEXT_LOCALE"]);
  return (await context.cookies())[0].value;
}

/** A language, as a path segment or a query string's value would name it. */
const LOCALE = /^(fr|en)([-_][a-z]{2})?$/i;
const LOCALE_KEY = /^(lang|language|locale|hl)$/i;
/**
 * The app's icons, which the document's head asks for again once rendered in the new language,
 * and which Chromium may fetch at any time, the favicon included. Their one query parameter is
 * their version, which Next names after the file: `/favicon.ico?favicon.<hash>.ico`. Its hash
 * has 13 characters; at least 8 are asked, which no language name has.
 */
const ICON_VERSION = new Map([
  ["/favicon.ico", /^favicon\.[\w-]{8,}\.ico$/],
  ["/icon.svg", /^icon\.[\w-]{8,}\.svg$/],
  ["/apple-icon.png", /^apple-icon\.[\w-]{8,}\.png$/],
]);
/** Whether a query parameter is an icon's version: on the icon's own path, named after it, without a value. */
const isIconVersion = (pathname: string, key: string, value: string) =>
  value === "" && (ICON_VERSION.get(pathname)?.test(key) ?? false);

/** Whether a text holds one of these: answered as a boolean, so that a failure prints none of them. */
const holdsAny = (text: string, secrets: string[]) => secrets.some((secret) => text.includes(secret));

test.describe("the language, without a choice", () => {
  for (const [locale, lang] of [
    ["de-DE", "fr"],
    ["en-GB", "en"],
    ["fr-FR", "fr"],
  ] as const) {
    test.describe(`in a browser set to ${locale}`, () => {
      test.use({ locale });

      test(`L1.6: without a cookie, the page is in ${lang === "fr" ? "French" : "English"}, and keeps none`, async ({
        page,
        context,
      }) => {
        expect(await cookieNames(context)).toEqual([]);
        await open(page, "/", "Fullcar");
        await expectLanguage(page, lang);
        await expect(page.getByText(lang === "fr" ? FR.tagline : EN.tagline, { exact: true })).toBeVisible();
        expect(await cookieNames(context)).toEqual([]);
      });
    });
  }

  test.describe("in a browser set to French", () => {
    test.use({ locale: "fr-FR" });

    test("L2.3: the six pages of the footer, visited without the button, leave no cookie", async ({
      page,
      context,
      seededEvent,
    }) => {
      for (const [where, path, heading] of PAGES) {
        await open(page, path(seededEvent), heading.fr);
        await expectLanguage(page, "fr");
        expect(await cookieNames(context), where).toEqual([]);
      }
    });

    for (const value of ["de", "", "EN"]) {
      test(`L2.6: a cookie worth ${JSON.stringify(value)} is ignored, and a tap replaces it`, async ({
        page,
        context,
        baseURL,
      }) => {
        await context.addCookies([{ name: "NEXT_LOCALE", value, url: baseURL!, sameSite: "Lax" }]);
        expect(await localeCookie(context)).toBe(value);

        await open(page, "/", "Fullcar");
        await expectLanguage(page, "fr");
        await expect(page.getByText(FR.tagline, { exact: true })).toBeVisible();

        await switchTo(page, "en");
        expect(await localeCookie(context)).toBe("en");
        await page.reload({ waitUntil: "networkidle" });
        await expectLanguage(page, "en");
      });
    }
  });
});

test.describe("the language chosen, kept by the device", () => {
  test.describe("in a browser set to French", () => {
    test.use({ locale: "fr-FR" });

    test("L2.1: after a tap, a reload, and a new page on another event, are in English", async ({
      page,
      context,
      db,
      seededEvent,
    }) => {
      await open(page, `/e/${seededEvent.id}`, "Tournoi de Rennes");
      await switchTo(page, "en");

      await page.reload({ waitUntil: "networkidle" });
      await expectLanguage(page, "en");

      const other = await seedEvent(db, { title: "Sortie ski du club", location: "La Clusaz" });
      try {
        const next = await context.newPage();
        await open(next, `/e/${other.id}`, "Sortie ski du club");
        await expectLanguage(next, "en");
        expect(await localeCookie(context)).toBe("en");
      } finally {
        await db.deleteFrom("event").where("id", "=", other.id).execute();
      }
    });

    test("L2.4: on the organiser's page, the cookie is the language only, without the event nor its secret", async ({
      page,
      context,
      seededEvent,
    }) => {
      const { id, token } = seededEvent;
      await open(page, `/e/${id}/admin#${token}`, "Tournoi de Rennes");
      await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();

      for (const lang of ["en", "fr"] as const) {
        await switchTo(page, lang);
        expect((await localeCookie(context)) === lang, `NEXT_LOCALE is ${lang}`).toBe(true);
        expect(holdsAny(JSON.stringify(await context.cookies()), [id, token]), "the cookies hold the event").toBe(
          false,
        );
      }
    });
  });

  test.describe("in a browser set to English", () => {
    test.use({ locale: "en-GB" });

    test("L2.5: after a tap on Français, the next visits are in French despite Accept-Language", async ({
      page,
      context,
      seededEvent,
    }) => {
      await open(page, "/", "Fullcar", EN);
      await expectLanguage(page, "en");
      await switchTo(page, "fr");
      expect(await localeCookie(context)).toBe("fr");

      for (const [, path, heading] of PAGES) {
        await open(page, path(seededEvent), heading.fr);
        await expectLanguage(page, "fr");
      }
      const next = await context.newPage();
      await open(next, "/", "Fullcar");
      await expect(next.getByText(FR.tagline, { exact: true })).toBeVisible();
    });
  });
});

/** What a request sends, by part: its path, its query string, its headers and its body. */
interface Sent {
  method: string;
  pathname: string;
  query: URLSearchParams;
  headers: string;
  body: string;
}

/** How long the page must stay without a request in flight to be taken as settled. */
const QUIET_MS = 500;

/**
 * Every request of the page from now on, read once the page has settled: no request in
 * flight for QUIET_MS. `waitForLoadState("networkidle")` would not wait: the document
 * reached that state before the tap, and what the page does next would be missed.
 */
function watchRequests(page: Page): () => Promise<Sent[]> {
  const requests: Request[] = [];
  let inFlight = 0;
  let lastActivity = Date.now();
  const started = (request: Request) => {
    requests.push(request);
    inFlight += 1;
    lastActivity = Date.now();
  };
  const ended = () => {
    inFlight -= 1;
    lastActivity = Date.now();
  };
  page.on("request", started);
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  return async () => {
    await expect.poll(() => inFlight === 0 && Date.now() - lastActivity >= QUIET_MS, { intervals: [100] }).toBe(true);
    page.off("request", started);
    page.off("requestfinished", ended);
    page.off("requestfailed", ended);
    return Promise.all(
      requests.map(async (request) => {
        const url = new URL(request.url());
        return {
          method: request.method(),
          pathname: url.pathname,
          query: url.searchParams,
          headers: JSON.stringify(await request.allHeaders()),
          body: request.postDataBuffer()?.toString("utf8") ?? "",
        };
      }),
    );
  };
}

test.describe("the language never in a URL", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path, heading] of PAGES) {
    test(`L2.7: on ${where}, a tap keeps the URL, puts the language in no path nor query, and sends no secret`, async ({
      page,
      seededEvent,
    }) => {
      const at = path(seededEvent);
      const { pathname } = new URL(at, "http://fullcar.test");
      await open(page, at, heading.fr);
      const before = page.url();
      const sent = watchRequests(page);
      // Every URL the document goes through, `history.replaceState` included: none but its own.
      const visited: string[] = [];
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) visited.push(frame.url());
      });

      await switchTo(page, "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading.en);
      const requests = await sent();
      expect(page.url() === before, "the URL is the same, fragment included").toBe(true);
      expect(
        visited.every((url) => url === before),
        "the URL was the same all along",
      ).toBe(true);

      // The secrets of the organiser's links, valid or not: never printed, whatever fails.
      const secrets = [seededEvent.token, WRONG_SECRET];
      const hide = (text: string) => secrets.reduce((shown, secret) => shown.replaceAll(secret, "{secret}"), text);
      // Watched: the switch is a POST to the page itself, whose body is the language only.
      expect(requests.map(({ method, pathname: to, body }) => hide(`${method} ${to} ${body}`))).toContain(
        `POST ${pathname} ["en"]`,
      );
      // The language is in no path and no query string: no segment, no parameter, no value names it.
      const named = requests
        .filter(
          ({ pathname: to, query }) =>
            to.split("/").some((segment) => LOCALE.test(segment)) ||
            [...query.keys()].some((key) => LOCALE_KEY.test(key)) ||
            [...query.values()].some((value) => LOCALE.test(value)),
        )
        .map(({ method, pathname: to, query }) => hide(`${method} ${to}?${query}`));
      expect(named).toEqual([]);
      // Nor any other query parameter than the RSC fetch's cache key, and an icon's version.
      const queries = requests.flatMap(({ method, pathname: to, query }) =>
        [...query]
          .filter(([key, value]) => key !== "_rsc" && !isIconVersion(to, key, value))
          .map(([key]) => hide(`${method} ${to} ${key}`)),
      );
      expect(queries).toEqual([]);
      // The secrets are in no part of any request.
      const leaks = requests.flatMap(({ method, pathname: to, query, headers, body }) =>
        Object.entries({ path: to, query: query.toString(), headers, body })
          .filter(([, text]) => holdsAny(text, secrets))
          .map(([part]) => `${method} ${part}`),
      );
      expect(leaks).toEqual([]);
    });
  }

  test("L2.7: what is read past is an icon's version, as the document's head names it, and nothing else", async ({
    page,
  }) => {
    await open(page, "/", "Fullcar");
    const hrefs = await page
      .locator('head link[rel="icon"], head link[rel="apple-touch-icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const icons = hrefs.map((href) => new URL(href, "http://fullcar.test"));
    expect(icons.map(({ pathname }) => pathname).sort()).toEqual(["/apple-icon.png", "/favicon.ico", "/icon.svg"]);
    for (const { pathname, searchParams } of icons) {
      const params = [...searchParams];
      expect(params, pathname).toHaveLength(1);
      const [[key, value]] = params;
      expect(isIconVersion(pathname, key, value), `${pathname}'s version`).toBe(true);
      // Its version only: not with a value, nor on another path.
      expect(isIconVersion(pathname, key, "en"), `${pathname}'s version with a value`).toBe(false);
      expect(isIconVersion("/", key, value), `${pathname}'s version on the home page`).toBe(false);
    }
    expect(isIconVersion("/favicon.ico", "lang", "")).toBe(false);
    expect(isIconVersion("/favicon.ico", "icon.19jyq0e_4sn9e.svg", "")).toBe(false);
    expect(isIconVersion("/favicon.ico", "favicon.ico", "")).toBe(false);
    // A language is no version: a hash has at least 8 characters.
    expect(isIconVersion("/favicon.ico", "favicon.en.ico", "")).toBe(false);
    expect(isIconVersion("/favicon.ico", "favicon.en-GB.ico", "")).toBe(false);
  });

  test("L2.7: the organiser's two links are the same after the tap, and the shared one opens in French", async ({
    page,
    browser,
    baseURL,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}/admin#${seededEvent.token}`, "Tournoi de Rennes");
    const links = (words: Words) =>
      Promise.all(
        [words.shareLink, words.adminLink].map((name) =>
          page.getByRole("region", { name: words.panel }).getByRole("group", { name }).getByTestId("link").innerText(),
        ),
      );
    const before = await links(FR);
    expect(before[0]).toBe(`${new URL(baseURL!).origin}/e/${seededEvent.id}`);

    await switchTo(page, "en");
    await expect(page.getByRole("region", { name: EN.panel })).toBeVisible();
    const after = await links(EN);
    expect(after[0]).toBe(before[0]);
    expect(after[1] === before[1], "the organiser's link is the same").toBe(true);

    const elsewhere = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      expect(await elsewhere.cookies()).toEqual([]);
      const shared = await elsewhere.newPage();
      await open(shared, after[0], "Tournoi de Rennes");
      await expectLanguage(shared, "fr");
    } finally {
      await elsewhere.close();
    }
  });
});

test.describe("an event created in the language chosen", () => {
  test.use({ locale: "fr-FR" });

  test("L2.8: the creation form turned into English, then a creation, give the organiser's page in English", async ({
    page,
    db,
  }) => {
    await open(page, "/nouveau", "Créer un événement");
    await switchTo(page, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create an event");

    const field = (label: string) => page.getByLabel(label, { exact: true });
    const allerDate = await page.evaluate(() => {
      const at = new Date();
      at.setDate(at.getDate() + 7);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    });
    await field("Title").fill("Club ski trip");
    await field("Place").fill("La Clusaz");
    await field("Outbound date").fill(allerDate);
    await field("Outbound time").fill("07:30");
    await field("Return time").fill("18:00");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    // Read by its path only: the URL's fragment is the organiser's secret.
    await expect.poll(() => /^\/e\/\w{8}\/admin$/.test(new URL(page.url()).pathname)).toBe(true);
    const id = new URL(page.url()).pathname.split("/")[2];
    try {
      await expect(page.getByRole("region", { name: EN.panel })).toBeVisible();
      await expectLanguage(page, "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Club ski trip");
    } finally {
      await db.deleteFrom("event").where("id", "=", id).execute();
    }
  });

  test("C4.2 of #3, in English after the tap: both links and the warning are visible without scrolling at 360 × 780", async ({
    page,
    seededEvent,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 780 });
    await open(page, `/e/${seededEvent.id}/admin#${seededEvent.token}`, "Tournoi de Rennes");
    await switchTo(page, "en");

    // The tap scrolled down to the footer: the panel is read from the top, as on arrival.
    await page.evaluate(() => window.scrollTo(0, 0));
    const panel = page.getByRole("region", { name: EN.panel });
    await expect(panel.getByRole("group", { name: EN.shareLink }).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("group", { name: EN.adminLink }).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole("note")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBe(0);
  });
});
