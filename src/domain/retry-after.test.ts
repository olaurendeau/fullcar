import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./retry-after";

/** A whole second: an HTTP date has no milliseconds. 23 October 2026 is a Friday. */
const START = Date.UTC(2026, 9, 23, 8, 0, 0);

describe("retryAfterMs", () => {
  it("is undefined without the header", () => {
    expect(retryAfterMs(null, START)).toBeUndefined();
  });

  it.each([
    ["0", 0],
    ["1", 1_000],
    ["120", 120_000],
    ["7200", 7_200_000],
    [" 120 ", 120_000],
  ])("reads %j as an integer of seconds", (raw, ms) => {
    expect(retryAfterMs(raw, START)).toBe(ms);
  });

  it("reads an HTTP date from the time given", () => {
    expect(retryAfterMs("Fri, 23 Oct 2026 08:01:30 GMT", START)).toBe(90_000);
    expect(retryAfterMs("Fri, 23 Oct 2026 07:59:00 GMT", START)).toBe(-60_000);
  });

  it.each([
    ["soon", "soon"],
    ["a negative number", "-1"],
    ["a decimal number", "1.5"],
    ["words Node reads as a date", "next tuesday 3"],
    ["a date that is not an HTTP date", new Date(START).toISOString()],
    ["an HTTP date with the wrong day", "Thu, 23 Oct 2026 08:02:00 GMT"],
    ["the obsolete RFC 850 form", "Friday, 23-Oct-26 08:02:00 GMT"],
    ["the obsolete asctime form", "Fri Oct 23 08:02:00 2026"],
    ["an empty value", ""],
  ])("is undefined for %s", (_, raw) => {
    expect(retryAfterMs(raw, START)).toBeUndefined();
  });
});
