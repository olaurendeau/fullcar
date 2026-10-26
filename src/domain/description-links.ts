/**
 * The description split into text and links (event-description v3, « Les liens »). An
 * `http(s)://` URL becomes a link only when what one reads is exactly where it leads; in
 * doubt, it stays text. Pure and safe in the browser: the only API is `new URL()`, which
 * parses and never fetches, and only its `host` is read.
 */

export type DescriptionPiece = { kind: "text"; text: string } | { kind: "link"; href: string };

/** Where a candidate may start: `http://` or `https://`, in any case. */
const SCHEME = /https?:\/\//giu;

/** What may not come just before a candidate: a letter, a digit, or one of `_ - . / @ +`. */
const GLUED = /^[\p{L}\p{N}_\-./@+]$/u;

/** A candidate ends at the first blank: a tab, `\n`, or a Zs space (U+00A0 and U+202F included). */
const BLANK = /[\t\n\p{Zs}]/u;

/** Cut from the end of a candidate, as many times as needed. */
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "…", ">", '"', "'", "»", "”", "’"]);

/** Cut from the end of a candidate when the candidate does not open it. */
const OPENERS: Record<string, string> = { ")": "(", "]": "[" };

/** Invisible, bidirectional, format or control: Cf, these ranges, and every Cc (tab and `\n` end the candidate first). */
const HIDDEN = /[\p{Cf}\p{Cc}\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/u;

/** A plain ASCII host, then at most a port. */
const ASCII_AUTHORITY = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/** The character just before `index`, a whole code point. */
function charBefore(value: string, index: number): string {
  return [...value.slice(Math.max(0, index - 2), index)].pop() ?? "";
}

function count(value: string, char: string): number {
  return value.split(char).length - 1;
}

/** The candidate without its trailing punctuation. */
function withoutTrailing(candidate: string): string {
  let end = candidate;
  for (;;) {
    const last = end[end.length - 1] ?? "";
    const opener = OPENERS[last];
    if (TRAILING.has(last) || (opener !== undefined && count(end, last) > count(end, opener))) end = end.slice(0, -1);
    else return end;
  }
}

/** Whether the candidate leads exactly where it reads, by the refusal rules in their order. */
function isLink(candidate: string): boolean {
  if (HIDDEN.test(candidate)) return false;
  const authority = candidate.slice(candidate.indexOf("//") + 2).split(/[/\\?#]/)[0];
  if (authority.includes("@")) return false;
  if (!ASCII_AUTHORITY.test(authority)) return false;
  if (authority.split(":")[0].split(".").some((label) => label.toLowerCase().startsWith("xn--"))) return false;
  try {
    return new URL(candidate).host === authority.toLowerCase();
  } catch {
    return false;
  }
}

/** The pieces of `description`, in order: text as typed, and links whose `href` is the candidate as typed. */
export function descriptionPieces(description: string): DescriptionPiece[] {
  const pieces: DescriptionPiece[] = [];
  const addText = (value: string) => {
    if (value === "") return;
    const last = pieces[pieces.length - 1];
    if (last?.kind === "text") last.text += value;
    else pieces.push({ kind: "text", text: value });
  };

  let done = 0;
  const scheme = new RegExp(SCHEME);
  for (let match = scheme.exec(description); match !== null; match = scheme.exec(description)) {
    const start = match.index;
    if (GLUED.test(charBefore(description, start))) continue;
    const blank = description.slice(start).search(BLANK);
    const candidate = withoutTrailing(description.slice(start, blank === -1 ? description.length : start + blank));
    const end = start + candidate.length;
    addText(description.slice(done, start));
    if (isLink(candidate)) pieces.push({ kind: "link", href: candidate });
    else addText(candidate);
    done = end;
    scheme.lastIndex = Math.max(end, start + 1);
  }
  addText(description.slice(done));
  return pieces;
}
