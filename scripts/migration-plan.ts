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

/**
 * Removes the URL and each of its parts from `text`: user, password, host and its first
 * label (Neon's endpoint id), database, and every query value, since pg reads some of them
 * (user, password, options, sslrootcert…) and may quote them in its errors. The port stays.
 */
export function redactConnection(text: string, url: string): string {
  const parts = new Set([url]);
  try {
    const { username, password, host, hostname, pathname, search, searchParams } = new URL(url);
    const rawQueryValues = search
      .slice(1)
      .split("&")
      .map((pair) => pair.slice(pair.indexOf("=") + 1));
    for (const part of [
      username,
      password,
      host,
      hostname,
      hostname.split(".")[0],
      pathname.slice(1),
      ...rawQueryValues,
      ...searchParams.values(),
    ]) {
      parts.add(part);
      parts.add(decode(part));
    }
  } catch {
    // Unparsable: only the URL as a whole can be recognised.
  }
  return [...parts]
    .filter((part) => part.length > 0)
    .sort((a, b) => b.length - a.length)
    .reduce((redacted, part) => redacted.split(part).join("[redacted]"), text);
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
