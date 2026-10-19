import type { Page } from "@playwright/test";
import type { SeededEvent } from "@/db/test-events";
import { leaveNoToken } from "./fixtures";
import {
  digitsOf,
  expect,
  type Exchange,
  hideToken,
  oneCharOff,
  organiserPath,
  type ScenePhones,
  seedOrganiserScene,
  test,
  watchHash,
} from "./organiser";

/*
 * #178, epic #154: in the browser, before any screen, the organiser area receives the numbers
 * DO1 allows and no other, and its token stays in the body of `loadOrganiserPanel`. The
 * browser holds no personal token. The fixture `organiserTraffic` checks every test for the
 * token (O6.1) and the storage for the token and the numbers (O2.10).
 */

leaveNoToken();

const FR = { panel: "Espace organisateur", invalid: "Ce lien d’organisateur n’est pas valide." };

type Letter = keyof ScenePhones;
const WITH_A_NUMBER: Letter[] = ["a", "b", "c", "e"];

/** Each place where a number of `letters` appears, as « A in … »: never the text itself. */
function numbersIn(places: [string, string][], phones: ScenePhones, letters: Letter[]): string[] {
  return places.flatMap(([where, text]) =>
    letters
      .filter((letter) => digitsOf(phones[letter]).some((form) => text.includes(form)))
      .map((letter) => `${letter.toUpperCase()} in ${where}`),
  );
}

/** Each answer, named by its request, whose path is shown without the token, should it carry it. */
function answers(exchanges: Exchange[], { token }: SeededEvent): [string, string][] {
  return exchanges.map((each, n) => [`answer ${n} (${each.method} ${hideToken(each.path, token)})`, each.answer]);
}

async function dom(page: Page): Promise<[string, string]> {
  return ["the DOM", await page.content()];
}

/** The request that carries the admin token in its body: the panel's read. */
function carrying(exchanges: Exchange[], token: string): Exchange[] {
  return exchanges.filter(({ requestBody }) => requestBody.includes(token));
}

test.use({ locale: "fr-FR" });

let phones: ScenePhones;

test.beforeEach(async ({ db, seededEvent }) => {
  phones = await seedOrganiserScene(db, seededEvent.id);
});

test("O2.5, O6.1, O6.3: with the right link, B's and C's numbers in the panel's answer only, never A's nor E's", async ({
  page,
  seededEvent,
  organiserTraffic,
  baseURL,
}) => {
  const hashChanges = await watchHash(page);
  const arrival = new URL(organiserPath(seededEvent), baseURL).href;
  await page.goto(organiserPath(seededEvent), { waitUntil: "networkidle" });
  await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();

  const exchanges = await organiserTraffic.exchanges();
  // O6.1, the witness: the token is in the body of one request, the action posted to the page.
  const panelReads = carrying(exchanges, seededEvent.token);
  expect(panelReads.map(({ method, path, action }) => ({ method, path: hideToken(path, seededEvent.token), action })))
    .toEqual([{ method: "POST", path: `/e/${seededEvent.id}/admin`, action: true }]);
  const [panelRead] = panelReads;
  const others = exchanges.filter((each) => each !== panelRead);

  expect(numbersIn([...answers(exchanges, seededEvent), await dom(page)], phones, ["a", "e"])).toEqual([]);
  expect(panelRead.answer.includes(phones.b), "B's number in the panel's answer").toBe(true);
  expect(panelRead.answer.includes(phones.c), "C's number in the panel's answer").toBe(true);
  expect(numbersIn([...answers(others, seededEvent), await dom(page)], phones, ["b", "c"])).toEqual([]);

  // O6.3: nothing touched the fragment.
  expect(await hashChanges()).toBe(0);
  expect(page.url() === arrival, "the URL is still the one arrived at").toBe(true);
});

for (const [name, link, checks] of [
  ["a token one character off", ({ id, token }: SeededEvent) => `/e/${id}/admin#${oneCharOff(token)}`, 1],
  ["no fragment", ({ id }: SeededEvent) => `/e/${id}/admin`, 0],
] as const) {
  test(`O2.6: with ${name}, no number of the scene in any answer`, async ({ page, seededEvent, organiserTraffic }) => {
    await page.goto(link(seededEvent), { waitUntil: "networkidle" });
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ })).toContainText(FR.invalid);

    const exchanges = await organiserTraffic.exchanges();
    // The witness: the wrong token's check was answered, and its answer recorded.
    expect(carrying(exchanges, oneCharOff(seededEvent.token)).length, "checks of the wrong token").toBe(checks);
    expect(numbersIn([...answers(exchanges, seededEvent), await dom(page)], phones, WITH_A_NUMBER)).toEqual([]);
  });
}

test("O2.9: the HTML of /e/{id}/admin holds no number of the scene, nor the panel's answer", async ({
  page,
  seededEvent,
  organiserTraffic,
}) => {
  await page.goto(organiserPath(seededEvent), { waitUntil: "networkidle" });
  await expect(page.getByRole("region", { name: FR.panel })).toBeVisible();

  const exchanges = await organiserTraffic.exchanges();
  const html = exchanges.filter((each) => each.html && each.path === `/e/${seededEvent.id}/admin`);
  expect(html.length, "HTML documents of /e/{id}/admin").toBe(1);
  expect(numbersIn(answers(html, seededEvent), phones, WITH_A_NUMBER)).toEqual([]);
  expect(html[0].answer.includes("carsWithoutPhone"), "the panel's answer in the HTML").toBe(false);
  // The witness: the word is the panel's, in its answer.
  const [panelRead] = carrying(exchanges, seededEvent.token);
  expect(panelRead?.answer.includes("carsWithoutPhone"), "the word in the panel's answer").toBe(true);
});

test("O7.6, O2.8: /e/{id} sends no number of the scene, and shows nothing of the organiser area", async ({
  page,
  seededEvent,
  organiserTraffic,
}) => {
  await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: /^Aller/ })).toHaveAttribute("aria-selected", "true");

  const exchanges = await organiserTraffic.exchanges();
  expect(exchanges.some(({ html }) => html), "an HTML document recorded").toBe(true);
  expect(numbersIn([...answers(exchanges, seededEvent), await dom(page)], phones, WITH_A_NUMBER)).toEqual([]);
  await expect(page.getByRole("region", { name: FR.panel })).toHaveCount(0);
  await expect(page.getByText("Lien d’organisateur")).toHaveCount(0);
});
