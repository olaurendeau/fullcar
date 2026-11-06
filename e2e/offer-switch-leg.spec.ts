import type { Locator, Page } from "@playwright/test";
import { animationsDone, bar, messages } from "./device";
import { expect, leaveNoToken, test, TAP_TARGET_MIN } from "./fixtures";

leaveNoToken();

// #998, epic #995 (event-board v5.3, RL2.1 to RL2.5, RL4.1): « Proposer plutôt pour le retour »
// in the sheet of « Proposer une voiture » closes it without sending, makes the other leg's tab
// active and opens its sheet, empty. RL2.4 on « Modifier la voiture » is in ride-edit.spec.ts, and
// after the refusal `noRetour` in aller-sheets.spec.ts; the focus after a success (RL2.5), the
// button while sending and after a failure (RL2.6, RL2.7) are in offer-ride.spec.ts and
// offer-passengers.spec.ts, which have a driver with a number.

type LegName = "aller" | "retour";

const WORDS = {
  "fr-FR": {
    offer: "Proposer une voiture",
    tabs: { aller: "Aller", retour: "Retour" },
    title: { aller: "Proposer une voiture pour l’aller", retour: "Proposer une voiture pour le retour" },
    // The button of the sheet of a leg, which leads to the other.
    switchLeg: { aller: "Proposer plutôt pour le retour", retour: "Proposer plutôt pour l’aller" },
    close: "Fermer",
  },
  "en-US": {
    offer: "Offer a car",
    tabs: { aller: "Outbound", retour: "Return" },
    title: { aller: "Offer a car for the outbound trip", retour: "Offer a car for the return trip" },
    switchLeg: { aller: "Offer for the return trip instead", retour: "Offer for the outbound trip instead" },
    close: "Close",
  },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

const other = (leg: LegName): LegName => (leg === "aller" ? "retour" : "aller");
const dialogs = (page: Page) => page.locator('[role="dialog"], [role="alertdialog"]');
const sheetOf = (page: Page, words: Words, leg: LegName) => page.getByRole("dialog", { name: words.title[leg], exact: true });
/** The button of a leg's top, by its landmark: a sheet hides the page from role queries. */
const top = (page: Page, leg: LegName) => page.locator(`[data-offer-ride="${leg}"]`);
const tab = (page: Page, leg: LegName) => page.locator(`[role="tab"][id$="${leg}"]`);
const switchButton = (sheet: Locator) => sheet.locator("[data-switch-leg]");

async function selectTab(page: Page, words: Words, leg: LegName) {
  const each = page.getByRole("tab", { name: new RegExp(`^${words.tabs[leg]}`) });
  await expect(async () => {
    await each.click();
    await expect(each).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The page on `leg`'s tab, its top button of « Proposer une voiture » tapped, the sheet open and settled. */
async function openFrom(page: Page, eventId: string, words: Words, leg: LegName) {
  await page.goto(`/e/${eventId}`);
  await selectTab(page, words, leg);
  await expect(top(page, leg)).toBeEnabled();
  await top(page, leg).click();
  const sheet = sheetOf(page, words, leg);
  await expect(sheet).toBeVisible();
  await animationsDone(sheet);
  return sheet;
}

/** What every field of the sheet holds, in the order of the sheet. */
const valuesOf = (sheet: Locator) => sheet.locator("input, textarea").evaluateAll((all) => all.map((each) => (each as HTMLInputElement).value));

/** Where the focus is: its tag and its name, or its landmark, never what is typed. */
const focusedOn = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    return active.getAttribute("data-offer-ride") ?? `${active.tagName} ${active.getAttribute("aria-label") ?? active.id.replace(/^.*-/, "")}`;
  });

for (const locale of ["fr-FR", "en-US"] as const) {
  const words = WORDS[locale];

  test.describe(`« Proposer plutôt pour… », ${locale}`, () => {
    test.use({ locale });

    for (const leg of ["aller", "retour"] as const) {
      test(`RL2.1, RL4.1: the sheet of the ${leg} starts with a button of 44 px at least, which leads to the ${other(leg)}`, async ({ page, seededEvent }) => {
        const sheet = await openFrom(page, seededEvent.id, words, leg);
        const button = sheet.getByRole("button", { name: words.switchLeg[leg], exact: true });
        await expect(button).toBeVisible();
        // The first element of the body, under the title.
        await expect(sheet.locator("form > *").first()).toHaveText(words.switchLeg[leg]);
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
        // Not the focus of the opening: the form's first control, as ever.
        await expect(button).not.toBeFocused();
      });

      test(`RL2.2: from the ${leg}, the tap closes the sheet, sends nothing, and opens the ${other(leg)}'s, empty, on its tab`, async ({ page, seededEvent }) => {
        const to = other(leg);
        // What an opening from the button at the top of the other tab gives: the reference.
        const reference = await openFrom(page, seededEvent.id, words, to);
        const defaults = await valuesOf(reference);
        await page.keyboard.press("Escape");
        await expect(dialogs(page)).toHaveCount(0);

        const sheet = await openFrom(page, seededEvent.id, words, leg);
        const posts: string[] = [];
        page.on("request", (request) => request.method() === "POST" && posts.push(request.url()));
        // A typed field, which the passage loses (decision 5).
        await sheet.getByLabel(/^(Prénom|First name)$/).fill("Marc");
        await sheet.getByLabel(/^Note/).fill("Coffre plein");
        expect(await valuesOf(sheet)).toContain("Marc");

        await switchButton(sheet).click();
        const next = sheetOf(page, words, to);
        await expect(next).toBeVisible();
        // One dialog once the first has left, and the other leg's tab is the active one.
        await expect(dialogs(page)).toHaveCount(1);
        await expect(tab(page, to)).toHaveAttribute("aria-selected", "true");
        await animationsDone(next);
        expect(await valuesOf(next)).toEqual(defaults);
        expect(posts).toEqual([]);
        await expect(bar(page)).toBeEmpty();
      });
    }
  });
}

test.describe("the way back, fr-FR", () => {
  test.use({ locale: "fr-FR" });
  const words = WORDS["fr-FR"];

  /** On `/` first, then the event: leaving the page means `/` again; hydrated, Next has written its state. */
  async function arrive(page: Page, eventId: string) {
    await page.goto("/");
    await page.goto(`/e/${eventId}`);
    await page.waitForFunction(() => history.state?.__NA === true);
  }
  const entries = (page: Page) => page.evaluate(() => history.length);

  test("RL2.3: after the passage one entry more; a single back closes the sheet on the event, the next one leaves; « Fermer » leaves none", async ({ page, seededEvent }) => {
    await arrive(page, seededEvent.id);
    const before = await entries(page);
    await selectTab(page, words, "aller");
    await expect(top(page, "aller")).toBeEnabled();
    await top(page, "aller").click();
    const sheet = sheetOf(page, words, "aller");
    await expect(sheet).toBeVisible();
    await expect.poll(() => entries(page)).toBe(before + 1);

    await switchButton(sheet).click();
    const next = sheetOf(page, words, "retour");
    await expect(next).toBeVisible();
    await expect(dialogs(page)).toHaveCount(1);
    await animationsDone(next);
    // The history takes a step back for the first sheet, then pushes the second's: let it finish.
    await page.waitForTimeout(500);
    expect(await entries(page)).toBe(before + 1);
    const url = page.url();

    await page.goBack();
    await expect(dialogs(page)).toHaveCount(0);
    expect(page.url() === url, "the address changed").toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(messages(page)).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname, { message: "the page was not left" }).toBe("/");
  });

  test("RL2.3: closed by « Fermer » after the passage, the sheet leaves no entry: the next back leaves the page", async ({ page, seededEvent }) => {
    await arrive(page, seededEvent.id);
    await selectTab(page, words, "aller");
    await expect(top(page, "aller")).toBeEnabled();
    await top(page, "aller").click();
    await switchButton(sheetOf(page, words, "aller")).click();
    const next = sheetOf(page, words, "retour");
    await expect(next).toBeVisible();
    await expect(dialogs(page)).toHaveCount(1);
    await animationsDone(next);
    await page.waitForTimeout(500);
    await next.getByRole("button", { name: words.close }).click();
    await expect(dialogs(page)).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname, { message: "the page was not left" }).toBe("/");
  });

  for (const via of ["« Fermer »", "Escape", "the back gesture"] as const) {
    for (const leg of ["aller", "retour"] as const) {
      test(`RL2.5: opened from the ${leg} and passed over, closed by ${via}: the focus is on the button of the ${other(leg)} at the top, never the ${leg}'s`, async ({ page, seededEvent }) => {
        const to = other(leg);
        // The focus an opening from the top of the other tab gives: the reference.
        await openFrom(page, seededEvent.id, words, to);
        const opened = await focusedOn(page);
        await page.keyboard.press("Escape");
        await expect(dialogs(page)).toHaveCount(0);

        const sheet = await openFrom(page, seededEvent.id, words, leg);
        await switchButton(sheet).click();
        const next = sheetOf(page, words, to);
        await expect(next).toBeVisible();
        await expect(dialogs(page)).toHaveCount(1);
        await animationsDone(next);
        // The same control as an opening from the top, and not the button of the passage.
        expect(await focusedOn(page)).toBe(opened);

        if (via === "« Fermer »") await next.getByRole("button", { name: words.close }).click();
        else if (via === "Escape") await page.keyboard.press("Escape");
        else await page.goBack();
        await expect(dialogs(page)).toHaveCount(0);
        await expect(top(page, to)).toBeFocused();
        await expect(top(page, leg)).not.toBeFocused();
        await expect(bar(page)).toBeEmpty();
      });
    }
  }
});

test.describe("without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("RL2.4: the button is not in the DOM", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const button = page.getByRole("button", { name: "Proposer une voiture", exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole("dialog", { name: "Proposer une voiture", exact: true })).toBeVisible();
    await expect(page.locator("[data-switch-leg]")).toHaveCount(0);
    await expect(page.getByText(/Proposer plutôt/)).toHaveCount(0);
  });
});
