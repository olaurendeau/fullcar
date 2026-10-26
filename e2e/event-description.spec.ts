import type { Page, Request } from "@playwright/test";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, pressUntil } from "./focus-ring";
import { organiserPath } from "./organiser";

/*
 * #711, epic #654, event-description v3 (« Lire », « Les liens », « Où elle ne va jamais »):
 * the description in the event's header, after the dates, its `http(s)` URLs as links, and
 * nowhere in the `<head>`. Its fold is in event-description-fold.spec.ts (#712). The organiser's
 * page is opened by its token: nothing here prints it.
 */

leaveNoToken();

/** The marker of the leak tests (event-description v3, « Critères »). */
const MARKER = "Zorglub4729";
const NEW_TAB = "(s’ouvre dans un nouvel onglet)";
const PLAN = "https://asa-annecy.example/plan";
/** DS3.3: the host no request may reach before a tap. */
const LINKED = "https://lien-test.example/x";
const LINKED_HOST = "lien-test.example";

const PAGES = [
  ["/e/{id}", ({ id }: SeededEvent) => `/e/${id}`],
  ["/e/{id}/admin", (event: SeededEvent) => organiserPath(event)],
] as const;

const header = (page: Page) => page.locator("header:has(#event-title)");
const description = (page: Page) => header(page).locator("#event-description");

/** The page opened; on `/admin`, once its organiser's area is there, which the token opens. */
async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator("#event-title")).toBeVisible();
  if (path.includes("/admin")) await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
  return response!;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** How many times `text` is in the page's content. */
async function occurrences(page: Page, text: string): Promise<number> {
  return (await page.locator("main").innerText()).split(text).length - 1;
}

test.describe("without a description", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path] of PAGES) {
    test(`DS2.1: on ${where}, the header is today's: the title and the place, then Début and Fin, nothing else`, async ({
      page,
      seededEvent,
    }) => {
      await open(page, path(seededEvent));
      await expect(header(page).locator("> *")).toHaveCount(2);
      expect(await header(page).locator("> *").evaluateAll((children) => children.map((child) => child.tagName))).toEqual(["DIV", "DL"]);
      await expect(header(page).locator("dt")).toHaveText(["Début", "Fin"]);
      await expect(header(page).getByRole("button")).toHaveCount(0);
      await expect(header(page).locator("p:empty, div:empty, span:empty")).toHaveCount(0);
      await expect(description(page)).toHaveCount(0);
    });
  }
});

test.describe("with a description and a link", () => {
  const text = `Pique-nique ${MARKER}\n\n**gras** <b>x</b>\n${PLAN}`;
  test.use({ locale: "fr-FR", eventFields: { description: text } });

  for (const [where, path] of PAGES) {
    test(`DS2.2: on ${where}, the text is in the header, after the dates, and nowhere else`, async ({ page, seededEvent }) => {
      await open(page, path(seededEvent));
      await expect(description(page)).toBeVisible();
      // With its fold, the header's last child, after the dates: the bar of messages and « Vos inscriptions » come after the header.
      expect(
        await description(page).evaluate((element) => {
          const fold = element.parentElement!;
          return [fold.parentElement?.tagName, fold.previousElementSibling?.tagName, fold.nextElementSibling];
        }),
      ).toEqual(["HEADER", "DL", null]);
      await expect(description(page)).toContainText(MARKER);
      // Not in a tab, the map or the organiser's area: once in the page.
      expect(await occurrences(page, MARKER)).toBe(1);
    });
  }

  test("DS2.3: each \\n starts a line, an empty line shows empty, nothing is interpreted", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expect(description(page)).toHaveCSS("white-space", "pre-wrap");
    expect(await description(page).evaluate((element) => element.textContent)).toBe(text.replace(PLAN, `${PLAN} ${NEW_TAB}`));
    await expect(description(page).locator("b, strong, em")).toHaveCount(0);
    // Four lines of 24 px: the first, the empty one, « **gras** <b>x</b> », and the link.
    const { height } = (await description(page).boundingBox())!;
    expect(Math.round(height)).toBe(4 * 24);
  });

  test("DS3.2: the link is the URL as typed, to a new tab, without referrer, isolated, and says so", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const links = description(page).getByRole("link");
    await expect(links).toHaveCount(1);
    const link = links.first();
    await expect(link).toHaveAttribute("href", PLAN);
    await expect(link).toHaveAttribute("target", "_blank");
    // The only check of `rel`, not DS3.4: DS3.4 would pass without it, since the site already
    // sends `Referrer-Policy: no-referrer` and Chromium already opens a target="_blank" link
    // without opener. Other browsers, or a later change to either, would not: do not remove this check.
    expect((await link.getAttribute("rel"))?.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer", "nofollow", "ugc"]));
    await expect(link).toHaveAttribute("dir", "ltr");
    await expect(link).toHaveCSS("unicode-bidi", "isolate");
    // The visible text: the link's text nodes; the rest is the screen reader's.
    expect(await link.evaluate((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(""))).toBe(PLAN);
    await expect(link.locator(".sr-only")).toHaveText(NEW_TAB);
    await expect(link).toHaveAccessibleName(`${PLAN} ${NEW_TAB}`);
  });

  test("DS3.6: from the keyboard, the link shows the application's focus ring", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const link = description(page).getByRole("link");
    await pressUntil(page, "Tab", link);
    await expectRing(link);
  });
});

test.describe("DS2.3: 1000 « W » without a space, with a title and a place of 30", () => {
  test.use({ locale: "fr-FR", eventFields: { title: "W".repeat(30), location: "W".repeat(30), description: "W".repeat(1000) } });

  test("no horizontal scroll", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expect(description(page)).toHaveText("W".repeat(1000));
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("DS3.6: a URL of 300 characters", () => {
  const url = `https://asa-annecy.example/${"a".repeat(300 - "https://asa-annecy.example/".length)}`;
  test.use({ locale: "fr-FR", eventFields: { description: `Le plan : ${url}` } });

  test("breaks within the column, without a horizontal scroll", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const link = description(page).getByRole("link");
    await expect(link).toHaveAttribute("href", url);
    const column = (await description(page).boundingBox())!;
    for (const box of await link.evaluate((element) => [...element.getClientRects()].map(({ left, right }) => ({ left, right })))) {
      expect(box.left).toBeGreaterThanOrEqual(column.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(column.x + column.width + 0.5);
    }
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("DS3.3, DS3.4, DS3.5: a link to another site", () => {
  test.use({ locale: "fr-FR", eventFields: { description: `Infos : ${LINKED}` } });

  test("no request before the tap; after it, a new tab at the exact href, without opener or referrer, and no preview", async ({
    context,
    page,
    seededEvent,
  }) => {
    const requests: Request[] = [];
    context.on("request", (request) => requests.push(request));
    // The linked site, served here: its title and its icon would be a preview if they reached the page.
    await context.route(`https://${LINKED_HOST}/**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><title>Page liée</title><link rel="icon" href="/favicon.ico"><img src="/image.png"><p>Lié</p>',
      }),
    );
    const toLinked = () => requests.filter((request) => new URL(request.url()).host === LINKED_HOST);

    await open(page, `/e/${seededEvent.id}`);
    await page.waitForLoadState("networkidle");
    const link = description(page).getByRole("link");
    await link.hover();
    expect(toLinked().map((request) => request.url())).toEqual([]);
    // DS3.5: nothing of the linked page in ours.
    await expect(page).toHaveTitle("Tournoi de Rennes");
    await expect(header(page).locator("img")).toHaveCount(0);
    await expect(page.locator(`head link[href*="${LINKED_HOST}"], img[src*="${LINKED_HOST}"]`)).toHaveCount(0);

    const before = requests.length;
    const [tab] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await tab.waitForLoadState("load");
    expect(tab.url()).toBe(LINKED);
    // The tab's first request is the href itself: no redirect through our origin.
    const fromTab = requests.slice(before).filter((request) => request.frame().page() === tab);
    expect(fromTab[0]?.url()).toBe(LINKED);
    expect(fromTab[0]?.redirectedFrom()).toBeNull();
    expect(await fromTab[0]?.headerValue("referer")).toBeNull();
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(await tab.evaluate(() => document.referrer)).toBe("");
    // The page stays as it was.
    await expect(page).toHaveTitle("Tournoi de Rennes");
    await tab.close();
  });
});

test.describe("DS3.8: other schemes and www. stay text", () => {
  const text = "javascript:alert(1) data:text/html,x mailto:julie@exemple.fr tel:0612345678 www.asa-annecy.example";
  test.use({ locale: "fr-FR", eventFields: { description: text } });

  test("no <a> in the description (L10, L11)", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expect(description(page)).toHaveText(text);
    await expect(description(page).locator("a")).toHaveCount(0);
  });
});

test.describe("DS3.9: an identifier before @ (L14)", () => {
  test.use({ locale: "fr-FR", eventFields: { description: "https://asa-annecy.example@evil.example/" } });

  test("the header has no link to evil.example", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expect(description(page)).toHaveText("https://asa-annecy.example@evil.example/");
    await expect(header(page).locator('a[href*="evil.example"]')).toHaveCount(0);
    await expect(description(page).locator("a")).toHaveCount(0);
  });
});

test.describe("DS3.12: a bidirectional character before the URL (L22)", () => {
  test.use({ locale: "fr-FR", eventFields: { description: `‮Voir ${PLAN}` } });

  test("the link is rendered and reads from left to right: « h » left of « n »", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const link = description(page).getByRole("link");
    await expect(link).toHaveAttribute("href", PLAN);
    const [first, last] = await link.evaluate((element) => {
      const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE)!;
      const length = node.textContent!.length;
      const box = (start: number) => {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + 1);
        return { char: range.toString(), left: range.getBoundingClientRect().left };
      };
      return [box(0), box(length - 1)];
    });
    expect([first.char, last.char]).toEqual(["h", "n"]);
    expect(first.left).toBeLessThan(last.left);
  });
});

test.describe("DS2.12: « Événement introuvable »", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path] of PAGES) {
    test(`on ${where}, an event deleted with its description shows none`, async ({ db, page }) => {
      const event = await seedEvent(db, { description: `Rendez-vous ${MARKER}` });
      await db.deleteFrom("event").where("id", "=", event.id).execute();
      const response = await page.goto(path(event));
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement introuvable");
      expect(await page.content()).not.toContain(MARKER);
      expect(await response!.text()).not.toContain(MARKER);
    });
  }
});

for (const [withOrWithout, fields] of [
  ["with a description", { description: `Rendez-vous ${MARKER}` }],
  ["without a description", {}],
] as const) {
  test.describe(`DS5.2–DS5.4: the <head>, ${withOrWithout}`, () => {
    test.use({ locale: "fr-FR", eventFields: fields });

    for (const [where, path] of PAGES) {
      test(`on ${where}: the event's title, robots, and nothing else of it`, async ({ page, request, seededEvent }) => {
        const response = await open(page, path(seededEvent));
        // DS5.2: neither the head the server sends nor the one the page shows has the marker.
        expect((await response.text()).split("</head>")[0]).not.toContain(MARKER);
        expect(await page.locator("head").innerHTML()).not.toContain(MARKER);
        await expect(page).toHaveTitle("Tournoi de Rennes");
        // DS5.3: no description, no og:, no twitter:.
        await expect(page.locator('meta[name="description"]')).toHaveCount(0);
        await expect(page.locator('meta[property^="og:"], meta[name^="og:"]')).toHaveCount(0);
        await expect(page.locator('meta[name^="twitter:"], meta[property^="twitter:"]')).toHaveCount(0);
        // DS5.4: noindex as on main, no structured data, no event in the sitemap.
        expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
        await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
        const sitemap = await (await request.get("/sitemap.xml")).text();
        expect(sitemap).not.toContain("/e/");
        expect(sitemap).not.toContain(MARKER);
      });
    }
  });
}
