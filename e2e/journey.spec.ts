import { readFileSync } from "node:fs";
import type { BrowserContext, Page, Response } from "@playwright/test";
import { expect, expectText, expectUrl, leaveNoToken, test } from "./fixtures";

leaveNoToken();

/*
 * The organiser's whole journey (#3, #24, #232): from `/` to the link to share, against the
 * production build served in UTC+14 (the Makefile's E2E_TZ), from browsers in other zones.
 */

type Messages = { [key: string]: string | Messages };

const messages = (locale: "fr" | "en"): string[] => {
  const flatten = (node: Messages): string[] =>
    Object.values(node).flatMap((value) => (typeof value === "string" ? [value] : flatten(value)));
  return flatten(JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")));
};

/** What both languages write the same way: any other shared text is a missing translation. */
const IN_BOTH = ["Fullcar", "Options"];

/** The words of one language: what a page in the other must never show (C7.1). */
function onlyIn(locale: "fr" | "en"): string[] {
  return messages(locale).filter((text) => !IN_BOTH.includes(text) && !text.includes("{"));
}

const WORDS = {
  fr: {
    title: "Titre",
    location: "Lieu",
    allerDate: "Date de début",
    allerTime: "Heure de début",
    retour: "Retour",
    retourTime: "Heure de fin",
    options: ["Rehausseurs", "Participation aux frais", "Points de RDV"],
    create: "Créer",
    newEvent: "Créer un événement",
    panel: "Espace organisateur",
    shareLink: "Lien à partager",
    aller: "Aller",
    dates: ["Début", "Fin"],
    offer: "Proposer une voiture",
    departure: "Heure de départ",
    at: (time: string) => `à ${time}`,
    // 07:30 and 18:00, as the language writes them.
    clock: { aller: "07:30", retour: "18:00" },
  },
  en: {
    title: "Title",
    location: "Place",
    allerDate: "Start date",
    allerTime: "Start time",
    retour: "Return",
    retourTime: "End time",
    options: ["Booster seats", "Cost sharing", "Meeting points"],
    create: "Create",
    newEvent: "Create an event",
    panel: "Organiser area",
    shareLink: "Link to share",
    aller: "Outbound",
    dates: ["Start", "End"],
    offer: "Offer a car",
    departure: "Departure time",
    at: (time: string) => `at ${time}`,
    clock: { aller: "7:30\\sAM", retour: "6:00\\sPM" },
  },
};

/** Where a new event lands: its organiser's link, the secret in the fragment only (C1.5). */
const ARRIVAL = /\/e\/([2-9A-HJ-NP-Za-km-z]{8})\/admin#[A-Za-z0-9_-]{22}$/;

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** The device's date, `days` from today, as an `<input type="date">` takes it. */
function deviceDate(page: Page, days: number): Promise<string> {
  return page.evaluate((days) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  }, days);
}

/** A leg's date and time as the page must write them: the digits typed, in any zone (C1.12). */
function legText(lang: "fr" | "en", date: string, time: string): RegExp {
  const day = new Intl.DateTimeFormat(lang, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00Z`));
  return new RegExp(`^${day} ${WORDS[lang].at(time)}$`);
}

/** The server action that checks the organiser's token: a POST to `/e/{id}/admin` (C4.9). */
const isCheck = (response: Response) =>
  response.request().method() === "POST" && /^\/e\/[^/]+\/admin$/.test(new URL(response.url()).pathname);

const JOURNEYS = [
  { locale: "fr-FR", lang: "fr", timezoneId: "America/New_York", retour: true },
  { locale: "fr-FR", lang: "fr", timezoneId: "Europe/Paris", retour: false },
  { locale: "en-GB", lang: "en", timezoneId: "Pacific/Honolulu", retour: true },
  { locale: "en-GB", lang: "en", timezoneId: "Asia/Tokyo", retour: false },
  // No German: the French, whole (C7.1).
  { locale: "de-DE", lang: "fr", timezoneId: "Europe/Berlin", retour: true },
] as const;

for (const { locale, lang, timezoneId, retour } of JOURNEYS) {
  const words = WORDS[lang];
  const name = `${locale}, ${retour ? "with" : "without"} a retour, browser in ${timezoneId}`;

  test.describe(`the organiser's journey, ${name}`, () => {
    test.use({ locale, timezoneId });

    test("A2.2, C1.4, C1.12, C5.9, C7.1: at most seven actions from /, six of them on /nouveau, to the link to share, in less than 30 s, in one language", async ({
      page,
      baseURL,
    }) => {
      const origin = new URL(baseURL!).origin;
      const requests: string[] = [];
      const scripts: string[] = [];
      page.on("request", (request) => {
        requests.push(request.url());
        if (request.resourceType() === "script") scripts.push(request.url());
      });
      const title = lang === "fr" ? "Sortie ski du club" : "Club ski trip";

      const start = Date.now();
      await page.goto("/");
      const allerDate = await deviceDate(page, 7);
      // A2.2: the home page's one link to the form, the first action.
      const toForm = () => page.getByRole("link", { name: words.newEvent, exact: true }).click();
      // C1.4 and C2.2: the shortest path, every action of the user on /nouveau in this list.
      const onForm = [
        () => field(page, words.title).fill(title),
        () => field(page, words.location).fill("La Clusaz"),
        () => field(page, words.allerDate).fill(allerDate),
        () => field(page, words.allerTime).fill("07:30"),
        retour ? () => field(page, words.retourTime).fill("18:00") : () => field(page, words.retour).click(),
        () => page.getByRole("button", { name: words.create }).click(),
      ];
      expect(onForm.length).toBeLessThanOrEqual(6);
      expect([toForm, ...onForm].length).toBeLessThanOrEqual(7);
      await toForm();
      // Hydrated: "Créer" stays inactive until then. Waiting is not an action.
      await expect(page.getByRole("button", { name: words.create })).toBeEnabled({ timeout: 15_000 });
      await expectUrl(page, /\/nouveau$/, "the creation form");
      for (const action of onForm) await action();

      const shareLink = page.getByRole("region", { name: words.panel }).getByRole("group", { name: words.shareLink });
      await expectUrl(page, ARRIVAL, "the organiser's link");
      const id = ARRIVAL.exec(page.url())![1];
      await expectText(shareLink.getByTestId("link"), `${origin}/e/${id}`, "the share link is shown");
      expect(Date.now() - start).toBeLessThan(30_000);

      // C1.12: 07:30 and 18:00, as typed, from a server in UTC+14 to a browser elsewhere.
      // D2.4: « Début » in full, « Fin » its time alone, the same day.
      const legs = [legText(lang, allerDate, words.clock.aller)];
      if (retour) legs.push(new RegExp(`^${words.clock.retour}$`));
      const dates = retour ? words.dates : words.dates.slice(0, 1);
      await expect(page.locator("header dt")).toHaveText(dates);
      await expect(page.locator("header dd")).toHaveText(legs);
      await expectOneLanguage(page, lang, allerDate);

      // The link to share, opened: the event, on both tabs when it has a retour.
      await page.goto(`${origin}/e/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("region", { name: words.panel })).toHaveCount(0);
      await expect(page.locator("header dt")).toHaveText(dates);
      await expect(page.locator("header dd")).toHaveText(legs);
      // D2.4: « Proposer une voiture » starts from the start at the aller, as before.
      await expectOfferAt(page, lang, "07:30");
      if (retour) {
        await expect(page.getByRole("tab", { name: words.aller })).toHaveAttribute("aria-selected", "true");
        await page.getByRole("tab", { name: words.retour }).click();
        await expect(page.getByRole("tab", { name: words.retour })).toHaveAttribute("aria-selected", "true");
        // v4.1: the header holds the legs' dates; a tab has no date line of its own.
        await expect(page.getByRole("tabpanel").locator("time")).toHaveCount(0);
        // D2.4: and from the end at the retour.
        await expectOfferAt(page, lang, "18:00");
      } else {
        await expect(page.getByRole("tab")).toHaveCount(0);
      }
      await expectOneLanguage(page, lang, allerDate);

      // C1.4: the production build, not `next dev`. C5.9: nothing but the app's host.
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.filter((url) => /development|hmr-client/.test(url))).toEqual([]);
      expect([...new Set(requests.map((url) => new URL(url).origin))]).toEqual([origin]);
    });
  });
}

/** D2.4: « Proposer une voiture » on the leg shown, its « Heure de départ » prefilled with `time`. */
async function expectOfferAt(page: Page, lang: "fr" | "en", time: string) {
  const words = WORDS[lang];
  // Inactive until the device's persons are known: a click waits for it.
  await page.getByRole("button", { name: words.offer, exact: true }).click();
  const form = page.getByRole("dialog", { name: words.offer });
  await expect(form.getByLabel(words.departure, { exact: true })).toHaveValue(time);
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
}

/**
 * Whether `text` holds `words` as words of their own: « Fin », « Start » or « End » inside a
 * longer word (« Find », « Restart ») is not the other language's.
 */
function holdsWords(text: string, words: string): boolean {
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
}

/** C7.1: the page's language, and not a word of the other one, dates included. */
async function expectOneLanguage(page: Page, lang: "fr" | "en", date: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  const other = lang === "fr" ? "en" : "fr";
  const otherDate = new Intl.DateTimeFormat(other, { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${date}T00:00Z`),
  );
  const text = await page.locator("body").innerText();
  expect([...onlyIn(other), otherDate].filter((words) => holdsWords(text, words))).toEqual([]);
}

interface Exchange {
  /** Method and path, the query string included: what a server's log keeps. */
  at: string;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;
}

/**
 * Every request of the context, and its response, body included: each response is read
 * here, in Node, before the browser gets it, so that none escapes for having been dropped
 * by a navigation. What leaves the browser is a URL's path and query string, never its
 * fragment.
 */
async function recordTraffic(context: BrowserContext): Promise<Exchange[]> {
  const traffic: Exchange[] = [];
  await context.route(
    () => true,
    async (route) => {
      const request = route.request();
      const response = await route.fetch();
      const body = await response.body();
      const { pathname, search } = new URL(request.url());
      traffic.push({
        at: `${request.method()} ${pathname}${search}`,
        requestHeaders: JSON.stringify(await request.allHeaders()),
        requestBody: request.postDataBuffer()?.toString("utf8") ?? "",
        responseHeaders: JSON.stringify(response.headersArray()),
        responseBody: body.toString("utf8"),
      });
      await route.fulfill({ response, body });
    },
  );
  return traffic;
}

test.describe("the organiser's token on the network", () => {
  test.use({ locale: "fr-FR" });

  test("A2.3, C1.5, C4.8: from / to the organiser's page, the token is only in the creation's answer and the check's request", async ({
    page,
    context,
  }) => {
    const words = WORDS.fr;
    const traffic = await recordTraffic(context);

    await page.goto("/");
    await page.getByRole("link", { name: words.newEvent, exact: true }).click();
    await expect(page.getByRole("button", { name: words.create })).toBeEnabled({ timeout: 15_000 });
    await expectUrl(page, /\/nouveau$/, "the creation form");
    await field(page, words.title).fill("Sortie ski du club");
    await field(page, words.location).fill("La Clusaz");
    await field(page, words.allerDate).fill(await deviceDate(page, 7));
    await field(page, words.allerTime).fill("07:30");
    await field(page, words.retourTime).fill("18:00");
    // Waited for, rather than the network going idle: a leak in an answer the page never
    // reads must fail on the token, not on a timeout.
    let checked = page.waitForResponse(isCheck);
    await page.getByRole("button", { name: words.create }).click();
    await checked;
    await expect(page.getByRole("region", { name: words.panel })).toBeVisible();

    // The server's HTML of the organiser's page, which `router.push` did not ask for.
    checked = page.waitForResponse(isCheck);
    await page.reload();
    await checked;
    await expect(page.getByRole("region", { name: words.panel })).toBeVisible();

    const { pathname, hash } = new URL(page.url());
    const token = hash.slice(1);
    expect(/^[A-Za-z0-9_-]{22}$/.test(token), "the fragment is a well-formed token").toBe(true);
    const admin = pathname;
    expect(admin).toMatch(/^\/e\/\w{8}\/admin$/);

    // Wherever the token is, by request, the query string included, and by part.
    const where = traffic.flatMap(({ at, ...parts }) =>
      Object.entries({ url: at, ...parts })
        .filter(([, text]) => text.includes(token))
        .map(([part]) => `${at.replaceAll(token, "{token}")} ${part}`),
    );
    expect(where).toEqual(["POST /nouveau responseBody", `POST ${admin} requestBody`, `POST ${admin} requestBody`]);

    // Everything was watched: the home page, the creation, the App Router's fetch of the
    // organiser's page (`router.push`, its RSC payload), the check, and the page's HTML.
    const ats = traffic.map(({ at }) => at.replace(/\?_rsc=.*$/, "?_rsc="));
    expect(ats).toEqual(
      expect.arrayContaining(["GET /", "POST /nouveau", `GET ${admin}?_rsc=`, `POST ${admin}`, `GET ${admin}`]),
    );
    expect(JSON.stringify(await context.cookies()).includes(token), "the cookies hold the token").toBe(false);
  });

  test("L3.2: changing the language sends the token nowhere, and does not check it again", async ({
    page,
    context,
    seededEvent,
  }) => {
    const { id, token } = seededEvent;
    const admin = `/e/${id}/admin`;
    const traffic = await recordTraffic(context);
    // The check and the language switch are both a POST to the page: told apart by their body.
    const checks = () => traffic.filter(({ at, requestBody }) => at === `POST ${admin}` && requestBody.includes(token));

    await page.goto(`${admin}#${token}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: WORDS.fr.panel })).toBeVisible();
    expect(checks().length, "checks carrying the token").toBe(1);
    const before = traffic.length;

    await expect(page.getByRole("button", { name: "English", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("region", { name: WORDS.en.panel })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const after = traffic.slice(before);
    // Watched: the switch is in what was recorded.
    expect(after.map(({ at, requestBody }) => `${at} ${requestBody}`.replaceAll(token, "{token}"))).toContain(`POST ${admin} ["en"]`);
    const where = after.flatMap(({ at, ...parts }) =>
      Object.entries({ url: at, ...parts })
        .filter(([, text]) => text.includes(token))
        .map(([part]) => `${at.replaceAll(token, "{token}")} ${part}`),
    );
    expect(where).toEqual([]);
    expect(checks().length, "checks carrying the token").toBe(1);
    expect(JSON.stringify(await context.cookies()).includes(token), "the cookies hold the token").toBe(false);
  });
});

test.describe("an event with its three options", () => {
  test.use({ locale: "fr-FR" });

  /** Creates the same event by the form, with or without its options: its organiser's URL. */
  async function create(page: Page, withOptions: boolean): Promise<string> {
    const words = WORDS.fr;
    await page.goto("/nouveau");
    await expect(page.getByRole("button", { name: words.create })).toBeEnabled({ timeout: 15_000 });
    await field(page, words.title).fill("Sortie ski du club");
    await field(page, words.location).fill("La Clusaz");
    await field(page, words.allerDate).fill(await deviceDate(page, 7));
    await field(page, words.allerTime).fill("07:30");
    await field(page, words.retourTime).fill("18:00");
    if (withOptions) for (const option of words.options) await field(page, option).check();
    await page.getByRole("button", { name: words.create }).click();
    await expectUrl(page, ARRIVAL, "the organiser's link");
    await expect(page.getByRole("region", { name: words.panel })).toBeVisible();
    return page.url();
  }

  /**
   * React's flight data written into the page by `self.__next_f.push(…)`, as a sorted list
   * of rows: what client components receive, rendered or not.
   * Its order is not the page's: rows come out as their data resolves, so `IconMark`
   * (metadata) and `ParticipantBoard` (the event's read) swap from one render to the next,
   * and the ids rows get as they are first met swap with them. Hence each row loses its id,
   * every reference to a row (`"$4"`, `"$L23"`, `"$@1f"`, `"$c:props:children"`) becomes
   * `"$…{ref}"`, and the rows are sorted. What a row holds is still compared, a prop
   * included. `"$undefined"`, `"$Sreact.fragment"` or a text written `"$$…"` are no references.
   * A text row (`id:T<hex length>,…`) has no line end and its length is in bytes: rows are
   * split before `normalise` changes any length.
   */
  function flightRows(pushes: string[], normalise: (text: string) => string): string[] {
    let flight = "";
    // `(self.__next_f=self.__next_f||[]).push([0])`, then `self.__next_f.push([1,"…"])`.
    for (const push of pushes) {
      const [kind, data] = JSON.parse(push.slice(push.indexOf(".push(") + ".push(".length, -1)) as [number, unknown];
      if (kind === 1 && typeof data === "string") flight += data;
      else if (kind !== 0) throw new Error(`C3.4: a flight chunk of kind ${kind}`);
    }
    const bytes = Buffer.from(flight, "utf8");
    const rows: string[] = [];
    for (let at = 0; at < bytes.length; ) {
      const colon = bytes.indexOf(":", at);
      if (colon < 0) throw new Error("C3.4: a flight row without its id");
      if (bytes.toString("utf8", colon + 1, colon + 2) === "T") {
        const comma = bytes.indexOf(",", colon);
        const end = comma + 1 + parseInt(bytes.toString("utf8", colon + 2, comma), 16);
        rows.push(`T${bytes.toString("utf8", comma + 1, end)}`);
        at = end;
      } else {
        const newline = bytes.indexOf("\n", colon);
        const end = newline < 0 ? bytes.length : newline;
        rows.push(bytes.toString("utf8", colon + 1, end));
        at = end + 1;
      }
    }
    return rows.map((row) => normalise(row.replace(/"\$([A-Z@]?)[0-9a-f]+(:[^"]*)?"/g, '"$$$1{ref}$2"'))).sort();
  }

  /**
   * React's scripts that reveal a Suspense boundary streamed after the page's shell, and Next's
   * that then moves the icons into `<head>`. The page's metadata (`generateMetadata`, its own
   * read of the event) streams that way when it resolves after the shell is sent, and is inlined
   * in `<head>` otherwise: a race of the server, not something the options change (#463). What
   * they reveal is compared all the same: in the DOM, and the metadata on its own.
   */
  const lateBoundary = [
    /^\$RB=\[\];\$RV=function/,
    /^\$RC\("B:\d+","S:\d+"\)$/,
    /^requestAnimationFrame\(function\(\)\{\$RT=performance\.now\(\)\}\);$/,
    /^document\.querySelectorAll\('body link\[rel="icon"\], body link\[rel="apple-touch-icon"\]'\)/,
  ];

  /**
   * The page's markup on each tab, its event's id and token replaced, the organiser's page
   * first. On the event's page, the DOM is compared in full without its scripts, and without its
   * metadata, which lands in `<body>` when it streams late (`lateBoundary`); then its metadata
   * wherever it is, its other scripts and its flight rows, the last two sorted.
   */
  async function markup(page: Page, adminUrl: string): Promise<string[]> {
    const { pathname, hash } = new URL(adminUrl);
    const id = pathname.split("/")[2];
    // React's generated ids too: the panel mounts after `router.push`, and its ids follow
    // whatever was rendered on `/` before, ticking the options included.
    // Radix's mounted tab panel too: it holds `animation-duration: 0s` until a render after
    // the next frame, which may or may not have come yet. It shows nothing.
    const normalise = (html: string) =>
      html
        .replaceAll(hash.slice(1), "{token}")
        .replaceAll(id, "{id}")
        .replace(/_r_\w+_/g, "{useId}")
        .replaceAll('style="animation-duration: 0s;"', 'style=""');
    const withoutScripts = () =>
      page.locator("body").evaluate((body) => {
        const copy = body.cloneNode(true) as HTMLElement;
        for (const element of copy.querySelectorAll("script, title, meta")) element.remove();
        return copy.innerHTML;
      });
    const seen = [normalise(await page.locator("main").innerHTML())];
    await page.goto(`/e/${id}`, { waitUntil: "networkidle" });
    seen.push(normalise(await withoutScripts()));
    // The metadata, in <head> or streamed into <body>, which changes its order, and where the
    // page then holds its <title> twice, the same: each element once, sorted.
    const metadata = await page.locator("title, meta").evaluateAll((all) => all.map((element) => element.outerHTML));
    seen.push(normalise([...new Set(metadata)].sort().join("")));
    const scripts = await page
      .locator("script")
      .evaluateAll((all) => all.map(({ outerHTML, textContent }) => ({ outerHTML, text: textContent ?? "" })));
    const isFlight = ({ text }: { text: string }) => text.includes("self.__next_f");
    const isLate = ({ text }: { text: string }) => lateBoundary.some((script) => script.test(text));
    const others = scripts.filter((script) => !isFlight(script) && !isLate(script)).map(({ outerHTML }) => normalise(outerHTML));
    const pushes = scripts.filter(isFlight).map(({ text }) => text);
    seen.push(...others.sort(), ...flightRows(pushes, normalise));
    await page.getByRole("tab", { name: WORDS.fr.retour }).click();
    await expect(page.getByRole("tab", { name: WORDS.fr.retour })).toHaveAttribute("aria-selected", "true");
    seen.push(normalise(await withoutScripts()));
    return seen;
  }

  test("C3.4: its pages are the same as without any option", async ({ page, db }) => {
    const options = (url: string) =>
      db
        .selectFrom("event")
        .select(["boosters_enabled", "participation_enabled", "stops_enabled"])
        .where("id", "=", new URL(url).pathname.split("/")[2])
        .executeTakeFirstOrThrow();

    const plainUrl = await create(page, false);
    expect(await options(plainUrl)).toEqual({
      boosters_enabled: false,
      participation_enabled: false,
      stops_enabled: false,
    });
    const plain = await markup(page, plainUrl);

    // Stored with its three options: otherwise, two events without any would compare equal.
    const withOptionsUrl = await create(page, true);
    expect(await options(withOptionsUrl)).toEqual({
      boosters_enabled: true,
      participation_enabled: true,
      stops_enabled: true,
    });
    const withOptions = await markup(page, withOptionsUrl);
    // The flight rows are read: the props the board receives are among them, its state's header first (epic #250).
    const boardProps = plain.some((text) => text.includes('{"id":"{id}","state":{"event":{"title":"Sortie ski du club",'));
    expect(boardProps).toBe(true);
    expect(withOptions).toEqual(plain);
  });
});
