import { devices, type Locator, type Page, type Request } from "@playwright/test";
import { expect, expectUrl, leaveNoToken, test } from "./fixtures";

leaveNoToken();

const FR = {
  title: "Titre",
  location: "Lieu",
  allerDate: "Date de début",
  allerTime: "Heure de début",
  retour: "Retour",
  retourHint: "Décochez s’il n’y a pas de retour organisé.",
  retourDate: "Date de fin",
  retourTime: "Heure de fin",
  options: [
    ["Rehausseurs", "Pour les enfants qui en ont besoin."],
    ["Participation aux frais", "Un montant par passager, facultatif."],
    ["Points de RDV", "Des arrêts sur la route des voitures."],
  ],
  create: "Créer",
  required: "Champ requis.",
  notAfterAller: "La fin doit être après le début.",
  tooEarly: "Cette date est déjà passée.",
  tooLate: "Pas plus d’un an à l’avance.",
  failed: "Impossible de créer l’événement. Vérifiez la connexion, puis réessayez.",
  needsJavaScript: "La création d’un événement nécessite JavaScript : activez-le, puis rechargez la page.",
  panel: "Espace organisateur",
  tagline: "Le covoiturage de groupe, aller et retour, sans compte.",
};

/** Where the form is (#245, A2.1): `/` is to be the home page. */
const NEW_EVENT = "/nouveau";

/** Where a new event lands: its organiser's link, the secret in the fragment only (C1.5). */
const ARRIVAL = /\/e\/[2-9A-HJ-NP-Za-km-z]{8}\/admin#[A-Za-z0-9_-]{22}$/;

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const createButton = (page: Page, name = FR.create) => page.getByRole("button", { name });
// Within the page's content: Next's route announcer is an alert as well.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

/**
 * The form, once hydrated: "Créer" stays inactive until then. Hydration is waited for
 * longer than an assertion, since a loaded machine slows it and nothing here measures it.
 */
async function openForm(page: Page, create = FR.create) {
  await page.goto(NEW_EVENT);
  await expect(createButton(page, create)).toBeEnabled({ timeout: 15_000 });
}

/** The device's date, `days` from today, as an `<input type="date">` takes it. */
function deviceDate(page: Page, days = 0): Promise<string> {
  return page.evaluate((days) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  }, days);
}

/** The creation requests: a server action posted to the form's page. */
function creations(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === NEW_EVENT &&
      request.headers()["next-action"]
    ) {
      sent.push(request);
    }
  });
  return sent;
}

async function fillAller(page: Page, { title = "Sortie ski du club", days = 7 } = {}) {
  await field(page, FR.title).fill(title);
  await field(page, FR.location).fill("Chalet des Écureuils, La Clusaz");
  await field(page, FR.allerDate).fill(await deviceDate(page, days));
  await field(page, FR.allerTime).fill("07:30");
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function height(locator: Locator): Promise<number> {
  return (await locator.boundingBox())!.height;
}

test.describe("creating an event from /nouveau", () => {
  test.use({ locale: "fr-FR" });

  test("A2.1: /nouveau answers 200, titled Créer un événement, its h1 before the form", async ({ page }) => {
    const response = await page.goto(NEW_EVENT);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Créer un événement");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Créer un événement");
    // The format of « Événement introuvable », and no tagline: it is the home page's.
    await expect(heading).toHaveCSS("font-size", "24px");
    await expect(heading).toHaveCSS("font-weight", "700");
    await expect(page.getByText(FR.tagline)).toHaveCount(0);
    const order = await heading.evaluate((h1) => {
      const after = (node: Element | null) =>
        node !== null && (h1.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return { form: after(document.querySelector("form")), footer: after(document.querySelector("footer")) };
    });
    expect(order).toEqual({ form: true, footer: true });
  });

  test("C1.1, C1.2, C3.1: every field has a label, Retour is checked with its fields, the options are off", async ({
    page,
  }) => {
    await openForm(page);
    for (const label of [FR.title, FR.location, FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
      await expect(field(page, label)).toBeVisible();
      await expect(field(page, label)).toHaveValue("");
    }
    await expect(field(page, FR.retour)).toBeChecked();
    await expect(field(page, FR.retour)).toHaveAccessibleDescription(FR.retourHint);

    const options = page.getByRole("group", { name: "Options" });
    for (const [label, hint] of FR.options) {
      await expect(options.getByLabel(label, { exact: true })).not.toBeChecked();
      await expect(options.getByLabel(label, { exact: true })).toHaveAccessibleDescription(hint);
    }
  });

  test("D2.1: the date fields are named by the start and the end, the box is still Retour", async ({ page }) => {
    await openForm(page);
    for (const label of [FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
      await expect(field(page, label)).toHaveAccessibleName(label);
    }
    await expect(field(page, FR.retour)).toHaveAccessibleName(FR.retour);
    await expect(field(page, FR.retour)).toHaveAccessibleDescription(FR.retourHint);
    // The legs' names are gone from the fields.
    await expect(page.getByLabel(/aller|du retour/i)).toHaveCount(0);
  });

  test("C1.3, D2.3: the end date follows the start date until it is changed, the end time is not prefilled", async ({
    page,
  }) => {
    await openForm(page);
    const [inAWeek, inTwoWeeks, inThreeWeeks] = await Promise.all([7, 14, 21].map((days) => deviceDate(page, days)));
    await field(page, FR.allerDate).fill(inAWeek);
    await field(page, FR.allerTime).fill("07:30");
    await expect(field(page, FR.retourDate)).toHaveValue(inAWeek);
    await expect(field(page, FR.retourTime)).toHaveValue("");

    await field(page, FR.allerDate).fill(inTwoWeeks);
    await expect(field(page, FR.retourDate)).toHaveValue(inTwoWeeks);

    await field(page, FR.retourDate).fill(inThreeWeeks);
    await field(page, FR.allerDate).fill(inAWeek);
    await expect(field(page, FR.retourDate)).toHaveValue(inThreeWeeks);
  });

  test("C1.4, C1.5, C4.6, D2.3: six actions from /nouveau to the organiser's arrival, in less than 30 s", async ({
    page,
  }) => {
    const sent = creations(page);
    const start = Date.now();
    await openForm(page);
    await fillAller(page); // title, place, start date, start time: 4 actions
    await field(page, FR.retourTime).fill("18:00"); // end time: 5
    await createButton(page).click(); // 6

    await expectUrl(page, ARRIVAL, "the organiser's link");
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sortie ski du club");
    expect(Date.now() - start).toBeLessThan(30_000);
    expect(sent.length).toBe(1);
  });

  test("C1.5: the token comes in the creation's response body, and in no URL nor header on the way to the arrival", async ({
    page,
  }) => {
    // What leaves the browser: a URL's path and query string, never its fragment.
    const sent = (url: string) => {
      const { origin, pathname, search } = new URL(url);
      return `${origin}${pathname}${search}`;
    };
    const seen: Promise<string>[] = [];
    const creationBodies: Promise<string>[] = [];
    page.on("request", (request) => {
      seen.push(Promise.resolve(sent(request.url())), request.allHeaders().then((headers) => JSON.stringify(headers)));
    });
    page.on("response", (response) => {
      seen.push(Promise.resolve(sent(response.url())), response.allHeaders().then((headers) => JSON.stringify(headers)));
    });
    // The creation's body is read here, in Node: the browser navigates away at once and may
    // already have dropped it when a `response` handler asks for it.
    await page.route(
      (url) => url.pathname === NEW_EVENT,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch();
        const body = await response.text();
        creationBodies.push(Promise.resolve(body));
        await route.fulfill({ response, body });
      },
    );

    await openForm(page);
    await fillAller(page);
    await field(page, FR.retourTime).fill("18:00");
    // The check's answer, rather than the network going idle: a leak in an answer the page
    // never reads must fail on the token, not on a timeout.
    const checked = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && /^\/e\/\w{8}\/admin$/.test(new URL(response.url()).pathname),
    );
    await createButton(page).click();
    await checked;
    await expectUrl(page, ARRIVAL, "the organiser's link");
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();

    const token = new URL(page.url()).hash.slice(1);
    expect((await Promise.all(creationBodies)).filter((body) => body.includes(token)).length, "creation answers holding the token").toBe(1);
    const texts = await Promise.all(seen);
    // The arrival itself was watched: the App Router's fetch of the organiser's page.
    expect(texts.filter((text) => /\/e\/\w{8}\/admin\?_rsc=/.test(text)).length).toBeGreaterThan(0);
    expect(texts.filter((text) => text.includes(token)).length, "URLs and headers holding the token").toBe(0);
  });

  test("C2.1, C2.2, D2.3: unchecking Retour hides both end fields, and six actions create an event without a retour", async ({
    page,
  }) => {
    await openForm(page);
    await fillAller(page);
    await field(page, FR.retour).click(); // 5
    await expect(field(page, FR.retour)).not.toBeChecked();
    await expect(field(page, FR.retourDate)).toHaveCount(0);
    await expect(field(page, FR.retourTime)).toHaveCount(0);
    await createButton(page).click(); // 6

    await expectUrl(page, ARRIVAL, "the organiser's link");
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
  });

  test("C1.6: sent empty, creates nothing, shows each error by its field, focuses the first, keeps the values", async ({
    page,
  }) => {
    const sent = creations(page);
    await openForm(page);
    await createButton(page).click();

    for (const label of [FR.title, FR.location, FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
      await expect(field(page, label)).toHaveAttribute("aria-invalid", "true");
      await expect(field(page, label)).toHaveAccessibleDescription(FR.required);
    }
    await expect(field(page, FR.title)).toBeFocused();

    await field(page, FR.location).fill("Chalet des Écureuils");
    await field(page, FR.allerTime).fill("07:30");
    await createButton(page).click();
    await expect(field(page, FR.title)).toBeFocused();
    await expect(field(page, FR.location)).toHaveValue("Chalet des Écureuils");
    await expect(field(page, FR.allerTime)).toHaveValue("07:30");
    await expect(field(page, FR.location)).not.toHaveAttribute("aria-invalid", "true");
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    expect(sent.length).toBe(0);
  });

  test("C1.7, D2.2: an end not after the start is refused, on the end's field, and nothing is created", async ({
    page,
  }) => {
    const sent = creations(page);
    await openForm(page);
    await fillAller(page);
    // An end time before the start's, on the same day.
    await field(page, FR.retourTime).fill("07:00");
    await createButton(page).click();
    await expect(field(page, FR.retourTime)).toHaveAccessibleDescription(FR.notAfterAller);
    await expect(field(page, FR.retourTime)).toBeFocused();

    // An end equal to the start.
    await field(page, FR.retourTime).fill("07:30");
    await createButton(page).click();
    await expect(field(page, FR.retourTime)).toHaveAccessibleDescription(FR.notAfterAller);
    await expect(field(page, FR.retourTime)).toBeFocused();

    // An end date the day before the start date.
    await field(page, FR.retourDate).fill(await deviceDate(page, 6));
    await field(page, FR.retourTime).fill("18:00");
    await createButton(page).click();
    await expect(field(page, FR.retourDate)).toHaveAccessibleDescription(FR.notAfterAller);
    await expect(field(page, FR.retourDate)).toBeFocused();
    await expect(field(page, FR.retourTime)).not.toHaveAttribute("aria-invalid", "true");
    expect(sent.length).toBe(0);
  });

  test("C1.8, D2.3: a start before the device's today, or after today + 365 days, is refused", async ({ page }) => {
    const sent = creations(page);
    await openForm(page);
    await fillAller(page, { days: -1 });
    await field(page, FR.retour).click();
    await createButton(page).click();
    await expect(field(page, FR.allerDate)).toHaveAccessibleDescription(FR.tooEarly);

    await field(page, FR.allerDate).fill(await deviceDate(page, 366));
    await createButton(page).click();
    await expect(field(page, FR.allerDate)).toHaveAccessibleDescription(FR.tooLate);

    await field(page, FR.allerDate).fill(await deviceDate(page, 365));
    await field(page, FR.retour).click();
    await field(page, FR.retourDate).fill(await deviceDate(page, 366));
    await field(page, FR.retourTime).fill("18:00");
    await createButton(page).click();
    await expect(field(page, FR.retourDate)).toHaveAccessibleDescription(FR.tooLate);
    await expect(field(page, FR.allerDate)).not.toHaveAttribute("aria-invalid", "true");
    expect(sent.length).toBe(0);
  });

  test("C1.9: the server's errors are shown by field, when the device's clock is ahead", async ({ page }) => {
    const sent = creations(page);
    // 400 days ahead: the device's today is past the server's today + 366.
    await page.clock.setFixedTime(new Date(Date.now() + 400 * 24 * 60 * 60 * 1000));
    await openForm(page);
    await fillAller(page, { days: 0 });
    await field(page, FR.retour).click();
    await createButton(page).click();

    await expect(field(page, FR.allerDate)).toHaveAccessibleDescription(FR.tooLate);
    await expect(field(page, FR.allerDate)).toBeFocused();
    await expect(field(page, FR.title)).toHaveValue("Sortie ski du club");
    await expect(createButton(page)).toBeEnabled();
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    expect(sent.length).toBe(1);
  });

  test("C1.10: an 80-character title and a 120-character place do not overflow at 360 px", async ({ page }) => {
    await openForm(page);
    await fillAller(page, { title: "W".repeat(80) });
    await field(page, FR.location).fill("M".repeat(120));
    expect(await horizontalOverflow(page)).toBe(0);

    await field(page, FR.retourTime).fill("18:00");
    await createButton(page).click();
    await expectUrl(page, ARRIVAL, "the organiser's link");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("W".repeat(80));
    await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("C1.11: two quick taps on Créer send one request, and the button is inactive while sending", async ({
    page,
  }) => {
    const sent = creations(page);
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === NEW_EVENT,
      async (route) => {
        if (route.request().method() === "POST") await released;
        await route.continue();
      },
    );

    await openForm(page);
    await fillAller(page);
    await field(page, FR.retourTime).fill("18:00");
    await createButton(page).dblclick();
    await expect(createButton(page)).toBeDisabled();
    await expect.poll(() => sent.length).toBe(1);

    release();
    await expectUrl(page, ARRIVAL, "the organiser's link");
    expect(sent.length).toBe(1);
  });

  test("C7.3: Créer is 44 px high, the boxes are 44 px targets, the fields 40 px", async ({ page }) => {
    await openForm(page);
    expect(await height(createButton(page))).toBeGreaterThanOrEqual(44);
    for (const label of [FR.title, FR.location, FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
      expect(await height(field(page, label)), label).toBe(40);
    }
    // The whole row of a box toggles it, its explanation included.
    for (const [label, hint] of [[FR.retour, FR.retourHint], ...FR.options]) {
      const row = page.locator("label").filter({ hasText: hint });
      expect(await height(row), label).toBeGreaterThanOrEqual(44);
      const checked = await field(page, label).isChecked();
      await page.getByText(hint).click();
      await expect(field(page, label)).toBeChecked({ checked: !checked });
    }
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("offline: one alert above Créer, no stale field error, the values kept, and a new try once back online succeeds", async ({
    page,
    context,
  }) => {
    await openForm(page);
    // First sent empty: the errors it shows must not outlive the fields being filled.
    await createButton(page).click();
    await expect(field(page, FR.title)).toHaveAccessibleDescription(FR.required);
    await fillAller(page);
    await field(page, FR.retourTime).fill("18:00");
    await context.setOffline(true);
    await createButton(page).click();

    await expect(alert(page)).toHaveText(FR.failed);
    for (const label of [FR.title, FR.location, FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
      await expect(field(page, label), label).not.toHaveAttribute("aria-invalid", "true");
      await expect(field(page, label), label).toHaveAccessibleDescription("");
    }
    await expect(page.getByText(FR.required)).toHaveCount(0);
    const alertBox = (await alert(page).boundingBox())!;
    expect(alertBox.y + alertBox.height).toBeLessThanOrEqual((await createButton(page).boundingBox())!.y);
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    await expect(field(page, FR.title)).toHaveValue("Sortie ski du club");
    await expect(field(page, FR.retourTime)).toHaveValue("18:00");

    await context.setOffline(false);
    await createButton(page).click();
    await expectUrl(page, ARRIVAL, "the organiser's link");
  });

  test("server error: the same alert, with no technical detail, and the values kept", async ({ page }) => {
    await page.route(
      (url) => url.pathname === NEW_EVENT,
      (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 500, body: "Internal Server Error: relation event" })
          : route.continue(),
    );
    await openForm(page);
    await fillAller(page);
    await field(page, FR.retourTime).fill("18:00");
    await createButton(page).click();

    await expect(alert(page)).toHaveText(FR.failed);
    await expect(page.getByText("Internal Server Error")).toHaveCount(0);
    await expect(field(page, FR.title)).toHaveValue("Sortie ski du club");
    await expect(createButton(page)).toBeEnabled();
  });
});

/**
 * The date and time of each leg, side by side: each field within its own column, the date
 * left of the time, the time short of the form's right edge, and nothing scrolls sideways.
 */
async function expectDateAndTimeSideBySide(page: Page) {
  const form = (await page.locator("form").boundingBox())!;
  for (const [date, time] of [
    [FR.allerDate, FR.allerTime],
    [FR.retourDate, FR.retourTime],
  ]) {
    const dateBox = (await field(page, date).boundingBox())!;
    const timeBox = (await field(page, time).boundingBox())!;
    expect(dateBox.x, date).toBeGreaterThanOrEqual(form.x);
    expect(dateBox.x + dateBox.width, `${date} overlaps ${time}`).toBeLessThan(timeBox.x);
    expect(timeBox.x + timeBox.width, `${time} past the form's edge`).toBeLessThanOrEqual(form.x + form.width);
    expect(Math.abs(dateBox.y - timeBox.y), `${date} and ${time} on one row`).toBeLessThan(1);
  }
  expect(await horizontalOverflow(page)).toBe(0);
}

async function fillDatesAndTimes(page: Page) {
  await field(page, FR.allerDate).fill(await deviceDate(page, 7));
  await field(page, FR.allerTime).fill("07:30");
  await field(page, FR.retourTime).fill("18:00");
}

test.describe("the date and time fields side by side (#114)", () => {
  test.use({ locale: "fr-FR" });

  test("stay in their columns at 360 px", async ({ page }) => {
    await openForm(page);
    await expectDateAndTimeSideBySide(page);
    await fillDatesAndTimes(page);
    await expectDateAndTimeSideBySide(page);
  });

  // Safari on iOS gives a date or time field of native appearance a minimum width, that of
  // its longest value, padding not included: wider than its column at 390 px, past
  // `min-w-0` (WebKit's RenderThemeIOS). Playwright's WebKit has the desktop theme, which
  // does not: the geometry passes there either way, and the appearance is what is left to
  // check, on the same engine. Launched from this project, so that `make e2e` runs it too.
  for (const width of [360, 390]) {
    test(`have no native appearance under WebKit, and stay in their columns with its desktop theme at ${width} px`, async ({
      playwright,
      baseURL,
    }) => {
      // Without the project's Chromium launch options, which WebKit refuses.
      const browser = await playwright.webkit.launch({ channel: undefined, args: [] });
      try {
        const context = await browser.newContext({
          ...devices["iPhone 13"],
          viewport: { width, height: 780 },
          locale: "fr-FR",
          baseURL,
        });
        try {
          const page = await context.newPage();
          await openForm(page);
          for (const label of [FR.allerDate, FR.allerTime, FR.retourDate, FR.retourTime]) {
            await expect(field(page, label), label).toHaveCSS("appearance", "none");
          }
          await expectDateAndTimeSideBySide(page);
          await fillDatesAndTimes(page);
          await expectDateAndTimeSideBySide(page);
        } finally {
          // No trace of this context: leaveNoToken() turns traces off for the whole file,
          // whose creations reach the organiser's page, and Playwright takes a trace
          // setting per file, not per describe.
          await context.close();
        }
      } finally {
        await browser.close();
      }
    });
  }
});

test.describe("creating an event without JavaScript", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("A1.4: /nouveau says creation needs JavaScript, keeps Créer inactive, and sends nothing", async ({ page }) => {
    const sent: Request[] = [];
    page.on("request", (request) => request.method() !== "GET" && sent.push(request));
    await page.goto(NEW_EVENT);
    // getByText skips what a <noscript> holds: its paragraph is reached by CSS.
    const message = page.locator("form noscript > p");
    await expect(message).toBeVisible();
    await expect(message).toHaveText(FR.needsJavaScript);
    await expect(createButton(page)).toBeDisabled();

    await field(page, FR.title).fill("Sortie ski du club");
    await field(page, FR.title).press("Enter");
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    expect(sent.length).toBe(0);
  });
});

test.describe("creating an event in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("A2.1: /nouveau answers 200, titled Create an event", async ({ page }) => {
    const response = await page.goto(NEW_EVENT);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Create an event");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create an event");
  });

  test("C7.1: speaks English", async ({ page }) => {
    await page.goto(NEW_EVENT);
    await expect(page.getByRole("button", { name: "Create" })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveAccessibleDescription("Required.");
    await expect(page.getByLabel("Return", { exact: true })).toBeChecked();
    await expect(page.getByLabel("End time", { exact: true })).toHaveAccessibleDescription("Required.");
  });

  test("D2.1: the date fields are Start date, Start time, End date, End time, the box is still Return", async ({
    page,
  }) => {
    await openForm(page, "Create");
    for (const label of ["Start date", "Start time", "End date", "End time"]) {
      await expect(field(page, label)).toHaveAccessibleName(label);
    }
    await expect(field(page, "Return")).toBeChecked();
    await expect(field(page, "Return")).toHaveAccessibleDescription("Untick if no return trip is organised.");
    await expect(page.getByLabel(/outbound|return (date|time)/i)).toHaveCount(0);
  });

  test("D2.2: an end before the start says so in English, on the end's field, and nothing is created", async ({
    page,
  }) => {
    const sent = creations(page);
    await openForm(page, "Create");
    await field(page, "Title").fill("Club ski trip");
    await field(page, "Place").fill("La Clusaz");
    await field(page, "Start date").fill(await deviceDate(page, 7));
    await field(page, "Start time").fill("07:30");
    await field(page, "End time").fill("07:00");
    await createButton(page, "Create").click();
    await expect(field(page, "End time")).toHaveAccessibleDescription("The end must be after the start.");

    await field(page, "End date").fill(await deviceDate(page, 6));
    await field(page, "End time").fill("18:00");
    await createButton(page, "Create").click();
    await expect(field(page, "End date")).toHaveAccessibleDescription("The end must be after the start.");
    await expectUrl(page, /\/nouveau$/, "still the creation form");
    expect(sent.length).toBe(0);
  });
});
