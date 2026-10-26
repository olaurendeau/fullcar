import type { Locator, Page } from "@playwright/test";
import { anchor, around, centre, FLAG, focusableIn, inside, joins, lines, mapName, openMap, OSM_LINK, overlap, points, seedCar, seedParking, test } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #481, event-map v18: cars less than 25 m apart make one point, its number on its label and
 * its name « N voitures : {prénoms}, {places} » (#655), and activated it opens our bubble, inserted in the DOM
 * just after it, titled and named « N voitures, {places} » (v30, #723). The flag first: cars less than 25 m from the flag are its one point. The
 * cards follow the departure times, which the cars get here. The fake tile provider answers its default
 * tile: no test here sets one. The project `e2e` is a Pixel 7, touch-enabled.
 */

test.use({ locale: "fr-FR" });

/** The bubble of a grouped point, by its title. */
const bubbleOf = (map: Locator, name: string) => map.getByRole("group", { name, exact: true });

/** Whether nothing in `bubble` scrolls but the list of its cars: its own box, its title and its « Fermer » never. */
function scrolling(bubble: Locator) {
  return bubble.evaluate((element) => {
    const scrolls = (part: Element) => part.scrollHeight > part.clientHeight;
    const list = element.querySelector("button")!.parentElement!;
    const others = [element, ...element.querySelectorAll("*")].filter((part) => part !== list && part instanceof HTMLElement && getComputedStyle(part).overflowY !== "visible");
    return { list: scrolls(list), others: others.some(scrolls) };
  });
}

/** `close` whole in `bubble`, in the map, and on top at its centre: neither cut nor covered. */
async function wholeIn(page: Page, close: Locator, bubble: Locator, map: Locator) {
  const box = (await close.boundingBox())!;
  expect(inside(box, (await bubble.boundingBox())!)).toBe(true);
  expect(inside(box, (await map.boundingBox())!)).toBe(true);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null, centre(box))).toBe("Fermer");
}

/** What a press at the centre of `box` reaches: the name of the point or the flag there. */
function topAt(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('button, [role="img"]')?.getAttribute("aria-label") ?? null,
    centre(box),
  );
}

test("CA1.6: two cars 10 m apart are one point, « 2 », named « 2 voitures : Nina, Paul, 3 places libres »; 40 m apart, two points", async ({ db, page, placed }) => {
  const near = around(placed.place, { east: 2000 });
  await seedCar(db, placed.id, "Nina", { position: near, departureTime: "08:00:00", seats: 1 });
  await seedCar(db, placed.id, "Paul", { position: around(near, { north: 10 }), departureTime: "09:00:00", seats: 2 });
  const far = around(placed.place, { east: -2000 });
  await seedCar(db, placed.id, "Léa", { position: far, location: "Gare", departureTime: "10:00:00" });
  await seedCar(db, placed.id, "Hugo", { position: around(far, { north: 40 }), location: "Mairie", departureTime: "11:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "4 voitures"));
  await expect(points(map)).toHaveCount(3);
  const group = map.getByRole("button", { name: "2 voitures : Nina, Paul, 3 places libres", exact: true });
  // Its number of cars, then its badge, the sum of their free seats (#655).
  await expect(group).toHaveText("23");
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(map.getByRole("button", { name: /^Voiture de Léa, départ : Gare/ })).toBeVisible();
  await expect(map.getByRole("button", { name: /^Voiture de Hugo, départ : Mairie/ })).toBeVisible();
  await expect(lines(map)).toHaveCount(3);
});

test("CA1.6, CA1.8: the bubble of two cars at the same position, its buttons, Escape, « Fermer », Tab out of it, and to a card", async ({ db, page, placed }) => {
  const parking = around(placed.place, { east: 2000 });
  await seedCar(db, placed.id, "Zoé", { position: around(placed.place, { north: 1500 }), location: "12 rue des Lilas", departureTime: "08:00:00" });
  await seedCar(db, placed.id, "Nina", { position: parking, location: "Parking du marché", departureTime: "09:00:00", seats: 1 });
  await seedCar(db, placed.id, "Marc", { position: around(placed.place, { east: -2000 }), location: "Place de la mairie", departureTime: "10:00:00" });
  await seedCar(db, placed.id, "Paul", { position: { ...parking }, location: "Parking du marché", departureTime: "11:00:00", seats: 2 });

  // Short enough for Paul's card, the last, to be out of view under the map.
  await page.setViewportSize({ width: 412, height: 500 });
  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "4 voitures"));
  const zoe = "Voiture de Zoé, départ : 12 rue des Lilas, 3 places libres";
  const marc = "Voiture de Marc, départ : Place de la mairie, 3 places libres";
  const name = "2 voitures : Nina, Paul, 3 places libres";
  const title = "2 voitures, 3 places libres";
  // The grouped point takes the place of its first car, Nina, in the Tab order.
  expect(await focusableIn(map)).toEqual([zoe, name, marc, "Zoom avant", "Zoom arrière", OSM_LINK]);

  const group = map.getByRole("button", { name, exact: true });
  const bubble = bubbleOf(map, title);
  const cars = bubble.getByRole("button");
  const nina = bubble.getByRole("button", { name: "Voiture de Nina, départ : Parking du marché, 1 place libre", exact: true });
  const close = bubble.getByRole("button", { name: "Fermer", exact: true });

  await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(bubble).toBeVisible();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(bubble.getByText(title, { exact: true })).toBeVisible();
  await expect(cars).toHaveText(["Voiture de Nina1", "Voiture de Paul2", "Fermer"]);
  await expect(nina).toBeFocused();
  // Just after its point in the DOM: the same marker's next element.
  const next = group.locator("xpath=following-sibling::*[1]");
  await expect(next).toHaveAttribute("role", "group");
  await expect(next).toHaveAccessibleName(title);
  // CA1.8, the bubble's part: targets of 44 px at least, and nothing of the bubble outside the map.
  const view = (await map.boundingBox())!;
  for (const button of await cars.all()) {
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    expect(inside(box, view)).toBe(true);
  }
  // On top of what it covers: its buttons take the touch there.
  for (const button of await cars.all()) expect(await topAt(page, (await button.boundingBox())!)).toBe(await button.getAttribute("aria-label"));
  // None of Leaflet's English, its popup's « Close popup » or its attribution's title.
  expect(await page.evaluate(() => /Close popup|A JavaScript library/.test(document.documentElement.outerHTML))).toBe(false);

  // The window losing the focus leaves it open. Playwright keeps every page focused (its focus
  // emulation): the window's blur is played by `document.hasFocus` answering false, and a blur.
  await nina.evaluate((element: HTMLElement) => {
    const hasFocus = document.hasFocus;
    document.hasFocus = () => false;
    element.blur();
    document.hasFocus = hasFocus;
  });
  await expect(bubble).toBeVisible();
  await nina.focus();

  // Escape closes it, the focus back on the point.
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await expect(group).toBeFocused();
  await expect(group).toHaveAttribute("aria-expanded", "false");

  // « Fermer » too.
  await page.keyboard.press("Enter");
  await expect(nina).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(bubble).toHaveCount(0);
  await expect(group).toBeFocused();

  // A tap opens it as well; Tab from « Fermer » goes to the next point, Marc's, and closes it.
  await group.tap();
  await expect(nina).toBeFocused();
  await close.focus();
  await page.keyboard.press("Tab");
  await expect(map.getByRole("button", { name: marc, exact: true })).toBeFocused();
  await expect(bubble).toHaveCount(0);

  // A car's button leads to its card, and closes the bubble.
  const paulTitle = page.getByRole("tabpanel").getByRole("heading", { name: "Voiture de Paul", exact: true });
  await map.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(paulTitle).not.toBeInViewport();
  await group.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(bubble.getByRole("button", { name: /^Voiture de Paul, départ : / })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(paulTitle).toBeFocused();
  await expect(paulTitle).toBeInViewport();
  await expect(bubble).toHaveCount(0);
});

test("CA1.6, CA1.22: at 360 × 780, the bubble of Nina (1) and Paul (2), « 2 voitures, 3 places libres », named so, on one line: nothing scrolls, off the credits", async ({ db, page, placed }) => {
  await seedParking(db, placed.id, placed.place);
  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  await map.getByRole("button", { name: "2 voitures : Nina, Paul, 3 places libres", exact: true }).click();
  const bubble = bubbleOf(map, "2 voitures, 3 places libres");
  await expect(bubble.getByRole("button")).toHaveText(["Voiture de Nina1", "Voiture de Paul2", "Fermer"]);
  const title = bubble.getByText("2 voitures, 3 places libres", { exact: true });
  await expect(title).toBeVisible();
  // One line of 13 px text: the names of the drivers are on the buttons.
  expect((await title.boundingBox())!.height).toBeLessThan(26);
  const shown = (await bubble.boundingBox())!;
  expect(Math.round(shown.width)).toBe(210);
  expect(await scrolling(bubble)).toEqual({ list: false, others: false });
  expect(overlap(shown, (await map.locator("[data-map-credits]").boundingBox())!)).toBe(false);
  await wholeIn(page, bubble.getByRole("button", { name: "Fermer", exact: true }), bubble, map);
});

test("CA1.6: « 2 voitures, 12 places libres » keeps « Fermer » whole; of three cars, only the list scrolls, « Fermer » whole, and a car focused comes into its view", async ({ db, page, placed }) => {
  const east = around(placed.place, { east: 350 });
  await seedCar(db, placed.id, "Nina", { position: east, departureTime: "08:00:00", seats: 6 });
  await seedCar(db, placed.id, "Paul", { position: { ...east }, departureTime: "09:00:00", seats: 6 });
  const west = around(placed.place, { east: -350 });
  for (const [firstName, departureTime] of [
    ["Léa", "10:00:00"],
    ["Hugo", "11:00:00"],
    ["Lou", "12:00:00"],
  ] as const) {
    await seedCar(db, placed.id, firstName, { position: { ...west }, departureTime });
  }
  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "5 voitures"));

  // Ten free seats and more: the title may take two lines, without harm.
  const twelve = map.getByRole("button", { name: "2 voitures : Nina, Paul, 12 places libres", exact: true });
  await twelve.click();
  const wide = bubbleOf(map, "2 voitures, 12 places libres");
  await expect(wide.getByText("2 voitures, 12 places libres", { exact: true })).toBeVisible();
  expect((await scrolling(wide)).others).toBe(false);
  await wholeIn(page, wide.getByRole("button", { name: "Fermer", exact: true }), wide, map);
  await page.keyboard.press("Escape");
  await expect(wide).toHaveCount(0);

  const three = map.getByRole("button", { name: "3 voitures : Léa, Hugo, Lou, 9 places libres", exact: true });
  await three.click();
  const bubble = bubbleOf(map, "3 voitures, 9 places libres");
  await expect(bubble.getByRole("button")).toHaveText(["Voiture de Léa3", "Voiture de Hugo3", "Voiture de Lou3", "Fermer"]);
  // Its title stays at its top, whole.
  expect(inside((await bubble.getByText("3 voitures, 9 places libres", { exact: true }).boundingBox())!, (await bubble.boundingBox())!)).toBe(true);
  expect(await scrolling(bubble)).toEqual({ list: true, others: false });
  const close = bubble.getByRole("button", { name: "Fermer", exact: true });
  await wholeIn(page, close, bubble, map);

  // Tab to Lou's car, the last: it comes into the visible part of the list; « Fermer » stays whole.
  const list = bubble.getByRole("button").first().locator("xpath=..");
  await expect(bubble.getByRole("button").first()).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const lou = bubble.getByRole("button", { name: /^Voiture de Lou, / });
  await expect(lou).toBeFocused();
  await expect.poll(async () => inside((await lou.boundingBox())!, (await list.boundingBox())!)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await wholeIn(page, close, bubble, map);
});

test("CA1.15: 20 m north and 20 m south of the flag, one point under it, « 2 voitures : Sophie, Nina, 3 places libres », with its bubble; no line, no label hiding another", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Sophie", { position: around(placed.place, { north: 20 }), location: "Parking du gymnase", departureTime: "08:00:00", seats: 1 });
  await seedCar(db, placed.id, "Nina", { position: around(placed.place, { north: -20 }), location: "Entrée sud", departureTime: "09:00:00", seats: 2 });
  await seedCar(db, placed.id, "Claire", { position: around(placed.place, { east: 600 }), location: "12 rue des Lilas", departureTime: "10:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "3 voitures"));
  const name = "2 voitures : Sophie, Nina, 3 places libres";
  const claire = "Voiture de Claire, départ : 12 rue des Lilas, 3 places libres";
  await expect(points(map)).toHaveCount(2);
  expect(await focusableIn(map)).toEqual([name, claire, "Zoom avant", "Zoom arrière", OSM_LINK]);
  // Claire's line only.
  await expect(lines(map)).toHaveCount(1);
  const flag = map.getByRole("img", { name: FLAG, exact: true });
  expect(await joins(map, await anchor(flag), await anchor(map.getByRole("button", { name: claire, exact: true })))).toBe(true);

  // Under the flag, its label 24 px under the flag's place, neither covering the other.
  const group = map.getByRole("button", { name, exact: true });
  await expect(group).toHaveText("23");
  const flagBox = (await flag.boundingBox())!;
  const groupBox = (await group.boundingBox())!;
  expect(overlap(flagBox, groupBox)).toBe(false);
  const label = (await group.locator(":scope > span").boundingBox())!;
  expect(Math.abs(label.y - (await anchor(flag)).y - 24)).toBeLessThanOrEqual(1);
  expect(await topAt(page, flagBox)).toBe(FLAG);
  expect(await topAt(page, groupBox)).toBe(name);

  await group.tap();
  const bubble = bubbleOf(map, "2 voitures, 3 places libres");
  await expect(bubble.getByRole("button")).toHaveText(["Voiture de Sophie1", "Voiture de Nina2", "Fermer"]);
  await expect(bubble.getByRole("button").first()).toBeFocused();
});

test("CA1.15: the flag first: A 30 m from the flag and first, B 20 m from it and 10 m from A; B under the flag, A its own point with its line", async ({ db, page, placed }) => {
  await seedCar(db, placed.id, "Marc", { position: around(placed.place, { north: 30 }), location: "Rue du stade", departureTime: "08:00:00" });
  await seedCar(db, placed.id, "Lou", { position: around(placed.place, { north: 20 }), location: "Parking du gymnase", departureTime: "09:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  const marc = map.getByRole("button", { name: "Voiture de Marc, départ : Rue du stade, 3 places libres", exact: true });
  const lou = map.getByRole("button", { name: "Voiture de Lou, départ : Parking du gymnase, 3 places libres", exact: true });
  await expect(points(map)).toHaveCount(2);
  await expect(marc).toHaveText("Marc3");
  await expect(lou).toHaveText("Lou3");

  // Marc's line, to his own place; none for Lou, whose label is 24 px under the flag's place.
  const flag = map.getByRole("img", { name: FLAG, exact: true });
  const at = await anchor(flag);
  await expect(lines(map)).toHaveCount(1);
  expect(await joins(map, at, await anchor(marc))).toBe(true);
  expect((await anchor(marc)).y).toBeLessThan(at.y);
  const label = (await lou.locator(":scope > span").boundingBox())!;
  expect(Math.abs(label.y - at.y - 24)).toBeLessThanOrEqual(1);
});
