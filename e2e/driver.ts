import type { Locator } from "@playwright/test";
import { withoutNumbers } from "./without-numbers";

/*
 * #775, epic #766: a car is offered by someone with a number. A new driver of « Proposer une
 * voiture » gives a first name and a number (`fillDriver`); a person of the device chosen to
 * drive is seeded with one (`seedPerson(…, { phone: DRIVER_PHONE })`). The device then sees it as
 * a `tel:` link in the car's card: an assertion that reads the card goes through `numbersHidden`.
 */

/** The number of a test's driver, seeded or typed: printed only through `withoutNumbers`. */
export const DRIVER_PHONE = "06 12 34 56 78";

/**
 * Fills a new driver's first name and number in `form`. The number's field is found by the start
 * of its label: « Téléphone (facultatif) », « Téléphone » or « Téléphone de {prénom} »;
 * « Phone (optional) » or « Phone ».
 */
export async function fillDriver(form: Locator, { firstName, phone }: { firstName: string; phone: string }) {
  await form.getByLabel(/^(Prénom|First name)$/).fill(firstName);
  await form.getByLabel(/^(Téléphone|Phone)/).fill(phone);
}

/** `run`, its failure rethrown with the numbers hidden: a card's text holds its `tel:` links. */
export async function numbersHidden<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(withoutNumbers(error instanceof Error ? error.message : String(error)));
  }
}
