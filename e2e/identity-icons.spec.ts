import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * #682, visual-identity v3 (VI4.6 to VI4.8): the tab icon, the Apple icon and the favicon,
 * once #171717, are in petrol, #005a5b, the car still #fafafa.
 */

type Rgba = [number, number, number, number];

const PETROL: Rgba = [0, 90, 91, 255];
const WHITE: Rgba = [250, 250, 250, 255];

/** The hand-drawn 16 px entry, recoloured: grey g → #005a5b + (g − 23) / 227 × (#fafafa − #005a5b). */
const RECOLOURED_RANGE: Rgba[] = [
  [0, 90, 91, 255],
  [28, 108, 109, 255],
  [56, 126, 127, 255],
  [84, 144, 144, 255],
  [111, 161, 162, 255],
  [139, 179, 179, 255],
  [166, 196, 197, 255],
  [195, 215, 215, 255],
  [222, 232, 232, 255],
  [250, 250, 250, 255],
];

const near = (actual: number[], expected: number[], tolerance: number) =>
  actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

/** The image at `src`, painted on a canvas of its own size: its size and every pixel, RGBA. */
async function paint(page: Page, src: string) {
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: [...data] };
  }, src);
}

type Painted = Awaited<ReturnType<typeof paint>>;

const pixel = ({ width, data }: Painted, x: number, y: number) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 4);

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

test("VI4.6 /icon.svg fills its square and its wheels with #005a5b, and no longer with #171717", async ({
  request,
}) => {
  const response = await request.get("/icon.svg");
  expect(response.status()).toBe(200);
  const svg = await response.text();
  expect(svg.match(/fill="#005a5b"/g)?.length).toBe(2);
  expect(svg).not.toContain("#171717");
});

test("VI4.7 /apple-icon.png is 180 × 180, petrol at its corner and white on the car", async ({ page }) => {
  const response = await page.request.get("/apple-icon.png");
  expect(response.status()).toBe(200);
  const image = await paint(page, dataUrl(await response.body()));
  expect([image.width, image.height]).toEqual([180, 180]);
  expect(near(pixel(image, 2, 2), PETROL, 2), `(2, 2) is ${pixel(image, 2, 2)}`).toBe(true);
  expect(near(pixel(image, 89, 98), WHITE, 2), `(89, 98) is ${pixel(image, 89, 98)}`).toBe(true);
});

test("VI4.8 /favicon.ico holds 16, 32 and 48 px RGBA PNGs, each petrol at its corner and white at its centre", async ({
  page,
}) => {
  const response = await page.request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  const ico = await response.body();

  // ICONDIR: reserved 0, type 1 (icon), 3 entries.
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);

  let next = 6 + 16 * 3;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + 16 * index;
    const name = `${size} px entry`;
    expect([ico[entry], ico[entry + 1]], name).toEqual([size, size]);
    expect(ico.readUInt16LE(entry + 6), `${name}, bits per pixel`).toBe(32);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    expect(offset, `${name}, right after the one before`).toBe(next);
    next = offset + length;

    const png = ico.subarray(offset, offset + length);
    expect(png.subarray(0, 8).toString("hex"), `${name}, PNG signature`).toBe("89504e470d0a1a0a");
    expect(png[25], `${name}, colour type`).toBe(6);

    const image = await paint(page, dataUrl(png));
    expect([image.width, image.height], name).toEqual([size, size]);
    const corner = pixel(image, 1, 1);
    const centre = pixel(image, size / 2, size / 2);
    expect(near(corner, PETROL, 2), `${name}, (1, 1) is ${corner}`).toBe(true);
    expect(near(centre, WHITE, 2), `${name}, centre is ${centre}`).toBe(true);

    if (size === 16) {
      const outside = [];
      for (let i = 0; i < image.data.length; i += 4) {
        const colour = image.data.slice(i, i + 4);
        if (!RECOLOURED_RANGE.some((allowed) => near(colour, allowed, 1))) outside.push(colour.join(","));
      }
      expect(outside, `${name}, colours outside the recoloured range`).toEqual([]);
    }
  }
  expect(next, "the last entry ends the file").toBe(ico.length);
});
