import type { Page } from "@playwright/test";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #1004, event-board v5.3 RL6.1, RL6.4, RL6.5: « Ajouter une personne » notes a first name the device already has.

const noteFr = (name: string) => `Une personne s’appelle déjà ${name} sur cet appareil.`;

const form = (page: Page) => page.getByRole("dialog", { name: /^(Ajouter une personne|Add a person)$/ });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const withoutCar = (page: Page) => page.getByRole("tabpanel").getByRole("region", { name: "Sans voiture" });

/** The grey of the helps, as the browser computes it (read like `destructive` in sheet.spec.ts). */
const muted = (page: Page) =>
  page.evaluate(() => getComputedStyle(Object.assign(document.body.appendChild(document.createElement("p")), { className: "text-muted-foreground" })).color);

async function openForm(page: Page, name = "Ajouter une personne") {
  const button = page.getByRole("tabpanel").getByRole("button", { name, exact: true });
  await expect(async () => {
    await button.click({ timeout: 1_000 });
    await expect(form(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function register(page: Page, firstName: string, name?: string) {
  await openForm(page, name);
  await form(page).getByLabel(/^(Prénom|First name)$/).fill(firstName);
  await form(page).getByRole("button", { name: /^(Valider|Confirm)$/ }).click();
  await expect(form(page)).toHaveCount(0);
}

test.describe("« Ajouter une personne » and a first name of the device", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test.beforeEach(async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
  });

  test("RL6.4: the grey line says who has the name, as the device saved it, and goes with the match; nothing is blocked", async ({ page }) => {
    await register(page, "Tiago");
    await openForm(page);
    const firstName = form(page).getByLabel("Prénom");
    await firstName.fill("tiago");
    const note = form(page).getByText(noteFr("Tiago"), { exact: true });
    await expect(note).toBeVisible();
    const describedBy = (await firstName.getAttribute("aria-describedby"))!.split(" ");
    expect(describedBy).toContain(await note.getAttribute("id"));
    await expect(note).toHaveCSS("color", await muted(page));

    await firstName.fill("Tiagoo");
    await expect(form(page).getByText(/s’appelle déjà/)).toHaveCount(0);

    await firstName.fill("tiago");
    await expect(note).toBeVisible();
    await form(page).getByRole("button", { name: "Valider" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("row").filter({ hasText: "Tiago" })).toHaveCount(2);
  });

  test("RL6.4: « Modifier » never notes a first name of the device", async ({ page }) => {
    await register(page, "Tiago");
    await register(page, "Ana");
    await withoutCar(page).getByRole("button", { name: "Ana", exact: true }).click();
    await page.getByRole("dialog", { name: /^Ana/ }).getByRole("button", { name: "Modifier", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Modifier Ana" });
    await edit.getByLabel("Prénom").fill("tiago");
    await expect(edit.getByLabel("Prénom")).toHaveValue("tiago");
    await expect(edit.getByText(/s’appelle déjà/)).toHaveCount(0);
  });

  test("RL6.1: only the persons of this device count", async ({ page, seededEvent, context }) => {
    const other = await context.browser()!.newContext({ locale: "fr-FR" });
    try {
      const away = await other.newPage();
      await holdToken(away, seededEvent.id, newToken());
      await away.goto(`/e/${seededEvent.id}`);
      await register(away, "Hugo");
    } finally {
      await other.close();
    }
    await page.reload();
    await openForm(page);
    await form(page).getByLabel("Prénom").fill("hugo");
    await expect(form(page).getByLabel("Prénom")).toHaveValue("hugo");
    await expect(form(page).getByText(/s’appelle déjà/)).toHaveCount(0);
  });
});

test.describe("« Ajouter une personne » and a first name of the device, in English", () => {
  test.use({ locale: "en-GB" });

  test("RL6.5: speaks English", async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, newToken());
    await page.goto(`/e/${seededEvent.id}`);
    await register(page, "Tiago", "Add a person");
    await openForm(page, "Add a person");
    await form(page).getByLabel("First name").fill("tiago");
    await expect(form(page).getByText("Someone on this device is already called Tiago.", { exact: true })).toBeVisible();
  });
});
