import type { Locator } from "@playwright/test";

/** The contrast ratio of `text`'s colour on `background`'s, as WCAG computes it: a canvas reads any CSS colour. */
export async function contrast(text: Locator, background: Locator): Promise<number> {
  const fg = await text.evaluate((element) => getComputedStyle(element).color);
  const bg = await background.evaluate((element) => getComputedStyle(element).backgroundColor);
  return text.page().evaluate(
    ([fg, bg]) => {
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    },
    [fg, bg],
  );
}
