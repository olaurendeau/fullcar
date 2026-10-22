import { cursorOf } from "./cursor";
import { expect, leaveNoToken, test } from "./fixtures";
import { withoutNumbers } from "./without-numbers";

leaveNoToken();

/*
 * #354: one `withoutNumbers`, shared by `e2e/cursor.ts` and `e2e/focus-ring-board.spec.ts`. A
 * phone number never reaches a test's output. Each check compares a boolean: a failure prints
 * true or false, never the text that holds the number.
 */

const PHONE = "06 11 22 33 44";

test.describe("withoutNumbers", () => {
  test("hides a phone number, written in any of its forms", () => {
    for (const phone of [PHONE, "0611223344", "+33 6 11 22 33 44", "+33611223344", "06.11.22.33.44", "06-11-22-33-44"]) {
      const hidden = withoutNumbers(`<a> "Appeler Léa au ${phone}"`);
      expect(hidden.includes(phone), `${phone.length} characters, in the text`).toBe(false);
      expect(hidden === '<a> "Appeler Léa au <numéro>"', `${phone.length} characters, all of them hidden`).toBe(true);
    }
  });

  test("lets a short number be: a count, an hour, a ring's width", () => {
    for (const text of ["Placer 1 personne", "Départ à 07:00", "2px solid", "Places : 3 sur 4"]) {
      expect(withoutNumbers(text) === text, text).toBe(true);
    }
  });
});

test("cursorOf: a failure on a tel: link names its number hidden", async ({ page }) => {
  await page.setContent(`<a href="tel:${PHONE.replaceAll(" ", "")}" hidden>Appeler Léa au ${PHONE}</a>`);
  const message = await cursorOf(page.getByText(`Appeler Léa au ${PHONE}`)).then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  expect(message !== "", "a failure").toBe(true);
  expect(message.includes("<numéro>"), "the number hidden in the message").toBe(true);
  for (const phone of [PHONE, PHONE.replaceAll(" ", "")]) {
    expect(message.includes(phone), `the number, ${phone.length} characters, in the message`).toBe(false);
  }
});
