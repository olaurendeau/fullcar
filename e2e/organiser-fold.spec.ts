import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent, type SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { leaveNoToken } from "./fixtures";
import { expectRing, press } from "./focus-ring";
import {
  breakStorage,
  expect,
  foldKey,
  hideToken,
  holdActionsWith,
  isAction,
  oneCharOff,
  organiserPath,
  seedCrowd,
  seedOrganiserScene,
  seedWorstSummary,
  test,
  type BrokenStorage,
} from "./organiser";

/*
 * #204, epic #154: the organiser area folds, a line per leg, and the device keeps it folded,
 * per event (O8). Each test runs under the fixture `organiserTraffic` (O6.1, O2.10). Nothing
 * here prints the token, the admin link or a number: a mismatch is named, never shown.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  refreshed: "Espace organisateur actualisé.",
  failedTitle: "L’espace organisateur n’a pas pu être actualisé.",
  bodyWithdrawn: "Vérifiez la connexion, puis utilisez de nouveau « Actualiser ».",
  stale: "L’espace organisateur n’est plus à jour. Utilisez « Actualiser » pour le relire.",
  nobody: "Personne ne s’est encore inscrit.",
  invalid: "Ce lien d’organisateur n’est pas valide.",
  failed: "Le lien d’organisateur n’a pas pu être vérifié.",
  retry: "Réessayer",
  needsJavaScript: "L’espace organisateur nécessite JavaScript : activez-le, puis rechargez la page.",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
/** The title's button, under either language's name. */
const toggle = (page: Page, name = FR.panel) => page.getByRole("button", { name, exact: true });
const refresh = (page: Page, name = FR.refresh) => panel(page).getByRole("button", { name, exact: true });
/** The summary: the list right under the title line, found by its place, not its words. */
const summary = (page: Page) => panel(page).locator(":scope > ul");
/** The summary anywhere in the page, by its structure alone: a list of lines that hold a leg's glance. */
const SUMMARY = "section > ul > li > span.font-semibold:first-child";
const lines = (page: Page) => summary(page).locator(":scope > li");
const tiles = (page: Page) => panel(page).getByRole("button", { name: /^(Aller|Retour)\b/ });
const alertText = (page: Page) => page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ });
const stale = (page: Page) => panel(page).getByText(FR.stale);
const board = (page: Page) => page.getByRole("tabpanel");

const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Text at 125 % on the root, measured once the buttons' transitions to it are over. */
async function rootFont(page: Page) {
  await page.addStyleTag({ content: "html { font-size: 125% }" });
  await page.evaluate(() => Promise.all(document.getAnimations().map((each) => each.finished)));
}

/** Folds or unfolds by a click, and checks the button says so. */
async function setFolded(page: Page, folded: boolean) {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", String(!folded));
}

/**
 * What became of each request the page sends from now on, in the order sent, by name: the
 * panel's read (the admin token in its body), the board's (the page's other action), or any
 * other by its method and path, the token hidden. A request is `sent` until it ends, then
 * `answered` with its status, or `failed` with the browser's reason. Nothing more: no URL,
 * body or header.
 *
 * #303: Chromium reports a fetch whose body the page reads to its end through a stream reader
 * as failed, `net::ERR_ABORTED` (`canceled` in its network log), when the body is drained
 * before the network layer says the request is complete. React reads a server action's answer
 * that way (`createFromFetch`), so either read may end so, its answer already in: nothing calls
 * `abort()` or `cancel()`, and the page applies it. Measured in Chromium (#303): one run of this
 * test in five, and one in two with no route at all; a page of the event fetched a hundred
 * times was reported aborted 93 times read through a reader, never by `response.text()`.
 * Such a request, failed after its answer arrived, is `answered`; the test that counts it
 * checks that the page applied that answer, which a body cut short would have failed. A
 * request failed before any answer (a route, a signal, a navigation) stays `failed`.
 */
function watchRequests(page: Page, { id, token }: SeededEvent) {
  const fates = new Map<Request, string>();
  const name = (request: Request) => {
    const path = hideToken(new URL(request.url()).pathname, token);
    if (!isAction(request) || path !== `/e/${id}/admin`) return `${request.method()} ${path}`;
    return (request.postData() ?? "").includes(token) ? "the panel's read" : "the board's read";
  };
  const answered = async (request: Request) => `answered ${(await request.response())?.status()}`;
  page.on("request", (request) => fates.set(request, "sent"));
  page.on("requestfinished", async (request) => fates.set(request, await answered(request)));
  page.on("requestfailed", async (request) => {
    const reason = request.failure()?.errorText;
    const late = reason === "net::ERR_ABORTED" && (await request.response()) !== null;
    fates.set(request, late ? await answered(request) : `failed ${reason}`);
  });
  return () => [...fates].map(([request, fate]) => `${name(request)}: ${fate}`);
}

/** The key set to `value` before any script of each document runs. */
const keepKey = (page: Page, id: string, value = "1") =>
  page.addInitScript(([key, value]) => localStorage.setItem(key, value), [foldKey(id), value]);

/** The keys of this function in the origin's `localStorage`, with their values: an event id and `1`, nothing secret. */
const foldKeys = (page: Page) =>
  page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("fullcar:organiser-folded:")));

/** Whether two boxes share any area. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width > b.x + 0.5 && b.x + b.width > a.x + 0.5 && a.y + a.height > b.y + 0.5 && b.y + b.height > a.y + 0.5;

/** Whether an element cuts its text. */
const cuts = (locator: Locator) => locator.evaluate((element) => element.scrollWidth > element.clientWidth);

test.use({ locale: "fr-FR" });

test.describe("the scene of O2.5", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedOrganiserScene(db, seededEvent.id);
  });

  for (const viewport of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    test(`O8.1, O8.2, O8.4, M1.2: at ${viewport.width} px, a click, Enter and Space fold and unfold, in place, with no request; folded, only the title line and the summary`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(organiserPath(seededEvent));
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await page.waitForLoadState("networkidle");
      let sent = 0;
      page.on("request", () => (sent += 1));
      const controls = (await toggle(page).getAttribute("aria-controls"))!;
      const content = page.locator(`[id="${controls}"]`);
      await expect(content).toHaveCount(1);
      await expect(panel(page).getByRole("heading", { level: 2 }).getByRole("button")).toHaveAccessibleName(FR.panel);
      expect((await box(toggle(page))).height).toBeGreaterThanOrEqual(44);
      await expect(summary(page)).toBeHidden();
      // Unfolded, « Modifier l’événement » is there: folding is what takes it out.
      await expect(panel(page).getByRole("button", { name: "Modifier l’événement" })).toHaveCount(1);
      const at = await box(toggle(page));

      await setFolded(page, true);
      await expect(toggle(page)).toBeFocused();
      await expect(content).toHaveCount(1);
      await expect(content).toBeHidden();
      await expect(summary(page)).toBeVisible();
      const now = await box(toggle(page));
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(now[key] - at[key]), key).toBeLessThanOrEqual(1);
      // Out of the accessibility tree: no role finds them.
      for (const hidden of [
        tiles(page),
        panel(page).getByRole("group"),
        panel(page).getByRole("button", { name: /^(Copier|Partager)$/ }),
        panel(page).getByRole("note"),
        panel(page).getByRole("region"),
        panel(page).getByRole("heading", { level: 3 }),
        // O8.2 amended by #250, M1.2.
        panel(page).getByRole("button", { name: "Modifier l’événement" }),
      ]) {
        await expect(hidden).toHaveCount(0);
      }
      await expect(panel(page).locator("button", { hasText: "Modifier l’événement" })).toBeHidden();
      for (const link of await panel(page).getByTestId("link").all()) await expect(link).toBeHidden();

      // From the keyboard: the ring is inside the button; Tab goes to « Actualiser », then out of the panel.
      await press(page, "Tab");
      await press(page, "Shift+Tab");
      await expect(toggle(page)).toBeFocused();
      // F1.7: inside, 2 px in from the edge, where « Actualiser » touches the button.
      await expectRing(toggle(page), { offset: -2 });
      await page.keyboard.press("Tab");
      await expect(refresh(page)).toBeFocused();
      await page.keyboard.press("Tab");
      expect(
        await panel(page).evaluate((section) => {
          const active = document.activeElement!;
          return active !== document.body && !section.contains(active) && !!(section.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
        }),
        "the focus is past the panel",
      ).toBe(true);

      await toggle(page).focus();
      for (const [key, folded] of [
        ["Enter", false],
        ["Space", true],
        ["Space", false],
      ] as const) {
        await page.keyboard.press(key);
        await expect(toggle(page)).toHaveAttribute("aria-expanded", String(!folded));
        await expect(toggle(page)).toBeFocused();
      }
      await expect(summary(page)).toBeHidden();
      await expect(content).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(sent, "requests sent by folding").toBe(0);
    });
  }

  // A click that does not focus the button, as Safari's (#302): the focus in what folds goes to the title's button.
  test("O8.1: folded by a click that leaves the focus on « Copier », the focus goes to the title's button", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await panel(page).getByRole("button", { name: "Copier", exact: true }).first().focus();
    await toggle(page).evaluate((button: HTMLElement) => button.click());
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page)).toBeFocused();
  });

  test("O8.3: each folded line reads as its tile; the pill is the tab's, nothing else amber; no button, link nor status", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    const tileTexts = await tiles(page).evaluateAll((all) => all.map((each) => each.textContent));
    await setFolded(page, true);
    expect(await lines(page).evaluateAll((all) => all.map((each) => each.textContent))).toEqual(tileTexts);
    expect(tileTexts).toEqual(["Aller2 sans voitureIl manque 1 place", "Retour1 sans voitureIl manque 1 place"]);

    const tabPill = page.getByRole("tab").getByText(/sans voiture/).first();
    const amber = await tabPill.evaluate((element) => getComputedStyle(element).backgroundColor);
    const backgrounds = await summary(page).evaluate((list) =>
      [...list.querySelectorAll("*")].map((each) => [each.textContent, getComputedStyle(each).backgroundColor]),
    );
    expect(backgrounds.filter(([, colour]) => colour !== "rgba(0, 0, 0, 0)")).toEqual([
      ["2 sans voiture", amber],
      ["1 sans voiture", amber],
    ]);
    await expect(summary(page).locator("button, a, [role=status], [aria-live]")).toHaveCount(0);
  });

  test("O8.5: unfolded at the first visit; the key, then its removal; reloaded folded, the share link is never shown; another event arrives unfolded", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    expect(await foldKeys(page)).toEqual([]);
    const elsewhere = async () => JSON.stringify([await page.evaluate(() => Object.entries(sessionStorage)), await context.cookies()]);
    const before = await elsewhere();
    await setFolded(page, true);
    expect(await foldKeys(page)).toEqual([[foldKey(seededEvent.id), "1"]]);
    await setFolded(page, false);
    expect(await foldKeys(page)).toEqual([]);
    await setFolded(page, true);

    await page.addInitScript(() => {
      const seen = { mounted: 0, shown: 0 };
      Object.assign(window, { shareSeen: seen });
      new MutationObserver(() => {
        for (const link of document.querySelectorAll("[data-testid=link]")) {
          seen.mounted += 1;
          if (!link.closest("[hidden]")) seen.shown += 1;
        }
      }).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await page.reload();
    await expect(summary(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    const seen = await page.evaluate(() => (window as unknown as { shareSeen: { mounted: number; shown: number } }).shareSeen);
    expect(seen.mounted).toBeGreaterThan(0);
    expect(seen.shown, "the share link shown").toBe(0);

    const other = await seedEvent(db);
    try {
      await page.goto(organiserPath(other));
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    } finally {
      await db.deleteFrom("event").where("id", "=", other.id).execute();
    }
    expect(await foldKeys(page)).toEqual([[foldKey(seededEvent.id), "1"]]);
    expect((await elsewhere()) === before, "sessionStorage and the cookies, as before folding").toBe(true);
  });

  test("O8.5, O4.2: on a device where an event is folded, one created from /nouveau arrives unfolded, its links and warning shown", async ({
    page,
    db,
    seededEvent,
  }) => {
    await keepKey(page, seededEvent.id);
    await page.goto("/nouveau");
    await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled({ timeout: 15_000 });
    const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const fields = { Titre: "Sortie ski du club", Lieu: "La Clusaz", "Date de début": day, "Heure de début": "07:30", "Heure de fin": "18:00" };
    for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Créer" }).click();
    // A loaded machine takes its time from the creation to the panel.
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    const created = new URL(page.url()).pathname.split("/")[2];
    try {
      await expect(panel(page).getByTestId("link").first()).toBeVisible();
      await expect(panel(page).getByRole("note")).toBeVisible();
      expect(await foldKeys(page)).toEqual([[foldKey(seededEvent.id), "1"]]);
    } finally {
      await db.deleteFrom("event").where("id", "=", created).execute();
    }
  });

  for (const how of ["property", "getItem", "setItem", "removeItem", "a key that holds true"] as const) {
    test(`O8.5: with ${how.startsWith("a key") ? how : `localStorage${how === "property" ? "" : `.${how}`} throwing`}, unfolded, and the button works for the page, with no message nor error`, async ({
      page,
      seededEvent,
    }) => {
      const errors: string[] = [];
      page.on("console", (message) => void (message.type() === "error" && errors.push("console error")));
      page.on("pageerror", () => errors.push("page error"));
      if (how === "a key that holds true") await keepKey(page, seededEvent.id, "true");
      else {
        if (how === "property" || how === "getItem") await keepKey(page, seededEvent.id);
        await breakStorage(page, how as BrokenStorage);
      }
      await page.goto(organiserPath(seededEvent));
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await setFolded(page, true);
      await expect(summary(page)).toBeVisible();
      await setFolded(page, false);
      await setFolded(page, true);
      await expect(alertText(page)).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }

  test("O8.5: nothing reads or writes the key on /e/{id}, nor with an invalid link", async ({ page, seededEvent }) => {
    await page.addInitScript(() => {
      const keys: string[] = [];
      Object.assign(window, { foldAccess: keys });
      for (const method of ["getItem", "setItem", "removeItem"] as const) {
        const original = Storage.prototype[method] as (...args: string[]) => unknown;
        Storage.prototype[method] = function (this: Storage, ...args: string[]) {
          if (String(args[0]).startsWith("fullcar:organiser-folded:")) keys.push(method);
          return original.apply(this, args);
        } as never;
      }
    });
    const accesses = () => page.evaluate(() => (window as unknown as { foldAccess: string[] }).foldAccess);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await accesses()).toEqual([]);
    await page.goto(`/e/${seededEvent.id}/admin#${oneCharOff(seededEvent.token)}`);
    await expect(alertText(page)).toContainText(FR.invalid);
    expect(await accesses()).toEqual([]);
  });

  test("O8.6, O1.10, O5.8: the key set, nothing folds before the panel; « Réessayer » then shows it folded, the focus on its button", async ({
    page,
    seededEvent,
  }) => {
    await keepKey(page, seededEvent.id);
    const nothingToFold = async () => {
      await expect(toggle(page)).toHaveCount(0);
      await expect(page.locator(SUMMARY)).toHaveCount(0);
    };
    await page.goto(`/e/${seededEvent.id}/admin#${oneCharOff(seededEvent.token)}`);
    await expect(alertText(page)).toContainText(FR.invalid);
    await nothingToFold();

    const reads = await holdActionsWith(page, seededEvent.token);
    await page.goto(organiserPath(seededEvent));
    await expect.poll(reads.held).toBe(1);
    await nothingToFold();
    await reads.lose();
    await expect(alertText(page)).toContainText(FR.failed);
    await nothingToFold();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: FR.retry }).click();
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(summary(page)).toBeVisible();
  });

  test("O8.6, O1.8: folded, « Actualiser » reads what another device declared, the panel's height kept meanwhile", async ({
    page,
    browser,
    seededEvent,
  }) => {
    await keepKey(page, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(lines(page).first()).toHaveText("Aller2 sans voitureIl manque 1 place");

    const other = await browser.newContext({ locale: "fr-FR" });
    try {
      const device = await other.newPage();
      await device.goto(`/e/${seededEvent.id}`);
      await board(device).getByRole("button", { name: "Ajouter une personne", exact: true }).click();
      const form = device.getByRole("dialog", { name: "Ajouter une personne" });
      await form.getByRole("checkbox", { name: "Aller et retour" }).uncheck();
      await form.getByLabel("Prénom").fill("Gaspard");
      await form.getByRole("button", { name: "Valider" }).click();
      await expect(form).toHaveCount(0);
    } finally {
      await other.close();
    }

    const reads = await holdActionsWith(page, seededEvent.token);
    const height = (await box(panel(page))).height;
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    expect(Math.abs((await box(panel(page))).height - height)).toBeLessThanOrEqual(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect(lines(page).first()).toHaveText("Aller3 sans voitureIl manque 2 places");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("O8.6, O5.4: folded, a refresh that fails: the alert between the title line and the unchanged summary, the focus on « Actualiser »", async ({
    page,
    seededEvent,
  }) => {
    await keepKey(page, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(summary(page)).toBeVisible();
    const before = await summary(page).textContent();
    const reads = await holdActionsWith(page, seededEvent.token);
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.lose();
    await expect(alertText(page)).toContainText(FR.failedTitle);
    const [title, alert, list] = await Promise.all([box(toggle(page)), box(alertText(page)), box(summary(page))]);
    expect(alert.y).toBeGreaterThan(title.y + title.height);
    expect(list.y).toBeGreaterThan(alert.y + alert.height);
    expect(await summary(page).textContent()).toBe(before);
    await expect(refresh(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("O8.6, O1.10: folded, an action whose read fails: the sentence in the summary's place; then a failed refresh, the alert alone", async ({
    page,
    db,
    seededEvent,
  }) => {
    const token = newToken();
    const { id } = await seedPerson(db, seededEvent.id, { firstName: "Oriane" }, token);
    await seedPlacement(db, { personId: id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await keepKey(page, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    await expect(summary(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Vos inscriptions" }).getByText("Oriane")).toBeVisible();

    const reads = await holdActionsWith(page, seededEvent.token);
    // Oriane alone is without a car at the aller: one tap seats her, with no sheet (C5.2, #92).
    await board(page).getByRole("button", { name: "Place libre : prendre une place dans la voiture de Anaïs" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(reads.held).toBe(1);
    await reads.lose();
    await expect(summary(page)).toHaveCount(0);
    await expect(stale(page)).toBeVisible();
    expect(await stale(page).evaluate((text) => text.closest("p")!.parentElement!.tagName)).toBe("SECTION");
    expect((await box(stale(page))).y).toBeGreaterThan((await box(toggle(page))).y);

    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.lose();
    await expect(alertText(page)).toHaveText(`${FR.failedTitle}${FR.bodyWithdrawn}`);
    await expect(stale(page)).toHaveCount(0);
    await expect(summary(page)).toHaveCount(0);
    // Under the title line, its alert alone: every other child of the panel is hidden.
    await expect(panel(page).locator(":scope > *:visible")).toHaveCount(1);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("O8.4: folding while a read is held sends nor cancels anything, and the read applies after", async ({
    page,
    seededEvent,
  }) => {
    // #343: watched from before the page loads, so that a read of the load that ends late is
    // counted where it was sent, before « Actualiser », and a fold that cancels any request is seen.
    const requests = watchRequests(page, seededEvent);
    await page.goto(organiserPath(seededEvent));
    await expect(toggle(page)).toBeVisible();
    await expect
      .poll(() => requests().filter((fate) => fate.endsWith(": sent")), { message: "requests of the load still running" })
      .toEqual([]);
    const loaded = requests();
    const reads = await holdActionsWith(page, seededEvent.token);
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    // Next sends one action at a time: the board's read waits for the panel's answer.
    const held = [...loaded, "the panel's read: sent"];
    expect(requests(), "requests while the read is held").toEqual(held);
    await setFolded(page, true);
    await setFolded(page, false);
    await setFolded(page, true);
    expect(requests(), "requests sent or ended while folding").toEqual(held);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    // Every request from « Actualiser » on, and how it ended (#303: answered, even when Chromium reports it aborted).
    await expect
      .poll(() => requests().slice(loaded.length), { message: "requests from « Actualiser » to its end" })
      .toEqual(["the panel's read: answered 200", "the board's read: answered 200"]);
    await expect(alertText(page)).toHaveCount(0);
  });
});

test("O8.4: a list unfolded by « Afficher les 9 autres » is still unfolded after a fold and an unfold", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedCrowd(db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));
  const aller = panel(page).getByRole("region", { name: "Aller", exact: true });
  const list = aller.getByRole("list", { name: "Sans voiture (14)", exact: true }).getByRole("listitem");
  await aller.getByRole("button", { name: "Afficher les 9 autres", exact: true }).click();
  await expect(list).toHaveCount(14);
  await setFolded(page, true);
  await setFolded(page, false);
  await expect(list).toHaveCount(14);
  await expect(aller.getByRole("button", { name: "Réduire la liste", exact: true })).toBeVisible();
});

test.describe("O8.3: the summary's forms", () => {
  const scenes: [string, (db: Kysely<Database>, eventId: string) => Promise<void>, string[]][] = [
    ["an empty event", async () => {}, [`Aller${FR.nobody}`, `Retour${FR.nobody}`]],
    [
      "everyone seated, beside an empty leg",
      async (db, eventId) => {
        const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
        const ride = await seedRide(db, eventId, id, { seats: 1 });
        const lea = await seedPerson(db, eventId, { firstName: "Léa" });
        await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: ride });
      },
      ["AllerTout le monde a une place", `Retour${FR.nobody}`],
    ],
    [
      "persons without a car and no car at all",
      async (db, eventId) => {
        for (const firstName of ["Léa", "Tom"]) {
          const { id } = await seedPerson(db, eventId, { firstName });
          await seedPlacement(db, { personId: id, eventId, leg: "aller", rideId: null });
        }
      },
      ["Aller2 sans voitureIl manque 2 places", `Retour${FR.nobody}`],
    ],
  ];
  for (const [name, seed, expected] of scenes) {
    test(`${name}: a line per leg, as its tile reads`, async ({ page, db, seededEvent }) => {
      await seed(db, seededEvent.id);
      await keepKey(page, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      await expect(lines(page)).toHaveText(expected);
      // What O8.9 looks for finds each line here.
      await expect(page.locator(SUMMARY)).toHaveCount(expected.length);
      await expect(lines(page).locator("[class*=bg-amber]")).toHaveCount(expected.filter((line) => line.includes("sans voiture")).length);
    });
  }

  test("the worst line, 20 without a car and 12 seats missing, at 360 px and at 125 %: nothing overlaps, is cut or overflows", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedWorstSummary(db, seededEvent.id);
    await keepKey(page, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const worst = lines(page).nth(1);
    await expect(worst).toHaveText("Retour20 sans voitureIl manque 12 places");
    for (const zoom of [false, true]) {
      if (zoom) await rootFont(page);
      const parts = await worst.locator(":scope > *").all();
      const boxes = await Promise.all(parts.map(box));
      const right = (await box(summary(page))).x + (await box(summary(page))).width;
      for (const [n, each] of boxes.entries()) {
        expect(each.x + each.width, `part ${n}'s right edge`).toBeLessThanOrEqual(right + 0.5);
        expect(await cuts(parts[n]), `part ${n} cut`).toBe(false);
        for (const other of boxes.slice(n + 1)) expect(overlap(each, other), `part ${n} overlaps`).toBe(false);
      }
      expect(await overflow(page)).toBe(0);
    }
  });
});

for (const [locale, name, refreshName] of [["fr-FR", FR.panel, FR.refresh], ["en-US", "Organiser area", "Refresh"]] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ locale, viewport: { width: 360, height: 780 } });

    test("O8.1: the title's button and « Actualiser » share the line without overlapping, cutting or overflowing, folded and unfolded, then at 125 %", async ({
      page,
      db,
      seededEvent,
    }) => {
      await seedOrganiserScene(db, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      const button = toggle(page, name);
      const read = page.getByRole("button", { name: refreshName, exact: true });
      await expect(button).toHaveAccessibleName(name);
      for (const zoom of [false, true]) {
        if (zoom) await rootFont(page);
        for (const folded of [false, true, false]) {
          if ((await button.getAttribute("aria-expanded")) === String(folded)) await button.click();
          await expect(button).toHaveAttribute("aria-expanded", String(!folded));
          const [own, other] = await Promise.all([box(button), box(read)]);
          const frame = await page.getByRole("region", { name }).evaluate((section) => {
            const rect = section.getBoundingClientRect();
            const style = getComputedStyle(section);
            return { left: rect.left, right: rect.right, content: rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) };
          });
          const where = `${zoom ? "at 125 %" : "at 100 %"}, ${folded ? "folded" : "unfolded"}`;
          expect(overlap(own, other), `${where}: the boxes overlap`).toBe(false);
          expect(Math.abs(other.x + other.width - frame.content), `${where}: right edge`).toBeLessThanOrEqual(1);
          for (const each of [button, read]) expect(await cuts(each), `${where}: a text cut`).toBe(false);
          for (const each of [own, other]) {
            expect(each.x).toBeGreaterThanOrEqual(frame.left);
            expect(each.x + each.width).toBeLessThanOrEqual(frame.right);
          }
          expect(await overflow(page)).toBe(0);
        }
      }
      const rects = await button.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents([...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!);
        return range.getClientRects().length;
      });
      expect(rects, "the title on one line at 125 %").toBe(1);
    });
  });
}

test.describe("at 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("O8.7: the same width folded and unfolded; Aller on the left, Retour on the right, tops aligned", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedOrganiserScene(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const width = (await box(panel(page))).width;
    await setFolded(page, true);
    expect(Math.abs((await box(panel(page))).width - width)).toBeLessThanOrEqual(1);
    const [aller, retour] = await Promise.all([box(lines(page).nth(0)), box(lines(page).nth(1))]);
    expect(aller.x + aller.width).toBeLessThanOrEqual(retour.x);
    expect(Math.abs(aller.y - retour.y)).toBeLessThanOrEqual(1);
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    test("O8.3, O8.7: one line, in the left column, and « Retour » nowhere in the panel", async ({ page, seededEvent }) => {
      await keepKey(page, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      await expect(lines(page)).toHaveText([`Aller${FR.nobody}`]);
      const [line, list] = await Promise.all([box(lines(page)), box(summary(page))]);
      expect(Math.abs(line.x - list.x)).toBeLessThanOrEqual(1);
      expect(line.width).toBeLessThanOrEqual(list.width / 2);
      expect(await panel(page).textContent()).not.toContain("Retour");
    });
  });
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`O8.8: with reducedMotion ${reducedMotion}, folding and unfolding are instant, and nothing scrolls`, async ({
    page,
    seededEvent,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto(organiserPath(seededEvent));
    await expect(toggle(page)).toBeVisible();
    await page.waitForLoadState("networkidle");
    for (const expanded of ["false", "true"]) {
      const after = await panel(page).evaluate(async (section) => {
        const scrollY = window.scrollY;
        const button = section.querySelector<HTMLButtonElement>("h2 button")!;
        button.click();
        // React commits the click's update in a microtask: its DOM, before any frame.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          expanded: button.getAttribute("aria-expanded"),
          animations: section.getAnimations({ subtree: true }).length,
          scrolled: window.scrollY - scrollY,
        };
      });
      expect(after).toEqual({ expanded, animations: 0, scrolled: 0 });
    }
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("O8.9: O5.5 holds, and the HTML of /admin holds neither the folding button nor the summary", async ({
    page,
    seededEvent,
  }) => {
    // Without JavaScript, the document is the server's HTML.
    await page.goto(organiserPath(seededEvent));
    expect(await page.locator("main noscript [role=note]").evaluate((note) => note.textContent)).toBe(FR.needsJavaScript);
    await expect(page.locator("h2 > button[aria-expanded]")).toHaveCount(0);
    await expect(page.locator(SUMMARY)).toHaveCount(0);
  });
});
