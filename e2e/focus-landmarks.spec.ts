import type { Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { failActions, holdActions, holdFirst, holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { expectRing, press, pressUntil } from "./focus-ring";
import { holdActionsWith, oneCharOff, organiserPath, seedCrowd, seedOrganiserScene, test as organiserTest } from "./organiser";

/*
 * #321, #314, epic #236: F1.17 of the language-switch design (v3.3.1). The landmarks that had
 * no ring at all focused by the action that focuses them in the application, from the
 * keyboard, pass the focus-ring measure: « Chargement de vos inscriptions… », the event's
 * title, and on the organiser's page the alert « lien non valide », a leg's title and a
 * list's title. There, the fixture `organiserTraffic` checks every test for the admin token
 * (O6.1) and the storage (O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

const FR = {
  retry: "Réessayer",
  loading: "Chargement de vos inscriptions…",
  failed: "Le lien d’organisateur n’a pas pu être vérifié.",
  invalid: "Ce lien d’organisateur n’est pas valide.",
  panel: "Espace organisateur",
  refresh: "Actualiser",
  less: "Réduire la liste",
};

const retry = (page: Page) => page.getByRole("button", { name: FR.retry });
// Within the page's content, with text: the bar of messages keeps its own alert, empty (#87).
const alert = (page: Page, text: string) => page.getByRole("main").getByRole("alert").filter({ hasText: text });
const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const section = (page: Page, leg: "Aller" | "Retour") => panel(page).getByRole("region", { name: leg, exact: true });

test.describe("on the event's page", () => {
  test.use({ locale: "fr-FR" });

  test("F1.17: « Chargement de vos inscriptions… », after Enter on « Réessayer », the read held", async ({
    db,
    page,
    seededEvent,
  }) => {
    const token = newToken();
    const { id } = await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token);
    await seedPlacement(db, { personId: id, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    const failing = await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(retry(page)).toBeVisible();

    failing.on = false;
    const release = await holdActions(page);
    await pressUntil(page, "Tab", retry(page));
    await press(page, "Enter");
    const loading = page.getByRole("status").filter({ hasText: FR.loading });
    await expect(loading).toBeFocused();
    await expectRing(loading);
    release();
    await expect(loading).toHaveCount(0);
  });

  test.describe("without a retour", () => {
    test.use({ eventFields: { retourAt: null } });

    // The scene of device-persons.spec.ts « without tabs, « Fermer » on a line whose landmark is gone… ».
    test("F1.17: the event's title, after Enter on « Fermer » of a line whose landmark is gone (focusLandmark)", async ({
      db,
      page,
      seededEvent,
    }) => {
      const token = newToken();
      await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token);
      const sophie = await seedRide(db, seededEvent.id, (await seedPerson(db, seededEvent.id, { firstName: "Sophie" })).id);
      await holdToken(page, seededEvent.id, token);
      const answer = await holdFirst(page, sophie, false);
      await page.goto(`/e/${seededEvent.id}`);
      await page.getByRole("button", { name: /^Place libre/ }).first().click();
      const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Sophie ?" });
      await sheet.getByRole("checkbox", { name: "Tom", exact: true }).setChecked(true);
      await sheet.getByRole("button", { name: /^Placer/ }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await db.deleteFrom("ride").where("id", "=", sophie).execute();
      answer();
      await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Sophie. Cette voiture n’est plus proposée."]);
      await expect(page.getByRole("heading", { name: "Voiture de Sophie" })).toHaveCount(0);
      await expect(page.locator("[data-leg-banner]")).toHaveCount(0);

      const close = page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
      await pressUntil(page, "Shift+Tab", close);
      await press(page, "Enter");
      const title = page.getByRole("heading", { level: 1, name: "Tournoi de Rennes" });
      await expect(title).toBeFocused();
      await expectRing(title);
    });
  });
});

organiserTest.describe("on the organiser's page", () => {
  organiserTest.use({ locale: "fr-FR" });

  organiserTest("F1.17: the alert « lien non valide », once « Réessayer » finds the link invalid", async ({
    page,
    seededEvent,
  }) => {
    // Only the check fails: the action posted with the wrong token in its body, never the page's GET.
    const wrong = oneCharOff(seededEvent.token);
    const check = await holdActionsWith(page, wrong);
    await page.goto(`/e/${seededEvent.id}/admin#${wrong}`);
    await expect.poll(check.held).toBe(1);
    await check.lose();
    await expect(alert(page, FR.failed)).toBeVisible();
    await expect(alert(page, FR.invalid)).toHaveCount(0);

    // The route released, the second check answers « invalid ».
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await pressUntil(page, "Tab", retry(page));
    await press(page, "Enter");
    const invalid = alert(page, FR.invalid);
    await expect(invalid).toBeFocused();
    await expectRing(invalid);
  });

  organiserTest("F1.17: a leg's title, after Enter on its tile (goToLeg)", async ({ db, page, seededEvent }) => {
    await seedOrganiserScene(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const tile = panel(page).getByRole("button", { name: /sans voiture|place/ }).first();
    await pressUntil(page, "Tab", tile);
    await press(page, "Enter");
    const title = section(page, "Aller").getByRole("heading", { level: 3, name: "Aller" });
    await expect(title).toBeFocused();
    await expectRing(title);
  });

  organiserTest("F1.17: a list's title, when a read removes the line with the focus (noteFocus)", async ({
    db,
    page,
    seededEvent,
  }) => {
    await seedCrowd(db, seededEvent.id);
    await page.goto(organiserPath(seededEvent));
    const aller = section(page, "Aller");
    const list = aller.getByRole("list", { name: /^Sans voiture/ });
    const refresh = panel(page).getByRole("button", { name: FR.refresh });
    // 1. « Sans voiture » of the aller, 14 lines, unfolded; the panel's reads held.
    await aller.getByRole("button", { name: /^Afficher les \d+ autres$/ }).first().click();
    await expect(list.getByRole("listitem")).toHaveCount(14);
    const reads = await holdActionsWith(page, seededEvent.token);

    // 2. Enter on « Actualiser »: the read leaves, and is held.
    await pressUntil(page, "Shift+Tab", refresh);
    await press(page, "Enter");
    await expect.poll(reads.held).toBe(1);

    // 3. Tab to « Réduire la liste », under « Actualiser »; Enter folds, Enter unfolds: the 6th line.
    const fold = aller.getByRole("button", { name: /^(Réduire la liste|Afficher les \d+ autres)$/ });
    await expect(fold).toHaveCount(2);
    const less = fold.first();
    await expect(less).toHaveText(FR.less);
    await pressUntil(page, "Tab", less);
    await press(page, "Enter");
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(less).toBeFocused();
    await press(page, "Enter");
    await expect(list.getByRole("listitem")).toHaveCount(14);
    const sixth = list.getByRole("listitem").nth(5).locator("[data-line-focus]");
    await expect(sixth).toBeFocused();

    // 4. Its person deleted; 5. the read released: the line goes, the list's title has the focus.
    const firstName = await sixth.innerText();
    await db.deleteFrom("person").where("event_id", "=", seededEvent.id).where("first_name", "=", firstName).execute();
    await reads.release();
    await expect(list.getByRole("listitem")).toHaveCount(13);
    const title = aller.getByRole("heading", { level: 4, name: /^Sans voiture/ });
    await expect(title).toBeFocused();
    await expectRing(title);
  });
});
