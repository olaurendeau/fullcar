import type { Page, TestInfo } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

// A capture opens the page with a device's personal token (#158).
leaveNoToken();

/*
 * C11.2: the board of a leg at WIDTH px (360 by default), without scrolling sideways. Each
 * capture waits for a sign that the page has hydrated (#65).
 */

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test.use({ locale: "fr-FR" });

// Aller: Marc drives Léa, Tom and Nina are without a car. Retour: Léa, Tom and Nina are.
test("leg with a banner, N > 0, and the tabs' pills", async ({ db, page, seededEvent }, testInfo) => {
  const { id } = seededEvent;
  const person = async (firstName: string) => (await seedPerson(db, id, { firstName })).id;
  const ride = await seedRide(db, id, await person("Marc"));
  const [lea, tom, nina] = [await person("Léa"), await person("Tom"), await person("Nina")];
  await seedPlacement(db, { personId: lea, eventId: id, leg: "aller", rideId: ride });
  for (const personId of [tom, nina]) await seedPlacement(db, { personId, eventId: id, leg: "aller", rideId: null });
  for (const personId of [lea, tom, nina]) await seedPlacement(db, { personId, eventId: id, leg: "retour", rideId: null });

  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  await page.goto(`/e/${id}`, { waitUntil: "networkidle" });
  // One click each, not retried: a page that has not hydrated stays on Aller.
  await tab("Retour 3 sans voiture").click();
  await expect(tab("Retour 3 sans voiture")).toHaveAttribute("aria-selected", "true");
  await tab("Aller 2 sans voiture").click();
  await expect(tab("Aller 2 sans voiture")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("2 sans voiture · 2 places libres");
  await shoot(page, testInfo, "event-leg-sans-voiture");
});

// event-board v4.8, state 1 (#779): Léa, of the device and without a number, is the passenger of
// Marc, of another device, who has his. The card asks for a number under its seats.
test("a car's card asks the device for a number", async ({ db, page, seededEvent }, testInfo) => {
  const { id } = seededEvent;
  const marc = await seedPerson(db, id, { firstName: "Marc", phone: "06 12 34 56 78" });
  const ride = await seedRide(db, id, marc.id);
  const token = newToken();
  const lea = await seedPerson(db, id, { firstName: "Léa" }, token);
  await seedPlacement(db, { personId: lea.id, eventId: id, leg: "aller", rideId: ride });
  await holdToken(page, id, token);

  await page.goto(`/e/${id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Ajouter un numéro pour Léa", exact: true })).toBeVisible();
  await shoot(page, testInfo, "event-phone-ask");
});
