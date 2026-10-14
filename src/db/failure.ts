/** Five digits or uppercase letters: what Postgres puts in `code` (23505, 57P01, 08006…). */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The one detail of a database error that is safe to log: its SQLSTATE, or the errno of
 * a system error (a refused or dropped connection). Enough to tell an outage from a broken
 * constraint; the message, the query, its values and the row stay out, a token among them.
 */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const { code, errno } = error as { code?: unknown; errno?: unknown };
    if (typeof code === "string" && SQLSTATE.test(code)) return `SQLSTATE ${code}`;
    if (typeof errno === "number" && Number.isInteger(errno)) return `errno ${errno}`;
  } catch {
    // A getter that throws leaves nothing to log but the fixed message.
  }
  return undefined;
}

/**
 * Logs `message` with the error's code alone, and returns the error to throw instead:
 * `message` again, without the original error nor its cause.
 */
export function databaseFailure(message: string, error: unknown): Error {
  const code = errorCode(error);
  console.error(code ? `${message} (${code})` : message);
  return new Error(message);
}
