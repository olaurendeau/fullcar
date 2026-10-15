import { builtinModules } from "node:module";

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
