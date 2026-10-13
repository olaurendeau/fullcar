import { describe, expect, it } from "vitest";
import {
  EVENT_FIELDS,
  LOCATION_MAX,
  TITLE_MAX,
  deviceBounds,
  firstInvalidField,
  serverBounds,
  validateEvent,
  type DateBounds,
  type EventFields,
} from "./event";

const bounds: DateBounds = { min: "2026-10-13", max: "2027-10-13" };

const valid: EventFields = {
  title: "Match à Lyon",
  location: "Gymnase Jean Macé",
  allerDate: "2026-12-12",
  allerTime: "07:30",
  retour: true,
  retourDate: "2026-12-12",
  retourTime: "18:00",
};

function errorsOf(fields: EventFields, on: DateBounds = bounds) {
  const result = validateEvent(fields, on);
  if (result.ok) throw new Error("expected errors, got a valid event");
  return result.errors;
}

function eventOf(fields: EventFields, on: DateBounds = bounds) {
  const result = validateEvent(fields, on);
  if (!result.ok) throw new Error(`expected an event, got ${JSON.stringify(result.errors)}`);
  return result.event;
}

describe("validateEvent", () => {
  it("returns the event, trimmed, with wall-clock times", () => {
    expect(eventOf({ ...valid, title: "  Match à Lyon ", location: "\tGymnase Jean Macé\n" })).toEqual({
      title: "Match à Lyon",
      location: "Gymnase Jean Macé",
      allerAt: "2026-12-12 07:30:00",
      retourAt: "2026-12-12 18:00:00",
      boostersEnabled: false,
      participationEnabled: false,
      stopsEnabled: false,
    });
  });

  it("C1.6: an empty form has an error on every required field", () => {
    expect(errorsOf({ retour: true })).toEqual({
      title: "required",
      location: "required",
      allerDate: "required",
      allerTime: "required",
      retourDate: "required",
      retourTime: "required",
    });
  });

  it("C1.6: blank text counts as empty", () => {
    expect(errorsOf({ ...valid, title: "   ", location: " \n" })).toEqual({
      title: "required",
      location: "required",
    });
  });

  describe("lengths, in code points after trim", () => {
    it(`accepts a title of ${TITLE_MAX} and refuses ${TITLE_MAX + 1}`, () => {
      expect(TITLE_MAX).toBe(80);
      expect(eventOf({ ...valid, title: ` ${"a".repeat(80)} ` }).title).toHaveLength(80);
      expect(errorsOf({ ...valid, title: "a".repeat(81) })).toEqual({ title: "tooLong" });
    });

    it(`accepts a location of ${LOCATION_MAX} and refuses ${LOCATION_MAX + 1}`, () => {
      expect(LOCATION_MAX).toBe(120);
      expect(eventOf({ ...valid, location: ` ${"b".repeat(120)}\n` }).location).toHaveLength(120);
      expect(errorsOf({ ...valid, location: "b".repeat(121) })).toEqual({ location: "tooLong" });
    });

    it("counts a character outside the BMP as one, not two UTF-16 units", () => {
      const eighty = "🚗".repeat(80);
      expect(eighty.length).toBe(160);
      expect(eventOf({ ...valid, title: eighty }).title).toBe(eighty);
      expect(errorsOf({ ...valid, title: `${eighty}🚗` })).toEqual({ title: "tooLong" });
    });
  });

  it("refuses a malformed date or time", () => {
    expect(errorsOf({ ...valid, allerDate: "2026-02-30", allerTime: "25:00" })).toEqual({
      allerDate: "invalid",
      allerTime: "invalid",
    });
  });

  describe("C1.7: the retour strictly follows the aller", () => {
    it("refuses the same date and time, on the retour time", () => {
      expect(errorsOf({ ...valid, retourTime: "07:30" })).toEqual({ retourTime: "notAfterAller" });
    });

    it("refuses an earlier time the same day, on the retour time", () => {
      expect(errorsOf({ ...valid, retourTime: "07:29" })).toEqual({ retourTime: "notAfterAller" });
    });

    it("refuses an earlier date, on the retour date", () => {
      expect(errorsOf({ ...valid, retourDate: "2026-12-11", retourTime: "23:00" })).toEqual({
        retourDate: "notAfterAller",
      });
    });

    it("accepts one minute later, and an earlier time on a later day", () => {
      expect(eventOf({ ...valid, retourTime: "07:31" }).retourAt).toBe("2026-12-12 07:31:00");
      expect(eventOf({ ...valid, retourDate: "2026-12-13", retourTime: "06:00" }).retourAt).toBe(
        "2026-12-13 06:00:00",
      );
    });
  });

  describe("C1.8: dates from today to today + 365 days", () => {
    it("accepts both ends", () => {
      expect(eventOf({ ...valid, allerDate: bounds.min, retourDate: bounds.min }).allerAt).toBe(
        "2026-10-13 07:30:00",
      );
      expect(eventOf({ ...valid, allerDate: bounds.max, retourDate: bounds.max }).retourAt).toBe(
        "2027-10-13 18:00:00",
      );
    });

    it("refuses an aller before today", () => {
      expect(errorsOf({ ...valid, allerDate: "2026-10-12", retourDate: "2026-10-13" })).toEqual({
        allerDate: "tooEarly",
      });
    });

    it("refuses an aller or a retour after today + 365 days", () => {
      expect(errorsOf({ ...valid, allerDate: "2027-10-14", retourDate: "2027-10-14" })).toEqual({
        allerDate: "tooLate",
        retourDate: "tooLate",
      });
      expect(errorsOf({ ...valid, retourDate: "2027-10-14" })).toEqual({ retourDate: "tooLate" });
    });

    it("refuses a retour before today even when the aller is missing", () => {
      expect(errorsOf({ ...valid, allerDate: "", retourDate: "2026-10-12" })).toEqual({
        allerDate: "required",
        retourDate: "tooEarly",
      });
    });
  });

  describe("C2.3: without a retour", () => {
    it("ignores the retour fields, even invalid, and stores no retour", () => {
      const event = eventOf({ ...valid, retour: false, retourDate: "2026-12-01", retourTime: "nope" });
      expect(event.retourAt).toBeNull();
    });

    it("does not require them", () => {
      expect(eventOf({ ...valid, retour: false, retourDate: undefined, retourTime: undefined }).retourAt).toBeNull();
    });
  });

  it("C3.2: options left untouched are all disabled", () => {
    expect(eventOf(valid)).toMatchObject({
      boostersEnabled: false,
      participationEnabled: false,
      stopsEnabled: false,
    });
  });

  it.each([
    ["boosters", { boostersEnabled: true, participationEnabled: false, stopsEnabled: false }],
    ["participation", { boostersEnabled: false, participationEnabled: true, stopsEnabled: false }],
    ["stops", { boostersEnabled: false, participationEnabled: false, stopsEnabled: true }],
  ] as const)("C3.3: enabling %s enables it alone", (option, expected) => {
    expect(eventOf({ ...valid, [option]: true })).toMatchObject(expected);
  });
});

describe("firstInvalidField", () => {
  it("follows the order of the form, for the focus", () => {
    expect(EVENT_FIELDS).toEqual(["title", "location", "allerDate", "allerTime", "retourDate", "retourTime"]);
    expect(firstInvalidField({ retourTime: "required", location: "tooLong" })).toBe("location");
    expect(firstInvalidField({ retourDate: "tooLate", allerTime: "invalid" })).toBe("allerTime");
    expect(firstInvalidField({})).toBeUndefined();
  });
});

describe("deviceBounds", () => {
  it("runs from the device's date to + 365 days", () => {
    expect(deviceBounds(new Date(2026, 9, 13, 23, 59))).toEqual({ min: "2026-10-13", max: "2027-10-13" });
    expect(deviceBounds(new Date(2027, 2, 1, 0, 0))).toEqual({ min: "2027-03-01", max: "2028-02-29" });
  });
});

describe("C1.9: serverBounds", () => {
  const now = new Date(Date.UTC(2026, 9, 13, 0, 30));

  it("runs from the UTC date − 1 day to + 366 days", () => {
    expect(serverBounds(now)).toEqual({ min: "2026-10-12", max: "2027-10-14" });
  });

  it("accepts an organiser a day behind or ahead of UTC", () => {
    const on = serverBounds(now);
    expect(eventOf({ ...valid, allerDate: "2026-10-12", retourDate: "2026-10-12" }, on).allerAt).toBe(
      "2026-10-12 07:30:00",
    );
    expect(eventOf({ ...valid, allerDate: "2027-10-14", retourDate: "2027-10-14" }, on).allerAt).toBe(
      "2027-10-14 07:30:00",
    );
  });

  it("refuses beyond the tolerance", () => {
    const on = serverBounds(now);
    expect(errorsOf({ ...valid, allerDate: "2026-10-11", retourDate: "2026-10-12" }, on)).toEqual({
      allerDate: "tooEarly",
    });
    expect(errorsOf({ ...valid, allerDate: "2027-10-15", retourDate: "2027-10-15" }, on)).toEqual({
      allerDate: "tooLate",
      retourDate: "tooLate",
    });
  });
});
