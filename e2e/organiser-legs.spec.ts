import { devices, type Locator, type Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { numbersHidden } from "./driver";
import { leaveNoToken } from "./fixtures";
import { expectRing, press } from "./focus-ring";
import {
  areaEditButton,
  digitsOf,
  expect,
  foldKey,
  holdActionsWith,
  LEGS_EXAMPLE_PHONE,
  legButton,
  organiserPath,
  seedCrowd,
  seedLegsExample,
  seedWithoutCar,
  seedWorstSummary,
  test,
  unfoldLegs,
  watchHash,
} from "./organiser";

/*
 * #662, epic #648: each leg's section of the organiser area folds behind its title, folded at
 * every appearance (organizer-view v3.5, O9). Each test runs under the fixture
 * `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  refreshed: "Espace organisateur actualisé.",
  failedTitle: "L’espace organisateur n’a pas pu être actualisé.",
  edit: "Modifier l’événement",
  share: "Lien à partager",
  needsJavaScript: "L’espace organisateur nécessite JavaScript : activez-le, puis rechargez la page.",
};
const NAMES = { "fr-FR": { aller: "Aller", retour: "Retour" }, "en-US": { aller: "Outbound", retour: "Return" } } as const;

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const section = (page: Page, leg: Leg) => page.locator(`section[aria-labelledby="organiser-leg-${leg}"]`);
const content = async (page: Page, leg: Leg) => page.locator(`[id="${await legButton(page, leg).getAttribute("aria-controls")}"]`);
const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every leg's button, and whether it is unfolded. */
const states = (page: Page) => panel(page).locator("h3 > button").evaluateAll((all) => all.map((each) => each.getAttribute("aria-expanded")));

/**
 * Marks the first element Tab reaches after the legs' sections, computed rather than named
 * (O9.2): « Personnes inscrites » once #672 adds it, the first element after the panel until
 * then. Focusable, in the tab order, rendered, not disabled, and in no section of a leg. Then
 * says whether it has the focus, or, for a widget that hands it on as it gets it (the board's
 * tab list, which gives it to its selected tab), holds it; false when there is none, and never
 * for `<body>`.
 */
async function firstAfterTheLegs(page: Page): Promise<() => Promise<boolean>> {
  await section(page, "retour").evaluate((last) => {
    const focusable = "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=true]";
    const next = [...document.querySelectorAll<HTMLElement>(focusable)].find(
      (each) =>
        !last.contains(each) &&
        !!(last.compareDocumentPosition(each) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        each.tabIndex >= 0 &&
        !each.matches(":disabled") &&
        each.checkVisibility({ visibilityProperty: true }),
    );
    Object.assign(window, { afterTheLegs: next ?? null });
  });
  return () =>
    page.evaluate(() => {
      const next = (window as unknown as { afterTheLegs: Element | null }).afterTheLegs;
      const active = document.activeElement;
      return next !== null && active !== null && active !== document.body && next.contains(active);
    });
}

/** Whether two boxes share any area. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width > b.x + 0.5 && b.x + b.width > a.x + 0.5 && a.y + a.height > b.y + 0.5 && b.y + b.height > a.y + 0.5;

/** Whether an element cuts its text. */
const cuts = (locator: Locator) => locator.evaluate((element) => element.scrollWidth > element.clientWidth);

/** A leg's folded summary, as its button's description names it (O9.3). */
const summaryOf = async (page: Page, leg: Leg) => page.locator(`[id="${await legButton(page, leg).getAttribute("aria-describedby")}"]`);

/** The organiser area's « Actualiser », and its title's button, which folds it (O8). */
const refresh = (page: Page) => panel(page).getByRole("button", { name: FR.refresh, exact: true });
const areaButton = (page: Page) => page.getByRole("button", { name: FR.panel, exact: true });

/** `firstName` added from the board, « Aller et retour », as a participant does. */
async function addFromBoard(page: Page, firstName: string) {
  await page.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Ajouter une personne" });
  await expect(form.getByRole("checkbox", { name: "Aller et retour" })).toBeChecked();
  await form.getByLabel("Prénom").fill(firstName);
  await form.getByRole("button", { name: "Valider" }).click();
  await expect(form).toHaveCount(0);
}

test.use({ locale: "fr-FR" });

test.describe("the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  for (const viewport of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    test(`O9.1, O7.4: at ${viewport.width} px, a button in each h3, named after its leg in both states, its chevron swapped, 44 px high, the section's width, the title's ring`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(organiserPath(seededEvent));
      for (const leg of ["aller", "retour"] as const) {
        const button = legButton(page, leg);
        const heading = section(page, leg).getByRole("heading", { level: 3 });
        await expect(heading.getByRole("button")).toHaveCount(1);
        await expect(heading).not.toHaveAttribute("tabindex");
        await expect(button).toHaveAttribute("type", "button");
        await expect(button).toHaveAccessibleName(NAMES["fr-FR"][leg]);
        await expect(button).toHaveAttribute("aria-expanded", "false");
        expect(await button.evaluate((each) => [...each.childNodes].map((node) => node.nodeName))).toEqual(["#text", "svg"]);
        await expect(button.locator("svg.lucide-chevron-down")).toHaveAttribute("aria-hidden", "true");
        const held = await content(page, leg);
        await expect(held).toHaveCount(1);
        await expect(held).toBeHidden();
        expect((await box(button)).height).toBeGreaterThanOrEqual(44);
        const [own, around] = await Promise.all([box(button), box(section(page, leg))]);
        expect(Math.abs(own.x + own.width - (around.x + around.width)), "the button's right edge").toBeLessThanOrEqual(1);

        await button.click();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(button).toHaveAccessibleName(NAMES["fr-FR"][leg]);
        await expect(button.locator("svg.lucide-chevron-up")).toHaveAttribute("aria-hidden", "true");
        await expect(button.locator("svg")).toHaveCount(1);
        await expect(held).toBeVisible();
        await expect(held.getByText(/sans voiture ·/)).toBeVisible();
        await expect(held.getByRole("list", { name: /^Sans voiture/ })).toBeVisible();
        await expect(held.locator("time").first()).toBeVisible();
      }
      // O8.1's ring, from the keyboard: inside, 2 px in from the edge.
      await panel(page).getByRole("button", { name: FR.edit, exact: true }).focus();
      await press(page, "Tab");
      await expect(legButton(page, "aller")).toBeFocused();
      await expectRing(legButton(page, "aller"), { offset: -2 });
    });
  }

  test("O9.2: every leg folded as the panel appears, the card kept folded or not, and after a reload; folded, no date, banner, list nor tel: link; Tab goes from Aller to Retour, then past the legs", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
    for (const leg of ["aller", "retour"] as const) {
      const held = await content(page, leg);
      for (const hidden of [held.locator("time"), held.getByText(/sans voiture ·/), held.locator("h4"), held.locator("ul")]) {
        for (const each of await hidden.all()) await expect(each).toBeHidden();
      }
      await expect(section(page, leg).getByRole("list")).toHaveCount(0);
      await expect(section(page, leg).getByRole("heading", { level: 4 })).toHaveCount(0);
      await expect(section(page, leg).getByRole("button")).toHaveCount(1);
    }
    await expect(panel(page).locator('a[href^="tel:"]')).not.toHaveCount(0);
    await expect(panel(page).locator('a[href^="tel:"]:visible')).toHaveCount(0);

    await legButton(page, "aller").focus();
    await page.keyboard.press("Tab");
    await expect(legButton(page, "retour")).toBeFocused();
    const next = await firstAfterTheLegs(page);
    await page.keyboard.press("Tab");
    expect(await next(), "the focus is on the first focusable element after the legs").toBe(true);

    // Unfolded, then reloaded, the card kept folded then unfolded: folded again each time.
    await unfoldLegs(page);
    await page.reload();
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
    await unfoldLegs(page);
    await page.getByRole("button", { name: FR.panel, exact: true }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: FR.panel, exact: true })).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate((key) => localStorage.getItem(key), foldKey(seededEvent.id))).toBe("1");
    await page.getByRole("button", { name: FR.panel, exact: true }).click();
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
  });

  for (const viewport of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    test(`O9.4, O6.3: at ${viewport.width} px, a click, Enter and Space fold its section alone, in place, unanimated, with no request; the URL stays`, async ({
      page,
      seededEvent,
      baseURL,
    }) => {
      const hashChanges = await watchHash(page);
      const arrival = new URL(organiserPath(seededEvent), baseURL).href;
      await page.setViewportSize(viewport);
      await page.goto(organiserPath(seededEvent));
      await expect(legButton(page, "aller")).toBeVisible();
      await page.waitForLoadState("networkidle");
      let sent = 0;
      page.on("request", () => (sent += 1));

      for (const [n, reducedMotion] of (["no-preference", "reduce"] as const).entries()) {
        await page.emulateMedia({ reducedMotion });
        for (const leg of ["aller", "retour"] as const) {
          const button = legButton(page, leg);
          const other = legButton(page, leg === "aller" ? "retour" : "aller");
          // Page at the top, then scrolled.
          await page.evaluate((top) => window.scrollTo(0, top), n * 200);
          await button.scrollIntoViewIfNeeded();
          const before = { at: await box(button), other: await box(other), otherState: await other.getAttribute("aria-expanded"), scrollY: await page.evaluate(() => window.scrollY) };
          await button.click();
          const after = await section(page, leg).evaluate((own) => ({ animations: own.getAnimations({ subtree: true }).length, scrollY: window.scrollY }));
          expect(after).toEqual({ animations: 0, scrollY: before.scrollY });
          await expect(button).toHaveAttribute("aria-expanded", "true");
          await expect(button).toBeFocused();
          const now = await box(button);
          for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(now[key] - before.at[key]), key).toBeLessThanOrEqual(1);
          await expect(other).toHaveAttribute("aria-expanded", before.otherState!);
          if (viewport.width === 1280) expect(Math.abs((await box(other)).y - before.other.y), "the other button").toBeLessThanOrEqual(1);

          for (const [key, expanded] of [
            ["Enter", "false"],
            ["Space", "true"],
            ["Space", "false"],
          ] as const) {
            await page.keyboard.press(key);
            await expect(button).toHaveAttribute("aria-expanded", expanded);
            await expect(button).toBeFocused();
          }
        }
      }
      await page.waitForLoadState("networkidle");
      expect(sent, "requests sent by folding").toBe(0);
      expect(page.url() === arrival, "the URL is still the one arrived at, fragment included").toBe(true);
      expect(await hashChanges()).toBe(0);
    });
  }

  test("O9.4: while a read runs, folding sends nothing and cancels nothing; offline, it still works", async ({ page, context, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(legButton(page, "aller")).toBeVisible();
    const reads = await holdActionsWith(page, seededEvent.token);
    await panel(page).getByRole("button", { name: FR.refresh, exact: true }).click();
    await expect.poll(reads.held).toBe(1);
    // From now on, what the page sends, and what fails before its answer (#303: a read drained
    // through a stream reader may be reported aborted once answered, which is no cancel).
    let sent = 0;
    const failed: string[] = [];
    page.on("request", () => (sent += 1));
    page.on("requestfailed", async (request) => {
      if ((await request.response()) === null) failed.push(request.failure()?.errorText ?? "");
    });
    await unfoldLegs(page);
    await legButton(page, "aller").click();
    await expect.poll(() => states(page)).toEqual(["false", "true"]);
    expect(sent, "requests sent by folding during the read").toBe(0);
    expect(reads.held()).toBe(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText("Espace organisateur actualisé.");
    await expect.poll(() => states(page)).toEqual(["false", "true"]);
    expect(failed, "requests cancelled").toEqual([]);

    await context.setOffline(true);
    try {
      await legButton(page, "aller").click();
      await legButton(page, "retour").click();
      await expect.poll(() => states(page)).toEqual(["true", "false"]);
    } finally {
      await context.setOffline(false);
    }
  });

  test("O9.7: no tiles; under 1024 px, the title line, its alert, the links, « Modifier l’événement », then Aller and Retour", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(panel(page).getByRole("button", { name: /^Aller/ })).toHaveCount(1);
    await expect(panel(page).getByRole("button", { name: /^Aller/ })).toHaveAccessibleName("Aller");
    await expect(panel(page).getByRole("button", { name: /sans voiture|place/ })).toHaveCount(0);
    const parts = [
      panel(page).getByRole("heading", { level: 2 }),
      panel(page).getByRole("alert").locator(".."),
      panel(page).getByRole("group", { name: FR.share }),
      panel(page).getByRole("button", { name: FR.edit, exact: true }),
      legButton(page, "aller"),
      legButton(page, "retour"),
    ];
    const tops = await Promise.all(parts.map(async (part) => (await box(part)).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  test("O9.9: a read takes away the list that had the focus: the focus goes to its section's button", async ({ page, db, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await unfoldLegs(page, ["retour"]);
    const cars = section(page, "retour").getByRole("list", { name: /^Voitures sans numéro/ });
    await expect(cars).toBeVisible();
    const reads = await holdActionsWith(page, seededEvent.token);
    await db.deleteFrom("ride").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    await panel(page).getByRole("button", { name: FR.refresh, exact: true }).click();
    await expect.poll(reads.held).toBe(1);
    await cars.locator("[tabindex='-1']").first().focus();
    await reads.release();
    await expect(cars).toHaveCount(0);
    await expect(legButton(page, "retour")).toBeFocused();
    await expect(legButton(page, "retour")).toHaveAttribute("aria-expanded", "true");
  });

  for (const where of ["its button", "its content"] as const) {
    test(`O9.9: a read takes the retour away while the focus is on ${where}: the focus goes to Aller's button`, async ({ page, db, seededEvent }) => {
      await page.goto(organiserPath(seededEvent));
      await unfoldLegs(page, ["retour"]);
      const reads = await holdActionsWith(page, seededEvent.token);
      await db.deleteFrom("placement").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
      await db.deleteFrom("ride").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
      await db.updateTable("event").set({ retour_at: null }).where("id", "=", seededEvent.id).execute();
      await panel(page).getByRole("button", { name: FR.refresh, exact: true }).click();
      await expect.poll(reads.held).toBe(1);
      const target = where === "its button" ? legButton(page, "retour") : section(page, "retour").locator("[tabindex='-1']").first();
      await target.focus();
      await reads.release();
      await expect(section(page, "retour")).toHaveCount(0);
      await expect(legButton(page, "aller")).toBeFocused();
    });
  }
});

test("O9.2: at 360 px, a folded section is as high with 2 and 14 without a car, 1 and 6 cars without a number", async ({ page, db, seededEvent }) => {
  // Both legs « N sans voiture » then « M places libres »: the same form of summary.
  for (const [leg, persons, cars] of [
    ["aller", 2, 1],
    ["retour", 14, 6],
  ] as const) {
    for (let n = 0; n < cars; n++) {
      const { id } = await seedPerson(db, seededEvent.id, { firstName: `Driver ${leg} ${n + 1}` });
      await seedRide(db, seededEvent.id, id, { leg, seats: 4, departureTime: "18:00:00" });
    }
    for (let n = 0; n < persons; n++) await seedWithoutCar(db, seededEvent.id, `Guest ${leg} ${n + 1}`, [leg]);
  }
  await page.goto(organiserPath(seededEvent));
  await expect(legButton(page, "aller")).toHaveAccessibleDescription("2 sans voiture 4 places libres");
  await expect(legButton(page, "retour")).toHaveAccessibleDescription("14 sans voiture 24 places libres");
  const [aller, retour] = await Promise.all([box(section(page, "aller")), box(section(page, "retour"))]);
  expect(Math.abs(aller.height - retour.height)).toBeLessThanOrEqual(1);
});

test("O9.4: a list unfolded by « Afficher les {n} autres » is still so once its section is folded and unfolded", async ({ page, db, seededEvent }) => {
  await seedCrowd(db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));
  await unfoldLegs(page, ["aller"]);
  const list = section(page, "aller").getByRole("list", { name: "Sans voiture (14)", exact: true });
  await section(page, "aller").getByRole("button", { name: "Afficher les 9 autres", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(14);
  await legButton(page, "aller").click();
  await expect(list).toHaveCount(0);
  await legButton(page, "aller").click();
  await expect(list.getByRole("listitem")).toHaveCount(14);
});

for (const locale of ["fr-FR", "en-US"] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ locale });

    test("O9.1: at 360 px, then with the text at 125 %, each leg's name holds on one line, its button cuts nothing, the page does not overflow", async ({
      page,
      db,
      seededEvent,
    }) => {
      await seedLegsExample(db, seededEvent.id);
      await page.goto(organiserPath(seededEvent));
      for (const large of [false, true]) {
        if (large) await page.addStyleTag({ content: "html { font-size: 125% }" });
        for (const leg of ["aller", "retour"] as const) {
          const button = legButton(page, leg);
          await expect(button).toHaveAccessibleName(NAMES[locale][leg]);
          const lines = await button.evaluate((each) => {
            const range = document.createRange();
            range.selectNodeContents(each.firstChild!);
            return range.getClientRects().length;
          });
          expect(lines, `${leg}, the name's lines`).toBe(1);
          expect(await button.evaluate((each) => each.scrollWidth <= each.clientWidth), `${leg}, nothing cut`).toBe(true);
        }
        expect(await overflow(page)).toBe(0);
      }
    });
  });
}

/** The forms of O9.3, word for word: by scene, each leg's summary, part by part, in each language. */
const FORMS: [string, (db: Kysely<Database>, eventId: string) => Promise<void>, Record<"fr-FR" | "en-US", [string[], string[]]>][] = [
  [
    "the singulars: 1 without a car and 1 free seat, then 1 without a car and no car",
    async (db, eventId) => {
      const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
      await seedRide(db, eventId, id, { seats: 1 });
      await seedWithoutCar(db, eventId, "Léa", ["aller", "retour"]);
    },
    {
      "fr-FR": [
        ["1 sans voiture", "1 place libre"],
        ["1 sans voiture", "Il manque 1 place"],
      ],
      "en-US": [
        ["1 without a car", "1 free seat"],
        ["1 without a car", "1 seat missing"],
      ],
    },
  ],
  [
    "the README's example: 2 without a car and 3 free seats, then 4 and 2 seats missing",
    seedLegsExample,
    {
      "fr-FR": [
        ["2 sans voiture", "3 places libres"],
        ["4 sans voiture", "Il manque 2 places"],
      ],
      "en-US": [
        ["2 without a car", "3 free seats"],
        ["4 without a car", "2 seats missing"],
      ],
    },
  ],
  [
    "everyone seated, beside an empty leg",
    async (db, eventId) => {
      const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
      const ride = await seedRide(db, eventId, id, { seats: 1 });
      const lea = await seedPerson(db, eventId, { firstName: "Léa" });
      await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: ride });
    },
    {
      "fr-FR": [["Tout le monde a une place"], ["Personne ne s’est encore inscrit."]],
      "en-US": [["Everyone has a seat"], ["Nobody has signed up yet."]],
    },
  ],
];

for (const locale of ["fr-FR", "en-US"] as const) {
  test.describe(`O9.3 in ${locale}`, () => {
    test.use({ locale });

    for (const [name, seed, forms] of FORMS) {
      test(`${name}: the pill then the seats, word for word, and the button described by them`, async ({ page, db, seededEvent }) => {
        await seed(db, seededEvent.id);
        await page.goto(organiserPath(seededEvent));
        for (const [n, leg] of (["aller", "retour"] as const).entries()) {
          const expected = forms[locale][n];
          const summary = await summaryOf(page, leg);
          await expect(summary.locator(":scope > *")).toHaveText(expected);
          await expect(legButton(page, leg)).toHaveAccessibleDescription(expected.join(" "));
          // The pill when someone is without a car, then the seats; missing, in bold.
          await expect(summary.locator(".bg-amber-100")).toHaveCount(expected.length - 1);
          const bold = /manque|missing/.test(expected.at(-1)!);
          await expect(summary.locator(":scope > *").last()).toHaveCSS("font-weight", bold ? "600" : "400");
        }
      });
    }
  });
}

test.describe("O9.3, the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  test("the button then the summary read as the folded area's line; the pill is the tab's, nothing else amber; no button, link nor status", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    const read = (leg: Leg) =>
      legButton(page, leg).evaluate((each) => `${each.textContent}${document.getElementById(each.getAttribute("aria-describedby")!)!.textContent}`);
    const legs = [await read("aller"), await read("retour")];
    expect(legs).toEqual(["Aller2 sans voiture3 places libres", "Retour4 sans voitureIl manque 2 places"]);
    await areaButton(page).click();
    expect(await panel(page).locator(":scope > ul > li").evaluateAll((all) => all.map((each) => each.textContent))).toEqual(legs);
    await areaButton(page).click();

    const amber = await page.getByRole("tab").first().getByText(/sans voiture/).evaluate((element) => getComputedStyle(element).backgroundColor);
    for (const [leg, pill] of [
      ["aller", "2 sans voiture"],
      ["retour", "4 sans voiture"],
    ] as const) {
      const summary = await summaryOf(page, leg);
      const backgrounds = await summary.evaluate((own) =>
        [own, ...own.querySelectorAll("*")].map((each) => [each.textContent, getComputedStyle(each).backgroundColor]),
      );
      expect(backgrounds.filter(([, colour]) => colour !== "rgba(0, 0, 0, 0)")).toEqual([[pill, amber]]);
      await expect(summary.locator("button, a, [role=status], [aria-live]")).toHaveCount(0);
    }
  });

  test("unfolded, no summary and no description; the date and the banner, the board's own words", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    for (const [leg, tab, banner] of [
      ["aller", "Aller", "2 sans voiture · 3 places libres"],
      ["retour", "Retour", "4 sans voiture · il manque 2 places"],
    ] as const) {
      const summary = await summaryOf(page, leg);
      await expect(summary).toBeVisible();
      await legButton(page, leg).click();
      await expect(summary).toBeHidden();
      await expect(legButton(page, leg)).not.toHaveAttribute("aria-describedby");
      await expect(legButton(page, leg)).toHaveAccessibleDescription("");
      const held = await content(page, leg);
      await expect(held.locator("time").first()).toBeVisible();
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText(banner);
      await expect(held.getByText(banner, { exact: true })).toBeVisible();
    }
  });
});

test("O9.3: the worst summary, 20 without a car and 12 seats missing, at 360 px then at 125 %: nothing overlaps, is cut or goes past the section", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedWorstSummary(db, seededEvent.id);
  await page.goto(organiserPath(seededEvent));
  const summary = await summaryOf(page, "retour");
  await expect(summary.locator(":scope > *")).toHaveText(["20 sans voiture", "Il manque 12 places"]);
  for (const large of [false, true]) {
    if (large) await page.addStyleTag({ content: "html { font-size: 125% }" });
    const where = large ? "at 125 %" : "at 100 %";
    const around = await box(section(page, "retour"));
    const parts = await summary.locator(":scope > *").all();
    const boxes = await Promise.all(parts.map(box));
    for (const [n, each] of boxes.entries()) {
      expect(each.x + each.width, `${where}, part ${n}'s right edge`).toBeLessThanOrEqual(around.x + around.width + 0.5);
      expect(await cuts(parts[n]), `${where}, part ${n} cut`).toBe(false);
      for (const other of boxes.slice(n + 1)) expect(overlap(each, other), `${where}, part ${n} overlaps`).toBe(false);
    }
    expect(await overflow(page)).toBe(0);
  }
});

test.describe("O9.5, the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  test("Retour unfolded; another context declares Gaspard without a car at the retour; « Actualiser »: Retour still unfolded, Gaspard in its list", async ({
    page,
    browser,
    baseURL,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await unfoldLegs(page, ["retour"]);
    const other = await browser.newContext({ locale: "fr-FR", baseURL, viewport: { width: 360, height: 780 } });
    try {
      const theirs = await other.newPage();
      await theirs.goto(`/e/${seededEvent.id}`);
      await theirs.getByRole("tab", { name: /^Retour/ }).click();
      await theirs.getByRole("tabpanel").getByRole("button", { name: "Ajouter une personne", exact: true }).click();
      const form = theirs.getByRole("dialog", { name: "Ajouter une personne" });
      await form.getByRole("checkbox", { name: "Aller et retour" }).uncheck();
      await form.getByLabel("Prénom").fill("Gaspard");
      await form.getByRole("button", { name: "Valider" }).click();
      await expect(form).toHaveCount(0);
    } finally {
      await other.close();
    }

    await expect(page.getByText("Gaspard")).toHaveCount(0);
    await refresh(page).click();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await expect.poll(() => states(page)).toEqual(["false", "true"]);
    await expect(section(page, "retour").getByRole("list", { name: /^Sans voiture/ }).getByText("Gaspard")).toBeVisible();
    await expect(legButton(page, "aller")).toHaveAccessibleDescription("2 sans voiture 3 places libres");
  });

  test("Retour unfolded stays so through « Actualiser », a failed one, a read after a board's action, the panel withdrawn then given back, the area folded and unfolded, « Modifier l’événement » opened and closed", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await unfoldLegs(page, ["retour"]);
    const kept = () => expect.poll(() => states(page)).toEqual(["false", "true"]);
    const reads = await holdActionsWith(page, seededEvent.token);

    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await kept();

    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.fail();
    await expect(panel(page).getByRole("alert")).toContainText(FR.failedTitle);
    await kept();

    await addFromBoard(page, "Gaspard");
    await expect.poll(reads.held).toBe(1);
    await reads.release();
    await expect(legButton(page, "aller")).toHaveAccessibleDescription("3 sans voiture 3 places libres");
    await kept();

    await addFromBoard(page, "Hector");
    await expect.poll(reads.held).toBe(1);
    await reads.fail();
    await expect(legButton(page, "retour")).toHaveCount(0);
    await refresh(page).click();
    await expect.poll(reads.held).toBe(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText(FR.refreshed);
    await kept();
    // Léa, Tom, Zoé, Hugo, Gaspard and Hector: the read that gave the panel back.
    await expect(section(page, "retour").getByRole("list", { name: "Sans voiture (6)", exact: true })).toBeVisible();

    await areaButton(page).click();
    await expect(legButton(page, "retour")).toBeHidden();
    await areaButton(page).click();
    await kept();
    await expect(legButton(page, "retour")).toBeVisible();

    await areaEditButton(page).click();
    await expect(page.getByRole("dialog", { name: FR.edit })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await kept();
  });

  test("unfolding and folding both legs leaves localStorage and sessionStorage, keys and values, and the cookies, as they were; a reload folds them all", async ({
    page,
    context,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(legButton(page, "aller")).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Every entry, its value with its key: a leg's state written into a key already there
    // changes no key (#739). The page writes none on its own, so each storage starts with
    // one, another event's folded card (O8.5): the comparison then has a value to watch.
    await page.evaluate(() => {
      for (const storage of [localStorage, sessionStorage]) storage.setItem("fullcar:organiser-folded:Ab3dEf7h", "1");
    });
    const storages = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries({ localStorage, sessionStorage }).map(([name, storage]) => [
            name,
            Object.fromEntries(Object.keys(storage).sort().map((key) => [key, storage.getItem(key)])),
          ]),
        ),
      );
    const cookies = async () => JSON.stringify(await context.cookies());
    const before = { storages: await storages(), cookies: await cookies() };
    await unfoldLegs(page);
    expect(await storages(), "unfolded").toEqual(before.storages);
    for (const leg of ["aller", "retour"] as const) await legButton(page, leg).click();
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
    expect(await storages(), "folded").toEqual(before.storages);
    await unfoldLegs(page);
    await expect.poll(() => states(page)).toEqual(["true", "true"]);
    expect(await storages(), "unfolded again").toEqual(before.storages);
    expect((await cookies()) === before.cookies, "the cookies, as before").toBe(true);
    await page.reload();
    await expect(legButton(page, "aller")).toBeVisible();
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
  });
});

test("O9.5: Aller and Retour unfolded; the retour taken away (M3), then added back (M4): Aller unfolded still, Retour back folded", async ({
  page,
  seededEvent,
}) => {
  await page.goto(organiserPath(seededEvent));
  await unfoldLegs(page);
  const sheet = page.getByRole("dialog", { name: FR.edit });
  const retourBox = sheet.getByRole("checkbox", { name: "Retour", exact: true });
  const save = async () => {
    await sheet.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(sheet).toHaveCount(0);
  };

  await areaEditButton(page).click();
  await retourBox.click();
  await save();
  await expect(legButton(page, "retour")).toHaveCount(0);
  await expect.poll(() => states(page)).toEqual(["true"]);

  await areaEditButton(page).click();
  await retourBox.click();
  await sheet.getByLabel("Heure de fin", { exact: true }).fill("18:00");
  await save();
  await expect(legButton(page, "retour")).toHaveCount(1);
  await expect.poll(() => states(page)).toEqual(["true", "false"]);
});

test.describe("O9.6, the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  test("the area folded hides the legs with the rest, its lines read as theirs; unfolded, each leg as it was; neither fold touches the other's state, nor the key", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    const key = () => page.evaluate((name) => localStorage.getItem(name), foldKey(seededEvent.id));
    await unfoldLegs(page, ["aller"]);
    for (const expanded of ["true", "false"]) {
      await legButton(page, "retour").click();
      await expect(legButton(page, "retour")).toHaveAttribute("aria-expanded", expanded);
      await expect(areaButton(page)).toHaveAttribute("aria-expanded", "true");
      expect(await key()).toBeNull();
    }
    await expect.poll(() => states(page)).toEqual(["true", "false"]);

    await areaButton(page).click();
    await expect(areaButton(page)).toHaveAttribute("aria-expanded", "false");
    for (const leg of ["aller", "retour"] as const) {
      await expect(section(page, leg)).toBeHidden();
      await expect(legButton(page, leg)).toBeHidden();
    }
    await expect(panel(page).getByRole("button", { name: /^(Aller|Retour)$/ })).toHaveCount(0);
    await expect(panel(page).locator(":scope > ul > li")).toHaveText(["Aller2 sans voiture3 places libres", "Retour4 sans voitureIl manque 2 places"]);
    expect(await states(page)).toEqual(["true", "false"]);
    expect(await key()).toBe("1");

    await areaButton(page).click();
    await expect(areaButton(page)).toHaveAttribute("aria-expanded", "true");
    expect(await states(page)).toEqual(["true", "false"]);
    await expect(await content(page, "aller")).toBeVisible();
    await expect(await summaryOf(page, "retour")).toBeVisible();
    expect(await key()).toBeNull();
  });
});

test("O9.6: an event just created from /nouveau arrives with the area unfolded and its legs folded; at 360 × 780, its share link in view with no scroll", async ({
  page,
  db,
}) => {
  await page.goto("/nouveau");
  await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled({ timeout: 15_000 });
  const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const fields = { Titre: "Sortie ski du club", Lieu: "La Clusaz", "Date de début": day, "Heure de début": "07:30", "Heure de fin": "18:00" };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Créer" }).click();
  // A loaded machine takes its time from the creation to the panel.
  await expect(areaButton(page)).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  const created = new URL(page.url()).pathname.split("/")[2];
  try {
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(panel(page).getByRole("group", { name: FR.share })).toBeInViewport({ ratio: 1 });
    // The notice « Confirmez votre adresse » of a pending event (OA2.1) comes with #581: none yet.
  } finally {
    await db.deleteFrom("event").where("id", "=", created).execute();
  }
});

test.describe("O9.8 at 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("side by side, Aller on the left, the folded buttons' tops aligned; the panel as wide with its legs folded or unfolded", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedLegsExample(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const [aller, retour] = await Promise.all([box(section(page, "aller")), box(section(page, "retour"))]);
    expect(aller.x + aller.width, "Aller left of Retour").toBeLessThanOrEqual(retour.x);
    const [first, second] = await Promise.all([box(legButton(page, "aller")), box(legButton(page, "retour"))]);
    expect(Math.abs(first.y - second.y), "the buttons' tops").toBeLessThanOrEqual(1);
    const width = (await box(panel(page))).width;
    await unfoldLegs(page);
    expect(Math.abs((await box(panel(page))).width - width), "unfolded").toBeLessThanOrEqual(1);
    for (const leg of ["aller", "retour"] as const) await legButton(page, leg).click();
    await expect.poll(() => states(page)).toEqual(["false", "false"]);
    expect(Math.abs((await box(panel(page))).width - width), "folded again").toBeLessThanOrEqual(1);
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    test("one section, in the left column, and « Retour » nowhere in the panel", async ({ page, seededEvent }) => {
      await page.goto(organiserPath(seededEvent));
      await expect(legButton(page, "aller")).toBeVisible();
      await expect(legButton(page, "retour")).toHaveCount(0);
      const [own, legs] = await Promise.all([box(section(page, "aller")), box(section(page, "aller").locator(".."))]);
      expect(Math.abs(own.x - legs.x), "at the left").toBeLessThanOrEqual(1);
      expect(own.width, "one column of two").toBeLessThanOrEqual(legs.width / 2);
      expect(await panel(page).textContent()).not.toContain("Retour");
    });
  });
});

test.describe("O9.9 in WebKit, the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
  });

  /**
   * Retour unfolded, the focus on one of its tel: links, then a click on its button: the focus is
   * on that button. By the mouse; then as Safari clicks, without giving the button the focus
   * (#302, O8.1): Playwright's WebKit, a build for Linux, does give it, as GTK's does, so the
   * click is dispatched by script, which moves no focus in any engine.
   */
  async function foldFromItsLink(page: Page, path: string) {
    await page.goto(path);
    for (const how of ["mouse", "script"] as const) {
      await unfoldLegs(page, ["retour"]);
      const tel = section(page, "retour").locator('a[href^="tel:"]').first();
      // A failure prints the link, its number included (#873).
      await numbersHidden(async () => {
        await tel.focus();
        await expect(tel).toBeFocused();
      });
      if (how === "mouse") await legButton(page, "retour").click();
      else await legButton(page, "retour").evaluate((button: HTMLElement) => button.click());
      await expect(legButton(page, "retour")).toHaveAttribute("aria-expanded", "false");
      expect(await legButton(page, "retour").evaluate((button) => document.activeElement === button), `${how}: the focus on Retour's button`).toBe(true);
    }
  }

  test("Retour folded by a click while one of its tel: links has the focus: the focus goes to its button, never to <body>, in Chromium as in WebKit", async ({
    page,
    playwright,
    baseURL,
    seededEvent,
  }) => {
    await foldFromItsLink(page, organiserPath(seededEvent));
    // Without the project's Chromium launch options, which WebKit refuses. This context is not
    // the fixture's: its requests go unrecorded, and it leaves its page before it closes.
    const browser = await playwright.webkit.launch({ channel: undefined, args: [] });
    try {
      const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, locale: "fr-FR", baseURL });
      try {
        await foldFromItsLink(await context.newPage(), organiserPath(seededEvent));
      } finally {
        for (const each of context.pages()) await each.goto("about:blank", { timeout: 5_000 }).catch(() => each.close());
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("O9.10: O5.5 holds, and the HTML of /admin holds neither a leg's button nor a summary", async ({ page, db, seededEvent }) => {
    await seedLegsExample(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    expect(await page.locator("main noscript [role=note]").evaluate((note) => note.textContent)).toBe(FR.needsJavaScript);
    const html = await page.content();
    expect(html.includes("organiser-leg-"), "a leg's section, button or summary").toBe(false);
    await expect(page.locator("h3 > button[aria-expanded]")).toHaveCount(0);
    expect(digitsOf(LEGS_EXAMPLE_PHONE).some((form) => html.includes(form)), "a number in the HTML").toBe(false);
  });
});
