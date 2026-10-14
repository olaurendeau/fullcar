import type { Page } from "@playwright/test";
import { PUBLIC_ID_ALPHABET } from "@/domain/public-id";
import { expect, test } from "./fixtures";

// The seed (src/db/test-events.ts): aller on 2026-12-12 at 07:30, retour the same day at 18:00.
const FR = {
  aller: /^samedi 12 décembre 2026 à 07:30$/,
  retour: /^samedi 12 décembre 2026 à 18:00$/,
  noCarAller: "Aucune voiture proposée pour l’aller",
  noCarRetour: "Aucune voiture proposée pour le retour",
  nobody: "Personne ne s’est encore inscrit.",
};

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Clicks a tab until it is selected: a click before hydration does nothing. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The id with the case of one letter changed, still in the alphabet. */
function swapOneCase(id: string): string {
  for (let i = 0; i < id.length; i++) {
    const c = id[i];
    const swapped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    if (swapped !== c && PUBLIC_ID_ALPHABET.includes(swapped)) return id.slice(0, i) + swapped + id.slice(i + 1);
  }
  throw new Error("no letter of this id has its other case in the alphabet");
}

test.describe("event page, with a retour", () => {
  test.use({ locale: "fr-FR" });

  test("C5.1: shows the title, the place, and the date and time of both legs", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(page.getByText("Gymnase des Gayeulles")).toBeVisible();
    const legs = page.locator("header dl");
    await expect(legs.locator("dt")).toHaveText(["Aller", "Retour"]);
    await expect(legs.locator("dd")).toHaveText([FR.aller, FR.retour]);
  });

  test("C5.2, C5.3: Aller is selected first, with its date and its empty state", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["Aller", "Retour"]);
    await expect(page.getByRole("tab", { name: "Aller" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Retour" })).toHaveAttribute("aria-selected", "false");

    const panel = page.getByRole("tabpanel");
    await expect(panel.locator("time")).toHaveText(FR.aller);
    await expect(panel.getByText(FR.noCarAller)).toBeVisible();
    await expect(panel.getByText(FR.nobody)).toBeVisible();
    // Nothing to do yet on an empty event (#3, "États à concevoir").
    await expect(panel.getByRole("button")).toHaveCount(0);
  });

  test("C5.2, C5.3: Retour shows its own date and empty state, without reload nor URL change", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const url = page.url();
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));

    await selectTab(page, "Retour");
    await expect(page.getByRole("tab", { name: "Aller" })).toHaveAttribute("aria-selected", "false");
    const panel = page.getByRole("tabpanel");
    await expect(panel.locator("time")).toHaveText(FR.retour);
    await expect(panel.getByText(FR.noCarRetour)).toBeVisible();
    await expect(panel.getByText(FR.nobody)).toBeVisible();

    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
  });

  test("C5.5: the tabs are at least 44 px high", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    for (const name of ["Aller", "Retour"]) {
      const box = await page.getByRole("tab", { name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("C5.6, C5.7: the document title holds the event's, and robots stay out", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page).toHaveTitle(/Tournoi de Rennes/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("C5.9: every request of the page goes to the app's host", async ({ page, seededEvent, baseURL }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
    await selectTab(page, "Retour");
    expect([...origins]).toEqual([new URL(baseURL!).origin]);
  });

  test("does not scroll sideways at 360 px, on either tab", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    expect(await horizontalOverflow(page)).toBe(0);
    await selectTab(page, "Retour");
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("event page, without retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("C2.4, C5.4: no tab, the aller and its empty state shown directly", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    const legs = page.locator("header dl");
    await expect(legs.locator("dt")).toHaveText(["Aller"]);
    await expect(legs.locator("dd")).toHaveText([FR.aller]);

    await expect(page.getByText(FR.noCarAller)).toBeVisible();
    await expect(page.getByText(FR.nobody)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByText("Retour")).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("event page, with the longest title and place without a space", () => {
  const title = "W".repeat(80);
  const location = "W".repeat(120);
  test.use({ locale: "fr-FR", eventFields: { title, location } });

  test("C1.10: wraps them instead of scrolling sideways at 360 px", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText(location)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await selectTab(page, "Retour");
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

for (const timezoneId of ["America/New_York", "Europe/Paris"]) {
  test.describe(`event page, in a browser set to ${timezoneId}`, () => {
    test.use({ locale: "fr-FR", timezoneId });

    test("C1.12: shows the times of the event's place, unchanged", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
      await expect(page.locator("header dd")).toHaveText([FR.aller, FR.retour]);
      await expect(page.getByRole("tabpanel").locator("time")).toHaveText(FR.aller);
      await selectTab(page, "Retour");
      await expect(page.getByRole("tabpanel").locator("time")).toHaveText(FR.retour);
    });
  });
}

test.describe("event page, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C5.1, C7.1: speaks English, dates included", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("header dt")).toHaveText(["Outbound", "Return"]);
    await expect(page.locator("header dd")).toHaveText([
      /^Saturday, December 12, 2026 at 7:30\sAM$/,
      /^Saturday, December 12, 2026 at 6:00\sPM$/,
    ]);
    await expect(page.getByRole("tab")).toHaveText(["Outbound", "Return"]);
    await expect(page.getByRole("tabpanel").getByText("No car offered for the outbound trip")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Nobody has signed up yet.")).toBeVisible();
    await selectTab(page, "Return");
    await expect(page.getByRole("tabpanel").getByText("No car offered for the return trip")).toBeVisible();
  });
});

test.describe("event page, in a browser set to German", () => {
  test.use({ locale: "de-DE" });

  test("C7.1: falls back to French", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("tabpanel").getByText(FR.noCarAller)).toBeVisible();
  });
});

test.describe("event not found", () => {
  test.use({ locale: "fr-FR" });

  test("C6.1: a well-formed unknown id answers 404, says what to check, and leads to /", async ({ page }) => {
    const response = await page.goto(`/e/${UNKNOWN_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement introuvable");
    await expect(page.getByText(/Vérifiez le lien/)).toBeVisible();
    await expect(page.getByText(/Les majuscules et les minuscules comptent\./)).toBeVisible();
    await expect(page.getByText(/supprimés 30\sjours après leur date/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Créer un événement" })).toHaveAttribute("href", "/");
    // Next adds its own `noindex` to a 404; ours is there as well.
    await expect(page.locator('meta[name="robots"][content="noindex, nofollow"]')).toHaveCount(1);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("C6.1: the link leads to the home page", async ({ page }) => {
    await page.goto(`/e/${UNKNOWN_ID}`);
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expect(page).toHaveURL("/");
  });

  test("C6.2, C6.3: malformed, unknown and miscased ids get the same page and the same status", async ({
    page,
    seededEvent,
  }) => {
    const seen = async (id: string) => {
      const response = await page.goto(`/e/${encodeURIComponent(id)}`);
      return {
        status: response?.status(),
        title: await page.title(),
        text: await page.locator("main").innerText(),
      };
    };
    const unknown = await seen(UNKNOWN_ID);
    expect(unknown.status).toBe(404);
    for (const id of [
      swapOneCase(seededEvent.id),
      "Ab3dEf7",
      "Ab3dEf7hj",
      "Ab3dEf70",
      "Ab3dEf7O",
      "Ab3dEf71",
      "Ab3dEf7l",
      "Ab3dEf7I",
      "Ab3d f7h",
    ]) {
      expect(await seen(id), id).toEqual(unknown);
    }
  });
});

test.describe("event not found, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C6.1, C7.1: speaks English", async ({ page }) => {
    const response = await page.goto(`/e/${UNKNOWN_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Event not found");
    await expect(page.getByText(/Upper and lower case matter\./)).toBeVisible();
    await expect(page.getByText(/deleted 30\sdays after their date/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/");
  });
});
