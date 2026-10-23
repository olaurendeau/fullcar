/**
 * A Plan IGN v2 tile, as our route `/tuiles/{z}/{x}/{y}` asks the Géoplateforme's WMTS for it
 * (event-map v11, « Les tuiles »; #238, the survey of #473 and the coordinator's option B).
 * Pure functions: no fetch, no XML library (Node has no `DOMParser`).
 */

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/**
 * The layer's last update, `YYYY-MM`, that the attribution shows: the revision of 2026-10-08
 * of the `IGNF_PLAN-IGN` record (updated monthly). Its test fails past 12 months (CA3.4).
 */
export const PLAN_IGN_UPDATED = "2026-10";

/** The last zoom of the map; the layer's grid `PM_0_19` goes one further, which we never ask for. */
const MAX_ZOOM = 18;

/** Canonical decimal only: no sign, no leading zero, so that one tile has one URL in the CDN's cache. */
const CANONICAL = /^(0|[1-9]\d*)$/;

function integerOf(value: string): number | null {
  return CANONICAL.test(value) ? Number(value) : null;
}

/**
 * The tile the route's three segments name: `z` from 0 to 18, `x` and `y` from 0 to 2^z − 1,
 * each in canonical decimal. Anything else is `null`, which the route answers 404 without
 * calling the IGN.
 */
export function tileOf(params: { z: string; x: string; y: string }): Tile | null {
  const z = integerOf(params.z);
  const x = integerOf(params.x);
  const y = integerOf(params.y);
  if (z === null || x === null || y === null || z > MAX_ZOOM) return null;
  const size = 2 ** z;
  if (x >= size || y >= size) return null;
  return { z, x, y };
}

/**
 * The KVP `GetTile` request for `tile`, as the survey of #473 sent it to the real service.
 * `base` is the WMTS endpoint (`IGN_WMTS_URL`); its own query and fragment are dropped, so the
 * request carries this query and nothing else.
 */
export function wmtsTileUrl(base: string, tile: Tile): string {
  const url = new URL(base);
  url.search = [
    "SERVICE=WMTS",
    "VERSION=1.0.0",
    "REQUEST=GetTile",
    "LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
    "STYLE=normal",
    "FORMAT=image/png",
    "TILEMATRIXSET=PM_0_19",
    `TILEMATRIX=${tile.z}`,
    `TILEROW=${tile.y}`,
    `TILECOL=${tile.x}`,
  ].join("&");
  url.hash = "";
  return url.href;
}

const OWS = "http://www.opengis.net/ows/1.1";
const XML = "http://www.w3.org/XML/1998/namespace";

/**
 * The longest body read, in characters. The real report is 138; one with a version, an
 * `xml:lang`, a schema location and an `ExceptionText` stays under 1 KiB. Past this, the body
 * is not a report we know, and the reader's work stays bounded: each element copies its
 * namespace scope, which on hundreds of kilobytes would take seconds, or the whole heap.
 */
const MAX_REPORT = 4096;

/**
 * Whether `text` is an OWS 1.1 exception report saying the tile does not exist: an
 * `ExceptionReport` root in `http://www.opengis.net/ows/1.1`, default or prefixed, with a
 * child `Exception` of that same namespace whose `exceptionCode` attribute is `Not Found`.
 * The attribute is read, never the body compared as a string. A body this reader cannot read
 * (cut, not XML, a DTD, a reference in an attribute, longer than 4 KiB) is `false`: the route
 * then caches nothing on a doubt.
 */
export function isNotFoundReport(text: string): boolean {
  if (text.length > MAX_REPORT) return false;
  const root = readXml(text);
  if (root === null || root.namespace !== OWS || root.local !== "ExceptionReport") return false;
  return root.children.some(
    (child) =>
      child.namespace === OWS && child.local === "Exception" && child.attributes.get("exceptionCode") === "Not Found",
  );
}

interface XmlElement {
  /** The namespace's URI, `""` for none (`xmlns=""` undeclares the default one). */
  namespace: string;
  local: string;
  /** Attributes without a prefix, by name: they are in no namespace. */
  attributes: Map<string, string>;
  children: XmlElement[];
}

interface Open {
  element: XmlElement;
  name: string;
  scope: Map<string, string>;
}

const NAME = /[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/y;
const SPACE = /[ \t\r\n]*/y;
/** A reference, or a lone `&` that is not one. */
const REFERENCE = /&(?:#x([0-9A-Fa-f]+)|#(\d+)|(lt|gt|amp|quot|apos))?;?/g;
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function nameAt(text: string, at: number): string | null {
  NAME.lastIndex = at;
  return NAME.exec(text)?.[0] ?? null;
}

function skipSpace(text: string, at: number): number {
  SPACE.lastIndex = at;
  SPACE.exec(text);
  return SPACE.lastIndex;
}

/** The value of an attribute as XML reads it: whitespace as spaces, then the references. */
function attributeValue(raw: string): string | null {
  if (raw.includes("<")) return null;
  let valid = true;
  const value = raw.replace(/[\t\n\r]/g, " ").replace(REFERENCE, (whole, hex, dec, named) => {
    if (!whole.endsWith(";") || whole === "&;") {
      valid = false;
      return "";
    }
    if (named) return ENTITIES[named];
    const code = hex ? parseInt(hex, 16) : Number(dec);
    if (!(code > 0 && code <= 0x10ffff)) {
      valid = false;
      return "";
    }
    return String.fromCodePoint(code);
  });
  return valid ? value : null;
}

function splitName(name: string): [prefix: string | null, local: string] {
  const colon = name.indexOf(":");
  return colon < 0 ? [null, name] : [name.slice(0, colon), name.slice(colon + 1)];
}

/**
 * A start tag at `at` (just past `<`): its element, its namespace scope, whether it closes
 * itself, and where it ends; `null` if it is not well formed or names an undeclared prefix.
 */
function startTag(
  text: string,
  at: number,
  parentScope: Map<string, string>,
): { element: XmlElement; name: string; scope: Map<string, string>; empty: boolean; end: number } | null {
  const name = nameAt(text, at);
  if (name === null) return null;
  let cursor = at + name.length;
  const raw = new Map<string, string>();
  for (;;) {
    const afterSpace = skipSpace(text, cursor);
    if (text.startsWith("/>", afterSpace) || text[afterSpace] === ">") {
      cursor = afterSpace;
      break;
    }
    if (afterSpace === cursor) return null;
    const attribute = nameAt(text, afterSpace);
    if (attribute === null || raw.has(attribute)) return null;
    let next = skipSpace(text, afterSpace + attribute.length);
    if (text[next] !== "=") return null;
    next = skipSpace(text, next + 1);
    const quote = text[next];
    if (quote !== '"' && quote !== "'") return null;
    const close = text.indexOf(quote, next + 1);
    if (close < 0) return null;
    const value = attributeValue(text.slice(next + 1, close));
    if (value === null) return null;
    raw.set(attribute, value);
    cursor = close + 1;
  }
  const empty = text[cursor] === "/";
  const end = cursor + (empty ? 2 : 1);

  const scope = new Map(parentScope);
  for (const [attribute, value] of raw) {
    if (attribute === "xmlns") scope.set("", value);
    else if (attribute.startsWith("xmlns:")) scope.set(attribute.slice("xmlns:".length), value);
  }
  const attributes = new Map<string, string>();
  for (const [attribute, value] of raw) {
    const [prefix, local] = splitName(attribute);
    if (prefix === null) {
      if (local !== "xmlns") attributes.set(local, value);
    } else if (prefix !== "xmlns" && !scope.has(prefix)) return null;
  }
  const [prefix, local] = splitName(name);
  if (prefix !== null && !scope.has(prefix)) return null;
  const namespace = scope.get(prefix ?? "") ?? "";
  return { element: { namespace, local, attributes, children: [] }, name, scope, empty, end };
}

/**
 * The root element of a small XML document, with its namespaces resolved; `null` for anything
 * that is not one well-formed element, possibly after a prologue and comments. Enough for an
 * exception report: no DTD, no entity beyond the five predefined ones.
 */
function readXml(text: string): XmlElement | null {
  const stack: Open[] = [];
  let root: XmlElement | null = null;
  let at = 0;
  const skip = (open: string, close: string): boolean => {
    const end = text.indexOf(close, at + open.length);
    if (end < 0) return false;
    at = end + close.length;
    return true;
  };
  while (at < text.length) {
    if (text.startsWith("<!--", at)) {
      if (!skip("<!--", "-->")) return null;
    } else if (text.startsWith("<?", at)) {
      if (!skip("<?", "?>")) return null;
    } else if (text.startsWith("<![CDATA[", at)) {
      if (stack.length === 0 || !skip("<![CDATA[", "]]>")) return null;
    } else if (text.startsWith("</", at)) {
      const name = nameAt(text, at + 2);
      const open = stack.pop();
      if (name === null || open === undefined || open.name !== name) return null;
      const end = skipSpace(text, at + 2 + name.length);
      if (text[end] !== ">") return null;
      at = end + 1;
    } else if (text[at] === "<") {
      const parent = stack.at(-1);
      if (parent === undefined && root !== null) return null;
      const tag = startTag(text, at + 1, parent?.scope ?? new Map([["xml", XML]]));
      if (tag === null) return null;
      if (parent === undefined) root = tag.element;
      else parent.element.children.push(tag.element);
      if (!tag.empty) stack.push({ element: tag.element, name: tag.name, scope: tag.scope });
      at = tag.end;
    } else {
      const next = text.indexOf("<", at);
      const end = next < 0 ? text.length : next;
      if (stack.length === 0 && !/^[ \t\r\n]*$/.test(text.slice(at, end))) return null;
      at = end;
    }
  }
  return stack.length === 0 ? root : null;
}
