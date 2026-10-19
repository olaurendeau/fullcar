import { describe, expect, it } from "vitest";
import {
  RIDE_FIELDS,
  RIDE_LOCATION_MAX,
  RIDE_NOTE_MAX,
  RIDE_SEATS_DEFAULT,
  RIDE_SEATS_MAX,
  RIDE_SEATS_MIN,
  passengersFit,
  seatReduction,
  seatsDecision,
  validateRide,
  validateRideChange,
  validSeats,
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

  // Only a forged request sends these: a field error, never an exception.
  it.each<[keyof RideFields, unknown]>([
    ["location", 42],
    ["location", { value: "Gare" }],
    ["time", 730],
    ["time", ["07:30"]],
    ["seats", true],
    ["seats", { seats: 3 }],
    ["seats", [3]],
    ["note", false],
    ["note", ["a"]],
  ])("refuses a forged %s of %j as invalid, without throwing", (field, value) => {
    expect(failureOf({ ...valid, [field]: value }).errors).toEqual({ [field]: "invalid" });
  });

  it("reads null as a missing value", () => {
    expect(failureOf({ location: null, time: null, seats: null }).errors).toEqual({
      location: "required",
      time: "required",
      seats: "required",
    });
    expect(rideOf({ ...valid, note: null }).note).toBeNull();
  });

  it("C4.7: reports an error per field, and the first field in error", () => {
    const failure = failureOf({ location: "Gare", time: "25:00", seats: "12", note: "a".repeat(201) });
    expect(failure.errors).toEqual({ time: "invalid", seats: "outOfRange", note: "tooLong" });
    expect(failure.first).toBe("time");
  });
});

describe("validateRideChange (C8.2)", () => {
  it("leaves out a field not sent, and reads the others as validateRide does", () => {
    expect(validateRideChange({})).toEqual({ ok: true, change: {} });
    expect(validateRideChange({ note: " Coffre plein " })).toEqual({ ok: true, change: { note: "Coffre plein" } });
    expect(validateRideChange({ seats: "2", note: "" })).toEqual({ ok: true, change: { seats: 2, note: null } });
    expect(validateRideChange({ location: " ", time: "25:00" })).toEqual({
      ok: false,
      errors: { location: "required", time: "invalid" },
      first: "location",
    });
  });
});

describe("seatReduction (C8.4, C8.5)", () => {
  const passengers = ["anna", "ben", "chloe", "dan"];
  /** The driver saw the passengers as they are now: nothing moved during the step. */
  function reduce(newSeats: number, leaving: string[], passengerIds = passengers, seenPassengerIds = passengers) {
    return seatReduction({ passengerIds, seenPassengerIds, newSeats, leaving });
  }
  const changed = { ok: false, error: "passengersChanged" };

  it("C8.4: accepts exactly passengers − new seats leaving, all of them passengers", () => {
    expect(reduce(2, ["ben", "dan"])).toEqual({ ok: true, leaving: ["ben", "dan"] });
  });

  it("C8.4: refuses one leaving too many", () => {
    expect(reduce(2, ["anna", "ben", "dan"])).toEqual(changed);
  });

  it("C8.4: refuses one leaving too few", () => {
    expect(reduce(2, ["ben"])).toEqual(changed);
  });

  it("C8.4: refuses someone leaving who is not a passenger", () => {
    expect(reduce(2, ["ben", "zoe"])).toEqual(changed);
  });

  it("refuses the same passenger counted twice, even when the count matches", () => {
    expect(reduce(2, ["ben", "ben", "dan"])).toEqual(changed);
  });

  it("C8.5: refuses when someone boarded during the step", () => {
    // The driver saw anna, ben, chloe and chose one to leave to go down to 2 seats; dan boarded meanwhile.
    expect(reduce(2, ["chloe"], passengers, ["anna", "ben", "chloe"])).toEqual(changed);
  });

  it("C8.5: refuses when someone boarded and someone else left during the step, the count unchanged", () => {
    // Seen: anna, ben, chloe. Now: anna, chloe, dan. Still 3 passengers, and chloe is still one of them.
    expect(reduce(2, ["chloe"], ["anna", "chloe", "dan"], ["anna", "ben", "chloe"])).toEqual(changed);
  });

  // The swap above is the test that proves C8.5. This one keeps the size in the
  // comparison of the passengers: without it, the passengers now, all among those seen,
  // would pass for them.
  it("C8.5: refuses when someone seen left during the step, the one chosen still a passenger", () => {
    expect(reduce(2, ["ben"], ["anna", "ben", "dan"], passengers)).toEqual(changed);
  });

  it("C8.5: refuses when the one chosen to leave left during the step", () => {
    expect(reduce(1, ["chloe"], ["anna", "ben"], ["anna", "ben", "chloe"])).toEqual(changed);
  });

  it("reads the passengers as a set: the order they come in does not matter", () => {
    expect(reduce(3, ["anna"], passengers, ["dan", "chloe", "ben", "anna"])).toEqual({ ok: true, leaving: ["anna"] });
  });

  it("asks no one to leave when the new seats still hold every passenger", () => {
    expect(reduce(4, [])).toEqual({ ok: true, leaving: [] });
    expect(reduce(8, [])).toEqual({ ok: true, leaving: [] });
    expect(reduce(8, ["anna"])).toEqual(changed);
  });

  it("without anyone to leave, someone boarding meanwhile changes nothing as long as all still fit", () => {
    expect(reduce(5, [], passengers, ["anna", "ben"])).toEqual({ ok: true, leaving: [] });
    expect(reduce(3, [], passengers, ["anna", "ben"])).toEqual(changed);
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
      freeSeats: 0,
    });
  });

  it("C6.5: all or nothing, one seat left for two persons places neither", () => {
    expect(seatsDecision({ ...ride, passengerIds: ["anna", "ben"], personIds: ["chloe", "dan"] })).toEqual({
      ok: false,
      error: "notEnoughSeats",
      freeSeats: 1,
    });
  });

  it("never counts fewer than zero free seats, when the seats went below the passengers", () => {
    expect(seatsDecision({ ...ride, seats: 2, passengerIds: ["anna", "ben", "chloe"], personIds: ["dan"] })).toEqual({
      ok: false,
      error: "notEnoughSeats",
      freeSeats: 0,
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

describe("passengersFit", () => {
  it.each([
    ["no one ticked", 0, 3, true],
    ["as many ticked as seats", 3, 3, true],
    ["one more than the seats", 4, 3, false],
    ["one more than a single seat", 2, 1, false],
  ])("C4.13: %s, %i for %i seats, fits: %s", (_, count, seats, fits) => {
    expect(passengersFit(count, seats)).toBe(fits);
  });

  it("counts against the seats R4 accepts, and none it refuses", () => {
    expect([validSeats("3"), validSeats(8), validSeats("9"), validSeats("deux"), validSeats(undefined)]).toEqual([
      3,
      8,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
