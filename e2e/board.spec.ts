import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { expect, leaveNoToken, test } from "./fixtures";
import { hideToken, htmlByLegSection } from "./organiser";

leaveNoToken();

/*
 * #86: the cars, their passengers, the persons without a car and the coverage of each leg,
 * as the server renders them for anyone holding the link. No action yet.
 */

type Db = Kysely<Database>;

/** A person of the event; the seed draws the rest. Only the id is kept. */
async function person(db: Db, eventId: string, firstName: string, phone: string | null = null): Promise<string> {
  return (await seedPerson(db, eventId, { firstName, phone })).id;
}

async function place(db: Db, eventId: string, personId: string, leg: Leg, rideId: string | null) {
  await seedPlacement(db, { personId, eventId, leg, rideId });
}

const PHONES = { marc: "06 19 28 37 46", lea: "07 64 53 42 31", tom: "+33 6 98 76 54 32", zoe: "06 47 38 29 10" };

/**
 * Aller: Marc drives Léa (3 seats, a note), Tom is without a car, Zoé is not concerned.
 * Retour: Zoé drives Tom (1 seat: full), Léa is without a car, Marc is not concerned.
 */
async function seedScene(db: Db, eventId: string) {
  const marc = await person(db, eventId, "Marc", PHONES.marc);
  const lea = await person(db, eventId, "Léa", PHONES.lea);
  const tom = await person(db, eventId, "Tom", PHONES.tom);
  const zoe = await person(db, eventId, "Zoé", PHONES.zoe);
  const aller = await seedRide(db, eventId, marc, { note: "Devant la boulangerie" });
  const retour = await seedRide(db, eventId, zoe, {
    leg: "retour",
    location: "Parking du gymnase",
    departureTime: "18:30:00",
    seats: 1,
  });
  await place(db, eventId, lea, "aller", aller);
  await place(db, eventId, tom, "aller", null);
  await place(db, eventId, tom, "retour", retour);
  await place(db, eventId, lea, "retour", null);
}

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

function car(scope: Page | Locator, driver: string): Locator {
  return scope.getByRole("article", { name: `Voiture de ${driver}` });
}

/** Whether two boxes share a line: each starts above where the other ends. */
async function onOneLine(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  return boxA!.y < boxB!.y + boxB!.height && boxB!.y < boxA!.y + boxA!.height;
}

/** Whether `a` starts where `b` ends, or further right. */
async function rightOf(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  return boxA!.x >= boxB!.x + boxB!.width;
}

/** Whether `a` starts where `b` ends, or further down. */
async function below(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  return boxA!.y >= boxB!.y + boxB!.height;
}

/** Each tab's height, Aller first. */
async function tabHeights(page: Page): Promise<number[]> {
  return page.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().height));
}

function withoutCar(scope: Page | Locator): Locator {
  return scope.getByRole("region", { name: "Sans voiture" });
}

/** The headings of the page's content, in document order, as `h{level} {text}`. */
function outline(page: Page): Promise<string[]> {
  return page
    .getByRole("main")
    .getByRole("heading")
    .evaluateAll((headings) => headings.map((heading) => `${heading.tagName.toLowerCase()} ${heading.textContent}`));
}

test.describe("board, with a retour", () => {
  test.use({ locale: "fr-FR" });

  test.beforeEach(async ({ db, seededEvent }) => {
    await seedScene(db, seededEvent.id);
  });

  test("C4.3, C4.2: a card shows its driver, place, time, note, passengers and free seats, on its leg only", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    const marc = car(panel, "Marc");
    await expect(marc).toContainText("Mairie de Cesson");
    await expect(marc.locator("time")).toHaveText("07:15");
    await expect(marc).toContainText("Devant la boulangerie");
    await expect(marc.getByRole("listitem")).toHaveText(["Léa", "Place libre", "Place libre"]);
    await expect(marc.getByText("Complet")).toHaveCount(0);
    await expect(car(panel, "Zoé")).toHaveCount(0);

    await selectTab(page, "Retour");
    const zoe = car(panel, "Zoé");
    await expect(zoe).toContainText("Parking du gymnase");
    await expect(zoe.locator("time")).toHaveText("18:30");
    await expect(zoe.getByRole("listitem")).toHaveText(["Tom"]);
    await expect(zoe.getByText("Complet")).toBeVisible();
    await expect(zoe.getByText("Place libre")).toHaveCount(0);
    await expect(car(panel, "Marc")).toHaveCount(0);
  });

  test("C4.3: a card's time is on its title's line, on the right, before « Complet »", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    const marc = car(panel, "Marc");
    const marcTitle = marc.getByRole("heading", { name: "Voiture de Marc" });
    expect(await onOneLine(marc.locator("time"), marcTitle)).toBe(true);
    expect(await rightOf(marc.locator("time"), marcTitle)).toBe(true);

    await selectTab(page, "Retour");
    const zoe = car(panel, "Zoé");
    const zoeTitle = zoe.getByRole("heading", { name: "Voiture de Zoé" });
    const time = zoe.locator("time");
    const full = zoe.getByText("Complet", { exact: true });
    expect(await onOneLine(time, zoeTitle)).toBe(true);
    expect(await onOneLine(full, time)).toBe(true);
    expect(await rightOf(time, zoeTitle)).toBe(true);
    expect(await rightOf(full, time)).toBe(true);
  });

  test("C3.4, C3.3: each leg lists its persons without a car; a person not concerned is in no list", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(withoutCar(panel).getByRole("listitem")).toHaveText(["Tom"]);
    await expect(panel.getByText("Zoé")).toHaveCount(0);

    await selectTab(page, "Retour");
    await expect(withoutCar(panel).getByRole("listitem")).toHaveText(["Léa"]);
    await expect(panel.getByText("Marc")).toHaveCount(0);
  });

  test("C9.1: the banner comes first, with enough seats, then with seats missing", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("status")).toHaveText("1 sans voiture · 2 places libres");
    const [banner, card] = await Promise.all([
      panel.getByRole("status").boundingBox(),
      car(panel, "Marc").boundingBox(),
    ]);
    expect(banner!.y).toBeLessThan(card!.y);

    await selectTab(page, "Retour");
    await expect(panel.getByRole("status")).toHaveText("1 sans voiture · il manque 1 place");
  });

  test("C9.3: each tab's name holds its count of persons without a car", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tab", { name: "Aller 1 sans voiture", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Retour 1 sans voiture", exact: true })).toBeVisible();
  });

  test("C11.7: the organiser's page shows the same board", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}/admin`);
    const panel = page.getByRole("tabpanel");
    await expect(car(panel, "Marc").getByRole("listitem")).toHaveText(["Léa", "Place libre", "Place libre"]);
    await expect(withoutCar(panel).getByRole("listitem")).toHaveText(["Tom"]);
  });

  test("does not scroll sideways at 360 px, on either tab", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    expect(await horizontalOverflow(page)).toBe(0);
    await selectTab(page, "Retour");
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("board, JavaScript disabled", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false });

  test("C3.4: both legs show their cars, banner and persons without a car", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(withoutCar(page)).toHaveCount(2);
    await expect(withoutCar(page).first().getByRole("listitem")).toHaveText(["Tom"]);
    await expect(withoutCar(page).last().getByRole("listitem")).toHaveText(["Léa"]);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText([
      "1 sans voiture · 2 places libres",
      "1 sans voiture · il manque 1 place",
    ]);
    await expect(car(page, "Marc")).toBeVisible();
    await expect(car(page, "Zoé")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("each leg is a region named by its leg alone, not a tab panel", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("tabpanel")).toHaveCount(0);
    const aller = page.getByRole("region", { name: "Aller", exact: true });
    const retour = page.getByRole("region", { name: "Retour", exact: true });
    await expect(aller).toHaveAccessibleName("Aller");
    await expect(retour).toHaveAccessibleName("Retour");
    await expect(car(aller, "Marc")).toBeVisible();
    await expect(car(retour, "Zoé")).toBeVisible();
  });

  test("headings go h1, then h2 per leg, then h3 for its cars and persons without a car", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedScene(db, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    expect(await outline(page)).toEqual([
      "h1 Tournoi de Rennes",
      "h2 Aller",
      "h3 Voiture de Marc",
      "h3 Sans voiture",
      "h2 Retour",
      "h3 Voiture de Zoé",
      "h3 Sans voiture",
    ]);
  });
});

test.describe("board without a retour, JavaScript disabled", () => {
  test.use({ locale: "fr-FR", javaScriptEnabled: false, eventFields: { retourAt: null } });

  test("headings go h1, h2 for the aller, then h3", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    await seedRide(db, id, await person(db, id, "Marc"));
    await place(db, id, await person(db, id, "Léa"), "aller", null);

    await page.goto(`/e/${id}`);
    expect(await outline(page)).toEqual(["h1 Tournoi de Rennes", "h2 Aller", "h3 Voiture de Marc", "h3 Sans voiture"]);
  });
});

/*
 * C10.2, C10.6, DO1: no number reaches a browser, on the public page or the organiser's, with
 * or without the organiser's link, with or without JavaScript, but in one answer: with a valid
 * organiser's link and JavaScript, `loadOrganiserPanel` sends the numbers of the persons
 * without a car, Tom's and Léa's, never those of Marc and Zoé, who drive. Searched in every
 * answer the page receives (HTML, RSC, scripts, the link's check) and in its final DOM, where
 * only the panel lists them (#179). A body that cannot be read fails the test.
 * This browser holds no personal token: e2e/device-persons.spec.ts covers one that does,
 * whose cards show numbers.
 */
const digitsToo = (phones: string[]) => phones.flatMap((phone) => [phone, phone.replace(/\D/g, "")]);
const LEAKS = digitsToo(Object.values(PHONES));
/** What the panel's answer never holds: the drivers' numbers (DO1). */
const DRIVERS_NUMBERS = digitsToo([PHONES.marc, PHONES.zoe]);

function expectNoNumber(where: string, text: string, leaks = LEAKS) {
  expect(leaks.filter((leak) => text.includes(leak)).length, `seeded numbers in ${where}`).toBe(0);
}

/** `loadOrganiserPanel`: a server action, posted to the organiser's page of event `id`. */
function isPanelRead(request: Request, id: string): boolean {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === `/e/${id}/admin` &&
    request.headers()["next-action"] !== undefined
  );
}

/** A body, or why it could not be read: never an empty one in its place. */
interface Body {
  url: string;
  text?: string;
  unreadable?: string;
}

function body(url: string, text: Promise<string>): Promise<Body> {
  return text.then(
    (text) => ({ url, text }),
    (error: unknown) => ({ url, unreadable: String(error) }),
  );
}

function readText({ url, text, unreadable }: Body): string {
  if (text === undefined) throw new Error(`The body of ${url} could not be read: ${unreadable}`);
  return text;
}

const PAGES = [
  { name: "/e/{id}", path: ({ id }: SeededEvent) => `/e/${id}`, organiser: false },
  { name: "/e/{id}/admin, without its fragment", path: ({ id }: SeededEvent) => `/e/${id}/admin`, organiser: false },
  {
    name: "/e/{id}/admin, with a valid organiser's link",
    path: (event: SeededEvent) => `/e/${event.id}/admin#${event.token}`,
    organiser: true,
  },
];

for (const javaScriptEnabled of [true, false]) {
  test.describe(`board, no number, JavaScript ${javaScriptEnabled ? "enabled" : "disabled"}`, () => {
    test.use({ locale: "fr-FR", javaScriptEnabled });

    test.beforeEach(async ({ db, seededEvent }) => {
      await seedScene(db, seededEvent.id);
    });

    for (const { name, path, organiser } of PAGES) {
      test(`C10.2, C10.6: no digit of a seeded number on ${name}`, async ({ page, seededEvent }) => {
        const { id } = seededEvent;
        // The panel's answer is read as Playwright fetches it: Chromium may drop the body of an
        // action's answer before `response.text()` asks for it.
        const panelReads: Promise<Body>[] = [];
        await page.route(
          (url) => url.pathname === `/e/${id}/admin`,
          async (route) => {
            if (!isPanelRead(route.request(), id)) return route.fallback();
            const answer = route.fetch();
            panelReads.push(body(hideToken(route.request().url(), seededEvent.token), answer.then((response) => response.text())));
            await route.fulfill({ response: await answer });
          },
        );
        const bodies: Promise<Body>[] = [];
        page.on("response", (response) => {
          if (!isPanelRead(response.request(), id)) bodies.push(body(hideToken(response.url(), seededEvent.token), response.text()));
        });
        await page.goto(path(seededEvent), { waitUntil: "networkidle" });
        // With JavaScript, the link's check answered: its panel shows.
        if (javaScriptEnabled && organiser) {
          await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
        }

        const dom = await page.content();
        expect(dom.includes("Marc"), "the DOM holds Marc").toBe(true);
        if (javaScriptEnabled && organiser) {
          // The panel's sections list Tom's and Léa's numbers (#179, DO1), each in its own leg's
          // only, visible or hidden: Tom's at the aller, Léa's at the retour. No driver's, and
          // none elsewhere on the page.
          const { sections, rest } = await htmlByLegSection(page);
          expect(Object.keys(sections)).toEqual(["aller", "retour"]);
          for (const [leg, own] of [
            ["aller", PHONES.tom],
            ["retour", PHONES.lea],
          ] as const) {
            expect(sections[leg].includes(own), `the ${leg} section shows its own number`).toBe(true);
            const others = digitsToo(Object.values(PHONES).filter((phone) => phone !== own));
            const shown = others.filter((form) => sections[leg].includes(form));
            expect(shown.length, `other numbers in the ${leg} section`).toBe(0);
          }
          expect(LEAKS.filter((form) => rest.includes(form)).length, "numbers outside the sections").toBe(0);
        } else {
          expectNoNumber("the DOM", dom);
        }
        const received = await Promise.all(bodies);
        expect(received.length).toBeGreaterThan(0);
        for (const read of received) expectNoNumber(read.url, readText(read));

        const panels = await Promise.all(panelReads);
        expect(panels.length, "reads of the panel").toBe(javaScriptEnabled && organiser ? 1 : 0);
        for (const read of panels) {
          const text = readText(read);
          expect(text.includes(PHONES.tom), "the panel holds Tom's number").toBe(true);
          expect(text.includes(PHONES.lea), "the panel holds Léa's number").toBe(true);
          expectNoNumber(`the panel at ${read.url}`, text, DRIVERS_NUMBERS);
        }
      });
    }
  });
}

test.describe("board, no number in the RSC payload", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedScene(db, seededEvent.id);
  });

  for (const { name, path } of PAGES.filter(({ organiser }) => !organiser)) {
    test(`C10.2, C10.6: no digit of a seeded number in the RSC answer of ${name}`, async ({ request, seededEvent }) => {
      const response = await request.get(path(seededEvent), { headers: { RSC: "1" } });
      expect(response.headers()["content-type"]).toContain("text/x-component");
      const payload = await response.text();
      expect(payload.includes("Marc"), "the RSC payload holds Marc").toBe(true);
      expectNoNumber("the RSC payload", payload);
    });
  }
});

test.describe("board, the tabs' pills", () => {
  test.use({ locale: "fr-FR" });

  test("C9.3: 2 and 4 without a car, in an amber pill under each name, part of it and nothing hidden", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    const persons: string[] = [];
    for (const firstName of ["Léa", "Tom", "Marc", "Zoé"]) persons.push(await person(db, id, firstName));
    for (const somebody of persons.slice(0, 2)) await place(db, id, somebody, "aller", null);
    for (const somebody of persons) await place(db, id, somebody, "retour", null);

    await page.goto(`/e/${id}`);
    const aller = page.getByRole("tab", { name: "Aller 2 sans voiture", exact: true });
    const retour = page.getByRole("tab", { name: "Retour 4 sans voiture", exact: true });
    const pill = aller.getByText("2 sans voiture", { exact: true });
    await expect(pill).toBeVisible();
    await expect(retour.getByText("4 sans voiture", { exact: true })).toBeVisible();
    // What a tab says is what it shows: no hidden text, no bare number.
    expect(await aller.innerText()).toMatch(/^Aller\s+2 sans voiture$/);
    expect(await retour.innerText()).toMatch(/^Retour\s+4 sans voiture$/);
    // Under the name, at 12 px, in the amber of a banner with seats missing.
    expect(await below(pill, aller.getByText("Aller", { exact: true }))).toBe(true);
    await expect(pill).toHaveCSS("font-size", "12px");
    const banner = page.getByRole("tabpanel").getByRole("status");
    await expect(banner).toHaveText("2 sans voiture · il manque 2 places");
    for (const property of ["background-color", "color"]) {
      const amber = await banner.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
      await expect(pill).toHaveCSS(property, amber);
    }
    expect(await tabHeights(page)).toEqual([48, 48]);
    // The name and the pill fit inside the tab's border and padding, not over them.
    const overflow = await aller.evaluate((tab) => {
      const box = tab.getBoundingClientRect();
      const style = getComputedStyle(tab);
      const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
      const bottom = box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
      const [name, pill] = [...tab.children].map((child) => child.getBoundingClientRect());
      return { above: top - name.top, below: pill.bottom - bottom };
    });
    expect(overflow).toEqual({ above: 0, below: 0 });
  });

  test("C9.3: no pill at 0, and both tabs the same height beside a pill", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const ride = await seedRide(db, id, await person(db, id, "Marc"));
    await place(db, id, await person(db, id, "Léa"), "aller", ride);
    await place(db, id, await person(db, id, "Tom"), "retour", null);

    await page.goto(`/e/${id}`);
    const aller = page.getByRole("tab", { name: "Aller", exact: true });
    await expect(aller).toBeVisible();
    expect(await aller.innerText()).toBe("Aller");
    await expect(page.getByRole("tab", { name: "Retour 1 sans voiture", exact: true })).toBeVisible();
    expect(await tabHeights(page)).toEqual([48, 48]);
  });
});

test.describe("board, everyone seated", () => {
  test.use({ locale: "fr-FR" });

  test("C9.1, C9.3, C9.6: no count at 0, free seats or none, and an empty leg without banner", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    const marc = await person(db, id, "Marc");
    const lea = await person(db, id, "Léa");
    const ride = await seedRide(db, id, marc, { seats: 3 });
    await place(db, id, lea, "aller", ride);

    await page.goto(`/e/${id}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("status")).toHaveText("Tout le monde a une place · 2 places libres");
    await expect(page.getByRole("tab", { name: "Aller", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Retour", exact: true })).toBeVisible();
    expect(await page.getByRole("tab").allInnerTexts()).toEqual(["Aller", "Retour"]);
    expect(await tabHeights(page)).toEqual([44, 44]);
    await expect(withoutCar(panel)).toHaveCount(0);

    await selectTab(page, "Retour");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await expect(panel.getByText("Aucune voiture proposée pour le retour")).toBeVisible();
    await expect(panel.getByText("Personne ne s’est encore inscrit.")).toBeVisible();
  });
});

test.describe("board, without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("C9.1: a full car and nobody left: everyone has a seat, nothing more", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await person(db, id, "Marc");
    const lea = await person(db, id, "Léa");
    const ride = await seedRide(db, id, marc, { seats: 1 });
    await place(db, id, lea, "aller", ride);

    await page.goto(`/e/${id}`);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText("Tout le monde a une place");
    await expect(car(page, "Marc").getByText("Complet")).toBeVisible();
  });

  test("C9.1: nobody drives: every person without a car is a seat missing", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    for (const firstName of ["Léa", "Tom"]) await place(db, id, await person(db, id, firstName), "aller", null);

    await page.goto(`/e/${id}`);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText("2 sans voiture · il manque 2 places");
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["Léa", "Tom"]);
    await expect(page.getByText("Aucune voiture proposée pour l’aller")).toBeVisible();
  });
});

test.describe("board, at 360 × 780 with a title and a place of 30 characters", () => {
  test.use({ locale: "fr-FR", eventFields: { title: "W".repeat(30), location: "W".repeat(30) } });

  test("C9.2: the aller's banner is visible without scrolling", async ({ db, page, seededEvent }) => {
    await place(db, seededEvent.id, await person(db, seededEvent.id, "Léa"), "aller", null);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toBeInViewport({ ratio: 1 });
  });
});

test.describe("board, with the longest values and no space", () => {
  test.use({ locale: "fr-FR" });

  test("C11.3: a first name of 40, a place of 120 and a note of 200 do not scroll sideways", async ({
    db,
    page,
    seededEvent,
  }) => {
    const { id } = seededEvent;
    const driver = await person(db, id, "D".repeat(40));
    const passenger = await person(db, id, "P".repeat(40));
    const alone = await person(db, id, "S".repeat(40));
    const ride = await seedRide(db, id, driver, { location: "L".repeat(120), note: "N".repeat(200) });
    await place(db, id, passenger, "aller", ride);
    await place(db, id, alone, "aller", null);

    await page.goto(`/e/${id}`);
    await expect(car(page, "D".repeat(40))).toContainText("N".repeat(200));
    await expect(withoutCar(page).getByRole("listitem")).toHaveText(["S".repeat(40)]);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("board, in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("speaks English, plurals included", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("status")).toHaveText("1 without a car · 2 free seats");
    await expect(page.getByRole("tab", { name: "Outbound 1 without a car", exact: true })).toBeVisible();
    const marc = panel.getByRole("article", { name: "Marc’s car" });
    await expect(marc.locator("time")).toHaveText(/^7:15\sAM$/);
    await expect(marc.getByRole("listitem")).toHaveText(["Léa", "Free seat", "Free seat"]);
    await expect(panel.getByRole("region", { name: "Without a car" }).getByRole("listitem")).toHaveText(["Tom"]);

    await selectTab(page, "Return 1 without a car");
    await expect(panel.getByRole("status")).toHaveText("1 without a car · 1 seat missing");
    await expect(panel.getByRole("article", { name: "Zoé’s car" }).getByText("Full")).toBeVisible();
  });
});
