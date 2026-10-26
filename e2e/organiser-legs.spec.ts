import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { leaveNoToken } from "./fixtures";
import { expectRing, press } from "./focus-ring";
import { expect, foldKey, holdActionsWith, legButton, organiserPath, seedCrowd, test, unfoldLegs, watchHash } from "./organiser";

/*
 * #662, epic #648: each leg's section of the organiser area folds behind its title, folded at
 * every appearance (organizer-view v3.5, O9). Each test runs under the fixture
 * `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

const FR = { panel: "Espace organisateur", refresh: "Actualiser", edit: "Modifier l’événement", share: "Lien à partager" };
const NAMES = { "fr-FR": { aller: "Aller", retour: "Retour" }, "en-US": { aller: "Outbound", retour: "Return" } } as const;

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const section = (page: Page, leg: Leg) => page.locator(`section[aria-labelledby="organiser-leg-${leg}"]`);
const content = async (page: Page, leg: Leg) => page.locator(`[id="${await legButton(page, leg).getAttribute("aria-controls")}"]`);
const box = async (locator: Locator) => (await locator.boundingBox()) ?? Promise.reject(new Error("no box"));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** A person of the event, without a car on each of `legs`. */
async function withoutCar(db: Kysely<Database>, eventId: string, firstName: string, legs: Leg[], phone: string | null = null) {
  const { id } = await seedPerson(db, eventId, { firstName, phone });
  for (const leg of legs) await seedPlacement(db, { personId: id, eventId, leg, rideId: null });
}

/** The README's example: at the aller, 2 without a car (Léa with a number) and 3 free seats; at the retour, 4 and 2 seats missing. */
async function seedExample(db: Kysely<Database>, eventId: string) {
  const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
  await seedRide(db, eventId, id, { seats: 3 });
  await seedRide(db, eventId, id, { leg: "retour", seats: 2, departureTime: "18:00:00" });
  await withoutCar(db, eventId, "Léa", ["aller", "retour"], "06 12 34 56 78");
  await withoutCar(db, eventId, "Tom", ["aller", "retour"]);
  for (const name of ["Zoé", "Hugo"]) await withoutCar(db, eventId, name, ["retour"]);
}

/** Every leg's button, and whether it is unfolded. */
const states = (page: Page) => panel(page).locator("h3 > button").evaluateAll((all) => all.map((each) => each.getAttribute("aria-expanded")));

/** Whether the focus is past the legs' sections, out of them, never on `<body>`. */
const pastTheLegs = (page: Page) =>
  section(page, "retour").evaluate((last) => {
    const active = document.activeElement!;
    return active !== document.body && !last.contains(active) && !!(last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

test.use({ locale: "fr-FR" });

test.describe("the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedExample(db, seededEvent.id);
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
    await page.keyboard.press("Tab");
    expect(await pastTheLegs(page), "the focus is past the legs").toBe(true);

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
    await unfoldLegs(page);
    await legButton(page, "aller").click();
    expect(reads.held()).toBe(1);
    await reads.release();
    await expect(panel(page).getByRole("status")).toHaveText("Espace organisateur actualisé.");
    await expect.poll(() => states(page)).toEqual(["false", "true"]);

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
    for (let n = 0; n < persons; n++) await withoutCar(db, seededEvent.id, `Guest ${leg} ${n + 1}`, [leg]);
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
      await seedExample(db, seededEvent.id);
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
