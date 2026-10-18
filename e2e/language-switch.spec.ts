import { devices, type Locator, type Page } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { expect, test } from "./fixtures";

/*
 * #113, #128: a button in the shared footer, before "contact us", that names the other
 * language in that language, and turns the page into it without reloading the document.
 */

const CRISP_CHAT = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";
const UNKNOWN_ID = "Zz9yXw8v";
const WRONG_TOKEN = "q3Vx9kLmN2pR7sT1uW4yZa";
const DAY = 24 * 60 * 60;

const FR = {
  switch: "English",
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
  contact: "Nous contacter (s’ouvre dans un nouvel onglet)",
  panel: "Espace organisateur",
  invalid: "Ce lien d’organisateur n’est pas valide.",
  title: "Titre",
  retour: "Retour",
  boosters: "Rehausseurs",
};
const EN = {
  switch: "Français",
  tagline: "Group carpooling, there and back, no account needed.",
  contact: "Contact us (opens in a new tab)",
  panel: "Organiser area",
  invalid: "This organiser link is not valid.",
  title: "Title",
  retour: "Return",
  boosters: "Booster seats",
};

/** The pages of the contact link (contact.spec.ts): which, where, and the title that tells it is shown. */
const PAGES: [string, (event: SeededEvent) => string, string][] = [
  ["the home page", () => "/", "Fullcar"],
  ["the event not found", () => `/e/${UNKNOWN_ID}`, "Événement introuvable"],
  ["the event's page", ({ id }) => `/e/${id}`, "Tournoi de Rennes"],
  ["the organiser's page", ({ id, token }) => `/e/${id}/admin#${token}`, "Tournoi de Rennes"],
  ["the organiser's page, wrong token", ({ id }) => `/e/${id}/admin#${WRONG_TOKEN}`, "Tournoi de Rennes"],
  ["the organiser's page, no token", ({ id }) => `/e/${id}/admin`, "Tournoi de Rennes"],
];

/** The page once it has settled: on the organiser's page, once the token has been checked. */
async function open(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  if (path.includes("/admin")) {
    await expect(
      page.getByRole("region", { name: FR.panel }).or(page.getByRole("main").getByRole("alert")),
    ).toBeVisible();
  }
}

const languageSwitch = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Taps the button once the page is hydrated, and waits for the page to be in the other language. */
async function switchTo(page: Page, from: typeof FR, to: typeof EN, lang: "fr" | "en") {
  const button = languageSwitch(page, from.switch);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(languageSwitch(page, to.switch)).toBeEnabled();
}

test.describe("the language switch, in a browser set to French", () => {
  test.use({ locale: "fr-FR" });

  for (const [where, path, heading] of PAGES) {
    test(`L1.1: on ${where}, one button named English, in the footer, before the contact link`, async ({
      page,
      seededEvent,
    }) => {
      await open(page, path(seededEvent), heading);
      await expectSwitch(languageSwitch(page, FR.switch), "en");
    });
  }

  test("L1.3: on /, a tap turns the page into English", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await switchTo(page, FR, EN, "en");
    await expect(page.getByText(EN.tagline, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: EN.contact, exact: true })).toHaveAttribute("href", CRISP_CHAT);
    await expect(languageSwitch(page, FR.switch)).toHaveCount(0);
  });

  test("L1.5: on the event not found, the document's title follows, and a reload still answers 404", async ({
    page,
  }) => {
    await open(page, `/e/${UNKNOWN_ID}`, "Événement introuvable");
    await switchTo(page, FR, EN, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Event not found");
    await expect(page).toHaveTitle("Event not found");
    const reloaded = await page.reload();
    expect(reloaded?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Event not found");
  });

  test("L1.7: the focus is back on the button, which now reads Français", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await switchTo(page, FR, EN, "en");
    await expect(languageSwitch(page, EN.switch)).toBeFocused();
  });

  test("L2.2: one cookie, NEXT_LOCALE, for the whole site, Lax, not Secure in http, for 365 days, renewed", async ({
    page,
    context,
    baseURL,
  }) => {
    await open(page, "/", "Fullcar");
    expect(await context.cookies()).toEqual([]);
    await switchTo(page, FR, EN, "en");

    const [cookie, ...others] = await context.cookies();
    expect(others).toEqual([]);
    expect(cookie).toMatchObject({ name: "NEXT_LOCALE", value: "en", path: "/", sameSite: "Lax", secure: false });
    expect(Math.abs(cookie.expires - (Date.now() / 1000 + 365 * DAY))).toBeLessThan(DAY);

    // Close to its end, the next tap gives it 365 days again.
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "en", url: baseURL!, sameSite: "Lax", expires: Math.round(Date.now() / 1000) + DAY },
    ]);
    await switchTo(page, EN, FR, "fr");
    const renewed = await context.cookies();
    expect(renewed).toHaveLength(1);
    expect(renewed[0]).toMatchObject({ name: "NEXT_LOCALE", value: "fr", path: "/", sameSite: "Lax", secure: false });
    expect(Math.abs(renewed[0].expires - (Date.now() / 1000 + 365 * DAY))).toBeLessThan(DAY);
  });

  test("L3.1: with a valid link, the URL stays, fragment included, and the panel is the same, in English", async ({
    page,
    seededEvent,
  }) => {
    await open(page, `/e/${seededEvent.id}/admin#${seededEvent.token}`, "Tournoi de Rennes");
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    const before = page.url();
    await page.getByRole("region", { name: FR.panel }).evaluate((section) => {
      (section as HTMLElement & { kept?: string }).kept = "the same node";
    });

    await switchTo(page, FR, EN, "en");
    const panel = page.getByRole("region", { name: EN.panel });
    await expect(panel).toBeVisible();
    expect(page.url()).toBe(before);
    expect(await panel.evaluate((section) => (section as HTMLElement & { kept?: string }).kept)).toBe("the same node");
  });

  for (const [which, fragment] of [
    ["a wrong token", `#${WRONG_TOKEN}`],
    ["no token", ""],
  ]) {
    test(`L3.3: with ${which}, the URL stays, and the link is still not valid, in English`, async ({
      page,
      seededEvent,
    }) => {
      await open(page, `/e/${seededEvent.id}/admin${fragment}`, "Tournoi de Rennes");
      await expect(page.getByRole("main").getByRole("alert")).toContainText(FR.invalid);
      const before = page.url();

      await switchTo(page, FR, EN, "en");
      await expect(page.getByRole("main").getByRole("alert")).toContainText(EN.invalid);
      expect(page.url()).toBe(before);
    });
  }

  test("L3.4: on /, no reload: what is typed and ticked stays", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled();
    await markWindow(page);
    await page.getByLabel(FR.title, { exact: true }).fill("Sortie ski du club");
    await page.getByLabel(FR.retour, { exact: true }).uncheck();
    await page.getByLabel(FR.boosters, { exact: true }).check();

    await switchTo(page, FR, EN, "en");
    await expect(page.getByLabel(EN.title, { exact: true })).toHaveValue("Sortie ski du club");
    await expect(page.getByLabel(EN.retour, { exact: true })).not.toBeChecked();
    await expect(page.getByLabel(EN.boosters, { exact: true })).toBeChecked();
    expect(await windowMarked(page)).toBe(true);
  });

  test("L3.4: on the organiser's page, no reload", async ({ page, seededEvent }) => {
    await open(page, `/e/${seededEvent.id}/admin#${seededEvent.token}`, "Tournoi de Rennes");
    await markWindow(page);
    await switchTo(page, FR, EN, "en");
    await expect(page.getByRole("region", { name: EN.panel })).toBeVisible();
    expect(await windowMarked(page)).toBe(true);
  });

  test("L4.3: without JavaScript, the button is there, inactive, where the hydrated page has it", async ({
    page,
    browser,
    baseURL,
    seededEvent,
  }) => {
    // The event's page: what is above its footer depends on JavaScript (both legs stacked
    // without it, tabs with one panel once hydrated), so the footer is not at the same height.
    // The button is compared where it is in the footer it belongs to, not in the page.
    const path = `/e/${seededEvent.id}`;
    await open(page, path, "Tournoi de Rennes");
    const hydrated = languageSwitch(page, FR.switch);
    await expect(hydrated).toBeEnabled();

    const noScript = await browser.newContext({
      ...devices["Pixel 7"],
      viewport: page.viewportSize()!,
      locale: "fr-FR",
      baseURL,
      javaScriptEnabled: false,
    });
    try {
      const still = await noScript.newPage();
      await still.goto(path);
      const inactive = languageSwitch(still, FR.switch);
      await expectSwitch(inactive, "en");
      await expect(inactive).toBeDisabled();
      expect(await inFooter(inactive)).toEqual(await inFooter(hydrated));
    } finally {
      await noScript.close();
    }
  });

  test("L4.4: a double tap changes the language once, by one request", async ({ page }) => {
    await open(page, "/", "Fullcar");
    const actions: string[] = [];
    page.on("request", async (request) => {
      if (request.method() === "POST" && (await request.headerValue("next-action"))) actions.push(request.url());
    });
    const button = languageSwitch(page, FR.switch);
    await expect(button).toBeEnabled();

    await button.dblclick();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(languageSwitch(page, EN.switch)).toBeEnabled();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(actions).toHaveLength(1);
  });
});

test.describe("the language switch, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("L1.1: on /, one button named Français, in the footer, before the contact link", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await expectSwitch(languageSwitch(page, EN.switch), "fr");
  });

  test("L1.3: on /, a tap turns the page into French", async ({ page }) => {
    await open(page, "/", "Fullcar");
    await switchTo(page, EN, FR, "fr");
    await expect(page.getByText(FR.tagline, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: FR.contact, exact: true })).toHaveAttribute("href", CRISP_CHAT);
    await expect(languageSwitch(page, EN.switch)).toHaveCount(0);
  });
});

/** L1.1: one `<button>`, of exactly that name, in the language it names, in the footer, before Crisp's link. */
async function expectSwitch(button: Locator, lang: "fr" | "en") {
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute("lang", lang);
  expect(
    await button.evaluate((element, href) => {
      const link = document.querySelector(`a[href="${href}"]`);
      return {
        tag: element.tagName,
        inFooter: element.closest("footer") !== null,
        beforeLink: link !== null && (element.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      };
    }, CRISP_CHAT),
  ).toEqual({ tag: "BUTTON", inFooter: true, beforeLink: true });
}

/** L4.3: the button's box, from the top left corner of the footer it is in, and that footer's width. */
async function inFooter(button: Locator) {
  const [box, footer] = await Promise.all([
    button.boundingBox(),
    button.locator("xpath=ancestor::footer[1]").boundingBox(),
  ]);
  expect(box).not.toBeNull();
  expect(footer).not.toBeNull();
  return {
    x: box!.x - footer!.x,
    y: box!.y - footer!.y,
    width: box!.width,
    height: box!.height,
    footerWidth: footer!.width,
  };
}

/** A mark only the same document keeps: a reload would lose it. */
function markWindow(page: Page) {
  return page.evaluate(() => {
    (window as Window & { notReloaded?: boolean }).notReloaded = true;
  });
}

function windowMarked(page: Page) {
  return page.evaluate(() => (window as Window & { notReloaded?: boolean }).notReloaded === true);
}
