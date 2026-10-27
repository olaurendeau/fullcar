import type { Locator, Page } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { holdFirst, holdToken, newToken } from "./device";
import { editEventInDb } from "./event-db";
import { creatorTest as test, expect, leaveNoToken } from "./fixtures";
import { pressUntil } from "./focus-ring";
import { organiserPath } from "./organiser";

/*
 * #712, epic #654, event-description v3 (« Lire », « Focus »): the description folded beyond
 * 4 lines. The server renders the whole text, folded by CSS, and guesses the button; the browser
 * measures and corrects it, again on each resize, font load and change of the text. Unfolded in
 * memory only. Without JavaScript, a `<noscript><style>` unfolds it. The organiser's page is
 * opened by its token: nothing here prints it.
 */

leaveNoToken();

const LINE = 24;
const lines = (count: number) => Array.from({ length: count }, (_, n) => `Ligne ${n + 1}`).join("\n");
const SIX = lines(6);
const FOUR = lines(4);
const PLAN = "https://asa-annecy.example/plan";
/** 1000 characters in words. */
const WORDS = "Rendez-vous au parking du gymnase avec les sacs, les gourdes et la bonne humeur. ".repeat(13).slice(0, 1000).trim();
/** Four lines, the last one wider than the column at 360 px (328 px) but not at 768 (416 px). */
const FITS_AT_768 = `${lines(3)}\nRendez-vous au parking du gymnase à 7 h 15, les sacs`;
/** Four short lines, 169 code points: the server guesses a button, the browser removes it. */
const GUESSED_LONG = ["Covoiturage depuis la place centrale", "Retour prévu vers dix-huit heures au plus tard", "Prenez de quoi pique-niquer le midi au stade", "Les enfants ont besoin d’un siège adapté"].join("\n");
/** Four lines, 124 code points: the server guesses no button, the browser adds it. */
const GUESSED_SHORT = `${lines(3)}\n${"Rendez-vous au parking du gymnase avec les sacs, les gourdes et la bonne humeur de chacun ce matin-là".slice(0, 100)}`;
/** Four lines, 89 code points: the server guesses no button; the 4th wraps, its 5th line starts with an accented capital. */
const ACCENTS_ON_FIFTH = `${lines(3)}\n${"ÉÀÊÎÔ Élodie Ångström ".repeat(3).trim()}`;

const FR = { more: "Afficher toute la description", less: "Réduire la description", add: "Ajouter une personne" };

/** The server's HTML has the button: its messages, in the page's payload, have its words anyway. */
const rendersButton = (html: string) => html.includes(`>${FR.more}</button>`);

const header = (page: Page) => page.locator("header:has(#event-title)");
const description = (page: Page) => header(page).locator("#event-description");
const toggle = (page: Page) => header(page).getByRole("button");
const form = (page: Page) => page.getByRole("dialog", { name: FR.add });

/** The page opened and hydrated: « Ajouter une personne » waits for the device's persons (C5.9). */
async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true })).toBeEnabled();
  return response!;
}

/** The text's shown height and its whole height, without the padding that leaves its links' rings room. */
const heights = (locator: Locator) =>
  locator.evaluate((element) => {
    const { paddingTop, paddingBottom } = getComputedStyle(element);
    const padding = parseFloat(paddingTop) + parseFloat(paddingBottom);
    return { shown: element.clientHeight - padding, whole: element.scrollHeight - padding };
  });

/** The text's content box, without that padding. */
const contentBox = (locator: Locator) =>
  locator.evaluate((element) => {
    const { top, left, width, height } = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
    return {
      x: left + paddingLeft,
      y: top + paddingTop,
      width: width - paddingLeft - paddingRight,
      height: height - paddingTop - paddingBottom,
    };
  });

async function expectFolded(page: Page) {
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await heights(description(page))).shown).toBe(4 * LINE);
  expect((await heights(description(page))).whole).toBeGreaterThan(4 * LINE);
}

async function expectUnfolded(page: Page, count: number) {
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => heights(description(page))).toEqual({ shown: count * LINE, whole: count * LINE });
}

/** Registers `firstName` from the aller, the sheet closed meanwhile, its answer held until the returned `answer()`. */
async function sendHeldRegistration(page: Page, firstName: string) {
  const answer = await holdFirst(page, firstName, false);
  await page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true }).click();
  await form(page).getByLabel("Prénom").fill(firstName);
  await form(page).getByRole("button", { name: "Valider" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return answer;
}

const storageKeys = (page: Page) => page.evaluate(() => [Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()]);

/** The storage's keys before any script of the page runs, on each load: a key written as the page mounts is not in them. */
async function noteKeysBeforeScripts(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { keysBeforeScripts: [Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()] });
  });
  return () => page.evaluate(() => (window as unknown as { keysBeforeScripts: string[][] }).keysBeforeScripts);
}

/** The text's height as the server's HTML shows it, the page's scripts blocked: before any measure. */
async function serverHeight(page: Page, path: string): Promise<number> {
  const scripts = "**/_next/static/**/*.js";
  await page.route(scripts, (route) => route.abort());
  await page.goto(path);
  const { shown } = await heights(description(page));
  await page.unroute(scripts);
  return shown;
}

test.describe("six short lines", () => {
  test.use({ locale: "fr-FR", eventFields: { description: SIX } });

  for (const [where, path] of [
    ["/e/{id}", ({ id }: SeededEvent) => `/e/${id}`],
    ["/e/{id}/admin", (event: SeededEvent) => organiserPath(event)],
  ] as const) {
    test(`DS2.4: on ${where}, 4 lines, then the button, 8 px under the text, full width, 44 px; in the server's HTML already`, async ({
      page,
      seededEvent,
    }) => {
      const response = await open(page, path(seededEvent));
      const html = await response.text();
      expect(html).toMatch(/<p[^>]*id="event-description"[^>]*class="[^"]*line-clamp-4/);
      expect(html).toMatch(new RegExp(`<button[^>]*aria-expanded="false"[^>]*>${FR.more}</button>`));
      await expectFolded(page);
      const button = toggle(page);
      await expect(button).toHaveText(FR.more);
      await expect(button).toHaveAttribute("aria-controls", "event-description");
      const text = await contentBox(description(page));
      const box = (await button.boundingBox())!;
      expect(Math.round(box.y - (text.y + text.height))).toBe(8);
      expect(Math.round(box.width)).toBe(Math.round(text.width));
      expect(Math.round(box.height)).toBe(44);
    });
  }

  test("DS2.6: a tap unfolds, a second folds; the focus stays on the button, in the window", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await toggle(page).click();
    await expectUnfolded(page, 6);
    await expect(toggle(page)).toHaveText(FR.less);
    await expect(toggle(page)).toBeFocused();

    await toggle(page).click();
    await expectFolded(page);
    await expect(toggle(page)).toHaveText(FR.more);
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toBeInViewport({ ratio: 1 });
  });

  test("DS2.7: unfolded through an action and its state, written nowhere, folded again by a reload", async ({ page, seededEvent }) => {
    const before = await noteKeysBeforeScripts(page);
    await open(page, `/e/${seededEvent.id}`);
    await toggle(page).click();
    await expectUnfolded(page, 6);
    expect(await storageKeys(page)).toEqual(await before());

    await page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true }).click();
    await form(page).getByLabel("Prénom").fill("Inès");
    await form(page).getByRole("button", { name: "Valider" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Sans voiture" }).getByText("Inès")).toBeVisible();
    await expectUnfolded(page, 6);

    await page.reload();
    await expect(page.getByRole("tabpanel").getByRole("button", { name: FR.add, exact: true })).toBeEnabled();
    await expectFolded(page);
  });

  test("DS2.8, DS2.13: a state that brings 4 lines takes the button away, and its focus goes to the title", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const answer = await sendHeldRegistration(page, "Inès");
    await toggle(page).focus();
    await editEventInDb(db, seededEvent.id, { description: FOUR });
    answer();

    await expect(description(page)).toHaveText(FOUR);
    await expect(toggle(page)).toHaveCount(0);
    expect(await heights(description(page))).toEqual({ shown: 4 * LINE, whole: 4 * LINE });
    await expect(page.locator("#event-title")).toBeFocused();
  });

  test("DS2.8: unfolded, then 4 lines, then 6 again: they come folded, with « Afficher toute la description »", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await toggle(page).click();
    await expectUnfolded(page, 6);
    const short = await sendHeldRegistration(page, "Inès");
    await editEventInDb(db, seededEvent.id, { description: FOUR });
    short();
    await expect(toggle(page)).toHaveCount(0);

    const long = await sendHeldRegistration(page, "Hugo");
    await editEventInDb(db, seededEvent.id, { description: SIX });
    long();
    await expect(description(page)).toHaveText(SIX);
    await expect(toggle(page)).toHaveText(FR.more);
    await expectFolded(page);
  });
});

test.describe("DS2.5: four short lines exactly", () => {
  test.use({ locale: "fr-FR", eventFields: { description: FOUR } });

  test("everything shown, no button in the server's HTML nor after hydration", async ({ page, seededEvent }) => {
    const response = await open(page, `/e/${seededEvent.id}`);
    expect(rendersButton(await response.text())).toBe(false);
    await expect(toggle(page)).toHaveCount(0);
    expect(await heights(description(page))).toEqual({ shown: 4 * LINE, whole: 4 * LINE });
  });

  test("DS2.13: a state that brings 6 lines adds the button, folded", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const answer = await sendHeldRegistration(page, "Inès");
    await editEventInDb(db, seededEvent.id, { description: SIX });
    answer();
    await expect(toggle(page)).toHaveText(FR.more);
    await expectFolded(page);
  });
});

test.describe("DS2.8: without a description", () => {
  test.use({ locale: "fr-FR" });

  test("a state that brings 6 lines shows them folded, with the button: its <noscript> does nothing", async ({ page, db, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    const answer = await sendHeldRegistration(page, "Inès");
    await editEventInDb(db, seededEvent.id, { description: SIX });
    answer();
    await expect(description(page)).toHaveText(SIX);
    await expect(toggle(page)).toHaveText(FR.more);
    await expectFolded(page);
  });
});

test.describe("DS2.4: in English", () => {
  test.use({ locale: "en-GB", eventFields: { description: SIX } });

  test("Show the whole description, then Show less", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Add a person", exact: true })).toBeEnabled();
    await expect(toggle(page)).toHaveText("Show the whole description");
    await toggle(page).click();
    await expect(toggle(page)).toHaveText("Show less");
  });
});

test.describe("DS2.9: a description of 1000 characters, a title and a place of 30", () => {
  test.use({ locale: "fr-FR", eventFields: { title: "W".repeat(30), location: "W".repeat(30), description: WORDS } });
  const banner = (page: Page) => page.getByRole("tabpanel").getByRole("status").filter({ hasText: /\S/ });

  test("C9.2: with one person without a car, the aller's banner is in the window on load", async ({ db, page, seededEvent }) => {
    const lea = await seedPerson(db, seededEvent.id, { firstName: "Léa" });
    await seedPlacement(db, { personId: lea.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await open(page, `/e/${seededEvent.id}`);
    await expectFolded(page);
    await expect(banner(page)).toBeInViewport({ ratio: 1 });
  });

  test("C9.2: with three persons on the device and « Vos inscriptions » unfolded, too", async ({ db, page, seededEvent }) => {
    const token = newToken();
    for (const firstName of ["Léa", "Tom", "Hugo"]) {
      const person = await seedPerson(db, seededEvent.id, { firstName }, token);
      await seedPlacement(db, { personId: person.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    }
    await holdToken(page, seededEvent.id, token);
    await open(page, `/e/${seededEvent.id}`);
    const section = page.getByRole("button", { name: /^Vos inscriptions/ });
    if ((await section.getAttribute("aria-expanded")) === "false") await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectFolded(page);
    await expect(banner(page)).toBeInViewport({ ratio: 1 });
  });
});

test.describe("DS2.10: at 1280 px", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, eventFields: { description: WORDS } });

  test("the text is at most 416 px wide and folds to 4 lines", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    expect((await contentBox(description(page))).width).toBeLessThanOrEqual(416);
    await expectFolded(page);
  });
});

test.describe("DS2.11: without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false, eventFields: { description: `${SIX}\n${PLAN}` } });

  test("the whole text, no button, the links are links, by a <noscript> in the page's HTML", async ({ page, seededEvent }) => {
    const response = await page.goto(`/e/${seededEvent.id}`);
    const html = await response!.text();
    expect(html).toMatch(/<noscript><style>[^<]*#event-description[^<]*<\/style><\/noscript>/);
    expect(html).not.toContain("scripting");
    expect(await heights(description(page))).toEqual({ shown: 7 * LINE, whole: 7 * LINE });
    await expect(toggle(page)).toBeHidden();
    await expect(description(page).getByRole("link")).toHaveAttribute("href", PLAN);
  });
});

test.describe("DS2.13: the measure follows the page", () => {
  test.describe("four lines that fit at 768 px, not at 360", () => {
    test.use({ locale: "fr-FR", eventFields: { description: FITS_AT_768 } });

    test("768 to 360 px adds the button, and back takes it away", async ({ page, seededEvent }) => {
      await page.setViewportSize({ width: 768, height: 780 });
      await open(page, `/e/${seededEvent.id}`);
      expect(await heights(description(page))).toEqual({ shown: 4 * LINE, whole: 4 * LINE });
      await expect(toggle(page)).toHaveCount(0);

      await page.setViewportSize({ width: 360, height: 780 });
      await expect(toggle(page)).toHaveText(FR.more);
      await expectFolded(page);

      await page.setViewportSize({ width: 768, height: 780 });
      await expect(toggle(page)).toHaveCount(0);
    });

    // At 480 px, the column is as wide (448 px) but no longer grows with the text: its 28 rem
    // would be wider than the window at 125 %.
    test("at 480 px, the page's text at 125 % adds the button", async ({ page, seededEvent }) => {
      await page.setViewportSize({ width: 480, height: 780 });
      await open(page, `/e/${seededEvent.id}`);
      await expect(toggle(page)).toHaveCount(0);
      await page.addStyleTag({ content: "html { font-size: 125% }" });
      await expect(toggle(page)).toHaveText(FR.more);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    });
  });

  test.describe("the server's guess, wrong", () => {
    for (const [what, text, guessed] of [
      ["four short lines of more than 140 code points", GUESSED_LONG, true],
      ["four lines of less than 140 code points, one of them long", GUESSED_SHORT, false],
    ] as const) {
      test.describe(what, () => {
        test.use({ locale: "fr-FR", eventFields: { description: text } });

        test(`the server ${guessed ? "renders" : "does not render"} the button, the browser corrects it once, the text unmoved`, async ({
          page,
          seededEvent,
        }) => {
          // The text folded by the server's HTML already: 4 lines before the page's scripts, 4 after.
          expect(await serverHeight(page, `/e/${seededEvent.id}`)).toBe(4 * LINE);
          const response = await open(page, `/e/${seededEvent.id}`);
          const html = await response.text();
          expect(html).toMatch(/<p[^>]*id="event-description"[^>]*class="[^"]*line-clamp-4/);
          expect(rendersButton(html)).toBe(guessed);
          await expect(toggle(page)).toHaveCount(guessed ? 0 : 1);
          expect((await heights(description(page))).shown).toBe(4 * LINE);
        });
      });
    }
  });
});

test.describe("DS3.7: a link beyond the 4 lines shown", () => {
  test.use({ locale: "fr-FR", eventFields: { description: `${SIX}\nLe plan : ${PLAN}` } });

  test("Tab reaching it unfolds the description; the link has the focus, in the window", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}`);
    await expectFolded(page);
    const link = description(page).getByRole("link");
    await page.locator("#event-title").focus();
    await pressUntil(page, "Tab", link);
    await expect(link).toBeFocused();
    await expectUnfolded(page, 7);
    await expect(toggle(page)).toHaveText(FR.less);
    await expect(link).toBeInViewport({ ratio: 1 });
  });
});

/*
 * DS3.6 with the fold: the text not unfolded is `overflow: hidden`, and the ring is drawn 4 px
 * outside the link. `expectRing` reads the computed style, not what is painted: here, the pixels
 * around the focused link differ from those around it unfocused, and are those painted with
 * nothing clipped. A side of the ring cut is a channel off by more than 64 over the ring's 2 px;
 * the clip's own layer, and an antialiased edge at a clip that falls between two device pixels,
 * change a channel by 27 at most.
 */

/** How many pixels of two screenshots of the same size differ by more than `by` on a channel. */
async function pixelsApart(page: Page, one: Buffer, two: Buffer, by = 64): Promise<number> {
  return page.evaluate(
    async ({ by, images }) => {
      const [first, second] = await Promise.all(
        images.map(async (data) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        }),
      );
      let apart = 0;
      for (let i = 0; i < first.length; i += 4) {
        if ([0, 1, 2, 3].some((k) => Math.abs(first[i + k] - second[i + k]) > by)) apart += 1;
      }
      return apart;
    },
    { by, images: [one.toString("base64"), two.toString("base64")] },
  );
}

test.describe("DS3.6: the ring of a link in a text not unfolded, painted whole", () => {
  for (const [where, text, folds] of [
    ["a short text that starts with a link", `${PLAN} pour le plan\nDeuxième ligne`, false],
    ["a short text that ends with a link", `Le plan :\n${PLAN}`, false],
    ["a long text that starts with a link", `${PLAN} pour le plan\n${SIX}`, true],
    ["a long text with a link on its 4th line", `${lines(3)}\n${PLAN}\n${lines(3)}`, true],
  ] as const) {
    test.describe(where, () => {
      test.use({ locale: "fr-FR", eventFields: { description: text } });

      test("no pixel of the ring cut", async ({ page, seededEvent }) => {
        await open(page, `/e/${seededEvent.id}`);
        const link = description(page).getByRole("link");
        await page.locator("#event-title").focus();
        // The link's box, the ring's 4 px, and 1 px more; unfocused, before the keyboard moves.
        const box = (await link.boundingBox())!;
        const clip = { x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 };
        const unfocused = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
        await pressUntil(page, "Tab", link);
        if (folds) await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
        else await expect(toggle(page)).toHaveCount(0);
        expect(await link.boundingBox(), "the link unmoved by its focus").toEqual(box);
        const painted = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
        expect(await pixelsApart(page, painted, unfocused), "pixels of the ring painted").toBeGreaterThan(0);
        await description(page).evaluate((element) => element.style.setProperty("overflow", "visible"));
        const unclipped = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
        expect(await pixelsApart(page, painted, unclipped), "pixels of the ring cut by the fold").toBe(0);
      });
    });
  }
});

test.describe("DS3.6: the room left for the ring, under a long text the server guesses short", () => {
  test.use({ locale: "fr-FR", eventFields: { description: ACCENTS_ON_FIFTH } });

  test("before the page's scripts, the strip under the 4 lines paints nothing of the 5th", async ({ page, seededEvent }) => {
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    const response = await page.goto(`/e/${seededEvent.id}`);
    expect(rendersButton(await response!.text())).toBe(false);
    const text = description(page);
    const { shown, whole } = await heights(text);
    expect(shown).toBe(4 * LINE);
    expect(whole).toBeGreaterThan(4 * LINE);
    // The padding under the content box, across the whole text: the room left for the ring.
    const clip = await text.evaluate((element) => {
      const { left, width, bottom } = element.getBoundingClientRect();
      const paddingBottom = parseFloat(getComputedStyle(element).paddingBottom);
      return { x: left, y: bottom - paddingBottom, width, height: paddingBottom };
    });
    const painted = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
    await text.evaluate((element) => element.style.setProperty("color", "transparent"));
    const withoutText = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
    expect(await pixelsApart(page, painted, withoutText, 0), "pixels of the 5th line in the strip").toBe(0);
  });
});
