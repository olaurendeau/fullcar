import type { Page } from "@playwright/test";
import { seedRemovalExample, type RemovalExample } from "@/db/test-removal-example";
import { messages } from "./device";
import { leaveNoToken } from "./fixtures";
import { expect, holdActionsWith, isAction, LEG_HEADINGS, legButton, organiserPath, test } from "./organiser";

/*
 * #672 (docs/design/remove-person/, v2.2, RP4; organizer-view v3.5, O5.8 and O9.4 for this
 * section): « Personnes inscrites » in the organiser area, and « Retirer » there, on the example of
 * the mock-ups (`seedRemovalExample`). Each test runs under the fixture `organiserTraffic`.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const FR = {
  hint: "Retirer une personne l’efface de l’événement, avec ses voitures et ses places. Personne n’est prévenu.",
  erased: "Son prénom, son numéro s’il y en a un et ses inscriptions seront effacés.",
  final: "C’est définitif.",
  noAccess: "L’espace organisateur ne vous est plus ouvert : rechargez la page.",
};

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const button = (page: Page) => page.locator("#organiser-persons > button");
const names = (page: Page) => panel(page).locator("[data-person-row] [data-line-focus]");
const row = (page: Page, n: number) => panel(page).locator("[data-person-row]").nth(n);
const confirmation = (page: Page, firstName: string) => page.getByRole("alertdialog", { name: `Retirer ${firstName} de l’événement ?` });
const legStates = (page: Page) => panel(page).locator(`${LEG_HEADINGS} > button`).evaluateAll((all) => all.map((each) => each.getAttribute("aria-expanded")));

/** Counts the server actions whose body carries `text` from now on. */
function countActions(page: Page, text = "") {
  let count = 0;
  page.on("request", (request) => void (isAction(request) && (request.postData() ?? "").includes(text) && count++));
  return () => count;
}

let example: RemovalExample;
test.beforeEach(async ({ db, seededEvent }) => {
  example = await seedRemovalExample(db, seededEvent);
});

test("RP4.1–RP4.3, O9.4: folded at every display, by first name, and nothing sent nor kept to unfold it", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await expect(button(page)).toHaveAccessibleName("Personnes inscrites (8)");
  await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  await expect(panel(page).getByText(FR.hint)).toBeHidden();
  const storage = () => page.evaluate(() => [Object.keys(localStorage).sort(), Object.keys(sessionStorage), document.cookie]);
  const before = await storage();
  const sent = countActions(page);
  const at = await button(page).boundingBox();

  await button(page).click();
  await expect(button(page)).toHaveAttribute("aria-expanded", "true");
  await expect(button(page)).toBeFocused();
  expect(await button(page).boundingBox()).toEqual(at);
  expect(await legStates(page)).toEqual(["false", "false"]);
  await expect(panel(page).getByText(FR.hint)).toBeVisible();
  await expect(names(page)).toHaveText(["Claire", "Hugo", "Inès", "Léa", "Léa"]);
  await expect(row(page, 1)).toContainText("HugoAller : Avec MarcRetour : Ne fait pas le retour");
  await expect(row(page, 4)).toContainText("LéaAller : Sans voitureRetour : Sans voiture");
  await expect(row(page, 0).getByRole("button", { name: "Retirer Claire de l’événement", exact: true })).toHaveText("Retirer");
  await expect(panel(page).locator('#organiser-persons-content a[href^="tel:"]')).toHaveCount(0);

  await panel(page).getByRole("button", { name: "Afficher les 3 autres", exact: true }).click();
  await expect(names(page)).toHaveText(["Claire", "Hugo", "Inès", "Léa", "Léa", "Marc", "Sophie", "Tom"]);
  await legButton(page, "aller").click();
  await expect(button(page)).toHaveAttribute("aria-expanded", "true");
  await button(page).click();
  await expect(panel(page).getByText(FR.hint)).toBeHidden();
  // O9.4: « un clic, Entrée ou Espace » — the keys unfold and fold it as the click does, in place.
  const here = await button(page).boundingBox();
  for (const [key, expanded] of [["Enter", "true"], ["Enter", "false"], ["Space", "true"], ["Space", "false"]] as const) {
    await button(page).focus();
    await page.keyboard.press(key);
    await expect(button(page)).toHaveAttribute("aria-expanded", expanded);
    await expect(button(page)).toBeFocused();
    expect(await button(page).boundingBox()).toEqual(here);
    if (expanded === "true") await expect(panel(page).getByText(FR.hint)).toBeVisible();
    else await expect(panel(page).getByText(FR.hint)).toBeHidden();
  }
  expect(await legStates(page)).toEqual(["true", "false"]);
  expect(sent()).toBe(0);
  expect(await storage()).toEqual(before);

  await page.reload();
  await expect(button(page)).toHaveAttribute("aria-expanded", "false");
});

test("RP4.5, RP4.6: the duplicate removed from the panel, then the count, the summaries and the focus", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await button(page).click();
  // Marc's first: the state, then the lines of the device, and whom to tell (RP4.5), then « Annuler ».
  await panel(page).getByRole("button", { name: "Afficher les 3 autres", exact: true }).click();
  await panel(page).getByRole("button", { name: "Retirer Marc de l’événement", exact: true }).click();
  await expect(confirmation(page, "Marc").locator("p, span")).toHaveText([
    "Aller : ConduitRetour : Avec Sophie",
    "Aller : Conduit",
    "Retour : Avec Sophie",
    "Sa voiture pour l’aller sera retirée. 3 personnes redeviendront sans voiture.",
    "Sa place dans la voiture de Sophie au retour sera libérée.",
    "Personne n’est prévenu, pas même Marc.",
    FR.erased,
    FR.final,
  ]);
  await expect(confirmation(page, "Marc").getByRole("button", { name: "Annuler" })).toBeFocused();
  await page.keyboard.press("Escape");
  await panel(page).getByRole("button", { name: "Réduire la liste", exact: true }).click();

  await row(page, 4).getByRole("button", { name: "Retirer Léa de l’événement", exact: true }).click();
  const doublon = confirmation(page, "Léa");
  await expect(doublon.locator("p, span").first()).toHaveText("Aller : Sans voitureRetour : Sans voiture");
  await expect(doublon.getByText("Personne n’est prévenu, pas même Léa.")).toBeVisible();
  await doublon.getByRole("button", { name: "Retirer de l’événement", exact: true }).click();

  await expect(messages(page)).toHaveText(["Léa ne fait plus partie de l’événement"]);
  await expect(button(page)).toHaveAccessibleName("Personnes inscrites (7)");
  await expect(names(page)).toHaveText(["Claire", "Hugo", "Inès", "Léa", "Marc"]);
  await expect(names(page).nth(4)).toBeFocused();
  await expect(page.locator("#organiser-leg-aller-summary")).toHaveText(/1 sans voiture.*1 place libre/);
  await expect(page.locator("#organiser-leg-retour-summary")).toHaveText(/2 sans voiture.*4 places libres/);
  expect(await legStates(page)).toEqual(["false", "false"]);
});

test("RP4.4: at 0, the button is there, and unfolded it says nobody has signed up, without the hint", async ({ page, seededEvent, db }) => {
  await db.deleteFrom("person").where("event_id", "=", seededEvent.id).execute();
  await page.goto(organiserPath(seededEvent));
  await expect(button(page)).toHaveAccessibleName("Personnes inscrites (0)");
  await button(page).click();
  await expect(panel(page).locator("#organiser-persons-content")).toHaveText("Personne ne s’est encore inscrit.");
});

// RP4.7 follows RP1.7 and RP1.9–RP1.11 (#854): said in the confirmation open, in the bar once it is closed.
for (const closed of [false, true]) {
  const where = closed ? "the confirmation closed before the answer: in the bar" : "the confirmation open: there, not in the bar";
  test(`RP4.7, decision 17: no access any more is final; ${where}; each reopening says it, and sends nothing`, async ({ page, seededEvent, db }) => {
    await page.goto(organiserPath(seededEvent));
    await button(page).click();
    await db.updateTable("event").set({ admin_token_hash: null }).where("id", "=", seededEvent.id).execute();
    const held = closed ? await holdActionsWith(page, example.persons.doublon.id) : undefined;
    const sent = countActions(page, example.persons.doublon.id);
    const remove = row(page, 4).getByRole("button", { name: "Retirer Léa de l’événement", exact: true });
    await remove.click();
    await confirmation(page, "Léa").getByRole("button", { name: "Retirer de l’événement", exact: true }).click();
    if (held) {
      await expect.poll(held.held).toBe(1);
      await page.keyboard.press("Escape");
      await held.release();
      await expect(messages(page)).toHaveText([`Léa fait toujours partie de l’événement. ${FR.noAccess}`]);
      await remove.click();
    }

    for (const opening of [1, 2]) {
      const open = confirmation(page, "Léa");
      await expect(open.getByRole("alert")).toHaveText(FR.noAccess);
      await expect(open.getByRole("button")).toHaveText(["Fermer"]);
      await expect(open.getByRole("button", { name: "Fermer" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(remove).toBeFocused();
      if (opening === 1) await remove.click();
    }
    expect(sent()).toBe(1);
    await expect(messages(page)).toHaveCount(closed ? 1 : 0);
    expect(await db.selectFrom("person").select("id").where("id", "=", example.persons.doublon.id).execute()).toHaveLength(1);
  });
}

// RP4.7 follows RP1.11 (#854): a failure that sending again could change is not kept. The confirmation
// reopened is a new one, with the red button, and the removal goes through without a reload.
const TRANSIENT = {
  offline: "Action impossible, vérifiez la connexion",
  "a server error (500)": "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
} as const;
for (const [what, said] of Object.entries(TRANSIENT)) {
  test(`RP4.7, RP1.11, ${what}: not kept as final; the confirmation reopened is new, and the removal goes through`, async ({
    context,
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await button(page).click();
    const held = await holdActionsWith(page, example.persons.doublon.id);
    const sent = countActions(page, example.persons.doublon.id);
    const remove = row(page, 4).getByRole("button", { name: "Retirer Léa de l’événement", exact: true });
    const confirm = confirmation(page, "Léa").getByRole("button", { name: "Retirer de l’événement", exact: true });
    await remove.click();
    await confirm.click();
    await expect.poll(held.held).toBe(1);
    if (what === "offline") {
      await context.setOffline(true);
      await held.lose();
    } else {
      await held.fail();
    }
    await expect(confirmation(page, "Léa").getByRole("alert")).toHaveText(said);
    await expect(confirmation(page, "Léa").getByRole("button")).toHaveText(["Retirer de l’événement", "Annuler"]);
    await context.setOffline(false);

    await confirmation(page, "Léa").getByRole("button", { name: "Annuler" }).click();
    await expect(remove).toBeFocused();
    await remove.click();
    await expect(confirmation(page, "Léa").getByRole("alert")).toHaveCount(0);
    await expect(confirmation(page, "Léa").getByRole("button")).toHaveText(["Retirer de l’événement", "Annuler"]);
    await confirm.click();
    await expect.poll(held.held).toBe(1);
    await held.release();

    await expect(messages(page)).toHaveText(["Léa ne fait plus partie de l’événement"]);
    await expect(button(page)).toHaveAccessibleName("Personnes inscrites (7)");
    expect(sent()).toBe(2);
  });
}
