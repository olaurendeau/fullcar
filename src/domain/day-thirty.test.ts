import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAY_THIRTY_DAYS,
  dayThirty,
  isDayThirtyReached,
  isPast,
  lastLegAt,
  parisNow,
  parisToday,
  purgeCutoff,
  REFERENCE_ZONE,
} from "./day-thirty";
import { addDays } from "./wall-clock";

/** The tests of a block run in `zone`; see wall-clock.test.ts. */
function inZone(zone: string) {
  const saved = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = zone;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  });
}

const withRetour = { allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-14 18:00:00" };
const withoutRetour = { allerAt: "2026-12-12 07:30:00", retourAt: null };

// Paris is UTC+1 in winter and UTC+2 in summer: midnight in Paris is 23:00 or 22:00 UTC.
const winterBeforeMidnight = new Date("2026-12-12T22:59:59Z");
const winterMidnight = new Date("2026-12-12T23:00:00Z");
const summerBeforeMidnight = new Date("2026-07-14T21:59:59Z");
const summerMidnight = new Date("2026-07-14T22:00:00Z");

describe("the reference zone", () => {
  it("is Paris, and the purge waits 30 days", () => {
    expect(REFERENCE_ZONE).toBe("Europe/Paris");
    expect(DAY_THIRTY_DAYS).toBe(30);
  });
});

/** Everything that reads the clock; the same instants must give the same answers in every zone. */
function clockCases() {
  describe("parisNow", () => {
    it("reads the instant on a clock in Paris, as a WallClock", () => {
      expect(parisNow(new Date("2026-12-12T06:30:00Z"))).toBe("2026-12-12 07:30:00");
      expect(parisNow(new Date("2026-07-14T05:30:00Z"))).toBe("2026-07-14 07:30:00");
    });

    it("turns the day at midnight in Paris, not in UTC", () => {
      expect(parisNow(winterBeforeMidnight)).toBe("2026-12-12 23:59:59");
      expect(parisNow(winterMidnight)).toBe("2026-12-13 00:00:00");
      expect(parisNow(summerBeforeMidnight)).toBe("2026-07-14 23:59:59");
      expect(parisNow(summerMidnight)).toBe("2026-07-15 00:00:00");
    });

    it("follows the change of hour", () => {
      // 2026-10-25: 03:00 summer time becomes 02:00 winter time, at 01:00 UTC.
      expect(parisNow(new Date("2026-10-25T00:59:59Z"))).toBe("2026-10-25 02:59:59");
      expect(parisNow(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-25 02:00:00");
      // 2027-03-28: 02:00 winter time becomes 03:00 summer time, at 01:00 UTC.
      expect(parisNow(new Date("2027-03-28T00:59:59Z"))).toBe("2027-03-28 01:59:59");
      expect(parisNow(new Date("2027-03-28T01:00:00Z"))).toBe("2027-03-28 03:00:00");
    });

    it("drops the milliseconds", () => {
      expect(parisNow(new Date("2026-12-12T22:59:59.999Z"))).toBe("2026-12-12 23:59:59");
    });
  });

  describe("parisToday", () => {
    it("is the date in Paris, around midnight", () => {
      expect(parisToday(winterBeforeMidnight)).toBe("2026-12-12");
      expect(parisToday(winterMidnight)).toBe("2026-12-13");
      expect(parisToday(summerBeforeMidnight)).toBe("2026-07-14");
      expect(parisToday(summerMidnight)).toBe("2026-07-15");
    });

    it("turns the year at midnight in Paris, an hour before UTC in winter", () => {
      expect(parisToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
      expect(parisToday(new Date("2026-12-31T22:30:00Z"))).toBe("2026-12-31");
    });
  });

  describe("OA6.1: isPast", () => {
    it("without a retour: once the aller's date and time have passed in Paris", () => {
      expect(isPast(withoutRetour, new Date("2026-12-12T06:29:59Z"))).toBe(false);
      expect(isPast(withoutRetour, new Date("2026-12-12T06:30:00Z"))).toBe(false);
      expect(isPast(withoutRetour, new Date("2026-12-12T06:30:01Z"))).toBe(true);
    });

    it("with a retour: only once the retour has passed, not the aller", () => {
      expect(isPast(withRetour, new Date("2026-12-13T12:00:00Z"))).toBe(false);
      expect(isPast(withRetour, new Date("2026-12-14T17:00:00Z"))).toBe(false);
      expect(isPast(withRetour, new Date("2026-12-14T17:00:01Z"))).toBe(true);
    });

    it("turns at midnight in Paris for a leg at midnight", () => {
      const atMidnight = { allerAt: "2026-12-13 00:00:00", retourAt: null };
      expect(isPast(atMidnight, winterMidnight)).toBe(false);
      expect(isPast(atMidnight, new Date("2026-12-12T23:00:01Z"))).toBe(true);
      const lateEvening = { allerAt: "2026-12-12 23:30:00", retourAt: null };
      expect(isPast(lateEvening, winterBeforeMidnight)).toBe(true);
    });
  });

  describe("OA2.7, OA8.1, OA8.2: isDayThirtyReached", () => {
    it("without a retour: from day 30 after the aller, at midnight in Paris", () => {
      // Day 30 is 2027-01-11, which begins at 2027-01-10T23:00:00Z.
      expect(isDayThirtyReached(withoutRetour, new Date("2027-01-10T22:59:59Z"))).toBe(false);
      expect(isDayThirtyReached(withoutRetour, new Date("2027-01-10T23:00:00Z"))).toBe(true);
      expect(isDayThirtyReached(withoutRetour, new Date("2027-03-01T12:00:00Z"))).toBe(true);
    });

    it("with a retour: from day 30 after the retour, not after the aller", () => {
      expect(isDayThirtyReached(withRetour, new Date("2027-01-11T12:00:00Z"))).toBe(false);
      // Day 30 is 2027-01-13, which begins at 2027-01-12T23:00:00Z.
      expect(isDayThirtyReached(withRetour, new Date("2027-01-12T22:59:59Z"))).toBe(false);
      expect(isDayThirtyReached(withRetour, new Date("2027-01-12T23:00:00Z"))).toBe(true);
    });

    it("on a summer day 30, midnight in Paris is 22:00 UTC", () => {
      const june = { allerAt: "2026-06-15 09:00:00", retourAt: null };
      // Day 30 is 2026-07-15.
      expect(isDayThirtyReached(june, summerBeforeMidnight)).toBe(false);
      expect(isDayThirtyReached(june, summerMidnight)).toBe(true);
    });

    it("does not depend on the hour of the last leg", () => {
      const late = { allerAt: "2026-12-12 23:59:00", retourAt: null };
      const early = { allerAt: "2026-12-12 00:00:00", retourAt: null };
      const dayThirtyStarts = new Date("2027-01-10T23:00:00Z");
      expect(isDayThirtyReached(late, dayThirtyStarts)).toBe(true);
      expect(isDayThirtyReached(early, new Date("2027-01-10T22:59:59Z"))).toBe(false);
    });
  });

  describe("purgeCutoff", () => {
    it("is the latest last-leg date whose day 30 has come, in Paris", () => {
      expect(purgeCutoff(new Date("2027-01-10T22:59:59Z"))).toBe("2026-12-11");
      expect(purgeCutoff(new Date("2027-01-10T23:00:00Z"))).toBe("2026-12-12");
    });

    it("agrees with isDayThirtyReached, around midnight in Paris", () => {
      for (const now of [winterBeforeMidnight, winterMidnight, summerBeforeMidnight, summerMidnight]) {
        const cutoff = purgeCutoff(now);
        for (const event of [
          { allerAt: `${cutoff} 23:59:00`, retourAt: null },
          { allerAt: "2026-01-01 08:00:00", retourAt: `${cutoff} 00:00:00` },
        ]) {
          expect(isDayThirtyReached(event, now)).toBe(true);
        }
        const dayAfter = addDays(cutoff, 1);
        expect(isDayThirtyReached({ allerAt: `${dayAfter} 00:00:00`, retourAt: null }, now)).toBe(false);
      }
    });
  });
}

describe("lastLegAt", () => {
  it("is the retour when the event has one, otherwise the aller", () => {
    expect(lastLegAt(withRetour)).toBe("2026-12-14 18:00:00");
    expect(lastLegAt(withoutRetour)).toBe("2026-12-12 07:30:00");
  });
});

describe("OA6.3: dayThirty", () => {
  it("without a retour: the aller's date plus 30 days", () => {
    expect(dayThirty(withoutRetour)).toBe("2027-01-11");
  });

  it("with a retour: the retour's date plus 30 days", () => {
    expect(dayThirty(withRetour)).toBe("2027-01-13");
  });

  it("counts calendar days, whatever the hour of the last leg", () => {
    expect(dayThirty({ allerAt: "2026-12-12 00:00:00", retourAt: null })).toBe("2027-01-11");
    expect(dayThirty({ allerAt: "2026-12-12 23:59:00", retourAt: null })).toBe("2027-01-11");
  });

  it("across a leap day and the end of a month", () => {
    expect(dayThirty({ allerAt: "2028-02-10 10:00:00", retourAt: null })).toBe("2028-03-11");
    expect(dayThirty({ allerAt: "2027-02-10 10:00:00", retourAt: null })).toBe("2027-03-12");
    expect(dayThirty({ allerAt: "2026-10-01 10:00:00", retourAt: "2026-10-31 18:00:00" })).toBe("2026-11-30");
  });
});

describe("on a server in UTC, as on Vercel", () => {
  inZone("UTC");
  clockCases();
});

describe("on a server in Pacific/Kiritimati (UTC+14), as in the e2e tests", () => {
  inZone("Pacific/Kiritimati");
  clockCases();
});

describe("on a server in Pacific/Pago_Pago (UTC−11)", () => {
  inZone("Pacific/Pago_Pago");
  clockCases();
});
