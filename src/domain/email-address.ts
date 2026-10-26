/**
 * An organiser's email address (epic #581): what /nouveau, /connexion and the
 * correction of an address read, in the browser and on the server alike (OA1.4).
 * One address is one account: it is written one way only, trimmed, lowercased,
 * in NFC, its domain in punycode (#626).
 */

/** RFC 5321: 254 characters, the longest path a mail server accepts. */
export const EMAIL_MAX = 254;

/** Error codes, translated by the view: « Champ requis. », « Adresse e-mail non valide. », « 254 caractères au maximum. ». */
export type EmailError = "required" | "invalid" | "tooLong";

/** Letters, digits and combining marks of any script: a domain may be internationalised. */
const ALNUM = "\\p{L}\\p{N}\\p{M}";

/**
 * The characters of `type="email"` (WHATWG) before the @, in ASCII only, 64 at most
 * (RFC 5321). Decision: a local part outside ASCII is invalid. — Reason: it needs
 * SMTPUTF8 at every hop, and nothing shows that Brevo delivers it (#626).
 */
const LOCAL = "[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}";

/** A label of `type="email"`: 63 characters at most, no hyphen at either end. */
const LABEL = `[${ALNUM}](?:[${ALNUM}-]{0,61}[${ALNUM}])?`;

/**
 * The address `type="email"` accepts, with two more rules: the domain has a dot, and its
 * last label is not only digits. Brevo cannot deliver to `camille@localhost` nor to an IP.
 * Checked as typed, then again in punycode, where a label may have grown past 63.
 */
const FORMAT = new RegExp(`^${LOCAL}@(?:${LABEL}\\.)+(?!\\p{N}+$)${LABEL}$`, "u");

/** What a punycode label decodes to may only be letters, digits, marks and hyphens. */
const UNICODE_LABEL = new RegExp(`^[${ALNUM}-]+$`, "u");

/**
 * The domain in ASCII, by IDNA (UTS #46, as the WHATWG URL parser does it, in Node and in
 * every browser alike), or `null` for a domain that IDNA refuses. `domain` has passed
 * FORMAT: nothing in it can end the host of the URL.
 */
function toAscii(domain: string): string | null {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
}

/**
 * The domain in punycode, or `null`. A label already in punycode must be the one its
 * letters convert to: Node, Chromium and WebKit keep a label that does not decode, or that
 * decodes to letters written another way (`xn--a`, `xn--bucher-xyd`), where Firefox
 * refuses it. Checked here, the form and the server read the same addresses everywhere.
 */
function asciiDomain(domain: string): string | null {
  const ascii = toAscii(domain);
  if (ascii === null) return null;
  for (const label of ascii.split(".")) {
    if (!label.startsWith("xn--")) continue;
    const letters = decodePunycode(label.slice(4));
    if (letters === null || !UNICODE_LABEL.test(letters) || toAscii(letters) !== label) return null;
  }
  return ascii;
}

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;

/** RFC 3492, 6.1. */
function adapt(delta: number, points: number, first: boolean): number {
  let scaled = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
  scaled += Math.floor(scaled / points);
  let k = 0;
  for (; scaled > ((BASE - T_MIN) * T_MAX) / 2; k += BASE) scaled = Math.floor(scaled / (BASE - T_MIN));
  return k + Math.floor(((BASE - T_MIN + 1) * scaled) / (scaled + 38));
}

/** The value of a lowercase punycode digit, or -1. */
function digit(code: number): number {
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;
  return -1;
}

/** RFC 3492, 6.2: what the label after `xn--` decodes to, or `null` when it does not decode. */
function decodePunycode(input: string): string | null {
  const delimiter = input.lastIndexOf("-");
  const output = [...input.slice(0, Math.max(delimiter, 0))].map((char) => char.codePointAt(0) ?? 0);
  let n = 0x80;
  let i = 0;
  let bias = 72;
  for (let at = delimiter + 1; at < input.length; ) {
    const before = i;
    for (let weight = 1, k = BASE; ; k += BASE) {
      const value = at < input.length ? digit(input.charCodeAt(at++)) : -1;
      if (value < 0) return null;
      i += value * weight;
      if (i > 0x10ffff * (output.length + 1)) return null;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (value < threshold) break;
      weight *= BASE - threshold;
    }
    bias = adapt(i - before, output.length + 1, before === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/**
 * The address written one way, or the error. Length is counted after normalisation, in
 * code points, then again in punycode. `undefined`, `null` and blank are a missing field;
 * any other value that is not a string comes from a forged request: invalid, never an
 * exception.
 */
export function emailAddress(value: unknown): { value: string } | { error: EmailError } {
  const raw = value ?? "";
  if (typeof raw !== "string") return { error: "invalid" };
  const typed = raw.trim().toLowerCase().normalize("NFC");
  if (typed === "") return { error: "required" };
  if ([...typed].length > EMAIL_MAX) return { error: "tooLong" };
  if (!FORMAT.test(typed)) return { error: "invalid" };
  const at = typed.indexOf("@");
  const domain = asciiDomain(typed.slice(at + 1));
  if (domain === null) return { error: "invalid" };
  const address = `${typed.slice(0, at)}@${domain}`;
  if (address.length > EMAIL_MAX) return { error: "tooLong" };
  if (!FORMAT.test(address)) return { error: "invalid" };
  return { value: address };
}
