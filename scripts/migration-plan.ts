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
 * label (Neon's endpoint id), database, and every query value, since pg reads some of them
 * (user, password, options, sslrootcert…) and may quote them in its errors. The port stays.
 * A URL read differently from pg-connection-string, or not at all, withholds the whole text.
 */
export function redactConnection(text: string, url: string): string {
  const parts = connectionParts(url);
  if (!parts) return WITHHELD;
  const pattern = [...parts]
    .filter((part) => part.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // One pass, longest part first: a marker already written is never matched again.
  return text.replace(new RegExp(pattern, "g"), "[redacted]");
}

function connectionParts(url: string): Set<string> | undefined {
  if (url.length === 0) return undefined;
  const parts = new Set([url]);
  // pg reads "/socket/directory database" as a host and a database.
  if (url.startsWith("/")) {
    for (const word of url.split(" ")) parts.add(word);
    return parts;
  }
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
