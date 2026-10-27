import type { Locator, Page, Request, Route } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { leaveNoToken } from "./fixtures";
import { areaRefused, digitsOf, expect, keepAdminToken, oneCharOff, organiserPath, SCENE_PHONES, seedOrganiserScene, test } from "./organiser";

/*
 * #181, epic #154: arriving on the organiser area. While the first read runs, a status line;
 * the area refused, its title alone (#597); a failed read, the alert and « Réessayer », which reads
 * again without reloading the page; without JavaScript, a sentence. The fixture
 * `organiserTraffic` checks every test for the token (O6.1) and the storage (O2.10).
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  loading: "Chargement de l’espace organisateur…",
  failed: "L’espace organisateur n’a pas pu être chargé.",
  failedBody: "Vérifiez la connexion, puis réessayez.",
  retry: "Réessayer",
  needsJavaScript: "L’espace organisateur nécessite JavaScript : activez-le, puis rechargez la page.",
};

// Within the page's content, with text: the bar of messages keeps its own alert, empty (#87).
const alert = (page: Page) => page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ });
const loading = (page: Page) => page.getByRole("main").getByRole("status").filter({ hasText: FR.loading });
const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
/** The area's title alone, in the panel's place, once the access is refused (#597, until #598). */
const refused = (page: Page) => areaRefused(page);
const retry =(page: Page) => page.getByRole("button", { name: FR.retry });
/** The failed check's frame: its alert region, then « Réessayer », next to it. */
const failedFrame = (page: Page) => page.getByRole("main").locator("div", { has: retry(page) }).last();
/** Playwright's text and role engines skip `<noscript>`: found by its markup. */
const noScript = (page: Page) => page.locator("main noscript [role=note]");

/** O7.5: what holds the panel's place has the board's width, and is centred like it. */
async function expectBoardWidth(page: Page, holder: Locator) {
  const box = (await holder.boundingBox())!;
  // The event's header, the board's column: there with or without JavaScript.
  const board = (await page.getByRole("main").locator("header").boundingBox())!;
  expect(Math.abs(box.x - board.x), "left edge").toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - board.width), "width").toBeLessThanOrEqual(1);
  expect(box.width).toBeLessThanOrEqual(448);
}

/** A read of the panel: a server action posted to the organiser's page. */
function isPanelRead(request: Request, { id }: SeededEvent): boolean {
  return (
    request.method() === "POST" &&
    request.headers()["next-action"] !== undefined &&
    new URL(request.url()).pathname === `/e/${id}/admin`
  );
}

/**
 * Takes the reads of the panel, in order, each to what `next` says: abort it as a lost
 * connection, hold it until `release()`, or let it through to the fixture's route. Counts
 * every read the page sent.
 */
async function readsOf(page: Page, event: SeededEvent, next: () => "abort" | "hold" | "pass") {
  const held: Route[] = [];
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isPanelRead(request, event)) sent.push(request);
  });
  await page.route(`**/e/${event.id}/admin`, async (route) => {
    if (!isPanelRead(route.request(), event)) return route.fallback();
    const what = next();
    if (what === "abort") return route.abort("internetdisconnected");
    if (what === "hold") held.push(route);
    else return route.fallback();
  });
  return {
    sent: () => sent.length,
    held: () => held.length,
    /** Lets the held reads through, to the fixture's route, which answers them. */
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
  };
}

/** The colour `css` gives to the text of an element of the page, as the browser computes it. */
async function colourOf(page: Page, css: string): Promise<string> {
  return page.evaluate((css) => {
    const probe = document.createElement("span");
    probe.style.color = css;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, css);
}

/** O7.7: no tinted background, the title in the destructive colour. */
async function expectUntinted(page: Page, notice: Locator, title: string) {
  const background = await notice.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  const titleColour = await notice.getByText(title).evaluate((element) => getComputedStyle(element).color);
  expect(titleColour).toBe(await colourOf(page, "var(--destructive)"));
}

/** Every text the failed check's alert region holds, recorded from now on. */
async function recordAlert(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate((failed) => {
    const region = [...document.querySelectorAll("main [role=alert]")].find((each) =>
      each.textContent?.includes(failed),
    )!;
    const texts: string[] = [];
    Object.assign(window, { alertTexts: texts });
    new MutationObserver(() => texts.push(region.textContent ?? "")).observe(region, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, FR.failed);
  return () => page.evaluate(() => (window as unknown as { alertTexts: string[] }).alertTexts);
}

async function htmlHoldsNoNumber(html: string) {
  const found = Object.entries(SCENE_PHONES).filter(([, phone]) => digitsOf(phone).some((form) => html.includes(form)));
  expect(found.map(([letter]) => letter)).toEqual([]);
}

test.use({ locale: "fr-FR" });

test.beforeEach(async ({ db, seededEvent }) => {
  await seedOrganiserScene(db, seededEvent.id);
});

// Online again before the fixture reads the storage, from /icon.svg.
test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test("O5.1: while the first read runs, a status line instead of the panel, with no link and no number", async ({
  page,
  seededEvent,
}) => {
  const reads = await readsOf(page, seededEvent, () => "hold");
  await page.goto(organiserPath(seededEvent));
  await expect.poll(reads.held).toBe(1);

  await expect(loading(page)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByText(/\/admin|\/e\//)).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button", { name: /Aller|Retour/ })).toHaveCount(0);
  await htmlHoldsNoNumber(await page.content());
  // The board is there already, rendered by the server.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");

  await reads.release();
  await expect(panel(page)).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
});

for (const [name, kept] of [
  ["a token one character off", ({ token }: SeededEvent) => oneCharOff(token)],
  ["no token", () => null],
] as const) {
  test(`O5.2, #597: with ${name} kept, the area's title alone, nothing of the panel`, async ({ page, seededEvent }) => {
    await keepAdminToken(page, seededEvent.id, kept(seededEvent));
    await page.goto(organiserPath(seededEvent));
    await expect(refused(page)).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await expect(loading(page)).toHaveCount(0);
    // No tile, no section of a leg: the board's own tabs and headings only.
    await expect(page.getByRole("main").getByRole("button", { name: /sans voiture/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^(Sans voiture|Voitures sans numéro) \(/ })).toHaveCount(0);
  });
}

test("O5.3, O5.8, O7.4, O7.7: offline, the failed check and « Réessayer », which reads again without a reload", async ({
  page,
  context,
  seededEvent,
}) => {
  // The first read is lost as the connection goes. Offline, a read fails as the browser fails
  // it: the fixture's route, which fetches every action, would otherwise wait for it forever.
  let first = true;
  let offline = false;
  const goOffline = async (value: boolean) => {
    offline = value;
    await context.setOffline(value);
  };
  await readsOf(page, seededEvent, () => {
    const lost = first || offline;
    first = false;
    return lost ? "abort" : "pass";
  });
  await page.goto(organiserPath(seededEvent));
  await goOffline(true);

  await expect(alert(page)).toContainText(FR.failed);
  await expect(alert(page)).toContainText(FR.failedBody);
  await expect(refused(page)).toHaveCount(0);
  await expect(retry(page)).toBeVisible();
  expect((await retry(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectUntinted(page, failedFrame(page), FR.failed);
  // « Réessayer » is next to the alert, not in it: the alert holds its text only.
  await expect(alert(page).getByRole("button")).toHaveCount(0);

  // Still offline, from the keyboard: the alert is emptied, then filled again; the focus stays.
  const texts = await recordAlert(page);
  await retry(page).focus();
  await page.keyboard.press("Enter");
  await expect.poll(texts).toEqual(["", `${FR.failed}${FR.failedBody}`]);
  await expect(retry(page)).toBeFocused();
  await expect(retry(page)).not.toHaveAttribute("aria-disabled", "true");

  // The connection is back: the panel, in the same document, and the focus on its title's button.
  await goOffline(false);
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: FR.panel, exact: true })).toBeFocused();
  await expect(alert(page)).toHaveCount(0);
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
});

test("O5.3, O5.8: while « Réessayer » reads, its label stays, it is aria-disabled and keeps the focus, and a second press sends nothing", async ({
  page,
  seededEvent,
}) => {
  const answers = ["abort", "hold"] as const;
  let n = 0;
  const reads = await readsOf(page, seededEvent, () => answers[n++] ?? "pass");
  await page.goto(organiserPath(seededEvent));
  await expect(alert(page)).toContainText(FR.failed);

  await retry(page).focus();
  await page.keyboard.press("Enter");
  await expect.poll(reads.held).toBe(1);
  await expect(retry(page)).toHaveAttribute("aria-disabled", "true");
  await expect(retry(page)).toBeFocused();
  await expect(loading(page)).toHaveCount(1);
  // The alert stays on screen; its live region is empty until the read ends.
  await expect(page.getByText(FR.failed)).toBeVisible();
  await expect(alert(page)).toHaveCount(0);

  await page.keyboard.press("Enter");
  // A tap: Playwright waits for an aria-disabled button to be enabled, which a person does not.
  await retry(page).click({ force: true });
  await expect(retry(page)).toBeFocused();

  await reads.release();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: FR.panel, exact: true })).toBeFocused();
  await expect(loading(page)).toHaveCount(0);
  // Next sends a page's actions one after the other: a read started by the second press
  // would leave only once the held one is answered. None does.
  await page.waitForLoadState("networkidle");
  expect(reads.sent(), "reads of the panel").toBe(2);
});

test("O5.8: « Réessayer » clicked, then the panel: the focus goes to its title's button, never by <body>", async ({
  page,
  seededEvent,
}) => {
  let first = true;
  await readsOf(page, seededEvent, () => (first ? ((first = false), "abort") : "pass"));
  await page.goto(organiserPath(seededEvent));
  await expect(alert(page)).toContainText(FR.failed);

  // Read as soon as the page has changed, before the browser paints. This does not tell
  // useLayoutEffect from useEffect: the screen's state comes from a dispatch in a layout
  // effect, and on React 19.3 that render runs its passive effects before control returns.
  // What it catches is a focus set in a later task, after <body> has had it.
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { focusSeen: seen });
    new MutationObserver(() => seen.push(document.activeElement?.tagName ?? "none")).observe(
      document.querySelector("main")!,
      { subtree: true, childList: true },
    );
  });
  await retry(page).click();
  await expect(panel(page).getByRole("button", { name: FR.panel, exact: true })).toBeFocused();
  const seen = await page.evaluate(() => (window as unknown as { focusSeen: string[] }).focusSeen);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen).not.toContain("BODY");
});

test("O5.8: when « Réessayer » finds the area refused, the focus goes to its title", async ({
  page,
  db,
  seededEvent,
  organiserTraffic,
}) => {
  let first = true;
  await readsOf(page, seededEvent, () => (first ? ((first = false), "abort") : "pass"));
  await page.goto(organiserPath(seededEvent));
  await expect(alert(page)).toContainText(FR.failed);

  // The event is gone meanwhile: the server answers « invalid ». Its numbers are taken
  // before, for the storage check (O2.10): once it is gone, no query gives them.
  await organiserTraffic.keepNumbers();
  await db.deleteFrom("event").where("id", "=", seededEvent.id).execute();
  await retry(page).focus();
  await page.keyboard.press("Enter");
  await expect(refused(page)).toBeFocused();
});

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("O7.5: loading, the failed check and the area refused have the board's width, centred", async ({
    page,
    seededEvent,
  }) => {
    const answers = ["hold", "abort"] as const;
    let n = 0;
    const reads = await readsOf(page, seededEvent, () => answers[n++] ?? "pass");
    await page.goto(organiserPath(seededEvent));
    await expect.poll(reads.held).toBe(1);
    await expectBoardWidth(page, loading(page));

    await page.reload();
    await expect(alert(page)).toContainText(FR.failed);
    await expectBoardWidth(page, failedFrame(page));

    await keepAdminToken(page, seededEvent.id, oneCharOff(seededEvent.token));
    await page.reload();
    await expect(refused(page)).toBeVisible();
    await expectBoardWidth(page, refused(page));
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const viewport of [
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`O5.5, O7.5: at ${viewport.width} px, a sentence says the area needs JavaScript, and the HTML holds no number`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto(organiserPath(seededEvent));
      await htmlHoldsNoNumber(await response!.text());

      await expect(noScript(page)).toBeVisible();
      expect(await noScript(page).evaluate((note) => note.textContent)).toBe(FR.needsJavaScript);
      await expect(page.getByText(FR.loading)).toBeHidden();
      await expect(panel(page)).toHaveCount(0);
      await expectBoardWidth(page, noScript(page));
    });
  }
});
