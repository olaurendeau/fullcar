import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * #320, epic #236: the focus ring of the language-switch design (v3.3.1), read in the source.
 * F1.12: no class of the old ring is left in a `.tsx`, `.css` or `.ts` file of `src/` (a list
 * of classes may live in a `.ts`; the `.test.ts` files, which name the old classes to find
 * them, are left out: #337), nor the utility that removes the outline, which left the
 * landmarks of #314 with no ring at all (#321): `NO_OUTLINE`, written in two parts so that no
 * file of `src/` holds it. A class is cut into its variants and its utility (`a:b:utility`), so
 * that `not-focus-visible` is not taken for `focus-visible`. F1.13: the `--ring` token is `#737373`, opaque.
 */

const NO_OUTLINE = "outline-" + "none";
const SRC = fileURLToPath(new URL("..", import.meta.url));

/** The variants and the utility of a class: `a:[&:x]:b:utility` gives `["a", "[&:x]", "b"]`, `utility`. */
function splitClass(name: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of name) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    // At or below 0: a word cut at a quote inside a bracket (`])]:utility`) is still split.
    if (char === ":" && depth <= 0) {
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
  if (utility === NO_OUTLINE) return "no ring at all";
  if (variants.includes("focus-visible") && (utility.startsWith("ring") || utility === "outline-1")) {
    return "a ring on focus-visible";
  }
  return undefined;
}

/** Every word of the file that may be a class: what lies between spaces, quotes (single ones too), commas and braces. */
const words = (text: string) => text.split(/[\s"'`,;{}]+/).filter(Boolean);

/** Whether the scan reads a file of this name: a `.tsx`, a `.css`, or a `.ts` that is no test. */
const scanned = (name: string) => /\.(tsx|css)$/.test(name) || (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name));

function* sources(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (scanned(entry.name)) yield path;
  }
}

describe("F1.12: the old focus ring, and the outline removed, are gone from src/", () => {
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

  it("finds each class of the old ring and the outline removed, and lets the error halo, the new ring and outline-hidden be", () => {
    for (const old of [
      "outline-ring/50",
      "focus-visible:ring-ring/50",
      "focus-visible:ring-3",
      "focus-visible:ring-[3px]",
      "focus-visible:ring-inset",
      "focus-visible:ring-destructive/20",
      "dark:focus-visible:ring-destructive/40",
      "focus-visible:outline-1",
      NO_OUTLINE,
      `focus-visible:${NO_OUTLINE}`,
      `!${NO_OUTLINE}`,
    ]) {
      expect(oldRing(old), old).toBeDefined();
    }
    for (const allowed of [
      "aria-invalid:not-focus-visible:ring-3",
      "aria-invalid:not-focus-visible:ring-destructive/20",
      "group-has-[:focus-visible]/field-label:ring-0",
      "focus-visible:focus-ring",
      "focus-visible:-outline-offset-2",
      // The dialog's content, which Radix focuses as a fallback: transparent, seen in forced colours.
      "outline-hidden",
      "focus-visible:border-ring",
      "ring-1",
    ]) {
      expect(oldRing(allowed), allowed).toBeUndefined();
    }
  });

  it("finds them between single quotes too, a bracket's quotes included", () => {
    const found = (text: string) => words(text).filter((word) => oldRing(word));
    expect(found("cn('focus-visible:ring-3')")).toEqual(["focus-visible:ring-3"]);
    expect(found(`"[&_svg:not([class*='size-'])]:focus-visible:ring-3 [&_svg:not([class*='size-'])]:size-4"`)).toEqual([
      "])]:focus-visible:ring-3",
    ]);
  });

  it("reads the .tsx, .css and .ts files, and leaves the tests out", () => {
    for (const name of ["button.tsx", "globals.css", "classes.ts", "test-events.ts", "page.test.tsx"]) {
      expect(scanned(name), name).toBe(true);
    }
    for (const name of ["focus-ring.test.ts", "admin.action.test.ts", "rows.spec.ts", "README.md", "next-env.d.mts"]) {
      expect(scanned(name), name).toBe(false);
    }
  });

  it("no .tsx, .css nor .ts file of src/ outside the tests has one", () => {
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
