import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * #113, #131: after a tap on the language switch, what the page computes follows the new
 * language too: the event's dates (L1.4) and a field's error (L3.5), not only its labels.
 */

const TITLE = "Tournoi de Rennes";
const LOCATION = "Gymnase des Gayeulles";
/** What `<time datetime>` says, in every language: the event's wall-clock times. */
const DATETIME = { aller: "2026-12-12T07:30", retour: "2026-12-12T18:00" };

const LANGUAGES = {
  fr: {
    switch: "English",
    legs: { aller: "Aller", retour: "Retour" },
    dates: { aller: /^samedi 12 décembre 2026 à 07:30$/, retour: /^samedi 12 décembre 2026 à 18:00$/ },
    invalid: "Ce lien d’organisateur n’est pas valide.",
  },
  en: {
    switch: "Français",
    legs: { aller: "Outbound", retour: "Return" },
    dates: {
      aller: /^Saturday, December 12, 2026 at 7:30\sAM$/,
      retour: /^Saturday, December 12, 2026 at 6:00\sPM$/,
    },
    invalid: "This organiser link is not valid.",
  },
} as const;
type Lang = keyof typeof LANGUAGES;

/** The event's view, on its own page and on the organiser's page with nothing after the `#`. */
const VIEWS: [string, (id: string) => string][] = [
  ["the event's page", (id) => `/e/${id}`],
  ["the organiser's page, without a fragment", (id) => `/e/${id}/admin`],
];

/** Clicks a tab until it is selected: a click before hydration does nothing. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** Taps the switch once hydrated, and waits for the page to be in the other language. */
async function switchLanguage(page: Page, from: Lang, to: Lang) {
  const button = page.getByRole("button", { name: LANGUAGES[from].switch, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", to);
  await expect(page.getByRole("button", { name: LANGUAGES[to].switch, exact: true })).toBeEnabled();
}

/**
 * L1.4: the header's two dates as `lang` writes them, the `datetime` unchanged, and each tab
 * named in `lang` (v4.1: no date line of its own); the title and the place are the
 * organiser's words, never translated.
 */
async function expectEventIn(page: Page, lang: Lang) {
  const { legs, dates } = LANGUAGES[lang];
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(page.getByText(LOCATION, { exact: true })).toBeVisible();

  const header = page.locator("main header time");
  await expect(header).toHaveText([dates.aller, dates.retour]);
  await expect(header.nth(0)).toHaveAttribute("datetime", DATETIME.aller);
  await expect(header.nth(1)).toHaveAttribute("datetime", DATETIME.retour);

  for (const leg of ["aller", "retour"] as const) {
    await selectTab(page, legs[leg]);
    await expect(page.getByRole("tabpanel", { name: legs[leg] }).locator("time")).toHaveCount(0);
  }
}

/** The view once it has settled: on the organiser's page, once the missing link has been checked. */
async function openView(page: Page, path: string, lang: Lang) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  if (path.endsWith("/admin")) {
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })).toContainText(LANGUAGES[lang].invalid);
  }
}

for (const [from, to, locale, timezoneId] of [
  ["fr", "en", "fr-FR", "America/New_York"],
  ["en", "fr", "en-GB", "Asia/Tokyo"],
] as const) {
  test.describe(`the event's dates, from ${locale}, in a browser set to ${timezoneId}`, () => {
    test.use({ locale, timezoneId });

    for (const [where, path] of VIEWS) {
      test(`L1.4: on ${where}, a tap rewrites the dates in ${to}, the times of the event's place unchanged`, async ({
        page,
        seededEvent,
      }) => {
        await openView(page, path(seededEvent.id), from);
        await expectEventIn(page, from);

        await switchLanguage(page, from, to);
        await expectEventIn(page, to);
      });
    }
  });
}

test.describe("a field's error, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  test("L3.5: on /, the title's error is said again in English", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const create = page.getByRole("button", { name: "Créer", exact: true });
    await expect(create).toBeEnabled();
    await create.click();
    const titre = page.getByLabel("Titre", { exact: true });
    await expect(titre).toHaveAttribute("aria-invalid", "true");
    await expect(titre).toHaveAccessibleDescription("Champ requis.");

    await switchLanguage(page, "fr", "en");
    const title = page.getByLabel("Title", { exact: true });
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAccessibleDescription("Required.");
    await expect(page.getByText("Champ requis.", { exact: true })).toHaveCount(0);
  });
});
