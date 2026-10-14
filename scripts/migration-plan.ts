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
 * label, database, and any Neon endpoint id found anywhere in the URL, with or without its
 * `-pooler` suffix. The port and the values of the allowed query keys stay. A query key
 * outside that list, or a value it does not expect, withholds the whole text, as does a URL
 * read differently from pg-connection-string, or not at all, or any failure while redacting.
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
 * The query keys a Neon URL carries, or may, and the values each takes. Postgres quotes
 * pieces of other values (options above all: unescaped, split, trimmed, unquoted) in ways
 * no redaction keeps up with, so any other key or value withholds the whole text.
 */
const ALLOWED_QUERY = new Map<string, (value: string) => boolean>([
  ["sslmode", (value) => ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(value)],
  ["channel_binding", (value) => ["disable", "prefer", "require"].includes(value)],
  ["connect_timeout", (value) => /^[0-9]+$/.test(value)],
]);
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
    const { username, password, host, hostname, pathname, hash, searchParams } = reading.url;
    // searchParams decodes keys and values as pg reads them (% escapes, + as a space).
    for (const [key, value] of searchParams) if (!ALLOWED_QUERY.get(key)?.(value)) return undefined;
    const hostParts = reading.hostless
      ? []
      : [host, hostname, hostname.replace(/^\[(.+)\]$/, "$1"), hostname.split(".")[0]];
    for (const part of [username, password, ...hostParts, pathname, pathname.slice(1), hash.slice(1)]) {
      for (const decode of [(s: string) => s, decodeURI, decodeURIComponent]) {
        try {
          parts.add(decode(part));
        } catch {
          // Not decodable this way: the raw form is already there.
        }
      }
    }
  }
  for (const part of [...parts]) {
    for (const [endpoint] of part.matchAll(NEON_ENDPOINT)) parts.add(endpoint).add(endpoint.replace(/-pooler$/, ""));
  }
  return parts;
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
