import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #961: a car icon before « Voiture de {conducteur} » in each card's header (event-board v4.9, CI1.1 to CI1.8).

type Db = Kysely<Database>;

/** The longest first name the database accepts (`person_first_name_length`). */
const LONG = "D".repeat(40);

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const header = (article: Locator) => article.locator(":scope > div").first();
const icon = (article: Locator) => header(article).locator("svg.lucide-car");
const title = (article: Locator) => header(article).getByRole("heading");
const rightSide = (article: Locator) => header(article).locator(":scope > span");
const box = async (locator: Locator) => (await locator.boundingBox())!;

/** A driver without a phone number (valid since v4.8) and their car on the aller. */
async function seedCar(db: Db, eventId: string, firstName: string, seats = 3, passenger?: string) {
  const driver = await seedPerson(db, eventId, { firstName });
  const rideId = await seedRide(db, eventId, driver.id, { seats });
  if (passenger) {
    const person = await seedPerson(db, eventId, { firstName: passenger });
    await seedPlacement(db, { personId: person.id, eventId, leg: "aller", rideId });
  }
  return rideId;
}

/** CI1.4 and CI1.5: the icon, the title and the right side share the line without touching, and the card does not overflow. */
async function expectHeaderFits(page: Page, article: Locator) {
  const [iconBox, titleBox, rightBox, cardBox] = [
    await box(icon(article)),
    await box(title(article)),
    await box(rightSide(article)),
    await box(article),
  ];
  expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(titleBox.x);
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(rightBox.x);
  expect(titleBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(rightBox.x + rightBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test.describe("the car icon of a card's header", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 800 } });

  test("CI1.1: in the header, the icon comes before the title, then the time", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, "Marc");
    await page.goto(`/e/${seededEvent.id}`);
    const article = car(page, "Marc");
    await expect(icon(article)).toHaveCount(1);
    const order = await header(article).evaluate((element) => {
      const [svg, h3, time] = ["svg.lucide-car", "h3", "time"].map((selector) => element.querySelector(selector)!);
      const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { iconThenTitle: before(svg, h3), titleThenTime: before(h3, time), sameLine: svg.parentElement === h3.parentElement };
    });
    expect(order).toEqual({ iconThenTitle: true, titleThenTime: true, sameLine: true });
  });

  test("CI1.2: 16 px square, in the colour of the card's other icons", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, "Marc");
    await page.goto(`/e/${seededEvent.id}`);
    const article = car(page, "Marc");
    const size = await box(icon(article));
    expect([size.width, size.height]).toEqual([16, 16]);
    const colour = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).color);
    const expected = await colour(article.locator("svg.lucide-map-pin"));
    expect(expected).not.toBe("");
    expect(await colour(icon(article))).toBe(expected);
    expect(await colour(article.locator("svg.lucide-clock"))).toBe(expected);
  });

  test("CI1.3: hidden from assistive technology, the card and its title keep their name", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, "Marc");
    await page.goto(`/e/${seededEvent.id}`);
    const article = car(page, "Marc");
    await expect(icon(article)).toHaveAttribute("aria-hidden", "true");
    await expect(icon(article)).not.toHaveAttribute("aria-label");
    await expect(title(article).locator("svg")).toHaveCount(0);
    await expect(car(page, "Marc")).toHaveCount(1);
    await expect(panel(page).getByRole("heading", { name: "Voiture de Marc" })).toHaveCount(1);
    await expect(title(article)).toHaveText("Voiture de Marc");
  });

  test("CI1.4: at 360 px, a 40-character first name, the time and « Complet » fit", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, LONG, 1, "Léa");
    await page.goto(`/e/${seededEvent.id}`);
    const article = car(page, LONG);
    await expect(article.getByText("Complet", { exact: true })).toBeVisible();
    await expectHeaderFits(page, article);
  });

  test("CI1.6: the icon is centred on the title's first line, on one line and on several", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, "Marc");
    await seedCar(db, seededEvent.id, LONG, 1, "Léa");
    await page.goto(`/e/${seededEvent.id}`);
    // The first line is the title's top and half its line height (20 px: the board text is 14 px): the title has no padding.
    const lines = async (article: Locator) =>
      title(article).evaluate((h3) => {
        const range = document.createRange();
        range.selectNodeContents(h3);
        const rowCount = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        return { centre: h3.getBoundingClientRect().top + parseFloat(getComputedStyle(h3).lineHeight) / 2, rowCount };
      });
    const single = car(page, "Marc");
    const several = car(page, LONG);
    for (const [article, multiline] of [[single, false], [several, true]] as const) {
      const { centre, rowCount } = await lines(article);
      expect(rowCount > 1).toBe(multiline);
      const iconBox = await box(icon(article));
      const gap = Math.abs(iconBox.y + iconBox.height / 2 - centre);
      expect(gap, JSON.stringify({ iconBox, centre, rowCount })).toBeLessThanOrEqual(1);
    }
  });

  test("CI1.7: « Voir la voiture » focuses the title, never the icon", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const rideId = await seedCar(db, seededEvent.id, "Marc");
    const tom = await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token);
    await seedPlacement(db, { personId: tom.id, eventId: seededEvent.id, leg: "aller", rideId });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const persons = page.getByRole("region", { name: "Vos inscriptions" });
    // Folded while nobody is without a car.
    await persons.getByRole("button", { name: /^Vos inscriptions/ }).click();
    await persons.getByRole("button", { name: /^Tom, Aller : / }).click();
    await page.getByRole("dialog", { name: "Tom · Aller" }).getByRole("button", { name: "Voir la voiture" }).click();
    const article = car(page, "Marc");
    await expect(title(article)).toBeFocused();
    const onIcon = () => page.evaluate(() => Boolean(document.activeElement?.closest("svg")));
    expect(await onIcon()).toBe(false);
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press("Tab");
      expect(await onIcon()).toBe(false);
    }
  });

  test("CI1.8: the 15 cars of a leg each have the icon, a full one too", async ({ db, page, seededEvent }) => {
    for (let index = 1; index <= 15; index++) {
      await seedCar(db, seededEvent.id, `Conducteur ${index}`, index === 15 ? 1 : 3, index === 15 ? "Léa" : undefined);
    }
    await page.goto(`/e/${seededEvent.id}`);
    const articles = panel(page).getByRole("article");
    await expect(articles).toHaveCount(15);
    for (const article of await articles.all()) await expect(icon(article)).toHaveCount(1);
    await expect(car(page, "Conducteur 15").getByText("Complet", { exact: true })).toBeVisible();
  });
});

test.describe("the car icon, in a browser set to English", () => {
  test.use({ locale: "en-GB", viewport: { width: 360, height: 800 } });

  test("CI1.5: the same header holds in English", async ({ db, page, seededEvent }) => {
    await seedCar(db, seededEvent.id, LONG, 1, "Léa");
    await seedCar(db, seededEvent.id, "Marc");
    await page.goto(`/e/${seededEvent.id}`);
    const marc = panel(page).getByRole("article", { name: "Marc’s car" });
    await expect(title(marc)).toHaveText("Marc’s car");
    await expect(marc.locator("time")).toHaveText(/^7:15\sAM$/);
    await expect(icon(marc)).toHaveCount(1);
    await expectHeaderFits(page, marc);
    const long = panel(page).getByRole("article", { name: `${LONG}’s car` });
    await expect(long.getByText("Full", { exact: true })).toBeVisible();
    await expectHeaderFits(page, long);
  });
});
