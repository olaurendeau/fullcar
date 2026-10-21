import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * #320, epic #236: the focus ring of the language-switch design (v3.3.1), read in the source.
 * F1.12: no class of the old ring is left in a `.tsx` or `.css` file of `src/`. A class is cut
 * into its variants and its utility (`a:b:utility`), so that `not-focus-visible` is not taken
 * for `focus-visible`. F1.13: the `--ring` token is `#737373`, opaque.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** The variants and the utility of a class: `a:[&:x]:b:utility` gives `["a", "[&:x]", "b"]`, `utility`. */
function splitClass(name: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of name) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    if (char === ":" && depth === 0) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  return { variants: parts, utility: part.replace(/^!|!$/g, "") };
}

/** Why a class is the old ring, or `undefined`. */
function oldRing(name: string): string | undefined {
  const { variants, utility } = splitClass(name);
  if (utility === "ring-ring/50" || utility === "outline-ring/50") return "the old ring colour";
  if (variants.includes("focus-visible") && (utility.startsWith("ring") || utility === "outline-1")) {
    return "a ring on focus-visible";
  }
  return undefined;
}

/** Every word of the file that may be a class: what lies between spaces, quotes, commas and braces. */
const words = (text: string) => text.split(/[\s"`,;{}]+/).filter(Boolean);

function* sources(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(tsx|css)$/.test(entry.name)) yield path;
  }
}

describe("F1.12: the old focus ring is gone from src/", () => {
  it("cuts a class into its variants and its utility, brackets kept whole", () => {
    expect(splitClass("ring-3")).toEqual({ variants: [], utility: "ring-3" });
    expect(splitClass("dark:focus-visible:ring-destructive/40")).toEqual({
      variants: ["dark", "focus-visible"],
      utility: "ring-destructive/40",
    });
    expect(splitClass("group-has-[:focus-visible]/field-label:ring-0")).toEqual({
      variants: ["group-has-[:focus-visible]/field-label"],
      utility: "ring-0",
    });
    expect(splitClass("[&_svg:not([class*='size-'])]:size-4").utility).toBe("size-4");
  });

  it("finds each class of the old ring, and lets the error halo and the new ring be", () => {
    for (const old of [
      "outline-ring/50",
      "focus-visible:ring-ring/50",
      "focus-visible:ring-3",
      "focus-visible:ring-[3px]",
      "focus-visible:ring-inset",
      "focus-visible:ring-destructive/20",
      "dark:focus-visible:ring-destructive/40",
      "focus-visible:outline-1",
    ]) {
      expect(oldRing(old), old).toBeDefined();
    }
    for (const allowed of [
      "aria-invalid:not-focus-visible:ring-3",
      "aria-invalid:not-focus-visible:ring-destructive/20",
      "group-has-[:focus-visible]/field-label:ring-0",
      "focus-visible:focus-ring",
      "focus-visible:-outline-offset-2",
      "focus-visible:border-ring",
      "ring-1",
    ]) {
      expect(oldRing(allowed), allowed).toBeUndefined();
    }
  });

  it("no .tsx nor .css file of src/ has one", () => {
    const found: string[] = [];
    for (const path of sources(SRC)) {
      for (const word of words(readFileSync(path, "utf8"))) {
        const why = oldRing(word);
        if (why) found.push(`${relative(SRC, path)}: ${word} (${why})`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe("F1.13: the ring token", () => {
  it("--ring is oklch(0.556 0 0) in :root, #737373", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(root.match(/--ring:\s*([^;]+);/)?.[1]).toBe("oklch(0.556 0 0)");
  });
});
