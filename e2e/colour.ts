import { expect, type Locator, type Page } from "@playwright/test";

/*
 * Colours read as the visual-identity design reads them (#651): a computed colour, written in
 * oklch, painted on a 1 px canvas over #ffffff and read back in sRGB. A colour with transparency
 * is thus composed on white first, as the page shows it on its white background.
 */

export type Rgb = { r: number; g: number; b: number };

/** Runs in the page: `value` painted over white, read back. Throws on what is no colour, which a canvas would ignore. */
function onWhite(value: string): Rgb {
  if (!CSS.supports("color", value)) throw new Error(`colour: "${value}" is no colour`);
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

/** `property` of the element, computed, composed on white, in sRGB. */
export async function colour(locator: Locator, property: string): Promise<Rgb> {
  const value = await locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
  return locator.page().evaluate(onWhite, value);
}

/** The custom property `name` of `:root`, as `colour` reads it. */
export async function token(page: Page, name: `--${string}`): Promise<Rgb> {
  const value = await page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name);
  return page.evaluate(onWhite, value);
}

export const css = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`;

/** The largest gap, channel by channel, between `actual` and `expected`, written `rgb(r, g, b)`. */
export function gap(actual: Rgb, expected: string): number {
  const [r, g, b] = expected.match(/\d+/g)!.map(Number);
  return Math.max(Math.abs(actual.r - r), Math.abs(actual.g - g), Math.abs(actual.b - b));
}

/**
 * `property` of the element reaches `expected` within ±1 on each channel, the design's
 * tolerance: polled, so that a transition (`transition-all` of a button) has ended.
 */
export async function expectColour(locator: Locator, property: string, expected: string, what: string) {
  await expect(async () => {
    const actual = await colour(locator, property);
    expect(gap(actual, expected), `${what}: ${property} ${css(actual)}, not ${expected} ±1`).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5_000 });
}

/** The contrast ratio of two sRGB colours, as WCAG computes it. */
export function ratio(a: Rgb, b: Rgb): number {
  const luminance = ({ r, g, b }: Rgb) => {
    const [lr, lg, lb] = [r, g, b].map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
