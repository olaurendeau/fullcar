import { describe, expect, it } from "vitest";
import { formatDate } from "./format-date";

// French writes the first day of a month « 1er » (#625); every other day, and English, as
// Intl writes them.

const UTC = { timeZone: "UTC" } as const;
const FULL = { dateStyle: "full", timeStyle: "short", ...UTC } as const;
const DAY = { dateStyle: "full", ...UTC } as const;
const LONG = { day: "numeric", month: "long", year: "numeric", ...UTC } as const;

describe("formatDate", () => {
  it("writes « 1er » for the first of a month in French, in every format with a day", () => {
    const first = new Date("2029-05-01T10:00:00Z");
    expect(formatDate("fr", first, FULL)).toBe("mardi 1er mai 2029 à 10:00");
    expect(formatDate("fr", first, DAY)).toBe("mardi 1er mai 2029");
    expect(formatDate("fr-FR", first, LONG)).toBe("1er mai 2029");
  });

  it("leaves every other day as Intl writes it: 11, 21 and 31 get no « er »", () => {
    for (const day of ["02", "11", "21", "31"]) {
      const date = new Date(`2029-12-${day}T10:00:00Z`);
      for (const options of [FULL, DAY, LONG]) {
        expect(formatDate("fr", date, options)).toBe(new Intl.DateTimeFormat("fr", options).format(date));
      }
    }
    expect(formatDate("fr-FR", new Date("2029-12-11T10:00:00Z"), LONG)).toBe("11 décembre 2029");
  });

  it("leaves English unchanged, the first of a month included", () => {
    const first = new Date("2029-05-01T10:00:00Z");
    for (const locale of ["en", "en-GB"]) {
      for (const options of [FULL, DAY, LONG]) {
        expect(formatDate(locale, first, options)).toBe(new Intl.DateTimeFormat(locale, options).format(first));
      }
    }
    expect(formatDate("en-GB", first, LONG)).toBe("1 May 2029");
  });

  it("leaves a time alone unchanged", () => {
    const first = new Date("2029-05-01T07:30:00Z");
    expect(formatDate("fr", first, { timeStyle: "short", ...UTC })).toBe("07:30");
  });

  it("formats in the time zone it is given: 23:30 UTC on 30 April is 1 May in Paris", () => {
    const date = new Date("2029-04-30T23:30:00Z");
    expect(formatDate("fr-FR", date, { ...LONG, timeZone: "Europe/Paris" })).toBe("1er mai 2029");
    expect(formatDate("fr-FR", date, LONG)).toBe("30 avril 2029");
  });
});
