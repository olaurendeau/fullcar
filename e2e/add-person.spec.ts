import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedRide } from "@/db/test-participants";
import { isPersonalToken } from "@/domain/personal-token";
import { bar, failActions, holdActions, holdClose, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #88: « Ajouter une personne » on each leg, its form in a bottom sheet, and the device it makes.

const FR = {
  add: "Ajouter une personne",
  firstName: "Prénom",
  phone: "Téléphone (facultatif)",
  phoneHint: "Visible seulement par l’organisateur et par les personnes de la même voiture.",
  both: "Aller et retour",
  bothHint: {
    aller: "Décochez si cette personne ne fait que l’aller.",
    retour: "Décochez si cette personne ne fait que le retour.",
  },
  remember: "Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement.",
  storageTitle: "Cet appareil ne pourra pas s’en souvenir",
  storageBody:
    "Votre navigateur bloque le stockage : après la fermeture de la page, ces inscriptions ne pourront plus être modifiées depuis cet appareil.",
  required: "Champ requis.",
  invalidPhone: "Numéro non valide : de 6 à 15 chiffres, avec seulement des espaces et + . - ( )",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
  /** In the bar, the failure names who was not added (C11.11, #225). */
  barFailed: "Léa n’a pas pu rejoindre vos inscriptions. Une erreur est survenue : réessayez dans un instant.",
};

const storageKey = (id: string) => `fullcar:personal-token:${id}`;

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

const addButton = (scope: Page | Locator) => scope.getByRole("button", { name: FR.add, exact: true });
const form = (page: Page) => page.getByRole("dialog", { name: FR.add });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider" });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
const withoutCar = (panel: Locator) => panel.getByRole("region", { name: "Sans voiture" }).getByRole("listitem");
/** A failure while the form is open is said in the form, which stays open. */
const failure = (page: Page) => form(page).getByRole("alert");
const alerts = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

/** Each row of « Vos inscriptions », as its cells read. */
async function cells(page: Page): Promise<string[][]> {
  return section(page)
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent ?? "")));
}

/** Opens the form from the active tab: the button waits, inactive, until the device is known (C5.9). */
async function openForm(page: Page, scope: Locator = page.getByRole("tabpanel")) {
  await addButton(scope).click();
  await expect(form(page)).toBeVisible();
}

async function register(page: Page, firstName: string) {
  await openForm(page);
  await form(page).getByLabel(FR.firstName).fill(firstName);
  await submit(page).click();
  await expect(form(page)).toHaveCount(0);
}

/** The registrations the page sends: server actions whose body carries `firstName`. */
function registrations(page: Page, firstName: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(firstName)) sent.push(request);
  });
  return sent;
}

/** The keys of `localStorage` that name event `id`. */
const keysOf = (page: Page, id: string) =>
  page.evaluate((event) => Object.keys(localStorage).filter((key) => key.includes(event)), id);

const firstNames = async (db: Kysely<Database>, eventId: string) =>
  (await db.selectFrom("person").select("first_name").where("event_id", "=", eventId).execute()).map(
    (row) => row.first_name,
  );

test.describe("add a person", () => {
  test.use({ locale: "fr-FR" });

  test("C1.1: on each leg, before the cars, with no person on the device", async ({ db, page, seededEvent }) => {
    const marc = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
    await seedRide(db, seededEvent.id, marc.id);
    await seedRide(db, seededEvent.id, marc.id, { leg: "retour" });
    await page.goto(`/e/${seededEvent.id}`);
    for (const leg of ["Aller", "Retour"]) {
      await selectTab(page, leg);
      const panel = page.getByRole("tabpanel");
      await expect(addButton(panel)).toBeEnabled();
      // The design's « userplus » icon, before the words.
      await expect(addButton(panel).locator('svg[aria-hidden="true"]')).toHaveCount(1);
      expect((await addButton(panel).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // In the document's order: the button, then the cars.
      const order = await panel.evaluate((root) =>
        Array.from(root.querySelectorAll("button, article"), (node) => (node.tagName === "ARTICLE" ? "car" : node.textContent)),
      );
      expect(order.indexOf(FR.add)).toBeLessThan(order.indexOf("car"));
      expect(order.indexOf(FR.add)).toBeGreaterThanOrEqual(0);
    }
  });

  test("C1.1: there too with a person on the device", async ({ db, page, seededEvent }) => {
    const token = newToken();
    await seedPerson(db, seededEvent.id, { firstName: "Claire" }, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(section(page)).toBeVisible();
    for (const leg of ["Aller", "Retour"]) {
      await selectTab(page, leg);
      await expect(addButton(page.getByRole("tabpanel"))).toBeEnabled();
    }
  });

  test("C1.2, C1.13: each field has its label, and a form opened then closed leaves nothing", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    const sheet = form(page);
    await expect(sheet).toContainText(FR.remember);
    const firstName = sheet.getByLabel(FR.firstName);
    await expect(firstName).toBeFocused();
    await expect(sheet.getByLabel(FR.phone)).toHaveAccessibleDescription(FR.phoneHint);
    const both = sheet.getByLabel(FR.both);
    await expect(both).toBeChecked();
    await expect(both).toHaveAccessibleDescription(FR.bothHint.aller);
    await expect(sheet.getByText(FR.storageTitle)).toHaveCount(0);

    await firstName.fill("Léa");
    await sheet.getByRole("button", { name: "Fermer" }).click();
    await expect(sheet).toHaveCount(0);
    // Radix gives the focus back to the button that opened it.
    await expect(addButton(page.getByRole("tabpanel"))).toBeFocused();
    expect(await keysOf(page, seededEvent.id)).toEqual([]);

    // From the Retour tab, the box speaks of the retour.
    await selectTab(page, "Retour");
    await openForm(page);
    await expect(form(page).getByLabel(FR.both)).toHaveAccessibleDescription(FR.bothHint.retour);
    await page.keyboard.press("Escape");
    expect(await keysOf(page, seededEvent.id)).toEqual([]);
  });

  test("C1.10, C9.4, C2.2, C3.6: three actions, then the person is the device's, with no reload", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(section(page)).toHaveCount(0);
    await expect(panel.getByRole("status")).toHaveCount(0);

    // « Ajouter une personne », the first name, « Valider ».
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await submit(page).click();

    await expect(form(page)).toHaveCount(0);
    await expect(addButton(panel)).toBeFocused();
    await expect(withoutCar(panel)).toHaveText(["Léa"]);
    // The banner and the pills follow, on both legs (C9.4).
    await expect(panel.getByRole("status")).toHaveText("1 sans voiture · il manque 1 place");
    await expect(page.getByRole("tab")).toHaveText(["Aller 1 sans voiture", "Retour 1 sans voiture"]);
    // « Vos inscriptions » appears, unfolded: the device is ready.
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(toggle(page)).toContainText("1 personne · 1 sans voiture");
    expect(await cells(page)).toEqual([["Sans voiture", "Sans voiture"]]);
  });

  test("C2.2, C3.6: after a first registration, the device is ready, and the free seats stay active", async ({
    db,
    page,
    seededEvent,
  }) => {
    const marc = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
    await seedRide(db, seededEvent.id, marc.id);
    await page.goto(`/e/${seededEvent.id}`);
    await register(page, "Léa");
    // Only a ready device shows its section: still `none`, it would not. Active seats hold for both.
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    const seats = page.getByRole("tabpanel").getByRole("button", { name: /^Place libre : / });
    await expect(seats).toHaveCount(3);
    for (const seat of await seats.all()) await expect(seat).toBeEnabled();
  });

  test("C1.3, C2.1: unticked on the Retour, not on the aller; two persons, one token, both kept", async ({
    page,
    seededEvent,
  }) => {
    const lea = registrations(page, "Léa");
    const tom = registrations(page, "Tom");
    await page.goto(`/e/${seededEvent.id}`);
    await register(page, "Léa");

    await selectTab(page, "Retour");
    await openForm(page);
    await form(page).getByLabel(FR.both).uncheck();
    await form(page).getByLabel(FR.firstName).fill("Tom");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect(await cells(page)).toEqual([
      ["Sans voiture", "Sans voiture"],
      ["Ne fait pas l’aller", "Sans voiture"],
    ]);

    // Both requests carried the one token the device stored.
    const stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", storageKey(seededEvent.id));
    expect(isPersonalToken(stored)).toBe(true);
    expect(lea.length).toBe(1);
    expect(tom.length).toBe(1);
    expect([lea[0], tom[0]].map((request) => request.postData()?.includes(stored))).toEqual([true, true]);

    await page.reload();
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa", "Tom"]);
  });

  test("C1.5: the token is stored under the event's key before the request leaves", async ({ page, seededEvent }) => {
    const seen = { stored: "", carried: false, inUrl: true };
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (request.headers()["next-action"] && request.postData()?.includes("Léa")) {
        seen.stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", storageKey(seededEvent.id));
        seen.carried = seen.stored !== "" && (request.postData() ?? "").includes(seen.stored);
        seen.inUrl = seen.stored !== "" && request.url().includes(seen.stored);
      }
      await route.continue();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await register(page, "Léa");

    expect(isPersonalToken(seen.stored)).toBe(true);
    expect(seen.carried).toBe(true);
    expect(seen.inUrl).toBe(false);
    await page.reload();
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
  });

  test("C1.8: an empty first name and a malformed number create nothing", async ({ db, page, seededEvent }) => {
    const sent = registrations(page, "06 12");
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    const sheet = form(page);
    const firstName = sheet.getByLabel(FR.firstName);
    const phone = sheet.getByLabel(FR.phone);
    await phone.fill("06 12");
    await submit(page).click();

    await expect(firstName).toHaveAccessibleDescription(FR.required);
    await expect(phone).toHaveAccessibleDescription(`${FR.invalidPhone} ${FR.phoneHint}`);
    await expect(firstName).toHaveAttribute("aria-invalid", "true");
    await expect(firstName).toBeFocused();
    await expect(phone).toHaveValue("06 12");

    // The first name right, the number still wrong: the focus goes to it.
    await firstName.fill("Léa");
    await submit(page).click();
    await expect(phone).toBeFocused();
    await expect(firstName).not.toHaveAttribute("aria-invalid");
    await expect(firstName).toHaveValue("Léa");
    expect(sent.length).toBe(0);
    expect(await firstNames(db, seededEvent.id)).toEqual([]);
  });

  test("C1.9: two quick taps send one request, and « Valider » is inactive meanwhile", async ({ page, seededEvent }) => {
    const sent = registrations(page, "Léa");
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    const release = await holdActions(page);
    await submit(page).dblclick();
    await expect(submit(page)).toBeDisabled();
    release();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
    expect(sent.length).toBe(1);
  });

  test("C1.12: a response lost after the write, sent again, makes one person, the device's", async ({
    db,
    page,
    seededEvent,
  }) => {
    let lost = false;
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (!lost && request.headers()["next-action"] && request.postData()?.includes("Léa")) {
        lost = true;
        // The request reaches the server and writes; its answer never reaches the page.
        await route.fetch();
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await submit(page).click();
    await expect(failure(page)).toHaveText(FR.failed);
    await expect(form(page).getByLabel(FR.firstName)).toHaveValue("Léa");

    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    // Nothing is left to say, in the bar either.
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
    expect(await firstNames(db, seededEvent.id)).toEqual(["Léa"]);
    await page.reload();
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
  });

  test("offline: said in the form, which keeps its values; nothing sent, nothing stored", async ({
    context,
    page,
    seededEvent,
  }) => {
    const sent = registrations(page, "Léa");
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await context.setOffline(true);
    await submit(page).click();
    await expect(failure(page)).toHaveText("Action impossible, vérifiez la connexion");
    await expect(form(page).getByLabel(FR.firstName)).toHaveValue("Léa");
    expect(sent.length).toBe(0);
    expect(await keysOf(page, seededEvent.id)).toEqual([]);

    // A field error replaces the message: the two are never shown together.
    await form(page).getByLabel(FR.firstName).clear();
    await submit(page).click();
    await expect(form(page).getByLabel(FR.firstName)).toHaveAccessibleDescription(FR.required);
    await expect(failure(page)).toHaveCount(0);
    await form(page).getByLabel(FR.firstName).fill("Léa");

    await context.setOffline(false);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
  });

  test("a refusal in the open sheet: said there alone, and « Valider » keeps the focus", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await failActions(page);
    await submit(page).focus();
    await page.keyboard.press("Enter");
    await expect(failure(page)).toHaveText(FR.failed);
    await expect(submit(page)).toBeFocused();
    await expect(bar(page)).toBeEmpty();
  });

  // Radix keeps a closing sheet mounted until its animation ends: held here until the answer has
  // come, however long it takes (#398). Reopened once closed, the sheet shows a new form: the one that sent is gone.
  for (const when of ["closed", "closing", "reopened"] as const) {
    test(`a refusal once the sheet is ${when}: said in the bar, once no sheet hides the page`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, "Léa", true);
      await page.goto(`/e/${seededEvent.id}`);
      const held = when === "closing" ? await page.addStyleTag({ content: holdClose }) : undefined;
      await openForm(page);
      await form(page).getByLabel(FR.firstName).fill("Léa");
      await submit(page).click();
      await expect(submit(page)).toBeDisabled();
      await page.keyboard.press("Escape");
      if (when === "closing") await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
      else await expect(form(page)).toHaveCount(0);
      if (when === "reopened") await openForm(page);
      const seen = await watchAlerts(page);
      const responded = page.waitForResponse((response) => response.status() === 500);
      answer();
      await responded;
      // Still closing at the answer: it came during the animation.
      if (when === "closing") expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(1);
      // Answered: the sheet may end its closing.
      await held?.evaluate((style) => style.parentNode?.removeChild(style));
      if (when === "reopened") {
        // Marc registered once Léa's answer has come: his success neither clears nor replaces it.
        await form(page).getByLabel(FR.firstName).fill("Marc");
        // One tap sends it (#398): awaited together, the request is waited for as long as the click takes.
        await Promise.all([page.waitForRequest((request) => !!request.postData()?.includes("Marc")), submit(page).click()]);
        await expect(form(page)).toHaveCount(0);
      }
      await expect(bar(page)).toHaveText(FR.barFailed);
      // The sheet that sent says nothing, and the bar fills only once the page is no longer hidden.
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(alerts(page)).toHaveText([FR.barFailed]);
    });
  }

  // Reopened while it closes, the sheet shows the same form, which keeps what was typed.
  for (const sentAgain of [false, true]) {
    const outcome = sentAgain ? "sent again and done, nothing left to say" : "said once it closes";
    test(`a refusal while the sheet closes, reopened before it has: ${outcome}`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, "Léa", true);
      await page.goto(`/e/${seededEvent.id}`);
      const held = await page.addStyleTag({ content: holdClose });
      await openForm(page);
      await form(page).getByLabel(FR.firstName).fill("Léa");
      await submit(page).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
      const seen = await watchAlerts(page);
      const responded = page.waitForResponse((response) => response.status() === 500);
      answer();
      await responded;
      // Hidden from role queries while the sheet is mounted.
      await page.locator('[role="tabpanel"][data-state="active"] button', { hasText: FR.add }).focus();
      await page.keyboard.press("Enter");
      await expect(form(page)).toHaveAttribute("data-state", "open");
      // Reopened: its next closing may end.
      await held.evaluate((style) => style.parentNode?.removeChild(style));
      await expect(form(page).getByLabel(FR.firstName)).toHaveValue("Léa");
      if (sentAgain) {
        await submit(page).click();
        await expect(form(page)).toHaveCount(0);
        await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
        await openForm(page);
        await expect(bar(page)).toBeEmpty();
      } else {
        await page.keyboard.press("Escape");
        await expect(form(page)).toHaveCount(0);
        await expect(bar(page)).toHaveText(FR.barFailed);
      }
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
    });
  }

  // #276: the sheet's veil closes in 100 ms, its content in 200 ms. Reopened in between, the
  // veil came back after the content in the page, above it, and caught every tap. Real durations.
  test("#276: reopened 150 ms after « Fermer », its veil gone but the sheet still closing, « Valider » takes the tap", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    const closeThenReopen = async () => {
      const sheet = (await page.locator('[data-slot="sheet-content"]').elementHandle())!;
      // In the page, as a user's two taps: the time between them is not Playwright's.
      await page.evaluate(async () => {
        const named = (scope: ParentNode, name: string) =>
          Array.from(scope.querySelectorAll("button")).find((button) => button.textContent?.trim() === name)!;
        const close = named(document.querySelector('[role="dialog"]')!, "Fermer");
        const add = named(document.querySelector('[role="tabpanel"][data-state="active"]')!, "Ajouter une personne");
        close.click();
        await new Promise((resolve) => setTimeout(resolve, 150));
        // Not before its veil is gone, as late as a busy machine makes it: until then, the
        // sheet reopened keeps its veil, in its place.
        await new Promise<void>((resolve) => {
          const gone = () => !document.querySelector('[data-slot="sheet-overlay"]');
          if (gone()) return resolve();
          const observer = new MutationObserver(() => gone() && (observer.disconnect(), resolve()));
          observer.observe(document.body, { childList: true });
        });
        add.click();
      });
      await expect(form(page)).toHaveAttribute("data-state", "open");
      // Not what the page shows at the second tap: an end React has yet to render can still
      // drop the sheet (#285's CI). What counts is what it kept: the same sheet, with its veil
      // remounted after it in the page, the order #276 is about.
      return sheet.evaluate((kept) => {
        const veil = document.querySelector('[data-slot="sheet-overlay"]');
        return { kept: kept.isConnected, veilAfter: !!veil && !!(kept.compareDocumentPosition(veil) & Node.DOCUMENT_POSITION_FOLLOWING) };
      });
    };
    // A busy machine can end the sheet's closing before the second tap: a new form then, typed
    // again, and the same two taps again.
    let reopened = await closeThenReopen();
    for (let tries = 1; tries < 10 && !(reopened.kept && reopened.veilAfter); tries++) {
      if (!reopened.kept) await form(page).getByLabel(FR.firstName).fill("Léa");
      reopened = await closeThenReopen();
    }
    expect(reopened).toEqual({ kept: true, veilAfter: true });

    await expect(form(page).getByLabel(FR.firstName)).toHaveValue("Léa");
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    // What a finger lands on at « Valider »'s centre: the sheet, not its veil.
    const box = (await submit(page).boundingBox())!;
    const under = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-slot="sheet-content"], [data-slot="sheet-overlay"]')?.getAttribute("data-slot"),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(under).toBe("sheet-content");
    await submit(page).tap();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);
  });

  // Next sends one server action at a time: the second waits for the first's answer, then goes.
  test("#167: a form opened while another's registration is on its way sends after it", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, "Léa", false);
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await submit(page).click();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);

    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Marc");
    await submit(page).click();
    // Sent, not dropped: inactive until its answer (C1.9).
    await expect(submit(page)).toBeDisabled();
    answer();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa", "Marc"]);
  });

  test("a success from a form closed since leaves the form opened meanwhile open", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, "Léa", false);
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await submit(page).click();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await openForm(page);
    answer();
    // Léa is the device's, behind the sheet, which stays open.
    await expect(page.locator("tbody th", { hasText: "Léa" })).toHaveCount(1);
    await expect(form(page)).toHaveAttribute("data-state", "open");
    await form(page).getByLabel(FR.firstName).fill("Marc");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa", "Marc"]);
  });

  test("C1.14: without localStorage, a warning, then a person for this page only", async ({ page, seededEvent }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      }),
    );
    await page.goto(`/e/${seededEvent.id}`);
    await openForm(page);
    await expect(form(page)).toContainText(FR.storageTitle);
    await expect(form(page)).toContainText(FR.storageBody);
    await expect(form(page)).not.toContainText(FR.remember);
    await form(page).getByLabel(FR.firstName).fill("Léa");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(section(page).getByRole("rowheader")).toHaveText(["Léa"]);

    await page.reload();
    await expect(addButton(page.getByRole("tabpanel"))).toBeEnabled();
    await expect(section(page)).toHaveCount(0);
  });

  test("C5.9: inactive while the device's persons load, and after a failure until « Réessayer »", async ({
    db,
    page,
    seededEvent,
  }) => {
    const token = newToken();
    await seedPerson(db, seededEvent.id, { firstName: "Claire" }, token);
    await holdToken(page, seededEvent.id, token);
    // Both legs' buttons, the hidden tab's too.
    const buttons = page.locator("button", { hasText: FR.add });

    const release = await holdActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" })).toBeVisible();
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    await addButton(page.getByRole("tabpanel")).click({ force: true });
    await expect(form(page)).toHaveCount(0);
    release();
    await expect(section(page)).toBeVisible();
    for (const button of await buttons.all()) await expect(button).toBeEnabled();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    const failing = await failActions(page);
    await page.reload();
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    failing.on = false;
    await retry.click();
    await expect(section(page)).toBeVisible();
    for (const button of await buttons.all()) await expect(button).toBeEnabled();
  });
});

test.describe("add a person, without a retour", () => {
  test.use({ locale: "fr-FR", eventFields: { retourAt: null } });

  test("C1.4: no box, and the person is without a car at the aller", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const legs = page.getByRole("region", { name: "Aller", exact: true });
    await openForm(page, legs);
    await expect(form(page).getByLabel(FR.both)).toHaveCount(0);
    await form(page).getByLabel(FR.firstName).fill("Paul");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    expect(await cells(page)).toEqual([["Sans voiture"]]);
    await expect(withoutCar(legs)).toHaveText(["Paul"]);
  });
});
