import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listMyEvents, type MyEventRow } from "./my-events";

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

const ACCOUNT = { id: "account-camille", email: "camille@exemple.fr" };
const OTHER_ACCOUNT_ID = "account-dominique";

/** 2026-12-12 13:00:00 in Paris (UTC+1 in winter). */
const NOW = new Date("2026-12-12T12:00:00Z");

/** A confirmed event of ACCOUNT, aller and retour, nobody signed up, unless `fields` says otherwise. */
function row(fields: Partial<MyEventRow> & Pick<MyEventRow, "id">): MyEventRow {
  return {
    title: `Tournoi ${fields.id}`,
    location: "Gymnase des Gayeulles",
    allerAt: "2026-12-20 07:30:00",
    retourAt: "2026-12-20 18:00:00",
    accountId: ACCOUNT.id,
    confirmed: true,
    anonymised: false,
    persons: 0,
    withoutCar: { aller: 0, retour: 0 },
    ...fields,
  };
}

const ids = (events: { id: string }[]) => events.map((event) => event.id);

function clockCases() {
  describe("OA6.1: upcoming, then past", () => {
    it("sorts the upcoming by start, soonest first, and the past by start, latest first", () => {
      const rows = [
        row({ id: "past-old", allerAt: "2026-10-01 09:00:00", retourAt: null }),
        row({ id: "next-later", allerAt: "2027-01-10 09:00:00", retourAt: null }),
        row({ id: "past-recent", allerAt: "2026-12-01 09:00:00", retourAt: "2026-12-01 18:00:00" }),
        row({ id: "next-soon", allerAt: "2026-12-15 09:00:00", retourAt: null }),
        row({ id: "past-middle", allerAt: "2026-11-01 09:00:00", retourAt: null }),
      ];
      const list = listMyEvents(rows, ACCOUNT, NOW);
      expect(ids(list.upcoming)).toEqual(["next-soon", "next-later"]);
      expect(ids(list.past)).toEqual(["past-recent", "past-middle", "past-old"]);
    });

    it("sorts by the start, the aller, not by the last leg", () => {
      const rows = [
        row({ id: "starts-first-ends-last", allerAt: "2026-12-14 09:00:00", retourAt: "2026-12-30 18:00:00" }),
        row({ id: "starts-second", allerAt: "2026-12-15 09:00:00", retourAt: "2026-12-15 18:00:00" }),
      ];
      expect(ids(listMyEvents(rows, ACCOUNT, NOW).upcoming)).toEqual(["starts-first-ends-last", "starts-second"]);
    });

    it("is past once the last leg's time has passed in Paris, not at that very second", () => {
      const atNow = row({ id: "at-13h", allerAt: "2026-12-12 13:00:00", retourAt: null });
      expect(ids(listMyEvents([atNow], ACCOUNT, NOW).upcoming)).toEqual(["at-13h"]);
      const aSecondLater = new Date("2026-12-12T12:00:01Z");
      expect(ids(listMyEvents([atNow], ACCOUNT, aSecondLater).past)).toEqual(["at-13h"]);
    });

    it("is not past while the retour has not passed, the aller past", () => {
      const retourTonight = row({ id: "retour-tonight", allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" });
      const list = listMyEvents([retourTonight], ACCOUNT, NOW);
      expect(ids(list.upcoming)).toEqual(["retour-tonight"]);
      expect(list.past).toEqual([]);
    });

    it("reads Paris's clock, not UTC's: a leg at 12:30 has passed at 12:00 UTC", () => {
      const atHalfPastTwelve = row({ id: "at-12h30", allerAt: "2026-12-12 12:30:00", retourAt: null });
      expect(ids(listMyEvents([atHalfPastTwelve], ACCOUNT, NOW).past)).toEqual(["at-12h30"]);
    });

    it("lists nothing in either section without events", () => {
      expect(listMyEvents([], ACCOUNT, NOW)).toEqual({ upcoming: [], past: [] });
    });
  });

  describe("OA6.2: a row", () => {
    it("carries the title, start, place, persons, and a count per leg with someone without a car", () => {
      const rows = [row({ id: "upcoming", persons: 4, withoutCar: { aller: 0, retour: 2 } })];
      expect(listMyEvents(rows, ACCOUNT, NOW).upcoming).toEqual([
        {
          state: "upcoming",
          id: "upcoming",
          title: "Tournoi upcoming",
          start: "2026-12-20 07:30:00",
          location: "Gymnase des Gayeulles",
          persons: 4,
          withoutCar: [{ leg: "retour", count: 2 }],
        },
      ]);
    });

    it("gives the legs in their order, and none without a car on no leg", () => {
      const both = row({ id: "both", persons: 3, withoutCar: { aller: 1, retour: 3 } });
      const none = row({ id: "none", allerAt: "2026-12-21 07:30:00", persons: 3 });
      const [first, second] = listMyEvents([both, none], ACCOUNT, NOW).upcoming;
      expect(first?.withoutCar).toEqual([
        { leg: "aller", count: 1 },
        { leg: "retour", count: 3 },
      ]);
      expect(second?.withoutCar).toEqual([]);
    });

    it("never counts a retour the event does not have", () => {
      const allerOnly = row({ id: "aller-only", retourAt: null, persons: 1, withoutCar: { aller: 1, retour: 1 } });
      expect(listMyEvents([allerOnly], ACCOUNT, NOW).upcoming[0]?.withoutCar).toEqual([{ leg: "aller", count: 1 }]);
    });
  });

  describe("OA6.3: past, not anonymised yet", () => {
    it("says the date of day 30 in Paris, from the last leg, and keeps its counts", () => {
      const past = row({
        id: "past",
        allerAt: "2026-12-01 07:30:00",
        retourAt: "2026-12-02 18:00:00",
        persons: 2,
        withoutCar: { aller: 1, retour: 0 },
      });
      expect(listMyEvents([past], ACCOUNT, NOW).past).toEqual([
        {
          state: "past",
          id: "past",
          title: "Tournoi past",
          start: "2026-12-01 07:30:00",
          location: "Gymnase des Gayeulles",
          persons: 2,
          withoutCar: [{ leg: "aller", count: 1 }],
          erasedOn: "2027-01-01",
        },
      ]);
    });

    it("counts day 30 from the aller without a retour", () => {
      const past = row({ id: "past", allerAt: "2026-12-01 23:30:00", retourAt: null });
      expect(listMyEvents([past], ACCOUNT, NOW).past[0]).toMatchObject({ state: "past", erasedOn: "2026-12-31" });
    });

    // #607: the purge runs at 03:00 UTC, and may fail. Day 30 begun, the date is no longer in the future.
    it("gives no date once day 30 has begun in Paris, before the purge has anonymised it", () => {
      const dayThirtyToday = row({ id: "today", allerAt: "2026-11-12 07:30:00", retourAt: "2026-11-12 18:00:00" });
      const dayThirtyPassed = row({ id: "passed", allerAt: "2026-11-01 07:30:00", retourAt: null });
      const dayThirtyTomorrow = row({ id: "tomorrow", allerAt: "2026-11-13 07:30:00", retourAt: null });
      const past = listMyEvents([dayThirtyToday, dayThirtyPassed, dayThirtyTomorrow], ACCOUNT, NOW).past;
      expect(past.map((event) => [event.id, event.state === "past" && event.erasedOn])).toEqual([
        ["tomorrow", "2026-12-13"],
        ["today", null],
        ["passed", null],
      ]);
      // From Paris's midnight on: 00:30 in Paris is still 23:30 UTC of the day before.
      const justAfterMidnight = new Date("2026-12-11T23:30:00Z");
      expect(listMyEvents([dayThirtyToday], ACCOUNT, justAfterMidnight).past[0]).toMatchObject({ erasedOn: null });
    });
  });

  describe("OA6.4: anonymised", () => {
    it("keeps the title, start and place, says the sign-ups are erased, and has no count", () => {
      const erased = row({
        id: "erased",
        allerAt: "2026-10-01 07:30:00",
        retourAt: "2026-10-01 18:00:00",
        anonymised: true,
        persons: 5,
        withoutCar: { aller: 2, retour: 1 },
      });
      const [listed] = listMyEvents([erased], ACCOUNT, NOW).past;
      expect(listed).toEqual({
        state: "erased",
        id: "erased",
        title: "Tournoi erased",
        start: "2026-10-01 07:30:00",
        location: "Gymnase des Gayeulles",
      });
      expect(listed).not.toHaveProperty("persons");
      expect(listed).not.toHaveProperty("withoutCar");
      expect(listed).not.toHaveProperty("erasedOn");
    });

    it("is among the past, by its start, with the past not anonymised yet", () => {
      const rows = [
        row({ id: "erased", allerAt: "2026-10-01 07:30:00", retourAt: null, anonymised: true }),
        row({ id: "past", allerAt: "2026-11-20 07:30:00", retourAt: null }),
        row({ id: "upcoming" }),
      ];
      const list = listMyEvents(rows, ACCOUNT, NOW);
      expect(ids(list.past)).toEqual(["past", "erased"]);
      expect(ids(list.upcoming)).toEqual(["upcoming"]);
    });
  });

  describe("OA2.3: only the events the session is the organiser of", () => {
    it("lists no pending event, nor an event of another account, nor one left without an organiser", () => {
      const rows = [
        row({ id: "pending", accountId: null, confirmed: false }),
        row({ id: "someone-else", accountId: OTHER_ACCOUNT_ID }),
        row({ id: "without-organiser", accountId: null }),
        row({ id: "mine" }),
      ];
      expect(ids(listMyEvents(rows, ACCOUNT, NOW).upcoming)).toEqual(["mine"]);
    });

    it("lists no anonymised event of another account, while its own is among the past", () => {
      const rows = [
        row({ id: "someone-else-erased", allerAt: "2026-10-01 07:30:00", retourAt: null, accountId: OTHER_ACCOUNT_ID, anonymised: true }),
        row({ id: "mine-erased", allerAt: "2026-10-02 07:30:00", retourAt: null, anonymised: true }),
      ];
      const list = listMyEvents(rows, ACCOUNT, NOW);
      expect(ids(list.past)).toEqual(["mine-erased"]);
      expect(list.upcoming).toEqual([]);
    });
  });
}

describe("in the server's own zone", () => {
  clockCases();
});

describe("in Pacific/Kiritimati (UTC+14)", () => {
  inZone("Pacific/Kiritimati");
  clockCases();
});
