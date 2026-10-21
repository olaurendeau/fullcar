import { expect, type Locator, type Page } from "@playwright/test";

/*
 * The focus ring, measured as the language-switch design (v3.3.1) states it, epic #236:
 * 0. stable values: the finite animations have ended, endless ones are ignored, and the
 *    measure is read again by `expect.poll` until it passes or times out;
 * 1. the element has the focus from the keyboard (`:focus-visible`), never from `focus()`;
 * 2. a solid 2 px outline of rgb(115, 115, 115), opaque, at its offset (2, 0 or -2 px);
 * 3. the background it touches: the backgrounds from the parent up (from the element itself
 *    at -2 px), composed with their opacity down to an opaque one, or the page's white;
 * 4. a contrast of at least 3:1 with that background, by the WCAG 2.x formula;
 * 5. the opacities of the element and its ancestors multiply to 1;
 * 6. no more visible boxShadow layer focused than unfocused. The unfocused state is read
 *    before the keyboard moves (`noteUnfocused`, `press`), never by `blur()` or `focus()`.
 *    An element the action itself renders, then focuses (a sixth line unfolded, an alert,
 *    « Chargement… »), was not there to be read: it counts as no visible layer unfocused,
 *    so any visible layer it has focused fails. A layer is visible if its colour is not
 *    transparent and one of its lengths is not 0: `ring-0` writes a coloured layer of no
 *    length (checkbox, radio-group).
 *    Layers are counted, not compared: a halo that replaced a shadow already visible would
 *    pass. No component is in that case. Tailwind 4 writes `ring-*` in `--tw-ring-shadow`
 *    and `shadow-*` in `--tw-shadow`, two layers apart, so a ring is always added to a
 *    shadow. No component of `ui/` has a visible shadow unfocused (the tabs' `data-active:`
 *    never applies: Radix sets `data-state="active"`). The one layer visible unfocused is the
 *    error halo, `aria-invalid:ring-3`, which a focus halo would replace in the same layer.
 *    F1.8 excludes that twice: « Lieu » is not in error yet when the unfocused state is read,
 *    before Enter on « Créer », and F1.8 also asks for no visible layer at all focused.
 * Colours are read in sRGB through a canvas: the computed style writes oklch or oklab.
 */

export type Rgba = { r: number; g: number; b: number; a: number };
export type Offset = 2 | 0 | -2;
/** What the measure found: the element, the composed background touched, the ratio. */
export type Ring = { element: string; background: string; ratio: number };
type Options = { offset?: Offset; timeout?: number };

type Read = {
  element: string;
  focusVisible: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineColor: Rgba;
  backgrounds: Rgba[];
  opacity: number;
  shadows: number;
  unfocusedShadows: number | null;
};

const RING: Rgba = { r: 115, g: 115, b: 115, a: 1 };
const STORE = "__focusRingUnfocused";

/**
 * A computed colour of the element in sRGB, its opacity `a` from 0 to 1. The property is
 * written as in CSS (`background-color`): another name, or one that is no colour, throws.
 */
export const rgba = (locator: Locator, property: string): Promise<Rgba> =>
  locator.evaluate((element, name) => {
    const value = getComputedStyle(element).getPropertyValue(name);
    if (!CSS.supports("color", value)) throw new Error(`rgba: ${name} is no colour property ("${value}")`);
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  }, property);

/**
 * Records every element's boxShadow, before the keyboard moves the focus (step 6), once
 * the finite animations have ended as in step 0: a function run in the page shares no code.
 */
export async function noteUnfocused(page: Page) {
  await page.evaluate(async (store) => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
    const shadows = new WeakMap<Element, string>();
    for (const element of document.querySelectorAll("*")) shadows.set(element, getComputedStyle(element).boxShadow);
    (window as unknown as Record<string, unknown>)[store] = shadows;
  }, STORE);
}

/** A key pressed after the unfocused state is noted. */
export async function press(page: Page, key: string) {
  await noteUnfocused(page);
  await page.keyboard.press(key);
}

/** `key` pressed, the unfocused state noted before each press, until `target` has the focus; at most `max` times. */
export async function pressUntil(page: Page, key: string, target: Locator, max = 40) {
  for (let presses = 0; presses < max; presses += 1) {
    await press(page, key);
    if (await isFocused(target)) return;
  }
  throw new Error(`pressUntil: ${key} pressed ${max} times did not reach ${target}`);
}

/** Steps 0 to 6 on the element, until they pass or `timeout` expires. */
export async function expectRing(locator: Locator, { offset = 2, timeout }: Options = {}): Promise<Ring> {
  let ring: Ring | undefined;
  let last = "";
  try {
    await expect
      .poll(
        async () => {
          const read = await readRing(locator, offset);
          ring = { element: read.element, ...contrast(read) };
          return (last = problems(read, ring, offset));
        },
        { timeout },
      )
      .toBe("");
  } catch (error) {
    // The last reading, unquoted: the element, the background touched, the ratio, what fails.
    throw last ? new Error(`focus ring: ${last}`, { cause: error }) : error;
  }
  return ring!;
}

/**
 * Tab from where the focus is until `until` has it, each element reached passing the
 * measure, at its offset in `offsets` (2 px otherwise). Fails if it reaches nothing, or
 * leaves the page or comes back to an element before `until`. Returns the elements reached.
 */
export async function walk(
  page: Page,
  { until, offsets = [], timeout }: { until: Locator; offsets?: [Locator, Offset][]; timeout?: number },
): Promise<string[]> {
  const reached: string[] = [];
  await page.evaluate((store) => ((window as unknown as Record<string, unknown>)[`${store}Seen`] = new WeakSet()), STORE);
  for (;;) {
    await press(page, "Tab");
    const fresh = await page.evaluate((store) => {
      const element = document.activeElement;
      const seen = (window as unknown as Record<string, WeakSet<Element>>)[`${store}Seen`];
      if (!element || element === document.body || seen.has(element)) return false;
      seen.add(element);
      return true;
    }, STORE);
    if (!fresh) break;
    const focused = page.locator(":focus");
    let offset: Offset = 2;
    for (const [locator, value] of offsets) if (await isFocused(locator)) offset = value;
    reached.push((await expectRing(focused, { offset, timeout })).element);
    if (await isFocused(until)) return reached;
  }
  if (!reached.length) throw new Error("walk: Tab reached nothing");
  throw new Error(`walk: Tab ended on ${reached.at(-1)}, not on its target ${until}`);
}

const isFocused = (locator: Locator) =>
  locator.evaluateAll((elements) => elements.some((element) => element === document.activeElement));

function readRing(locator: Locator, offset: Offset): Promise<Read> {
  return locator.evaluate(
    async (element, { inside, store }) => {
      // Step 0: the finite animations end; an endless one would never let the test go on.
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const srgb = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = "transparent";
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        return { r, g, b, a: a / 255 };
      };
      // A layer is visible if its colour is not transparent and one of its lengths is not 0.
      const visible = (shadow: string) =>
        shadow === "none"
          ? 0
          : shadow.split(/,(?![^(]*\))/).filter((layer) => {
              const color = layer.match(/[a-z-]+\([^)]*\)|#[0-9a-f]+|\b(?!inset\b)[a-z]+\b/i)?.[0] ?? "currentcolor";
              const lengths = layer.replace(color, "").match(/-?[\d.]+(?:e-?\d+)?px/g) ?? [];
              return srgb(color).a > 0 && lengths.some((length) => parseFloat(length) !== 0);
            }).length;

      const style = getComputedStyle(element);
      const backgrounds = [];
      for (let at: Element | null = inside ? element : element.parentElement; at; at = at.parentElement) {
        const background = srgb(getComputedStyle(at).backgroundColor);
        backgrounds.push(background);
        if (background.a === 1) break;
      }
      let opacity = 1;
      for (let at: Element | null = element; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
      // No record at all: nothing was noted. No entry: the action rendered the element.
      const noted = (window as unknown as Record<string, WeakMap<Element, string> | undefined>)[store];
      const unfocused = noted && (noted.has(element) ? visible(noted.get(element)!) : 0);
      const name =
        element.getAttribute("aria-label") ||
        (element as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 40) ||
        element.getAttribute("placeholder") ||
        "";
      return {
        element: `<${element.tagName.toLowerCase()}>${name ? ` "${name}"` : ""}`,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        outlineColor: srgb(style.outlineColor),
        backgrounds,
        opacity,
        shadows: visible(style.boxShadow),
        unfocusedShadows: unfocused ?? null,
      };
    },
    { inside: offset < 0, store: STORE },
  );
}

/** Steps 3 and 4: the backgrounds composed over the page's white, and the WCAG 2.x ratio. */
function contrast({ backgrounds, outlineColor }: Read) {
  let covered = 0;
  const sum = [0, 0, 0];
  for (const { r, g, b, a } of backgrounds) {
    const weight = (1 - covered) * a;
    [r, g, b].forEach((channel, i) => (sum[i] += weight * channel));
    covered += weight;
  }
  const [r, g, b] = sum.map((channel) => Math.round(channel + (1 - covered) * 255));
  const ratio = (luminance([r, g, b]) + 0.05) / (luminance([outlineColor.r, outlineColor.g, outlineColor.b]) + 0.05);
  return { background: `rgb(${r}, ${g}, ${b})`, ratio: Math.max(ratio, 1 / ratio) };
}

function luminance(channels: number[]) {
  const [r, g, b] = channels.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const css = ({ r, g, b, a }: Rgba) => `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;

/** "" when the ring passes; otherwise the element, its background, its ratio and what fails. */
function problems(read: Read, ring: Ring, offset: Offset): string {
  const found = [
    !read.focusVisible && "no keyboard focus (:focus-visible)",
    read.outlineStyle !== "solid" && `outlineStyle ${read.outlineStyle}, not solid`,
    read.outlineWidth !== "2px" && `outlineWidth ${read.outlineWidth}, not 2px`,
    css(read.outlineColor) !== css(RING) && `outlineColor ${css(read.outlineColor)}, not ${css(RING)}`,
    read.outlineOffset !== `${offset}px` && `outlineOffset ${read.outlineOffset}, not ${offset}px`,
    ring.ratio < 3 && "contrast below 3:1",
    read.opacity !== 1 && `opacity ${Number(read.opacity.toFixed(2))}, not 1`,
    read.unfocusedShadows === null
      ? "no unfocused state noted before the keyboard moved (noteUnfocused, press)"
      : read.shadows > read.unfocusedShadows &&
        `${read.shadows - read.unfocusedShadows} visible boxShadow layer more than unfocused`,
  ].filter(Boolean);
  return found.length ? `${ring.element} on ${ring.background}, ratio ${ring.ratio.toFixed(2)}:1: ${found.join("; ")}` : "";
}
