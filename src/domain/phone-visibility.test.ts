import { describe, expect, it } from "vitest";
import { buildBoard, type BoardPerson, type BoardRows, type PlacementRow, type RideRow } from "./board";
import type { Leg } from "./leg";
import { phoneVisible, withVisiblePhones, type CarMembers } from "./phone-visibility";

const PHONES = new Map<string, string | null>([
  ["marc", "06 11 11 11 11"],
  ["lea", "06 22 22 22 22"],
  ["tom", "+33 6 33 33 33 33"],
  ["ana", "07 44 44 44 44"],
  ["zoe", "07 55 55 55 55"],
  ["sam", null],
]);

function p(id: string): BoardPerson {
  return { id, firstName: id };
}

function car(driverId: string, ...passengerIds: string[]): CarMembers {
  return { driver: p(driverId), passengers: passengerIds.map(p) };
}

describe("phoneVisible (C10.1, C10.5)", () => {
  it.each<[string, string, CarMembers | null, string[], boolean]>([
    ["a person of the device sees their own number, without a car", "tom", null, ["tom"], true],
    ["a person of the device sees their own number, in a car", "lea", car("marc", "lea"), ["lea"], true],
    ["the passenger sees the driver", "marc", car("marc", "lea"), ["lea"], true],
    ["the driver sees the passenger", "lea", car("marc", "lea"), ["marc"], true],
    ["a passenger sees another passenger of the car", "zoe", car("marc", "lea", "zoe"), ["lea"], true],
    ["different cars: nothing", "ana", car("ana", "zoe"), ["lea"], false],
    ["a person outside the car given: nothing", "ana", car("marc", "lea"), ["lea"], false],
    ["two persons of another device share the car: nothing", "lea", car("marc", "lea", "zoe"), ["tom"], false],
    ["a person without a car: nothing", "tom", null, ["lea"], false],
    ["a device without a person: nothing", "marc", car("marc", "lea"), [], false],
  ])("%s", (_, subjectId, members, device, expected) => {
    expect(phoneVisible({ subjectId, car: members, deviceIds: new Set(device) })).toBe(expected);
  });
});

let clock = 0;
function placed(personId: string, leg: Leg, rideId: string | null): PlacementRow {
  clock += 1;
  return { personId, leg, rideId, placedAt: new Date(Date.UTC(2026, 9, 15, 8, 0, clock)) };
}

function ride(id: string, leg: Leg, driverId: string, departureTime: RideRow["departureTime"]): RideRow {
  return { id, leg, driverId, location: "Gymnase", departureTime, seats: 3, note: null };
}

/**
 * Aller: Marc drives Léa (r1), Ana drives Zoé (r2), Tom is without a car.
 * Retour: Marc drives alone (r3), Ana drives Léa (r4), Tom and Zoé are without a car.
 * Sam has no phone and is not concerned.
 */
const ROWS: BoardRows = {
  persons: ["marc", "lea", "tom", "ana", "zoe", "sam"].map((id) => ({ id, firstName: id })),
  rides: [
    ride("r1", "aller", "marc", "07:00:00"),
    ride("r2", "aller", "ana", "08:00:00"),
    ride("r3", "retour", "marc", "17:00:00"),
    ride("r4", "retour", "ana", "18:00:00"),
  ],
  placements: [
    placed("lea", "aller", "r1"),
    placed("zoe", "aller", "r2"),
    placed("tom", "aller", null),
    placed("lea", "retour", "r4"),
    placed("tom", "retour", null),
    placed("zoe", "retour", null),
  ],
};

function visibleFor(device: string[]) {
  const deviceIds = new Set(device);
  return withVisiblePhones(buildBoard(ROWS, ["aller", "retour"], deviceIds), PHONES, deviceIds);
}

/** Every phone of the card, by person: `null` for a number that is not sent. */
function cardPhones(board: ReturnType<typeof visibleFor>, leg: Leg, rideId: string) {
  const found = board.find((legBoard) => legBoard.leg === leg)?.cars.find((card) => card.id === rideId);
  if (found === undefined) throw new Error(`no car ${rideId} on ${leg}`);
  return Object.fromEntries([found.driver, ...found.passengers].map((person) => [person.id, person.phone]));
}

function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** The numbers whose digits appear anywhere in what would be sent. */
function sentNumbers(value: unknown): string[] {
  const sent = digits(JSON.stringify(value));
  return [...PHONES.entries()].flatMap(([id, phone]) => (phone !== null && sent.includes(digits(phone)) ? [id] : []));
}

describe("withVisiblePhones", () => {
  it("C10.1: the passenger sees the driver's number on their car, and the driver the passenger's", () => {
    expect(cardPhones(visibleFor(["lea"]), "aller", "r1")).toEqual({ marc: "06 11 11 11 11", lea: "06 22 22 22 22" });
    expect(cardPhones(visibleFor(["marc"]), "aller", "r1")).toEqual({ marc: "06 11 11 11 11", lea: "06 22 22 22 22" });
  });

  it("C10.1: another car of the same leg shows no number", () => {
    expect(cardPhones(visibleFor(["lea"]), "aller", "r2")).toEqual({ ana: null, zoe: null });
  });

  it("C10.3: sharing a car on the other leg only shows nothing, car by car and never by person", () => {
    const board = visibleFor(["lea"]);
    // Marc drives Léa at the aller, not at the retour.
    expect(cardPhones(board, "retour", "r3")).toEqual({ marc: null });
    // Ana drives Léa at the retour, not at the aller.
    expect(cardPhones(board, "retour", "r4")).toEqual({ ana: "07 44 44 44 44", lea: "06 22 22 22 22" });
    expect(cardPhones(board, "aller", "r2")).toEqual({ ana: null, zoe: null });
  });

  it("C10.1: the device section shows the number of the device's own persons, and nobody else's", () => {
    const [aller] = visibleFor(["lea", "tom", "sam"]);
    expect(aller.device).toEqual([
      {
        id: "lea",
        firstName: "lea",
        state: { kind: "passenger", rideId: "r1", driver: { id: "marc", firstName: "marc" } },
        phone: "06 22 22 22 22",
      },
      { id: "tom", firstName: "tom", state: { kind: "withoutCar" }, phone: "+33 6 33 33 33 33" },
      { id: "sam", firstName: "sam", state: { kind: "notConcerned" }, phone: null },
    ]);
  });

  it("C10.1: a driver without a phone has no number", () => {
    const deviceIds = new Set(["lea"]);
    const rows: BoardRows = {
      persons: [
        { id: "sam", firstName: "sam" },
        { id: "lea", firstName: "lea" },
      ],
      rides: [ride("r5", "aller", "sam", "07:00:00")],
      placements: [placed("lea", "aller", "r5")],
    };
    const [aller] = withVisiblePhones(buildBoard(rows, ["aller"], deviceIds), PHONES, deviceIds);
    expect(aller.cars[0].driver).toEqual({ id: "sam", firstName: "sam", phone: null });
    expect(aller.cars[0].passengers).toEqual([{ id: "lea", firstName: "lea", phone: "06 22 22 22 22" }]);
  });

  it("a person absent from phonesById has a null number, never undefined, in the car and the device section", () => {
    const deviceIds = new Set(["lea"]);
    const board = buildBoard(ROWS, ["aller"], deviceIds);
    const [aller] = withVisiblePhones(board, new Map(), deviceIds);
    const r1 = aller.cars.find((card) => card.id === "r1");
    expect(r1?.driver).toStrictEqual({ id: "marc", firstName: "marc", phone: null });
    expect(r1?.passengers).toStrictEqual([{ id: "lea", firstName: "lea", phone: null }]);
    expect(aller.device.map((person) => person.phone)).toStrictEqual([null]);
    // The key survives serialization: no `tel:undefined` link on the other side.
    expect(JSON.parse(JSON.stringify(aller.device[0]))).toHaveProperty("phone", null);
  });

  it("the list without a car carries no number, not even the device's own", () => {
    const [aller] = visibleFor(["tom"]);
    expect(aller.withoutCar).toEqual([{ id: "tom", firstName: "tom" }]);
  });

  it.each<[string, string[], string[], string[]]>([
    ["a device without a person", [], [], []],
    ["a person without a car on both legs", ["tom"], ["tom"], ["tom"]],
    ["the passenger of Marc at the aller, of Ana at the retour", ["lea"], ["marc", "lea"], ["ana", "lea"]],
    ["Marc, who drives Léa at the aller only", ["marc"], ["marc", "lea"], ["marc"]],
    ["Zoé, in Ana's car at the aller, without a car at the retour", ["zoe"], ["ana", "zoe"], ["zoe"]],
  ])("C10.1, C10.5: %s receives no other number, digits searched in the serialized board", (_, device, aller, retour) => {
    const [allerBoard, retourBoard] = visibleFor(device);
    expect(sentNumbers(allerBoard).sort()).toEqual([...aller].sort());
    expect(sentNumbers(retourBoard).sort()).toEqual([...retour].sort());
  });

  it("leaves the board it is given without any number", () => {
    const deviceIds = new Set(["lea"]);
    const board = buildBoard(ROWS, ["aller", "retour"], deviceIds);
    withVisiblePhones(board, PHONES, deviceIds);
    expect(sentNumbers(board)).toEqual([]);
  });
});
