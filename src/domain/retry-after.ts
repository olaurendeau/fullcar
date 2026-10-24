/**
 * `Retry-After` in milliseconds from `time`: an integer of seconds, or an HTTP date as RFC 9110
 * writes it (IMF-fixdate, `Fri, 23 Oct 2026 08:00:00 GMT`) that names a real day and time;
 * anything else, `undefined`. `Date.parse` alone is not enough: Node reads « -1 » or « next
 * tuesday 3 » as dates in 2001. Shared by the breakers of Photon and of the tiles.
 */
export function retryAfterMs(raw: string | null, time: number): number | undefined {
  if (raw === null) return undefined;
  // HTTP allows whitespace around a field's value, and `fetch` may keep it.
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  // `toUTCString` writes an IMF-fixdate: any other text, a 30 February or a wrong day of the week, differs.
  return !Number.isNaN(date) && new Date(date).toUTCString() === value ? date - time : undefined;
}
