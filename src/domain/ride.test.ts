import { describe, expect, it } from "vitest";
import {
  RIDE_FIELDS,
  RIDE_LOCATION_MAX,
  RIDE_NOTE_MAX,
  RIDE_SEATS_DEFAULT,
  RIDE_SEATS_MAX,
  RIDE_SEATS_MIN,
  seatReduction,
  seatsDecision,
  validateRide,
  type RideFields,
} from "./ride";

const valid: RideFields = { location: "Gare de Lyon", time: "07:30", seats: "3", note: "" };

function rideOf(fields: RideFields) {
  const result = validateRide(fields);
  if (!result.ok) throw new Error(`expected a ride, got ${JSON.stringify(result.errors)}`);
  return result.ride;
}

function failureOf(fields: RideFields) {
  const result = validateRide(fields);
  if (result.ok) throw new Error("expected errors, got a valid ride");
  return result;
}

describe("validateRide", () => {
  it("states the rules of R4", () => {
    expect(RIDE_FIELDS).toEqual(["location", "time", "seats", "note"]);
    expect([RIDE_LOCATION_MAX, RIDE_NOTE_MAX, RIDE_SEATS_MIN, RIDE_SEATS_MAX]).toEqual([120, 200, 1, 8]);
    expect(RIDE_SEATS_DEFAULT).toBe(3);
  });

  it("returns the ride, trimmed, without a note when none is given", () => {
    expect(rideOf({ ...valid, location: "  Gare de Lyon\n", seats: " 4 " })).toEqual({
      location: "Gare de Lyon",
      time: "07:30",
      seats: 4,
      note: null,
    });
  });

  it("accepts the default number of seats, as a number too", () => {
    expect(rideOf({ ...valid, seats: RIDE_SEATS_DEFAULT }).seats).toBe(3);
  });

  it("C4.7: an empty form has an error on every required field", () => {
    const failure = failureOf({});
    expect(failure.errors).toEqual({ location: "required", time: "required", seats: "required" });
    expect(failure.first).toBe("location");
  });

  describe("location", () => {
    it.each([
      ["blank", "  "],
      ["invisible", "​⁠"],
    ])("C4.7: is required, so a %s location is an error", (_, location) => {
      expect(failureOf({ ...valid, location }).errors).toEqual({ location: "required" });
    });

    it("C4.7: accepts 1 and 120 characters, refuses 121", () => {
      expect(rideOf({ ...valid, location: "A" }).location).toBe("A");
      expect(rideOf({ ...valid, location: "a".repeat(120) }).location).toBe("a".repeat(120));
      expect(failureOf({ ...valid, location: "a".repeat(121) }).errors).toEqual({ location: "tooLong" });
    });

    it("C4.7: counts an emoji as one character", () => {
      expect(rideOf({ ...valid, location: "\u{1f3df}".repeat(120) }).location).toBe("\u{1f3df}".repeat(120));
      expect(failureOf({ ...valid, location: "\u{1f3df}".repeat(121) }).errors).toEqual({ location: "tooLong" });
    });
  });

  describe("time", () => {
    it.each(["00:00", "07:30", "23:59"])("C4.7: accepts %s", (time) => {
      expect(rideOf({ ...valid, time }).time).toBe(time);
    });

    it.each(["24:00", "12:60", "7:30", "07:30:00", "0730", "midi"])("C4.7: refuses %s as invalid", (time) => {
      expect(failureOf({ ...valid, time }).errors).toEqual({ time: "invalid" });
    });
  });

  describe("seats", () => {
    it.each<[string | number, number]>([
      ["1", 1],
      ["8", 8],
      [1, 1],
      [8, 8],
    ])("C4.7: accepts %j", (seats, expected) => {
      expect(rideOf({ ...valid, seats }).seats).toBe(expected);
    });

    it.each([["0"], ["9"], [0], [9], ["-1"]])("C4.7: refuses %j as out of range", (seats) => {
      expect(failureOf({ ...valid, seats }).errors).toEqual({ seats: "outOfRange" });
    });

    it.each([["2.5"], [2.5], ["3e0"], ["deux"], ["0x3"], [Number.NaN], [Number.POSITIVE_INFINITY]])(
      "C4.7: refuses %j as not a whole number",
      (seats) => {
        expect(failureOf({ ...valid, seats }).errors).toEqual({ seats: "invalid" });
      },
    );

    it.each([[""], ["  "]])("C4.7: is required, so %j is an error", (seats) => {
      expect(failureOf({ ...valid, seats }).errors).toEqual({ seats: "required" });
    });
  });

  describe("note", () => {
    it.each([undefined, "", "  ", "​"])("is optional: %j is no note", (note) => {
      expect(rideOf({ ...valid, note }).note).toBeNull();
    });

    it("C4.7: accepts 200 characters, emojis counting one, and refuses 201", () => {
      expect(rideOf({ ...valid, note: " Coffre plein " }).note).toBe("Coffre plein");
      expect(rideOf({ ...valid, note: "\u{1f9f3}".repeat(200) }).note).toBe("\u{1f9f3}".repeat(200));
      expect(failureOf({ ...valid, note: "a".repeat(201) }).errors).toEqual({ note: "tooLong" });
    });

    it("refuses a NUL character as invalid", () => {
      expect(failureOf({ ...valid, note: "\u0000" }).errors).toEqual({ note: "invalid" });
    });
  });

  it("C4.7: reports an error per field, and the first field in error", () => {
    const failure = failureOf({ location: "Gare", time: "25:00", seats: "12", note: "a".repeat(201) });
    expect(failure.errors).toEqual({ time: "invalid", seats: "outOfRange", note: "tooLong" });
    expect(failure.first).toBe("time");
  });
});

describe("seatReduction (C8.4, C8.5)", () => {
  const passengers = ["anna", "ben", "chloe", "dan"];

  it("C8.4: accepts exactly passengers − new seats leaving, all of them passengers", () => {
    expect(seatReduction(passengers, 2, ["ben", "dan"])).toEqual({ ok: true, leaving: ["ben", "dan"] });
  });

  it("C8.4: refuses one leaving too many", () => {
    expect(seatReduction(passengers, 2, ["anna", "ben", "dan"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("C8.4: refuses one leaving too few", () => {
    expect(seatReduction(passengers, 2, ["ben"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("C8.4: refuses someone leaving who is not a passenger", () => {
    expect(seatReduction(passengers, 2, ["ben", "zoe"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("refuses the same passenger counted twice", () => {
    expect(seatReduction(passengers, 2, ["ben", "ben"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("C8.5: refuses when someone boarded during the step", () => {
    // The driver chose one leaving among anna, ben, chloe to go from 4 seats to 2; dan boarded meanwhile.
    expect(seatReduction(passengers, 2, ["chloe"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("C8.5: refuses when the one chosen to leave left during the step", () => {
    expect(seatReduction(["anna", "ben"], 1, ["chloe"])).toEqual({ ok: false, error: "passengersChanged" });
  });

  it("asks no one to leave when the new seats still hold every passenger", () => {
    expect(seatReduction(passengers, 4, [])).toEqual({ ok: true, leaving: [] });
    expect(seatReduction(passengers, 8, [])).toEqual({ ok: true, leaving: [] });
    expect(seatReduction(passengers, 8, ["anna"])).toEqual({ ok: false, error: "passengersChanged" });
  });
});

describe("seatsDecision", () => {
  const ride = { seats: 3, passengerIds: ["anna"], elsewhereIds: ["zoe"] };

  it("places everyone asked when the seats are free", () => {
    expect(seatsDecision({ ...ride, personIds: ["ben", "chloe"] })).toEqual({ ok: true, place: ["ben", "chloe"] });
  });

  it("C5.7: refuses the last seat once it is taken, and places no one", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben", "chloe"], personIds: ["dan"] })).toEqual({
      ok: false,
      error: "notEnoughSeats",
      free: 0,
    });
  });

  it("C6.5: all or nothing, one seat left for two persons places neither", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben"], personIds: ["chloe", "dan"] })).toEqual({
      ok: false,
      error: "notEnoughSeats",
      free: 1,
    });
  });

  it("C5.8: already in this car succeeds with nothing to write", () => {
    expect(seatsDecision({ ...ride, personIds: ["anna"] })).toEqual({ ok: true, place: [] });
  });

  it("C5.8: already in this car, even when it is full", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben", "chloe"], personIds: ["anna"] })).toEqual({
      ok: true,
      place: [],
    });
  });

  it("counts only those not yet in this car against the free seats", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben"], personIds: ["anna", "chloe"] })).toEqual({
      ok: true,
      place: ["chloe"],
    });
  });

  it("refuses someone already in another car on this leg, and places no one", () => {
    expect(seatsDecision({ ...ride, personIds: ["ben", "zoe"] })).toEqual({ ok: false, error: "alreadyInCar" });
  });

  it("refuses someone already in another car before counting the seats", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben", "chloe"], personIds: ["zoe"] })).toEqual({
      ok: false,
      error: "alreadyInCar",
    });
  });

  it("places someone asked twice only once", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben"], personIds: ["chloe", "chloe"] })).toEqual({
      ok: true,
      place: ["chloe"],
    });
  });
});
