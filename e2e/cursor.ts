import { expect, type Locator } from "@playwright/test";
import { withoutNumbers } from "./without-numbers";

/*
 * The pointer of the language-switch design (v3.3.3, #347), as its README reads it: the
 * computed `cursor` of an element, once it is visible. The computed value does not depend on
 * the hover: no `hover()`. Expected values are exact: `pointer` (the hand), `default` (the
 * arrow), `text`, and `auto` where it is named.
 */

/** The computed `cursor` of `locator`, once visible. A failure names no phone number. */
export async function cursorOf(locator: Locator): Promise<string> {
  try {
    await expect(locator).toBeVisible();
    return await locator.evaluate((element) => getComputedStyle(element).cursor);
  } catch (error) {
    throw new Error(withoutNumbers(error instanceof Error ? error.message : String(error)));
  }
}

/** The computed `cursor` of each of `locators`, by name: one comparison shows them all. */
export async function cursorsOf(locators: Record<string, Locator>): Promise<Record<string, string>> {
  const cursors: Record<string, string> = {};
  for (const [name, locator] of Object.entries(locators)) cursors[name] = await cursorOf(locator);
  return cursors;
}
