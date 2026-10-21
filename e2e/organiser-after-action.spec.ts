import type { Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, organiserPath, seedCrowd, seedOrganiserScene, test } from "./organiser";

/*
 * #183, epic #154: after an action of the board, the panel alone is read again; withdrawn
 * when that read fails (O1.10), with the board kept in place on screen (O1.11), and the
 * unfolded lists kept through the reads (O5.7). The organiser's device holds Oriane, without a
 * car at the aller. The fixture `organiserTraffic` checks every test for the token (O6.1) and
 * the storage (O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  refreshing: "Actualisation…",
  refreshed: "Espace organisateur actualisé.",
  failedTitle: "L’espace organisateur n’a pas pu être actualisé.",
  bodyWithdrawn: "Vérifiez la connexion, puis utilisez de nouveau « Actualiser ».",
  lastLoad: "date du dernier chargement",
  stale: "L’espace organisateur n’est plus à jour. Utilisez « Actualiser » pour le relire.",
  share: "Lien à partager",
  less: "Réduire la liste",
};
const ORGANISER = "Oriane";

// `includeHidden`: found under a sheet's aria-hidden too, while one closes.
const panel = (page: Page) => page.getByRole("region", { name: FR.panel, includeHidden: true });
const refresh = (page: Page) => panel(page).getByRole("button", { name: FR.refresh, includeHidden: true });
const regions = (page: Page) => panel(page).locator("[role=status], [role=alert]");
const alertRegion = (page: Page) => panel(page).getByRole("alert", { includeHidden: true });
const section = (page: Page, leg: "Aller" | "Retour") => panel(page).getByRole("region", { name: leg, exact: true });
const tiles = (page: Page) => panel(page).getByRole("button", { name: /sans voiture|place/ });
const stale = (page: Page) => panel(page).getByText(FR.stale);
const board = (page: Page) => page.getByRole("tabpanel");
const carTitle = (page: Page, driver: string) => board(page).getByRole("heading", { name: `Voiture de ${driver}` });

/**
 * Oriane takes a seat in `driver`'s car, the first with a free seat without one: in one tap, the
 * only person of the device without a car at the aller (C5.2, #92). The bar says so.
 */
async function takeSeat(page: Page, driver?: string) {
  const name = `Place libre : prendre une place dans la voiture de ${driver ?? ""}`;
  await board(page).getByRole("button", { name: driver ? name : new RegExp(`^${name}`) }).first().click();
  await expect(page.getByRole("group", { name: "Messages" }).getByText(new RegExp(`^${ORGANISER} est dans la voiture de`))).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

/** Holds, from now on, every action whose body carries `text` until it fails or goes through. */
async function holdActionsWith(page: Page, text: string) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes(text) ? held.push(route) : route.fallback()),
  );
  return {
    held: () => held.length,
    fail: async () => {
      for (const route of held.splice(0)) await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
    },
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
  };
}

/** Holds, from now on, every read of the panel (the admin token in its body). */
const holdPanelReads = (page: Page, { token }: SeededEvent) => holdActionsWith(page, token);

/** The organiser's device, with Oriane without a car at the aller: her id. */
async function organiserDevice(page: Page, db: Kysely<Database>, event: SeededEvent) {
  const token = newToken();
  const { id } = await seedPerson(db, event.id, { firstName: ORGANISER }, token);
  await seedPlacement(db, { personId: id, eventId: event.id, leg: "aller", rideId: null });
  await holdToken(page, event.id, token);
  return id;
}

const ownPersons = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });

/** The organiser's device, then the organiser's page, its board's device known. */
async function openAsOrganiser(page: Page, db: Kysely<Database>, event: SeededEvent) {
  const id = await organiserDevice(page, db, event);
  await page.goto(organiserPath(event));
  await expect(refresh(page)).toBeVisible();
  await expect(ownPersons(page).getByText(ORGANISER)).toBeVisible();
  return id;
}

/** Oriane's seat in Anaïs's car, sent in one tap (C5.2, #92): no sheet waits for the answer. */
async function sendSeat(page: Page) {
  await board(page).getByRole("button", { name: "Place libre : prendre une place dans la voiture de Anaïs" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Every text the panel's live regions held, from now on. */
async function recordRegions(page: Page): Promise<() => Promise<string[]>> {
  await panel(page).evaluate((element) => {
    const texts: string[] = [];
    Object.assign(window, { panelRegionTexts: texts });
    for (const region of element.querySelectorAll("[role=status], [role=alert]")) {
      new MutationObserver(() => texts.push(region.textContent ?? "")).observe(region, { subtree: true, childList: true, characterData: true });
    }
  });
  return () => page.evaluate(() => (window as unknown as { panelRegionTexts: string[] }).panelRegionTexts.filter(Boolean));
}

/** Marks the element with the focus now; then says whether it still has it, and is not `<body>`. */
async function markFocus(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => Object.assign(window, { markedFocus: document.activeElement }));
  return () =>
    page.evaluate(() => document.activeElement !== document.body && document.activeElement === (window as unknown as { markedFocus: Element }).markedFocus);
}

/** The panel withdrawn: no tile, no section, the links still there. */
async function expectWithdrawn(page: Page) {
  await expect(panel(page).getByRole("region", { name: /^(Aller|Retour)$/ })).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(0);
  await expect(panel(page).getByRole("group", { name: FR.share })).toBeVisible();
}

test.use({ locale: "fr-FR" });

test.describe("the scene of O2.5, and Oriane on the organiser's device", () => {
  let oriane: string;
  test.beforeEach(async ({ db, page, seededEvent }) => {
    await seedOrganiserScene(db, seededEvent.id);
    oriane = await openAsOrganiser(page, db, seededEvent);
  });

  test("O1.10: a person added « Aller et retour » from the board is in both sections, N + 1 on both banners, and nothing more is announced", async ({
    page,
  }) => {
    const banner = (leg: "Aller" | "Retour") => section(page, leg).getByText(/sans voiture ·/);
    await expect(banner("Aller")).toHaveText(/^3 sans voiture/);
    await expect(banner("Retour")).toHaveText(/^1 sans voiture/);
    const said = await recordRegions(page);

    await board(page).getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Ajouter une personne" });
    await expect(form.getByRole("checkbox", { name: "Aller et retour" })).toBeChecked();
    await form.getByLabel("Prénom").fill("Gaspard");
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(form).toHaveCount(0);

    for (const leg of ["Aller", "Retour"] as const) {
      await expect(section(page, leg).getByRole("list", { name: /^Sans voiture/ }).getByText("Gaspard")).toBeVisible();
    }
    await expect(banner("Aller")).toHaveText(/^4 sans voiture/);
    await expect(banner("Retour")).toHaveText(/^2 sans voiture/);
    await page.waitForLoadState("networkidle");
    expect(await said()).toEqual([]);
    await expect(regions(page)).toHaveText(["", ""]);
  });

  test("O1.10, O5.4: the panel's read fails after a seat taken: withdrawn without a word; then « Actualiser » fails, and its alert replaces the sentence", async ({
    page,
    seededEvent,
  }) => {
    const said = await recordRegions(page);
    const reads = await holdPanelReads(page, seededEvent);
    await takeSeat(page, "Anaïs");
    await expect.poll(reads.held).toBe(1);
    const focused = await markFocus(page);
    const boardAfter = await board(page).innerText();

    await reads.fail();
    await expectWithdrawn(page);
    await expect(stale(page)).toBeVisible();
    // Not live: neither in a live region, nor announced.
    expect(await stale(page).evaluate((element) => element.closest("[role=status], [role=alert], [aria-live]") === null)).toBe(true);
    await expect(regions(page)).toHaveText(["", ""]);
    expect(await said()).toEqual([]);
    expect(await focused(), "the focus stays where the board's action put it").toBe(true);
    expect((await board(page).innerText()) === boardAfter, "the board shows the action").toBe(true);

    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.fail();
    await expect(alertRegion(page)).toHaveText(`${FR.failedTitle}${FR.bodyWithdrawn}`);
    await expect(panel(page).getByText(FR.lastLoad)).toHaveCount(0);
    await expect(stale(page)).toHaveCount(0);
    await expect(refresh(page)).toBeFocused();
    expect((await board(page).innerText()) === boardAfter, "the board is still the action's").toBe(true);
    await expectWithdrawn(page);
  });

  test("O5.8: the panel withdrawn while its tile has the focus: the focus goes to the button of the panel's title, never to <body>", async ({
    page,
    seededEvent,
  }) => {
    const reads = await holdPanelReads(page, seededEvent);
    await takeSeat(page, "Anaïs");
    await expect.poll(reads.held).toBe(1);
    await tiles(page).first().focus();
    await reads.fail();
    await expectWithdrawn(page);
    await expect(panel(page).getByRole("button", { name: FR.panel, exact: true })).toBeFocused();
  });

  // Next sends one action after the other: « Actualiser » touched while the seat is on its way reads after it.
  test("O1.9: a read after an action that ends a running « Actualiser » says its outcome, as « Actualiser » would", async ({
    page,
  }) => {
    const seat = await holdActionsWith(page, oriane);
    await sendSeat(page);
    await expect.poll(seat.held).toBe(1);
    await refresh(page).click();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshing);
    await seat.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect(refresh(page)).not.toHaveAttribute("aria-disabled");
    await expect(section(page, "Aller").getByRole("list", { name: /^Sans voiture/ }).getByText(ORGANISER)).toHaveCount(0);
  });

  test("O5.4, O1.11: while the read after a failure runs, the alert stays on screen out of its emptied region, and nothing under it moves", async ({
    page,
    seededEvent,
  }) => {
    const reads = await holdPanelReads(page, seededEvent);
    const frame = alertRegion(page).locator("..");
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.fail();
    await expect(alertRegion(page)).toContainText(FR.failedTitle);
    const before = { panel: (await panel(page).boundingBox())!, links: (await panel(page).getByRole("group", { name: FR.share }).boundingBox())! };

    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await expect(alertRegion(page)).toHaveText("");
    await expect(frame).toContainText(FR.failedTitle);
    expect((await panel(page).boundingBox())!.height).toBe(before.panel.height);
    expect((await panel(page).getByRole("group", { name: FR.share }).boundingBox())!.y).toBe(before.links.y);
    await reads.fail();
    await expect(alertRegion(page)).toContainText(FR.failedTitle);
  });

  test("O1.8: another context registers a person; « Actualiser » shows her in the panel as in the board", async ({
    page,
    browser,
    baseURL,
    seededEvent,
  }) => {
    const other = await browser.newContext({ locale: "fr-FR", baseURL, viewport: { width: 360, height: 780 } });
    try {
      const theirs = await other.newPage();
      await theirs.goto(`/e/${seededEvent.id}`);
      await theirs.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true }).click();
      const form = theirs.getByRole("dialog", { name: "Ajouter une personne" });
      await form.getByLabel("Prénom").fill("Gaspard");
      await form.getByRole("button", { name: "Valider" }).click();
      await expect(form).toHaveCount(0);
    } finally {
      await other.close();
    }

    await expect(page.getByText("Gaspard")).toHaveCount(0);
    await refresh(page).click();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect(section(page, "Aller").getByText("Gaspard")).toBeVisible();
    await expect(section(page, "Retour").getByText("Gaspard")).toBeVisible();
    await expect(board(page).getByText("Gaspard")).toBeVisible();
  });

  for (const [viewport, place] of [
    [{ width: 360, height: 780 }, "mid-page"],
    [{ width: 1280, height: 800 }, "mid-page"],
    [{ width: 360, height: 780 }, "bottom"],
    [{ width: 1280, height: 800 }, "bottom"],
  ] as const) {
    test(`O1.11: at ${viewport.width} px, ${place}, without scroll anchoring, the car looked at stays in place as the panel is withdrawn, then rendered again`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      // Mid-page, room under the board, in main, as a longer board has: there, nothing but the
      // compensation keeps the car in place. At the bottom of the real page, the browser pulls
      // the scroll back itself as the page gets shorter, and the compensation must not add to it.
      const room = place === "mid-page" ? 'main::after { content: ""; display: block; height: 200vh; }' : "";
      await page.addStyleTag({ content: `html, main { overflow-anchor: none !important; } ${room}` });
      const title = carTitle(page, "Anaïs");
      // Where the title is painted: two frames on, once the observer has run and scrolled.
      const y = async () => {
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return (await title.boundingBox())!.y;
      };
      /** Scrolls the car's title to the top of the screen, or to the end of the page; the panel above it. */
      const lookAtCar = async () => {
        await title.evaluate((element, end) => {
          if (end) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          else element.scrollIntoView({ block: "start", behavior: "instant" });
        }, place === "bottom");
        expect(await panel(page).evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0);
        await expect(title).toBeInViewport();
      };
      const reads = await holdPanelReads(page, seededEvent);

      await lookAtCar();
      const before = await y();
      await takeSeat(page, "Anaïs");
      await expect.poll(reads.held).toBe(1);
      const height = (await panel(page).boundingBox())!.height;
      await reads.fail();
      await expectWithdrawn(page);
      expect((await panel(page).boundingBox())!.height).toBeLessThan(height - 100);
      expect(Math.abs((await y()) - before)).toBeLessThanOrEqual(1);

      // « Actualiser » touched, its read held; the page scrolled to the car; then the read goes through.
      await refresh(page).click();
      await expect.poll(reads.held).toBe(1);
      await lookAtCar();
      const again = await y();
      await reads.release();
      await expect(panel(page).getByRole("status", { includeHidden: true })).toHaveText(FR.refreshed);
      await expect(section(page, "Aller")).toBeAttached();
      expect(Math.abs((await y()) - again)).toBeLessThanOrEqual(1);
    });
  }

  for (const viewport of [
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`O1.11: at ${viewport.width} px, at the bottom of the page, the organiser scrolls up in the very frame the browser pulls the scroll back: the car moves by that scroll alone (#297)`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      await page.addStyleTag({ content: "html, main { overflow-anchor: none !important; }" });
      const title = carTitle(page, "Anaïs");
      const y = async () => {
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return (await title.boundingBox())!.y;
      };
      const reads = await holdPanelReads(page, seededEvent);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      expect(await panel(page).evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0);
      await expect(title).toBeInViewport();
      const before = await y();
      await takeSeat(page, "Anaïs");
      await expect.poll(reads.held).toBe(1);

      // In the task that commits the withdrawal, before the next frame's observers: the layout
      // clamps the scroll to the end of a shorter page, then the organiser scrolls 60 px up.
      await panel(page).evaluate((element) => {
        const height = element.getBoundingClientRect().height;
        const end = () => document.documentElement.scrollHeight - window.innerHeight;
        const atStart = window.scrollY;
        const observer = new MutationObserver(() => {
          const after = element.getBoundingClientRect().height;
          if (after > height - 100) return;
          observer.disconnect();
          Object.assign(window, { pulledBack: Math.max(0, atStart - end()), withdrawn: height - after });
          window.scrollBy({ top: -60, behavior: "instant" });
        });
        observer.observe(element, { subtree: true, childList: true });
      });
      await reads.fail();
      await expectWithdrawn(page);
      // Pulled back by part of the withdrawn height only: the case where the sum is wrong without #297.
      const { pulledBack, withdrawn } = await page.evaluate(() => {
        const { pulledBack, withdrawn } = window as unknown as { pulledBack: number; withdrawn: number };
        return { pulledBack, withdrawn };
      });
      expect(pulledBack).toBeGreaterThan(1);
      expect(pulledBack).toBeLessThan(withdrawn - 1);
      expect(Math.abs((await y()) - before - 60)).toBeLessThanOrEqual(1);
    });
  }

  test.describe("at 1280 px", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("O7.5: the withdrawal's frame has the panel's width, its text is narrower", async ({ page, seededEvent }) => {
      const reads = await holdPanelReads(page, seededEvent);
      await takeSeat(page, "Anaïs");
      await expect.poll(reads.held).toBe(1);
      await reads.fail();
      await expect(stale(page)).toBeVisible();
      const line = (await panel(page).getByRole("heading", { level: 2 }).locator("..").boundingBox())!;
      const frame = (await stale(page).locator("..").boundingBox())!;
      const text = (await stale(page).boundingBox())!;
      expect(Math.abs(frame.width - line.width)).toBeLessThanOrEqual(2);
      expect(text.width).toBeLessThan(frame.width - 100);
    });
  });
});

test("O1.10: a seat taken while the area loads, answered once it is there, reads the panel again", async ({ page, db, seededEvent }) => {
  await seedOrganiserScene(db, seededEvent.id);
  const oriane = await organiserDevice(page, db, seededEvent);
  const reads = await holdPanelReads(page, seededEvent);
  const seat = await holdActionsWith(page, oriane);
  await page.goto(organiserPath(seededEvent));
  await expect(ownPersons(page).getByText(ORGANISER)).toBeVisible();
  await expect(page.getByText("Chargement de l’espace organisateur…")).toBeVisible();
  await sendSeat(page);

  // The area read before the seat is taken; the seat's answer comes once it is shown.
  await reads.release();
  await expect(section(page, "Aller").getByText(ORGANISER)).toBeVisible();
  await expect.poll(seat.held).toBe(1);
  await seat.release();
  await expect.poll(reads.held).toBe(1);
  await reads.release();
  await expect(section(page, "Aller").getByText(ORGANISER)).toHaveCount(0);
  await expect(stale(page)).toHaveCount(0);
});

test.describe("the crowd of O5.9, and Oriane on the organiser's device", () => {
  type Db = Kysely<Database>;
  const list = (page: Page, leg: "Aller" | "Retour", title: RegExp) => section(page, leg).getByRole("list", { name: title });
  const listTitle = (page: Page, leg: "Aller" | "Retour", title: RegExp) =>
    section(page, leg).getByRole("heading", { level: 4, name: title });
  const fold = (page: Page, leg: "Aller" | "Retour", name: RegExp) => section(page, leg).getByRole("button", { name });
  /** The aller's persons without a car, but `kept` of them, are not concerned any more; the aller's or the retour's cars all gone. */
  const leaveAller = async (db: Db, eventId: string, kept: number) => {
    const rows = await db
      .selectFrom("placement")
      .select("person_id")
      .where("event_id", "=", eventId)
      .where("leg", "=", "aller")
      .where("ride_id", "is", null)
      .execute();
    const leaving = rows.map((row) => row.person_id).slice(kept);
    await db.deleteFrom("placement").where("event_id", "=", eventId).where("leg", "=", "aller").where("person_id", "in", leaving).execute();
    return leaving;
  };

  test.beforeEach(async ({ db, page, seededEvent }) => {
    await seedCrowd(db, seededEvent.id);
    await openAsOrganiser(page, db, seededEvent);
  });

  test("O5.7: an unfolded list stays so after « Actualiser », and after the read that follows an action", async ({ page }) => {
    await fold(page, "Aller", /^Afficher les \d+ autres$/).first().click();
    await expect(list(page, "Aller", /^Sans voiture/).getByRole("listitem")).toHaveCount(15);

    await refresh(page).click();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect(list(page, "Aller", /^Sans voiture/).getByRole("listitem")).toHaveCount(15);

    // Oriane takes a seat: the list loses her, and stays unfolded.
    await takeSeat(page);
    await expect(list(page, "Aller", /^Sans voiture/).getByRole("listitem")).toHaveCount(14);
    await expect(fold(page, "Aller", new RegExp(`^${FR.less}$`)).first()).toBeVisible();
  });

  test("O5.7, O5.8: a read that brings a list to 5 lines takes its button, the focus going to its title; folded for what follows; a list gone sends it to its section", async ({
    page,
    db,
    seededEvent,
  }) => {
    const withoutCar = /^Sans voiture/;
    await fold(page, "Aller", /^Afficher les \d+ autres$/).first().click();
    const less = fold(page, "Aller", new RegExp(`^${FR.less}$`)).first();
    await expect(less).toBeVisible();
    const reads = await holdPanelReads(page, seededEvent);

    // The focus on « Réduire la liste » while the read runs; the list comes back with 5 lines.
    const leaving = await leaveAller(db, seededEvent.id, 5);
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await less.focus();
    await reads.release();
    await expect(list(page, "Aller", withoutCar).getByRole("listitem")).toHaveCount(5);
    await expect(section(page, "Aller").getByRole("button", { name: /^(Afficher|Réduire)/ })).toHaveCount(1);
    await expect(listTitle(page, "Aller", withoutCar)).toBeFocused();

    // Long again: folded.
    for (const personId of leaving) await seedPlacement(db, { personId, eventId: seededEvent.id, leg: "aller", rideId: null });
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect(listTitle(page, "Aller", withoutCar)).toHaveText(`Sans voiture (${leaving.length + 5})`);
    await expect(list(page, "Aller", withoutCar).getByRole("listitem")).toHaveCount(5);
    await expect(fold(page, "Aller", new RegExp(`^Afficher les ${leaving.length} autres$`))).toBeVisible();

    // The focus on a line of the retour's « Voitures sans numéro », which goes with its cars.
    const cars = /^Voitures sans numéro/;
    await fold(page, "Retour", /^Afficher les \d+ autres$/).last().click();
    await expect(list(page, "Retour", cars).getByRole("listitem")).toHaveCount(7);
    await db.deleteFrom("ride").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await list(page, "Retour", cars).getByRole("listitem").last().locator("[tabindex='-1']").focus();
    await reads.release();
    await expect(listTitle(page, "Retour", cars)).toHaveCount(0);
    await expect(section(page, "Retour").getByRole("heading", { level: 3 })).toBeFocused();
  });
});
