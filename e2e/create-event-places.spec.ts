import { randomUUID } from "node:crypto";
import { expect, expectUrl, leaveNoToken, test } from "./fixtures";
import { answerFor, requestsFor } from "./photon";
import {
  ARRIVAL,
  barContrast,
  carries,
  createButton,
  created,
  creations,
  ECOLE,
  fillTheRest,
  FR,
  holdCreation,
  isSearch,
  list,
  MAIRIE,
  openForm,
  options,
  place,
  PLACES,
  positionLine,
  recordStatus,
  removeButton,
  SALLE,
  searchedText,
  searches,
  status,
  textOf,
  typeAndList,
} from "./place-field";

// Each creation lands on the organiser's link, its token in the fragment.
leaveNoToken();

// #428: the place field of « Créer un événement », with suggestions (place-autocomplete, states 1
// to 5, « Anatomie et clavier », « Les mots »), against the slot's fake Photon.

test.describe("the place field of « Créer un événement »", () => {
  test.use({ locale: "fr-FR" });

  test("AL1.1: under 3 characters after trim, no request; then one, 300 ms after the last of keystrokes less than 300 ms apart", async ({ page }) => {
    await page.clock.install();
    const sent = searches(page);
    await openForm(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));

    await place(page).pressSequentially("  Va");
    await page.clock.runFor(1_000);
    const rest = ["ugn", "eray ", randomUUID()];
    for (const part of rest) {
      await place(page).pressSequentially(part);
      await page.clock.runFor(250);
    }
    const next = page.waitForRequest(isSearch);
    await page.clock.runFor(50);
    const request = await next;

    // Anything « Va » or a part had sent would have come first.
    expect(searchedText(request)).toBe(`Va${rest.join("")}`);
    expect(sent.length).toBe(1);
    await expect.poll(async () => (await requestsFor(`Va${rest.join("")}`)).length).toBe(1);
  });

  test("AL1.2, AL1.6: 5 options of at least 44 px, the combobox expanded, the list named; Arrow down makes the first active, by aria-selected, aria-activedescendant and a bar of 3:1", async ({
    page,
  }) => {
    const text = textOf("Vaugn");
    await answerFor(text, { features: PLACES.map(({ feature }) => feature) });
    await openForm(page);
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await typeAndList(page, text, 5);

    await expect(place(page)).toHaveAttribute("aria-expanded", "true");
    await expect(place(page)).toHaveAttribute("aria-autocomplete", "list");
    await expect(status(page)).toHaveText("5 propositions");
    await expect(options(page)).toHaveText(PLACES.slice(0, 5).map(({ label }) => label));
    for (const option of await options(page).all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(FR.keepText)).toBeVisible();
    await expect(page.getByText(FR.source)).toBeVisible();
    await expect(options(page).first()).toHaveAttribute("aria-selected", "false");
    await expect(place(page)).not.toHaveAttribute("aria-activedescendant");

    await place(page).press("ArrowDown");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "true");
    await expect(place(page)).toHaveAttribute("aria-activedescendant", (await options(page).first().getAttribute("id"))!);
    expect(await barContrast(options(page).first())).toBeGreaterThanOrEqual(3);
    await expect(place(page)).toBeFocused();

    await place(page).press("ArrowDown");
    await expect(options(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "false");
  });

  test("AL1.3, AL1.6: three suggestions said; a tap puts its label in the field, closes the list, keeps the focus, and sends nothing", async ({ page }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE, ECOLE, MAIRIE].map(({ feature }) => feature) });
    const sent = creations(page);
    await openForm(page);
    // The form complete: a creation sent on the tap would not stop at the browser's validation.
    await fillTheRest(page);
    await typeAndList(page, text, 3);
    await expect(status(page)).toHaveText("3 propositions");

    await options(page).nth(1).click();
    await expect(place(page)).toHaveValue(ECOLE.label);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).toBeFocused();
    await expect(positionLine(page)).toHaveText(`Position : ${ECOLE.label}`);
    expect(sent.length).toBe(0);
  });

  test("AL1.3, AL1.7, AL3.4: Arrow down then Enter chooses without sending; the position line describes the field, « Position ajoutée. »; the event shows the label, at the option's position", async ({
    page,
    db,
  }) => {
    const text = textOf("Salle des f");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature] });
    const sent = creations(page);
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 2);
    await place(page).press("ArrowDown");
    await place(page).press("Enter");

    await expect(place(page)).toHaveValue(SALLE.label);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAccessibleDescription(`Position : ${SALLE.label}`);
    await expect(status(page)).toHaveText(FR.added);
    expect(sent.length).toBe(0);

    await createButton(page).click();
    const event = await created(page, db);
    expect(event).toEqual({ location: SALLE.label, location_lat: 45.73791, location_lng: 4.65616 });
    await expect(page.getByText(SALLE.label, { exact: true })).toBeVisible();
  });

  test("AL3.1: the text changed after a choice keeps the position line, and the event is created with that text and the choice's position", async ({ page, db }) => {
    const text = textOf("Mairie");
    await answerFor(text, { features: [MAIRIE.feature] });
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();

    const edited = "Devant la mairie de Vaugneray, côté parking";
    await place(page).fill(edited);
    await expect(positionLine(page)).toHaveText(`Position : ${MAIRIE.label}`);
    await expect(place(page)).toHaveAccessibleDescription(`Position : ${MAIRIE.label}`);

    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: edited, location_lat: 45.73701, location_lng: 4.65988 });
  });

  test("AL3.2, AL3.4: « Retirer » takes the line and the position, leaves the text, focuses the field, and says « Position retirée. »", async ({ page, db }) => {
    const text = textOf("École");
    await answerFor(text, { features: [ECOLE.feature] });
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const said = await recordStatus(page);

    await removeButton(page).click();
    await expect(positionLine(page)).toHaveCount(0);
    await expect(removeButton(page)).toHaveCount(0);
    await expect(place(page)).toHaveValue(ECOLE.label);
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAccessibleDescription("");
    await expect(status(page)).toHaveText(FR.removed);
    expect(await said()).toEqual([FR.removed]);

    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: ECOLE.label, location_lat: null, location_lng: null });
  });

  test("AL3.3, AL3.8: emptying the field takes its position and says « Position retirée. » once; emptying it without a position says nothing", async ({ page }) => {
    const text = textOf("Stade");
    await answerFor(text, { features: [SALLE.feature] });
    const nothing = textOf("Rien");
    await openForm(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const said = await recordStatus(page);

    await place(page).fill("");
    await expect(positionLine(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(FR.removed);

    await place(page).fill("St");
    await place(page).fill("");
    // Said after the field was emptied without a position: nothing in between.
    await place(page).fill(nothing);
    await expect(status(page)).toHaveText(FR.none);
    expect(await said()).toEqual([FR.removed, FR.none]);
  });

  test("AL2.1: « devant la salle des fêtes », sent without a choice, creates the event with that exact text and no position", async ({ page, db }) => {
    await openForm(page);
    await fillTheRest(page);
    await place(page).fill("devant la salle des fêtes");
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: "devant la salle des fêtes", location_lat: null, location_lng: null });
  });

  test("AL2.3: an empty fake Photon gives « Aucune proposition… » under the field, said, and no list", async ({ page }) => {
    const text = textOf("Devant le portail vert");
    await openForm(page);
    await place(page).fill(text);
    await expect(page.locator("form p").filter({ hasText: FR.none })).toBeVisible();
    await expect(status(page)).toHaveText(FR.none);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  });

  test("AL1.8: a page in French asks Photon in French", async ({ page }) => {
    const text = textOf("Mairie");
    await openForm(page);
    await place(page).fill(text);
    await expect.poll(async () => (await requestsFor(text)).length).toBe(1);
    expect(new URLSearchParams((await requestsFor(text))[0].query).get("lang")).toBe("fr");
  });

  test("AL5.4: Enter sends the form while a pause is under way: it sends nothing, nor does a keystroke while sending, and « Retirer » does nothing", async ({
    page,
    db,
  }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE.feature] });
    const later = textOf("Devant la salle");
    await page.clock.install();
    const sent = searches(page);
    const creation = await holdCreation(page);
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const before = sent.length;

    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    await place(page).fill(later);
    await place(page).press("Enter");
    await creation.sent;
    await page.clock.runFor(5_000);
    await place(page).pressSequentially(" bis");
    await page.clock.runFor(5_000);
    await expect(removeButton(page)).toHaveAttribute("aria-disabled", "true");
    // Tapped: a button `aria-disabled` takes the tap, which Playwright's click would wait out.
    await removeButton(page).dispatchEvent("click");
    await page.clock.resume();

    await creation.fail();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(FR.failed);
    // Anything sent while sending, or « Retirer » heard, came before the answer.
    expect(sent.length - before).toBe(0);
    await expect(positionLine(page)).toHaveText(`Position : ${SALLE.label}`);
    await expect(removeButton(page)).not.toHaveAttribute("aria-disabled");
    expect((await requestsFor(later)).length + (await requestsFor(`${later} bis`)).length).toBe(0);

    await creation.stop();
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: `${later} bis`, location_lat: 45.73791, location_lng: 4.65616 });
  });

  test("AL5.4: an answer awaited when Enter sends the form opens no list, neither then nor once the sending failed", async ({ page }) => {
    const text = textOf("Gymnase Colette-Bes");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature], delayMs: 1_500 });
    const creation = await holdCreation(page);
    await openForm(page);
    await fillTheRest(page);
    const left = page.waitForRequest((request) => isSearch(request) && searchedText(request) === text);
    await place(page).fill(text);
    await left;

    // Abandoned when the form locks, or answered: either way, nothing more comes for it.
    const settled = Promise.race([
      page.waitForEvent("requestfailed", isSearch),
      page.waitForResponse((response) => isSearch(response.request())).then((response) => response.finished()),
    ]);
    await place(page).press("Enter");
    await creation.sent;
    await settled;
    await place(page).press("ArrowDown");
    await creation.fail();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(FR.failed);

    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).toBeFocused();
  });

  test("AL6.2, AL6.3: while typing and choosing, every request of the page goes to our origin, and no URL carries the text typed, in any encoding", async ({
    page,
    baseURL,
  }) => {
    const text = `Lilas ${randomUUID()} l’été à Sainte-Foy-lès-Lyon`;
    await answerFor(text, { features: [SALLE.feature] });
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    const sent = searches(page);
    await openForm(page);
    await fillTheRest(page);

    await place(page).pressSequentially(text);
    await expect(options(page)).toHaveCount(1);
    await place(page).press("ArrowDown");
    await place(page).press("Enter");
    await place(page).pressSequentially(" côté parking");
    await expect(page.locator("form p").filter({ hasText: FR.none })).toBeVisible();
    await createButton(page).click();
    await expectUrl(page, ARRIVAL, "the organiser's link");

    // The text went, in the body of a POST to /api/lieux.
    expect(sent.filter((request) => request.method() === "POST" && searchedText(request) === text).length).toBe(1);
    const origin = new URL(baseURL!).origin;
    expect(urls.filter((url) => new URL(url).origin !== origin).length, "requests to another origin").toBe(0);
    const typed = new Set([...sent.map(searchedText), `${SALLE.label} côté parking`]);
    for (let n = 10; n <= text.length; n++) typed.add(text.slice(0, n));
    const carried = [...typed].filter((each) => urls.some((url) => carries(url, each)));
    expect(carried, "texts typed found in a URL").toEqual([]);
  });
});

test.describe("the place field in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("AL1.8: a page in English asks Photon in English, and names its list Suggestions for Place", async ({ page }) => {
    const text = textOf("Town hall");
    await answerFor(text, { features: [MAIRIE.feature] });
    await openForm(page, "Create");
    await place(page, "Place").fill(text);
    await expect(list(page, "Suggestions for Place").getByRole("option")).toHaveCount(1);
    await expect(status(page)).toHaveText("1 suggestion");
    expect(new URLSearchParams((await requestsFor(text))[0].query).get("lang")).toBe("en");
  });
});
