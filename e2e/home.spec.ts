import { expect, test, type Page } from "@playwright/test";

/** The home page's words (#232, design v2.1, docs/design/home/README.md). */
const FR = {
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
  intro:
    "Un match, un mariage, un week-end au ski : partagez un seul lien, et chacun voit qui conduit, où il reste des places et qui n’a pas encore de voiture.",
  create: "Créer un événement",
  myEvents: "Mes événements",
  howItWorks: "Comment ça marche",
  steps: [
    [
      "Créez l’événement",
      "Un titre, un lieu, l’heure de début et, s’il y a un retour, l’heure de fin. Sans compte ni adresse e-mail.",
    ],
    ["Partagez le lien", "Par SMS ou dans le groupe. Chacun s’inscrit, propose une voiture ou prend une place libre."],
    [
      "Suivez qui reste sans voiture",
      "Un bandeau dit combien de personnes sont encore sans voiture, et s’il manque des places.",
    ],
  ],
  // A non-breaking space, as in « Événement introuvable »: « 30 » never ends a line alone.
  deleted: "Les événements sont supprimés 30 jours après leur date.",
};
type Words = typeof FR;
const EN: Words = {
  tagline: "Group carpooling, there and back, no account needed.",
  intro:
    "A match, a wedding, a ski weekend: share one link, and everyone sees who is driving, where seats are free and who still has no car.",
  create: "Create an event",
  myEvents: "My events",
  howItWorks: "How it works",
  steps: [
    [
      "Create the event",
      "A title, a place, the start time and, if there is a return trip, the end time. No account, no email address.",
    ],
    ["Share the link", "By text message or in the group chat. Everyone signs up, offers a car or takes a free seat."],
    ["See who still has no car", "A banner shows how many people still have no car, and whether seats are missing."],
  ],
  deleted: "Events are deleted 30 days after their date.",
};

const createLink = (page: Page, words: Words) => page.getByRole("link", { name: words.create, exact: true });

/** A1.1: `/` answers 200 and holds, in this order, the home page's blocks, and nothing else before its footer. */
async function expectHome(page: Page, words: Words) {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fullcar");

  // The page's content in the order of the document, its footer aside.
  const content = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll("h1, h2, h3, p, a")]
      .filter((element) => !element.closest("footer"))
      .map((element) => `${element.tagName} ${element.textContent?.trim()}`),
  );
  expect(content).toEqual([
    "H1 Fullcar",
    `P ${words.tagline}`,
    `P ${words.intro}`,
    `A ${words.create}`,
    `A ${words.myEvents}`,
    `H2 ${words.howItWorks}`,
    ...words.steps.flatMap(([title, text]) => [`H3 ${title}`, `P ${text}`]),
    `P ${words.deleted}`,
  ]);

  await expect(createLink(page, words)).toHaveCount(1);
  await expect(createLink(page, words)).toHaveAttribute("href", "/nouveau");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(words.howItWorks);

  // One ordered list of three steps, each its h3 then its paragraph.
  const list = page.locator("main ol");
  await expect(list).toHaveCount(1);
  const steps = list.locator("> li");
  await expect(steps).toHaveCount(3);
  for (const [index, [title, text]] of words.steps.entries()) {
    await expect(steps.nth(index).getByRole("heading", { level: 3 })).toHaveText(title);
    await expect(steps.nth(index).locator("p")).toHaveText(text);
    // Its rank, shown, but hidden from screen readers: the list gives it.
    await expect(steps.nth(index).locator(':scope > [aria-hidden="true"]')).toHaveText(String(index + 1));
  }

  // Safari exposes a list without bullets as a list only with its role: Chromium would without.
  await expect(list).toHaveAttribute("role", "list");
  // What a screen reader gets: a list of three items, each its title and its text, and no number.
  await expect(list).toMatchAriaSnapshot(
    [
      "- list:",
      "  - /children: equal",
      ...words.steps.flatMap(([title, text]) => [
        "  - listitem:",
        "    - /children: equal",
        `    - heading ${JSON.stringify(title)} [level=3]`,
        `    - paragraph: ${JSON.stringify(text)}`,
      ]),
    ].join("\n"),
  );
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("home in a browser set to German", () => {
  test.use({ locale: "de-DE" });

  test("falls back to French", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText(FR.tagline, { exact: true })).toBeVisible();
  });
});

test.describe("home in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("speaks English", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText(EN.tagline, { exact: true })).toBeVisible();
  });

  test("A1.5: shows the English words", async ({ page }) => {
    await expectHome(page, EN);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("home", () => {
  test.use({ locale: "fr-FR" });

  test("A1.1: answers 200 with the title, the tagline, the intro, one link to /nouveau, the three steps and the deletion", async ({
    page,
  }) => {
    await expectHome(page, FR);
  });

  test("A1.2: at 360 × 780, the link is whole without scrolling, 44 px tall at least, as wide as the column", async ({
    page,
  }) => {
    await page.goto("/");
    const link = createLink(page, FR);
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await link.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBe(328);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("A1.3: has no field and no Créer button", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Créer", exact: true })).toHaveCount(0);
  });

  // The end-to-end tests run against what Vercel serves (`next build`, `next start`), not `next dev`.
  test("is served by the production build", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((url) => /development|hmr-client/.test(url))).toEqual([]);
  });

  test("sends no referrer", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("loads no web font", async ({ page }) => {
    const fonts: string[] = [];
    page.on("request", (r) => r.resourceType() === "font" && fonts.push(r.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(fonts).toEqual([]);
  });

  test("does not scroll sideways at 360 px", async ({ page }) => {
    await page.goto("/");
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("home on a computer, 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("A1.2: the 448 px column is centred, at the top, and the link takes its whole width", async ({ page }) => {
    await page.goto("/");
    const main = (await page.locator("main").boundingBox())!;
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(main.width).toBe(448);
    expect(Math.abs(main.x - (width - main.x - main.width))).toBeLessThanOrEqual(1);
    expect((await page.getByRole("heading", { level: 1 }).boundingBox())!.y).toBe(16);
    expect((await createLink(page, FR).boundingBox())!.width).toBe(416);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("home without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("A1.4: Créer un événement leads to /nouveau, which says creation needs JavaScript", async ({ page }) => {
    await page.goto("/");
    await createLink(page, FR).click();
    await expect(page).toHaveURL(/\/nouveau$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(FR.create);
    // getByText skips what a <noscript> holds: its paragraph is reached by CSS.
    await expect(page.locator("form noscript > p")).toHaveText(
      "La création d’un événement nécessite JavaScript : activez-le, puis rechargez la page.",
    );
  });
});
