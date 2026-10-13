import { describe, expect, it } from "vitest";
import {
  addDays,
  isWallDate,
  isWallTime,
  localDate,
  toWallClock,
  utcDate,
  wallClockAsUtc,
  wallClockParts,
} from "./wall-clock";

describe("isWallDate", () => {
  it("accepts a calendar date as an <input type=date> sends it", () => {
    expect(isWallDate("2026-12-12")).toBe(true);
    expect(isWallDate("2028-02-29")).toBe(true);
  });

  it("refuses a date that does not exist", () => {
    expect(isWallDate("2026-02-29")).toBe(false);
    expect(isWallDate("2026-04-31")).toBe(false);
    expect(isWallDate("2026-13-01")).toBe(false);
    expect(isWallDate("2026-00-10")).toBe(false);
    expect(isWallDate("2026-01-00")).toBe(false);
  });

  it("refuses any other shape", () => {
    for (const value of ["", "2026-1-05", "12/12/2026", "2026-12-12T07:30", "+02026-12-12", " 2026-12-12"]) {
      expect(isWallDate(value)).toBe(false);
    }
  });
});

describe("isWallTime", () => {
  it("accepts hours and minutes", () => {
    expect(isWallTime("00:00")).toBe(true);
    expect(isWallTime("07:30")).toBe(true);
    expect(isWallTime("23:59")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const value of ["", "24:00", "07:60", "7:30", "07:30:00", "07h30", "07:30Z"]) {
      expect(isWallTime(value)).toBe(false);
    }
  });
});

describe("addDays", () => {
  it("moves across months, years and leap days", () => {
    expect(addDays("2026-10-13", 1)).toBe("2026-10-14");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-10-13", 365)).toBe("2027-10-13");
    expect(addDays("2027-10-13", 365)).toBe("2028-10-12");
  });
});

describe("today", () => {
  it("reads the device's date in its own time zone", () => {
    expect(localDate(new Date(2026, 9, 13, 0, 0))).toBe("2026-10-13");
    expect(localDate(new Date(2026, 9, 13, 23, 59))).toBe("2026-10-13");
  });

  it("reads the server's date in UTC", () => {
    expect(utcDate(new Date(Date.UTC(2026, 9, 13, 0, 0)))).toBe("2026-10-13");
    expect(utcDate(new Date(Date.UTC(2026, 9, 13, 23, 59)))).toBe("2026-10-13");
  });
});

describe("wall-clock time, without a time zone", () => {
  it("joins a date and a time into the string Postgres stores and returns", () => {
    expect(toWallClock("2026-12-12", "07:30")).toBe("2026-12-12 07:30:00");
  });

  it("splits it back into the values of the form", () => {
    expect(wallClockParts("2026-12-12 07:30:00")).toEqual({ date: "2026-12-12", time: "07:30" });
  });

  it("keeps the digits whatever the time zone, when formatted as UTC", () => {
    const at = wallClockAsUtc("2026-12-12 07:30:00");
    const time = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "short" }).format(at);
    expect(time).toBe("07:30");
    expect(date).toBe("12/12/2026");
  });
});
