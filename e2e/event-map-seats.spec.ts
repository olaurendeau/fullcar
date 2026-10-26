import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { contrast } from "./contrast";
import { around, focusableIn, inside, mapName, openMap, OSM_LINK, seedCar, test } from "./event-map-points";
import { expect } from "./fixtures";

/*
 * #655, event-map v32: each point's label shows its free seats after its first name, or its
 * number of cars: a rule, Lucide's armchair (`aria-hidden`) and the number, in the point's own
 * button (CA1.21); the names say the same number once (CA1.22). The fake tile provider answers
 * its default tile: no test here sets one. The project `e2e` is a Pixel 7, touch-enabled.
 */

test.use({ locale: "fr-FR" });

/** The seat badge of a point, or of a bubble's car button. */
const seatsOf = (button: Locator) => button.locator("[data-map-seats]");
/** The label of a point: its outer element, the one with the border. */
const labelOf = (point: Locator) => point.locator(":scope > span");

/** A car of `seats` seats with `passengers` of them taken, its id. */
async function seedSeated(
  db: Kysely<Database>,
  eventId: string,
  firstName: string,
  fields: { position: Position; location: string; seats: number; passengers?: number; leg?: Leg; departureTime?: `${string}:00` },
): Promise<string> {
  const { passengers = 0, leg = "aller", ...ride } = fields;
  const id = await seedCar(db, eventId, firstName, { ...ride, leg });
  for (let n = 0; n < passengers; n++) {
    const person = await seedPerson(db, eventId, { firstName: `Passager ${n + 1}` });
    await seedPlacement(db, { personId: person.id, eventId, leg, rideId: id });
  }
  return id;
}

/**
 * What a badge is drawn with: its number's colour, weight and size, its background, its rule's,
 * its icon's; and `--border` as a border colour computes there, for the rule (as CA1.18 reads it).
 */
function styleOf(badge: Locator) {
  return badge.evaluate((element) => {
    const style = getComputedStyle(element);
    const icon = getComputedStyle(element.querySelector("svg")!);
    const probe = document.createElement("span");
    probe.style.borderColor = "var(--border)";
    element.append(probe);
    const border = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return {
      border,
      color: style.color,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      backgroundColor: style.backgroundColor,
      rule: `${style.borderLeftWidth} ${style.borderLeftStyle}`,
      ruleColor: style.borderLeftColor,
      icon: `${icon.width} ${icon.height}`,
      iconColor: icon.color,
    };
  });
}

/** Whether each CSS colour of `colours` is a grey, never a hue (amber, say): its red, green and blue equal, as a canvas reads it. */
function neutral(page: Page, colours: string[]): Promise<boolean[]> {
  return page.evaluate((colours) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    return colours.map((colour) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return a === 0 || (Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1);
    });
  }, colours);
}

test("CA1.21, CA1.22, CA1.5, CA1.8: each point shows its free seats, « 0 » when full, the sum for a group, under the flag too; the names say them once", async ({
  db,
  page,
  placed,
}) => {
  await seedSeated(db, placed.id, "Sophie", { position: around(placed.place, { east: 10 }), location: "Parking du gymnase", seats: 2, departureTime: "07:00:00" });
  await seedSeated(db, placed.id, "Claire", { position: around(placed.place, { north: 600 }), location: "12 rue des Lilas", seats: 3, passengers: 1, departureTime: "08:00:00" });
  await seedSeated(db, placed.id, "Inès", { position: around(placed.place, { east: -700 }), location: "Gare", seats: 1, passengers: 1, departureTime: "09:00:00" });
  const parking = around(placed.place, { east: 700 });
  await seedSeated(db, placed.id, "Nina", { position: parking, location: "Parking du marché", seats: 2, passengers: 1, departureTime: "10:00:00" });
  await seedSeated(db, placed.id, "Paul", { position: { ...parking }, location: "Parking du marché", seats: 2, departureTime: "11:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "5 voitures"));
  const sophie = "Voiture de Sophie, départ : Parking du gymnase, 2 places libres";
  const claire = "Voiture de Claire, départ : 12 rue des Lilas, 2 places libres";
  const ines = "Voiture de Inès, départ : Gare, 0 place libre";
  const group = "2 voitures : Nina, Paul, 3 places libres";
  // CA1.22: one name per point, its number once; CA1.21: no target more than the points.
  expect(await focusableIn(map)).toEqual([sophie, claire, ines, group, "Zoom avant", "Zoom arrière", OSM_LINK]);

  // CA1.21: after the first name, or the number of cars, the badge: its icon hidden, its number.
  const point = (name: string) => map.getByRole("button", { name, exact: true });
  for (const [name, label, seats] of [
    [sophie, "Sophie", "2"],
    [claire, "Claire", "2"],
    [ines, "Inès", "0"],
    [group, "2", "3"],
  ] as const) {
    await expect(point(name)).toHaveText(`${label}${seats}`);
    await expect(seatsOf(point(name))).toHaveText(seats);
    await expect(seatsOf(point(name)).locator("svg")).toHaveAttribute("aria-hidden", "true");
    // Inside the label, after its text: its right end.
    const [labelBox, badgeBox] = [(await labelOf(point(name)).boundingBox())!, (await seatsOf(point(name)).boundingBox())!];
    expect(inside(badgeBox, labelBox)).toBe(true);
    // CA1.8: the badge's text 12 px at least; CA1.21: the point's target 44 × 44 px at least.
    expect(parseFloat((await styleOf(seatsOf(point(name)))).fontSize)).toBeGreaterThanOrEqual(12);
    const box = (await point(name).boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  // The label keeps its border and background (#687, VI5.12).
  await expect(labelOf(point(claire))).toHaveClass(/(^| )border-\[1\.5px\]( |$)/);
  await expect(labelOf(point(claire))).toHaveClass(/(^| )border-primary( |$)/);
  await expect(labelOf(point(claire))).toHaveClass(/(^| )bg-background( |$)/);

  // The same style for « 0 » and « 2 », never amber: the number, its background and its icon
  // greys, and its rule 1 px of `--border` exactly, compared as CA1.18 compares the container's.
  const [full, free] = [await styleOf(seatsOf(point(ines))), await styleOf(seatsOf(point(claire)))];
  expect(full).toEqual(free);
  expect(free.rule).toBe("1px solid");
  expect(free.ruleColor).toBe(free.border);
  expect(await neutral(page, [free.color, free.backgroundColor, free.iconColor])).toEqual([true, true, true]);
  const icon = seatsOf(point(claire)).locator("svg");
  // Its number at 4.5:1 at least on the label's background, its icon at 3:1.
  expect(await contrast(seatsOf(point(claire)), labelOf(point(claire)))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(icon, labelOf(point(claire)))).toBeGreaterThanOrEqual(3);

  // CA1.5: « 0 place libre » is « Complet » on Inès's card.
  await expect(page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Inès", exact: true }).getByText("Complet", { exact: true })).toBeVisible();

  // The bubble: each car's button with its car's badge, its name saying the same number.
  await point(group).click();
  const bubble = map.getByRole("group", { name: group, exact: true });
  const nina = bubble.getByRole("button", { name: "Voiture de Nina, départ : Parking du marché, 1 place libre", exact: true });
  const paul = bubble.getByRole("button", { name: "Voiture de Paul, départ : Parking du marché, 2 places libres", exact: true });
  await expect(bubble.getByRole("button")).toHaveText(["Voiture de Nina1", "Voiture de Paul2", "Fermer"]);
  await expect(seatsOf(nina)).toHaveText("1");
  await expect(seatsOf(paul)).toHaveText("2");
  await expect(seatsOf(paul).locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(seatsOf(bubble.getByRole("button", { name: "Fermer", exact: true }))).toHaveCount(0);
  for (const button of [nina, paul]) {
    expect(parseFloat((await styleOf(seatsOf(button))).fontSize)).toBeGreaterThanOrEqual(12);
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
});

test("CA1.21, CA1.22: a group whose cars are all full, « 0 » and « 0 place libre », on the point and on its bubble's buttons", async ({ db, page, placed }) => {
  const parking = around(placed.place, { east: 700 });
  await seedSeated(db, placed.id, "Nina", { position: parking, location: "Parking du marché", seats: 1, passengers: 1, departureTime: "08:00:00" });
  await seedSeated(db, placed.id, "Paul", { position: { ...parking }, location: "Parking du marché", seats: 2, passengers: 2, departureTime: "09:00:00" });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "2 voitures"));
  const name = "2 voitures : Nina, Paul, 0 place libre";
  const group = map.getByRole("button", { name, exact: true });
  await expect(group).toHaveText("20");
  await expect(seatsOf(group)).toHaveText("0");
  await group.click();
  const bubble = map.getByRole("group", { name, exact: true });
  for (const driver of ["Nina", "Paul"]) {
    await expect(seatsOf(bubble.getByRole("button", { name: `Voiture de ${driver}, départ : Parking du marché, 0 place libre`, exact: true }))).toHaveText("0");
  }
});

test("CA1.21: at the retour, the seats of the retour's Ride", async ({ db, page, placed }) => {
  await seedSeated(db, placed.id, "Marc", { position: around(placed.place, { north: 500 }), location: "Place de la mairie", seats: 3, passengers: 3 });
  await seedSeated(db, placed.id, "Marc", { position: around(placed.place, { north: -500 }), location: "Gare", seats: 4, passengers: 1, leg: "retour" });

  await page.goto(`/e/${placed.id}`);
  const aller = await openMap(page, mapName("aller", "1 voiture"));
  await expect(seatsOf(aller.getByRole("button", { name: "Voiture de Marc, départ : Place de la mairie, 0 place libre", exact: true }))).toHaveText("0");

  const tab = page.getByRole("tab", { name: "Retour" });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
  const retour = await openMap(page, mapName("retour", "1 voiture"));
  await expect(seatsOf(retour.getByRole("button", { name: "Voiture de Marc, dépose : Gare, 3 places libres", exact: true }))).toHaveText("3");
});

test("CA1.16: next to a first name of 40 characters cut at 120 px, the badge whole", async ({ db, page, placed }) => {
  const long = "Marie-Bérengère-Anne-Charlotte-Hortensia";
  await seedSeated(db, placed.id, long, { position: around(placed.place, { north: 500 }), location: "Chemin des Vignes", seats: 3 });

  await page.goto(`/e/${placed.id}`);
  const map = await openMap(page, mapName("aller", "1 voiture"));
  const point = map.getByRole("button", { name: `Voiture de ${long}, départ : Chemin des Vignes, 3 places libres`, exact: true });
  const firstName = point.getByText(long, { exact: true });
  const [nameBox, badgeBox, labelBox] = [(await firstName.boundingBox())!, (await seatsOf(point).boundingBox())!, (await labelOf(point).boundingBox())!];
  expect(nameBox.width).toBeLessThanOrEqual(120);
  await expect(seatsOf(point)).toHaveText("3");
  // Whole: after the cut name, inside the label, nothing of it clipped.
  expect(badgeBox.x).toBeGreaterThanOrEqual(nameBox.x + nameBox.width);
  expect(inside(badgeBox, labelBox)).toBe(true);
  expect(await seatsOf(point).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  // At the label's right end, beyond its padding: the badge is its last part.
  expect(labelBox.x + labelBox.width - (badgeBox.x + badgeBox.width)).toBeLessThanOrEqual(12);
});

test.describe("in English", () => {
  test.use({ locale: "en-US" });

  test("CA1.22: “2 cars: Nina, Paul, 3 free seats”, and “…, 0 free seats” for a full car; the number is the same", async ({ db, page, placed }) => {
    const parking = around(placed.place, { east: 700 });
    await seedSeated(db, placed.id, "Nina", { position: parking, location: "Market car park", seats: 2, passengers: 1, departureTime: "08:00:00" });
    await seedSeated(db, placed.id, "Paul", { position: { ...parking }, location: "Market car park", seats: 2, departureTime: "09:00:00" });
    await seedSeated(db, placed.id, "Inès", { position: around(placed.place, { north: 600 }), location: "Station", seats: 1, passengers: 1, departureTime: "10:00:00" });

    await page.goto(`/e/${placed.id}`);
    const button = page.getByRole("tabpanel").getByRole("button", { name: "Map", exact: true });
    await expect(async () => {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
    }).toPass();
    const map = page.getByRole("region", { name: "Outbound map: the event place and 3 cars", exact: true });
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await expect(seatsOf(map.getByRole("button", { name: "2 cars: Nina, Paul, 3 free seats", exact: true }))).toHaveText("3");
    await expect(seatsOf(map.getByRole("button", { name: "Inès’s car, departs from Station, 0 free seats", exact: true }))).toHaveText("0");
  });
});
