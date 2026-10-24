import type { Page } from "@playwright/test";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor, photonFeature, requestsFor, type PhotonAnswer } from "./photon";
import {
  barContrast,
  carries,
  createButton,
  created,
  ECOLE,
  fillTheRest,
  FR,
  isSearch,
  line,
  list,
  MAIRIE,
  openForm,
  options,
  place,
  positionLine,
  recordStatus,
  SALLE,
  searchedText,
  searches,
  status,
  textOf,
  typeAndList,
} from "./place-field";

// Each creation lands on the organiser's link, its token in the fragment.
leaveNoToken();

// #429: the place field of « Créer un événement » waiting, unavailable, and its list at 360 px
// (place-autocomplete, v6: states 7, 8 and 10, « Cycle de vie »), against the slot's fake Photon.
// The route gives Photon 3 s: a delay under it is answered, a delay over it is unavailable.

/** Outside France, Photon's country ends the label (state 7); a word longer than a line breaks. */
const LONG = {
  feature: photonFeature({
    lat: 47.99591,
    lon: 7.84211,
    name: "Grundschulmehrzweckturnhallenerweiterungsbau Sankt Georgen",
    postcode: "79111",
    city: "Freiburg im Breisgau",
    countrycode: "DE",
    country: "Allemagne",
  }),
  label: "Grundschulmehrzweckturnhallenerweiterungsbau Sankt Georgen, 79111 Freiburg im Breisgau, Allemagne",
};
const SION = {
  feature: photonFeature({ lat: 46.23312, lon: 7.36026, name: "Salle polyvalente Marie-Curie", postcode: "1950", city: "Sion", countrycode: "CH", country: "Suisse" }),
  label: "Salle polyvalente Marie-Curie, 1950 Sion, Suisse",
};
const PAGNOL = {
  feature: photonFeature({
    lat: 43.52975,
    lon: 5.44741,
    name: "Salle polyvalente Marcel-Pagnol",
    postcode: "13090",
    city: "Aix-en-Provence",
    countrycode: "FR",
    country: "France",
  }),
  label: "Salle polyvalente Marcel-Pagnol, 13090 Aix-en-Provence",
};

/** Every URL the page asks for, from now on. */
function urlsOf(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

/** Whether the form ever showed `words`, from now on, even for an instant. */
async function recordShown(page: Page, words: string) {
  await page.locator("form").evaluate((form, words) => {
    const seen = { shown: false };
    (window as unknown as { seen: typeof seen }).seen = seen;
    const look = () => (seen.shown ||= form.textContent?.includes(words) ?? false);
    look();
    new MutationObserver(look).observe(form, { childList: true, subtree: true, characterData: true });
  }, words);
  return () => page.evaluate(() => (window as unknown as { seen: { shown: boolean } }).seen.shown);
}

/** The page's clock held, the form open: it moves only when a test moves it. */
async function openWithClock(page: Page) {
  await page.clock.install();
  await openForm(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
}

/** `text` typed, its pause over, its request received by the fake Photon. */
async function typeAndAsk(page: Page, text: string) {
  const left = page.waitForRequest((request) => isSearch(request) && searchedText(request) === text);
  await place(page).fill(text);
  await page.clock.runFor(300);
  await left;
  await expect.poll(async () => (await requestsFor(text)).length).toBe(1);
}

test.describe("the place field of « Créer un événement », waiting and unavailable", () => {
  test.use({ locale: "fr-FR" });

  test("AL1.2, AL1.4: at 360 px, a long label wraps inside its option, each option at least 44 px, the active one's bar at 3:1; outside France, the country ends the label", async ({
    page,
  }) => {
    const text = textOf("Salle polyvalente Mar");
    await answerFor(text, { features: [PAGNOL.feature, SION.feature, LONG.feature, MAIRIE.feature] });
    await openForm(page);
    await typeAndList(page, text, 4);

    await expect(options(page)).toHaveText([PAGNOL.label, SION.label, LONG.label, MAIRIE.label]);
    expect(page.viewportSize()!.width).toBe(360);
    const listBox = (await list(page).boundingBox())!;
    for (const option of await options(page).all()) {
      const box = (await option.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(listBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(listBox.x + listBox.width);
      expect(await option.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    // Gone to the next line: the label's 18 px lines, more than one.
    expect((await options(page).nth(2).locator("span").boundingBox())!.height).toBeGreaterThan(18 * 2 - 1);

    for (let n = 0; n < 3; n++) await place(page).press("ArrowDown");
    await expect(options(page).nth(2)).toHaveAttribute("aria-selected", "true");
    expect(await options(page).nth(2).evaluate((element) => getComputedStyle(element).boxShadow)).toMatch(/ inset 3px 0px 0px 0px$| 3px 0px 0px 0px inset$/);
    expect(await barContrast(options(page).nth(2))).toBeGreaterThanOrEqual(3);
    expect((await options(page).nth(2).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("AL1.5: Tab closes the list and leaves the text; so does a tap outside it", async ({ page }) => {
    const text = textOf("Gymnase");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature] });
    const other = textOf("Stade");
    await answerFor(other, { features: [MAIRIE.feature] });
    await openForm(page);

    await typeAndList(page, text, 2);
    await place(page).press("ArrowDown");
    await place(page).press("Tab");
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).not.toBeFocused();
    await expect(place(page)).toHaveValue(text);
    await expect(positionLine(page)).toHaveCount(0);

    await typeAndList(page, other, 1);
    await page.getByRole("heading", { level: 1 }).tap();
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).not.toBeFocused();
    await expect(place(page)).toHaveValue(other);
    await expect(positionLine(page)).toHaveCount(0);
  });

  test("AL1.10: an answer in 1.5 s shows « Recherche de propositions… » once 1 s has gone by, never said; the list takes its place", async ({ page }) => {
    const text = textOf("Gymnase Colette-Bes");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature], delayMs: 1_500 });
    await openWithClock(page);
    const said = await recordStatus(status(page));
    const shown = await recordShown(page, FR.searching);

    await typeAndAsk(page, text);
    await page.clock.runFor(999);
    expect(await shown()).toBe(false);
    await page.clock.runFor(1);
    await expect(line(page, FR.searching)).toBeVisible();

    await expect(options(page)).toHaveCount(2);
    await expect(line(page, FR.searching)).toHaveCount(0);
    await expect(status(page)).toHaveText("2 propositions");
    expect(await said()).toEqual(["2 propositions"]);
  });

  test("AL1.10: an answer in 0.5 s never shows « Recherche de propositions… »", async ({ page }) => {
    const text = textOf("Gymnase Colette-Besson");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature], delayMs: 500 });
    await openWithClock(page);
    const shown = await recordShown(page, FR.searching);

    await typeAndAsk(page, text);
    // The page's 0.5 s go by while the fake holds its answer.
    await page.clock.runFor(500);
    await expect(options(page)).toHaveCount(2);
    await page.clock.runFor(3_000);
    await expect(options(page)).toHaveCount(2);
    expect(await shown()).toBe(false);
  });

  test("AL1.10: an answer for a text changed since opens no list; the current text's does", async ({ page }) => {
    const first = textOf("Gymnase");
    const second = `${first} Colette`;
    await answerFor(first, { features: [SALLE.feature], delayMs: 1_000 });
    await answerFor(second, { features: [ECOLE.feature, MAIRIE.feature], delayMs: 2_000 });
    await openWithClock(page);
    const shown = await recordShown(page, SALLE.label);

    await typeAndAsk(page, first);
    await typeAndAsk(page, second);
    // The second answer comes after the first: by then, the first could have opened its list.
    await expect(options(page)).toHaveText([ECOLE.label, MAIRIE.label]);
    expect(await shown()).toBe(false);
  });

  test("AL1.10: the list closes at the next keystroke, and Enter then chooses nothing: the event is created with the text typed, without a position", async ({
    page,
    db,
  }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature] });
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 2);
    await place(page).press("ArrowDown");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "true");

    await place(page).press("x");
    await expect(list(page)).toBeHidden();
    await expect(place(page)).not.toHaveAttribute("aria-activedescendant");
    await place(page).press("Enter");
    expect(await created(page, db)).toEqual({ location: `${text}x`, location_lat: null, location_lng: null });
  });

  const causes: { cause: string; answer: PhotonAnswer }[] = [
    { cause: "a 500", answer: { status: 500 } },
    { cause: "a 429", answer: { status: 429 } },
  ];
  for (const { cause, answer } of causes) {
    test(`AL2.2, AL6.3: ${cause} gives « Propositions indisponibles… » under the field, said, without an alert; the form then sends the text, in no URL`, async ({
      page,
      db,
    }) => {
      const text = textOf(`Gymnase ${cause}`);
      await answerFor(text, answer);
      const urls = urlsOf(page);
      await openForm(page);
      await fillTheRest(page);

      await place(page).fill(text);
      await expect(line(page, FR.unavailable)).toBeVisible();
      await expect(status(page)).toHaveText(FR.unavailable);
      await expect(list(page)).toBeHidden();
      await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
      expect((await requestsFor(text)).length).toBe(1);

      await createButton(page).click();
      expect(await created(page, db)).toEqual({ location: text, location_lat: null, location_lng: null });
      expect(urls.filter((url) => carries(url, text)).length, "URLs carrying the text typed").toBe(0);
    });
  }

  test("AL2.2, AL6.3: an answer past the route's 3 s gives « Propositions indisponibles… », after « Recherche… », without an alert; the form then sends the text, in no URL", async ({
    page,
    db,
  }) => {
    const text = textOf("Gymnase lent");
    // Suggestions the route waits 3 s for, and no longer: the page's own 3 s are held.
    await answerFor(text, { features: [SALLE.feature], delayMs: 3_500 });
    const urls = urlsOf(page);
    await openWithClock(page);
    await fillTheRest(page);

    await typeAndAsk(page, text);
    await page.clock.runFor(1_000);
    await expect(line(page, FR.searching)).toBeVisible();
    await expect(line(page, FR.unavailable)).toBeVisible({ timeout: 10_000 });
    await expect(line(page, FR.searching)).toHaveCount(0);
    await expect(status(page)).toHaveText(FR.unavailable);
    await expect(list(page)).toBeHidden();
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);

    await page.clock.resume();
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: text, location_lat: null, location_lng: null });
    expect(urls.filter((url) => carries(url, text)).length, "URLs carrying the text typed").toBe(0);
  });

  test("AL2.2, AL5.5, AL6.3: offline, no request and « Propositions indisponibles… »; the creation fails with today's message and keeps the text and the position, then sends them once online", async ({
    page,
    context,
    db,
  }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE.feature] });
    const edited = textOf("Devant la salle des fêtes");
    const sent = searches(page);
    const urls = urlsOf(page);
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    await expect(positionLine(page)).toHaveText(`Position : ${SALLE.label}`);

    await context.setOffline(true);
    await place(page).fill(edited);
    await expect(line(page, FR.unavailable)).toBeVisible();
    await expect(status(page)).toHaveText(FR.unavailable);
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
    expect(sent.filter((request) => searchedText(request) === edited).length).toBe(0);

    await createButton(page).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(FR.failed);
    await expect(place(page)).toHaveValue(edited);
    await expect(positionLine(page)).toHaveText(`Position : ${SALLE.label}`);

    await context.setOffline(false);
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: edited, location_lat: 45.73791, location_lng: 4.65616 });
    expect((await requestsFor(edited)).length).toBe(0);
    expect(urls.filter((url) => carries(url, edited) || carries(url, text)).length, "URLs carrying a text typed").toBe(0);
  });

  test("AL2.2: two pauses in a row, still unavailable, the focus in the field: the status region says it once", async ({ page }) => {
    const first = textOf("Gymnase");
    const second = `${first} Colette`;
    await answerFor(first, { status: 500 });
    await answerFor(second, { status: 500 });
    await openForm(page);
    const said = await recordStatus(status(page));

    await place(page).fill(first);
    await expect(line(page, FR.unavailable)).toBeVisible();
    await place(page).fill(second);
    await expect(line(page, FR.unavailable)).toHaveCount(0);
    await expect.poll(async () => (await requestsFor(second)).length).toBe(1);
    await expect(line(page, FR.unavailable)).toBeVisible();
    await expect(place(page)).toBeFocused();
    expect(await said()).toEqual([FR.unavailable]);
  });
});
