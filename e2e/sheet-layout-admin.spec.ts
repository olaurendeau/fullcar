import type { Page } from "@playwright/test";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, organiserPath, seedOrganiserScene, test, unfoldLegs } from "./organiser";

leaveNoToken();

// #691 (event-board v4.6, rule 7, v4.6-15): closed, a sheet gives the page back where it was, less
// what the page scrolled itself meanwhile. On /admin, the board's compensation (O1.11) is kept.

test.use({ locale: "fr-FR", viewport: { width: 360, height: 780 } });

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur", includeHidden: true });
const board = (page: Page) => page.getByRole("tabpanel");

test("O1.11: /admin, the panel shorter after « Placer 1 personne » while the seat's sheet closes, the car looked at stays in place", async ({
  db,
  page,
  seededEvent,
}) => {
  await seedOrganiserScene(db, seededEvent.id);
  const token = newToken();
  for (const firstName of ["Oriane", "Paul"]) {
    const { id } = await seedPerson(db, seededEvent.id, { firstName }, token);
    await seedPlacement(db, { personId: id, eventId: seededEvent.id, leg: "aller", rideId: null });
  }
  await holdToken(page, seededEvent.id, token);
  await page.goto(organiserPath(seededEvent));
  await expect(panel(page).getByRole("button", { name: "Actualiser" })).toBeVisible();
  await unfoldLegs(page);
  // Room under the board, in main, as a longer board has: nothing but the compensation keeps the car in place.
  await page.addStyleTag({ content: 'html, main { overflow-anchor: none !important; } main::after { content: ""; display: block; height: 200vh; }' });
  const title = board(page).getByRole("heading", { name: "Voiture de Anaïs" });
  // Where the title is painted: two frames on, once the observer has run and scrolled.
  const y = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return (await title.boundingBox())!.y;
  };
  await title.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  expect(await panel(page).evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0);
  const before = await y();
  const height = (await panel(page).boundingBox())!.height;

  await board(page).getByRole("button", { name: /^Place libre : prendre une place dans la voiture de Anaïs/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Anaïs ?" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("checkbox", { name: /^Paul/ }).uncheck();
  await sheet.getByRole("button", { name: "Placer 1 personne" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The panel, read again, has Oriane no longer without a car: it is shorter.
  await expect.poll(async () => (await panel(page).boundingBox())!.height).toBeLessThan(height);
  expect(Math.abs((await y()) - before)).toBeLessThanOrEqual(1);
});
