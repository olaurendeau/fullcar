import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Test support: whether a module the browser imports is free of Node. A Node
 * built-in can be named with or without `node:` (`crypto`, `node:crypto`,
 * `fs/promises`), in `import … from`, `export … from`, a bare `import`,
 * `import()` or `require()`, between single, double or back quotes.
 */

const BUILTINS = new Set(builtinModules);
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(["'`])([^"'`]+)\1/g;

/** The Node built-ins `source` imports, under any spelling. */
export function nodeBuiltinsImported(source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .map((match) => match[2])
    .filter((name) => name.startsWith("node:") || BUILTINS.has(name.split("/")[0]));
}

/** What keeps `source` out of the browser: its Node built-ins, and `Buffer` if it uses it. */
export function browserUnsafe(source: string): string[] {
  return [...nodeBuiltinsImported(source), ...(/\bBuffer\b/.test(source) ? ["Buffer"] : [])];
}

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The file a specifier of the module at `from` names in `src/`, by `@/` or a relative path; `null` for a package. */
function sourceFile(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((each) => existsSync(each) && statSync(each).isFile()) ?? null;
}

/**
 * What keeps `source`, the module at `file`, out of the browser, its own imports followed
 * through `src/`, whether written with `@/` or a relative path: by module, from `src/`
 * (`domain/public-id.ts: node:crypto`).
 */
export function browserUnsafeReached(source: string, file: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const visit = (text: string, path: string) => {
    seen.add(path);
    found.push(...browserUnsafe(text).map((name) => `${relative(SRC, path)}: ${name}`));
    for (const [, , specifier] of text.matchAll(SPECIFIER)) {
      const next = sourceFile(specifier, path);
      if (next && !seen.has(next)) visit(readFileSync(next, "utf8"), next);
    }
  };
  visit(source, file);
  return found;
}
