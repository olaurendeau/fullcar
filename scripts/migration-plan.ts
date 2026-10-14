// What scripts/migrate.ts does, decided from the environment alone: no connection here.

const COMMANDS = ["latest", "up", "down", "reset"] as const;
export type MigrationCommand = (typeof COMMANDS)[number];

/** The non-pooled URL first: a migration's locks and DDL do not go through Neon's pooler. */
const URL_VARIABLES = ["DATABASE_URL_UNPOOLED", "DATABASE_URL"] as const;
export type UrlVariable = (typeof URL_VARIABLES)[number];

export type MigrationPlan =
  | { action: "skip"; reason: string }
  | { action: "migrate"; command: MigrationCommand; variable: UrlVariable };

type Env = Partial<Record<string, string | undefined>>;

/**
 * `deploy` is the Vercel build: it migrates to latest in production only, since previews
 * have no database. The other commands come from `make migrate` and always run.
 * Errors name variables, never their values.
 */
export function planMigration(command: string, env: Env): MigrationPlan {
  if (command === "deploy") {
    if (env.VERCEL_ENV !== "production") {
      return { action: "skip", reason: "not a production deployment, no migration" };
    }
    return { action: "migrate", command: "latest", variable: urlVariable(env) };
  }
  if (!(COMMANDS as readonly string[]).includes(command)) {
    throw new Error(`Unknown command "${command}": ${COMMANDS.join(", ")} or deploy`);
  }
  return { action: "migrate", command: command as MigrationCommand, variable: urlVariable(env) };
}

function urlVariable(env: Env): UrlVariable {
  const variable = URL_VARIABLES.find((name) => env[name]);
  if (!variable) throw new Error(`Neither ${URL_VARIABLES.join(" nor ")} is set`);
  return variable;
}

const WITHHELD = "[error withheld: its connection string could not be read safely]";

/**
 * Removes the URL and each of its parts from `text`: user, password, host and its first
 * label, database, and every query value, since pg reads some of them (user, password,
 * options, sslrootcert…) and may quote them in its errors. Postgres quotes a piece of a value
 * too (`options=-c a=se\cret` → `"secret"`), so each piece goes as well, and so does any Neon
 * endpoint id found anywhere in the URL, with or without its `-pooler` suffix. The port stays.
 * A URL read differently from pg-connection-string, or not at all, withholds the whole text,
 * and so does any failure while redacting.
 */
export function redactConnection(text: string, url: string): string {
  try {
    const parts = connectionParts(url);
    return parts ? cover(text, parts) : WITHHELD;
  } catch {
    return WITHHELD;
  }
}

/**
 * Replaces each stretch of `text` covered by one part or more with a single marker: every
 * occurrence of every part, overlapping or adjacent ones merged, so no piece of a part is
 * left beside the marker and no marker is ever matched again.
 */
function cover(text: string, parts: Set<string>): string {
  const stretches: [number, number][] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) {
      stretches.push([at, at + part.length]);
    }
  }
  stretches.sort((a, b) => a[0] - b[0]);
  let redacted = "";
  let cursor = 0;
  for (let i = 0; i < stretches.length; ) {
    const start = stretches[i][0];
    let end = stretches[i][1];
    for (i++; i < stretches.length && stretches[i][0] <= end; i++) end = Math.max(end, stretches[i][1]);
    redacted += `${text.slice(cursor, start)}[redacted]`;
    cursor = end;
  }
  return redacted + text.slice(cursor);
}

/**
 * Shorter pieces are flags and settings (-c, on, off, 1, 30s), not secrets, and would blank
 * every word or line number holding them. A whole value is removed whatever its length.
 */
const MIN_PIECE_LENGTH = 4;
/** isspace() in C, where Postgres splits options: not \s, which also holds Unicode spaces. */
const PG_SPACE = /[ \t\n\v\f\r]/;
/** A Neon endpoint id, such as ep-cool-darkness-123456, as a label of its own. */
const NEON_ENDPOINT = /(?<![a-z0-9-])ep-[a-z0-9-]*[a-z0-9]/gi;

function connectionParts(url: string): Set<string> | undefined {
  if (url.length === 0) return undefined;
  const parts = new Set([url]);
  // pg reads "/socket/directory database" as a host and a database.
  if (url.startsWith("/")) {
    for (const word of url.split(" ")) parts.add(word);
    return parts;
  }
  // new URL ends the authority at the first / ? or #: an @ after it means a password holding
  // one of them, the start of which would be read as the host and the port. new URL drops
  // tabs and newlines anywhere, so they are dropped here too before looking.
  if (/^[^:/?#]+:\/\/[^/?#]*[/?#][\s\S]*@/.test(url.replace(/[\t\n\r]/g, ""))) return undefined;
  // pg re-encodes a URL holding a space or a stray % before reading it: both readings count.
  let asPg: string;
  try {
    asPg = / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(url) ? encodeURI(url).replace(/%25(\d\d)/g, "%$1") : url;
  } catch {
    return undefined;
  }
  const readings = [readUrl(asPg), readUrl(url)];
  if (!readings[0]) return undefined;
  for (const reading of readings) {
    if (!reading) continue;
    const { username, password, host, hostname, pathname, search, hash, searchParams } = reading.url;
    const hostParts = reading.hostless
      ? []
      : [host, hostname, hostname.replace(/^\[(.+)\]$/, "$1"), hostname.split(".")[0]];
    const rawQueryValues = search
      .slice(1)
      .split("&")
      .map((pair) => pair.slice(pair.indexOf("=") + 1));
    for (const part of [
      username,
      password,
      ...hostParts,
      pathname,
      pathname.slice(1),
      ...rawQueryValues,
      ...searchParams.values(),
      hash.slice(1),
    ]) {
      for (const decode of [(s: string) => s, decodeURI, decodeURIComponent]) {
        try {
          parts.add(decode(part));
        } catch {
          // Not decodable this way: the raw form is already there.
        }
      }
    }
    // searchParams has decoded each value as pg does (% escapes, + as a space).
    for (const value of searchParams.values()) {
      for (const piece of valuePieces(value)) if (piece.length >= MIN_PIECE_LENGTH) parts.add(piece);
    }
  }
  for (const part of [...parts]) {
    for (const [endpoint] of part.matchAll(NEON_ENDPOINT)) parts.add(endpoint).add(endpoint.replace(/-pooler$/, ""));
  }
  return parts;
}

/**
 * What Postgres may quote from a query value: the value unescaped, and the words pg_split_opts
 * reads in options, each whole, after its first =, and split on = and commas
 * (`-c a=x,y` → `a=x,y`, `x,y`, `x`, `y`).
 */
function valuePieces(value: string): string[] {
  const words = unescapedWords(value);
  const pieces = [words.join(" ")];
  for (const word of words) {
    pieces.push(word, word.slice(word.indexOf("=") + 1), ...word.split(/[=,]/));
  }
  return pieces;
}

/** As pg_split_opts: words split on spaces, a backslash dropped and the character after it kept. */
function unescapedWords(value: string): string[] {
  const words: string[] = [];
  let word = "";
  for (let i = 0; i < value.length; i++) {
    if (PG_SPACE.test(value[i])) {
      if (word) words.push(word);
      word = "";
    } else {
      word += value[i] === "\\" ? (value[++i] ?? "") : value[i];
    }
  }
  if (word) words.push(word);
  return words;
}

/**
 * Reads `url` as pg-connection-string does, a missing host included (`@/`, socket: URLs),
 * but only as an absolute PostgreSQL or socket URL with a path: pg resolves anything else
 * against a base of its own, which this does not try to follow.
 */
function readUrl(url: string): { url: URL; hostless: boolean } | undefined {
  for (const [candidate, hostless] of [
    [url, false],
    [url.replace("@/", "@___DUMMY___/"), true],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      continue;
    }
    const known = ["postgres:", "postgresql:", "socket:"].includes(parsed.protocol);
    const hierarchical = parsed.pathname === "" || parsed.pathname.startsWith("/");
    return known && hierarchical ? { url: parsed, hostless } : undefined;
  }
  return undefined;
}
