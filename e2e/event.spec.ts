import type { Page } from "@playwright/test";
import { PUBLIC_ID_ALPHABET } from "@/domain/public-id";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath } from "./organiser";

// D1.6 opens the organiser's page with its token.
leaveNoToken();

// The seed (src/db/test-events.ts): aller on 2026-12-12 at 07:30, retour the same day at 18:00.
// v4.3 (#235): the header names them « Début » and « Fin », the end its time alone that day.
const FR = {
  dates: ["Début", "Fin"],
  start: /^samedi 12 décembre 2026 à 07:30$/,
  end: /^18:00$/,
  datetime: ["2026-12-12T07:30", "2026-12-12T18:00"],
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

/** D1.1: the seeded event's header, « Début » in full, « Fin » its time alone, each `<time>` complete. */
async function expectSameDayHeader(page: Page) {
  const header = page.locator("header");
  await expect(header.locator("dt")).toHaveText(FR.dates);
  await expect(header.locator("dd")).toHaveText([FR.start, FR.end]);
  await expect(header.locator("time")).toHaveCount(2);
  await expect(header.locator("time").nth(0)).toHaveAttribute("datetime", FR.datetime[0]);
  await expect(header.locator("time").nth(1)).toHaveAttribute("datetime", FR.datetime[1]);
}

/** D1.8: how far each `dt` of the header sits from the top of its `dd`, in px. */
async function dtOffsets(page: Page): Promise<number[]> {
  return page.locator("header dl").evaluate((dl) =>
    Array.from(dl.querySelectorAll("dt"), (dt) => {
      const dd = dt.nextElementSibling as HTMLElement;
      return Math.abs(dt.getBoundingClientRect().top - dd.getBoundingClientRect().top);
    }),
  );
}

test.describe("event page, with a retour", () => {
  test.use({ locale: "fr-FR" });

  test("C5.1, D1.1: shows the title, the place, the start, and the end without its date that day", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    await expect(page.getByText("Gymnase des Gayeulles")).toBeVisible();
    await expectSameDayHeader(page);
  });

  test("D1.4: the header names no leg, the tabs keep theirs", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.locator("header dt")).toHaveText(FR.dates);
    await expect(page.locator("header")).not.toContainText(/Aller|Retour/);
    await expect(page.getByRole("tab")).toHaveText(["Aller", "Retour"]);
  });

  test("C5.2, C9.6: Aller is selected first, with its empty state, both actions and no date line", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["Aller", "Retour"]);
    await expect(page.getByRole("tab", { name: "Aller" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Retour" })).toHaveAttribute("aria-selected", "false");

    const panel = page.getByRole("tabpanel");
    // v4.1: the header's line « Aller » says it already.
    await expect(panel.locator("time")).toHaveCount(0);
    await expect(panel.getByText(FR.noCarAller)).toBeVisible();
    await expect(panel.getByText(FR.nobody)).toBeVisible();
    // C9.6, in place of C5.3's « no button »: an empty event can be joined from its empty state.
    await expect(panel.getByRole("button")).toHaveText(["Ajouter une personne", "Proposer une voiture"]);
    await expect(panel.getByRole("button", { name: "Ajouter une personne" })).toBeEnabled();
    await expect(panel.getByRole("button", { name: "Proposer une voiture" })).toBeEnabled();
  });

  test("C5.2, C5.3: Retour shows its own empty state, no date line, without reload nor URL change", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const url = page.url();
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));

    await selectTab(page, "Retour");
    await expect(page.getByRole("tab", { name: "Aller" })).toHaveAttribute("aria-selected", "false");
    const panel = page.getByRole("tabpanel");
    await expect(panel.locator("time")).toHaveCount(0);
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

  test("C2.4, C5.4, D1.3: no tab, no end, the aller and its empty state shown directly", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tournoi de Rennes");
    const header = page.locator("header");
    await expect(header.locator("dt")).toHaveText(["Début"]);
    await expect(header.locator("dd")).toHaveText([FR.start]);
    await expect(header).not.toContainText("Fin");

    await expect(page.getByText(FR.noCarAller)).toBeVisible();
    await expect(page.getByText(FR.nobody)).toBeVisible();
    // v4.1: no date line under the header's, without a retour either.
    const aller = page.getByRole("region", { name: "Aller", exact: true });
    await expect(aller.getByText(FR.noCarAller)).toBeVisible();
    await expect(aller.locator("time")).toHaveCount(0);
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
      await expect(page.locator("header dd")).toHaveText([FR.start, FR.end]);
    });
  });
}

// D1.2: an end on another day shows its own date, after midnight as over several days.
for (const { retourAt, end } of [
  { retourAt: "2026-12-13 01:00:00", end: /^dimanche 13 décembre 2026 à 01:00$/ },
  { retourAt: "2026-12-14 17:00:00", end: /^lundi 14 décembre 2026 à 17:00$/ },
]) {
  test.describe(`event page, ending on ${retourAt}`, () => {
    test.use({ locale: "fr-FR", eventFields: { allerAt: "2026-12-12 20:00:00", retourAt } });

    test("D1.2: the end shows its date and its time", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await expect(page.locator("header dt")).toHaveText(FR.dates);
      await expect(page.locator("header dd")).toHaveText([/^samedi 12 décembre 2026 à 20:00$/, end]);
    });
  });
}

// #625: the first of a month is « 1er » in French, « 1 » in English, wherever a date shows.
for (const { locale, dates } of [
  { locale: "fr-FR", dates: [/^samedi 1er mai 2027 à 08:00$/, /^dimanche 2 mai 2027 à 18:00$/] },
  { locale: "en-US", dates: [/^Saturday, May 1, 2027 at 8:00\sAM$/, /^Sunday, May 2, 2027 at 6:00\sPM$/] },
]) {
  test.describe(`event page on 1 May, in ${locale}`, () => {
    test.use({ locale, eventFields: { allerAt: "2027-05-01 08:00:00", retourAt: "2027-05-02 18:00:00" } });

    test("#625: the first of the month is written as the language writes it", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await expect(page.locator("header dd")).toHaveText(dates);
    });
  });
}

// D1.7: « the same day » is the event's place's, whatever the browser's zone, on both sides of midnight.
for (const { retourAt, end } of [
  { retourAt: "2026-12-12 23:30:00", end: /^23:30$/ },
  { retourAt: "2026-12-13 00:30:00", end: /^dimanche 13 décembre 2026 à 00:30$/ },
]) {
  test.describe(`event page ending on ${retourAt}, in a browser set to America/New_York`, () => {
    test.use({
      locale: "fr-FR",
      timezoneId: "America/New_York",
      eventFields: { allerAt: "2026-12-12 20:00:00", retourAt },
    });

    test("D1.7: the same day is read on the wall clock", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
      await expect(page.locator("header dd")).toHaveText([/^samedi 12 décembre 2026 à 20:00$/, end]);
    });
  });
}

// D1.8: the longest header, two full dates, at 360 px in both languages.
for (const { locale, dates } of [
  { locale: "fr-FR", dates: FR.dates },
  { locale: "en-GB", dates: ["Start", "End"] },
]) {
  test.describe(`event page over two days, in ${locale}, at 360 px`, () => {
    test.use({
      locale,
      viewport: { width: 360, height: 780 },
      eventFields: { allerAt: "2026-12-12 20:00:00", retourAt: "2026-12-14 17:00:00" },
    });

    test("D1.8: no sideways scroll, and each dt on the first line of its dd", async ({ page, seededEvent }) => {
      await page.goto(`/e/${seededEvent.id}`);
      await expect(page.locator("header dt")).toHaveText(dates);
      expect(await horizontalOverflow(page)).toBe(0);
      const offsets = await dtOffsets(page);
      expect(offsets).toHaveLength(2);
      for (const offset of offsets) expect(offset).toBeLessThanOrEqual(4);
    });
  });
}

test.describe("event page, on the organiser's page", () => {
  test.use({ locale: "fr-FR" });

  test("D1.6: the same header as the event's page, under the organiser area", async ({ page, seededEvent }) => {
    // A failed navigation would print the URL, and the token in its fragment: named instead.
    await page.goto(organiserPath(seededEvent)).catch(() => {
      throw new Error("D1.6: the organiser's page did not load");
    });
    await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
    await expectSameDayHeader(page);
    await expect(page.locator("header")).not.toContainText(/Aller|Retour/);
  });
});

test.describe("event page, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C5.1, C7.1, D1.5: speaks English, dates included", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("header dt")).toHaveText(["Start", "End"]);
    await expect(page.locator("header dd")).toHaveText([/^Saturday, December 12, 2026 at 7:30\sAM$/, /^6:00\sPM$/]);
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

  test("C6.1, A2.5: a well-formed unknown id answers 404, says what to check, and leads to /nouveau", async ({
    page,
  }) => {
    const response = await page.goto(`/e/${UNKNOWN_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement introuvable");
    await expect(page.getByText(/Vérifiez le lien/)).toBeVisible();
    await expect(page.getByText(/Les majuscules et les minuscules comptent\./)).toBeVisible();
    await expect(page.getByText(/supprimés 30\sjours après leur date/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Créer un événement" })).toHaveAttribute("href", "/nouveau");
    // Next adds its own `noindex` to a 404; ours is there as well.
    await expect(page.locator('meta[name="robots"][content="noindex, nofollow"]')).toHaveCount(1);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("C6.1, A2.5: the link leads to the creation form", async ({ page }) => {
    await page.goto(`/e/${UNKNOWN_ID}`);
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expect(page).toHaveURL("/nouveau");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer un événement");
  });

  test("A2.4: /e/nouveau is not an id, and answers 404 with Événement introuvable", async ({ page }) => {
    const response = await page.goto("/e/nouveau");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement introuvable");
    await expect(page).toHaveTitle("Événement introuvable");
  });

  test("C6.2, C6.3: malformed, unknown and miscased ids get the same page and the same status", async ({
    page,
    seededEvent,
  }) => {
    const seen = async (id: string) => {
      const response = await page.goto(`/e/${encodeURIComponent(id)}`);
      // The title is streamed after the page's content: waited for, not read at once.
      await expect(page, id).toHaveTitle("Événement introuvable");
      return {
        status: response?.status(),
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

// #142: Next 16.4 sends an empty document for a `notFound()` thrown while rendering; the
// 404's content only arrives with the scripts (docs/agents/architecture.md, Règles d'exécution).
const NOT_FOUND_PATHS = [`/e/${UNKNOWN_ID}`, `/e/${UNKNOWN_ID}/admin`];

test.describe("event not found, without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  for (const path of NOT_FOUND_PATHS) {
    test(`C6.1, C6.4: ${path} still answers 404, with Next's empty error document`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      // Pins the limit itself: the day Next renders the 404 on the server, this fails.
      const stale =
        "the 404 is no longer Next's empty error document: update the #142 paragraph of " +
        "docs/agents/architecture.md (Règles d'exécution), then this test";
      await expect(page.locator("html"), stale).toHaveAttribute("id", "__next_error__");
      // innerText, not textContent: the inlined scripts carry the render's data as text.
      await expect(page.locator("body"), stale).toHaveText("", { useInnerText: true });
    });
  }
});

test.describe("event not found, with JavaScript", () => {
  test.use({ locale: "fr-FR" });

  for (const path of NOT_FOUND_PATHS) {
    test(`C6.1, C6.4: ${path} shows its heading, its text and the footer`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement introuvable");
      await expect(page.getByText(/Vérifiez le lien/)).toBeVisible();
      await expect(page.getByText(/supprimés 30\sjours après leur date/)).toBeVisible();
      // Inside <main>, the footer has no `contentinfo` role: reached by its element.
      await expect(page.locator("footer").getByRole("link", { name: /^Nous contacter/ })).toBeVisible();
    });
  }
});

test.describe("event not found, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("C6.1, C7.1: speaks English", async ({ page }) => {
    const response = await page.goto(`/e/${UNKNOWN_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Event not found");
    await expect(page.getByText(/Upper and lower case matter\./)).toBeVisible();
    await expect(page.getByText(/deleted 30\sdays after their date/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/nouveau");
  });
});
