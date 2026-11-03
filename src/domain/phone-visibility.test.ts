import { describe, expect, it } from "vitest";
import { hashAdminToken } from "./admin-token";
import { buildBoard, type BoardPerson, type BoardRows, type PlacementRow, type RideRow } from "./board";
import type { Leg } from "./leg";
import { decideOrganiserAccess, type OrganiserAccess, type OrganiserVisitor } from "./organiser-access";
import {
  phoneVisible,
  withOrganiserPhones,
  withVisiblePhones,
  type CarMembers,
  type OrganiserLegBoard,
  type PhonesById,
} from "./phone-visibility";

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
  return { personId, leg, rideId, stopId: null, placedAt: new Date(Date.UTC(2026, 9, 15, 8, 0, clock)) };
}

function ride(id: string, leg: Leg, driverId: string, departureTime: RideRow["departureTime"]): RideRow {
  return { id, leg, driverId, location: "Gymnase", departureTime, seats: 3, note: null, position: null };
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
  stops: [],
};

const GYMNASE = { lat: 48.85661, lng: 2.35222 };

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
      stops: [],
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

  it("PL7.2: the persons not concerned carry no number, whatever the device, even their own", () => {
    // Tom has a number and does not do the aller: his device reads it in its own section only.
    const rows: BoardRows = { ...ROWS, placements: ROWS.placements.filter((row) => !(row.personId === "tom" && row.leg === "aller")) };
    for (const device of [[], ["tom"], ["sam"], ["marc", "tom"], ["lea", "zoe", "ana"]]) {
      const deviceIds = new Set(device);
      const [aller] = withVisiblePhones(buildBoard(rows, ["aller", "retour"], deviceIds), PHONES, deviceIds);
      expect(aller.notConcerned).toStrictEqual([p("tom"), p("sam")]);
      for (const person of aller.notConcerned) expect(Object.keys(person).sort()).toEqual(["firstName", "id"]);
      expect(JSON.stringify(aller.notConcerned)).not.toMatch(/\d/);
    }
  });

  it("a car's position, or null, arrives in the visible car", () => {
    const rows: BoardRows = { ...ROWS, rides: ROWS.rides.map((row) => (row.id === "r1" ? { ...row, position: GYMNASE } : row)) };
    const deviceIds = new Set(["lea"]);
    const [aller] = withVisiblePhones(buildBoard(rows, ["aller"], deviceIds), PHONES, deviceIds);
    expect(aller.cars.map((card) => [card.id, card.position])).toStrictEqual([
      ["r1", GYMNASE],
      ["r2", null],
    ]);
    // The key survives serialization: a car without a position says so.
    expect(JSON.parse(JSON.stringify(aller.cars[1]))).toHaveProperty("position", null);
  });

  it("leaves the board it is given without any number", () => {
    const deviceIds = new Set(["lea"]);
    const board = buildBoard(ROWS, ["aller", "retour"], deviceIds);
    withVisiblePhones(board, PHONES, deviceIds);
    expect(sentNumbers(board)).toEqual([]);
  });
});

/*
 * DO1 (#154, decided by the human on 2026-10-18): what the organiser area receives. The token
 * below is a test value, not a real one, and no test title carries it nor any number.
 */
const ADMIN_TOKEN = "Zm9yLXRoZS10ZXN0cy1vbm";
const EVENT_ID = "Ab3dEf7h";
const ORGANISER = { id: "account-organiser", email: "camille@exemple.fr" };

/** The access the one rule gives (organiser-access.ts) to this visitor of a confirmed event. */
function accessOf(visitor: OrganiserVisitor): OrganiserAccess {
  const event = { id: EVENT_ID, accountId: ORGANISER.id, confirmed: true, anonymised: false, adminTokenHash: hashAdminToken(ADMIN_TOKEN) };
  const decision = decideOrganiserAccess(event, visitor);
  if (decision.state !== "organiser") throw new Error(`the decision is ${decision.state}`);
  return decision.access;
}

/** The creation browser's token (OA7.6). */
const RIGHT = accessOf({ adminToken: ADMIN_TOKEN, account: undefined });
/** The session of the event's account (OA7.6). */
const SESSION = accessOf({ adminToken: undefined, account: ORGANISER });

const ORGANISER_PHONES = new Map<string, string | null>([
  ["marc", "06 11 11 11 11"],
  ["lea", "06 22 22 22 22"],
  ["tom", "+33 6 33 33 33 33"],
  ["ana", "07 44 44 44 44"],
  ["eve", "07 66 66 66 66"],
  ["sam", null],
]);
const EVE_PHONE = "07 66 66 66 66";

/** The persons of the scene whose number's digits appear anywhere in what would be sent. */
function sentOrganiserNumbers(value: unknown): string[] {
  const sent = digits(JSON.stringify(value) ?? "");
  return [...ORGANISER_PHONES.entries()].flatMap(([id, phone]) =>
    phone !== null && sent.includes(digits(phone)) ? [id] : [],
  );
}

/** Where a number's digits appear in the organiser's board: `{leg}.withoutCar` or `{leg}.cars`. */
function phonePlaces(board: OrganiserLegBoard[], phone: string): string[] {
  return board.flatMap((leg) =>
    (["withoutCar", "cars"] as const).flatMap((list) =>
      digits(JSON.stringify(leg[list])).includes(digits(phone)) ? [`${leg.leg}.${list}`] : [],
    ),
  );
}

type EveOnAller = "without a car" | "a passenger" | "a driver" | "not concerned" | "not concerned, and without a car on the retour";

/**
 * Aller: Marc drives Léa (r1), Tom is without a car. Retour: Ana drives Tom (r3), Sam is
 * without a car and has no number. Eve, the person of the case, is on the aller as the case
 * says, and not concerned at the retour, except in the last case, where it is the reverse.
 */
function sceneWithEve(eve: EveOnAller): BoardRows {
  const rides = [ride("r1", "aller", "marc", "07:00:00"), ride("r3", "retour", "ana", "17:00:00")];
  const placements = [
    placed("lea", "aller", "r1"),
    placed("tom", "aller", null),
    placed("tom", "retour", "r3"),
    placed("sam", "retour", null),
  ];
  if (eve === "without a car") placements.push(placed("eve", "aller", null));
  if (eve === "a passenger") placements.push(placed("eve", "aller", "r1"));
  if (eve === "a driver") rides.push(ride("r2", "aller", "eve", "08:00:00"));
  if (eve === "not concerned, and without a car on the retour") placements.push(placed("eve", "retour", null));
  return {
    persons: ["marc", "lea", "tom", "ana", "eve", "sam"].map((id) => ({ id, firstName: id })),
    rides,
    placements,
    stops: [],
  };
}

/** The board is built without a device, as the organiser area has none. */
function organiserBoard(rows: BoardRows, access: OrganiserAccess, phones: PhonesById = ORGANISER_PHONES, eventId = EVENT_ID) {
  return withOrganiserPhones(buildBoard(rows, ["aller", "retour"], new Set()), phones, access, eventId);
}

describe("withOrganiserPhones (DO1, O2.1)", () => {
  describe.each<[EveOnAller, string[]]>([
    ["without a car", ["aller.withoutCar"]],
    ["a passenger", []],
    ["a driver", []],
    ["not concerned", []],
    ["not concerned, and without a car on the retour", ["retour.withoutCar"]],
  ])("Eve, on the aller: %s", (eve, places) => {
    it.each<[string, OrganiserAccess]>([
      ["the creation browser's token", RIGHT],
      ["the organiser's session", SESSION],
    ])("OA7.6, %s: her number is set only in the list without a car of the leg where she is", (_, access) => {
      const board = organiserBoard(sceneWithEve(eve), access);
      expect(board).toBeDefined();
      expect(phonePlaces(board ?? [], EVE_PHONE)).toEqual(places);
    });

    it.each<[string, unknown]>([
      ["a copy of a granted access", { ...RIGHT }],
      ["an object of the same shape", { eventId: EVENT_ID, via: "adminToken" }],
      ["true", true],
      ["nothing", undefined],
    ])("an access the rule did not give, %s: nothing at all", (_, forged) => {
      expect(organiserBoard(sceneWithEve(eve), forged as OrganiserAccess)).toBeUndefined();
    });

    it("an access granted for another event: nothing at all", () => {
      expect(organiserBoard(sceneWithEve(eve), RIGHT, ORGANISER_PHONES, "Zz9yXw8v")).toBeUndefined();
    });
  });

  it("OA7.6: the session and the token see the very same thing", () => {
    for (const eve of ["without a car", "a passenger", "a driver"] as const) {
      expect(organiserBoard(sceneWithEve(eve), SESSION)).toStrictEqual(organiserBoard(sceneWithEve(eve), RIGHT));
    }
  });

  it("O3.4: no number of a driver or a placed passenger, digits searched in the serialized output", () => {
    // Marc and Eve drive at the aller, where Léa is placed; Ana drives Tom at the retour.
    const board = organiserBoard(sceneWithEve("a driver"), RIGHT) ?? [];
    expect(sentOrganiserNumbers(board)).toEqual(["tom"]);
    expect(phonePlaces(board, "+33 6 33 33 33 33")).toEqual(["aller.withoutCar"]);
  });

  it("the list without a car keeps the board's order, with a null number for a person who has none", () => {
    const [aller, retour] = organiserBoard(sceneWithEve("without a car"), RIGHT) ?? [];
    expect(aller.withoutCar).toStrictEqual([
      { id: "tom", firstName: "tom", phone: "+33 6 33 33 33 33" },
      { id: "eve", firstName: "eve", phone: EVE_PHONE },
    ]);
    expect(retour.withoutCar).toStrictEqual([{ id: "sam", firstName: "sam", phone: null }]);
  });

  it("O2.3: a person without a car on both legs has her number in both lists", () => {
    const rows = sceneWithEve("without a car");
    const both: BoardRows = { ...rows, placements: [...rows.placements, placed("eve", "retour", null)] };
    const board = organiserBoard(both, RIGHT) ?? [];
    expect(phonePlaces(board, EVE_PHONE)).toEqual(["aller.withoutCar", "retour.withoutCar"]);
  });

  it.each<[string, string | null | undefined, boolean]>([
    ["a number", EVE_PHONE, true],
    ["no entry", undefined, false],
    ["a null number", null, false],
    ["an empty string", "", false],
  ])("O3.4: a driver with %s: whether she has a number, never the number", (_, phone, expected) => {
    const phones = new Map(ORGANISER_PHONES);
    if (phone === undefined) phones.delete("eve");
    else phones.set("eve", phone);
    const board = organiserBoard(sceneWithEve("a driver"), RIGHT, phones) ?? [];
    const r2 = board[0].cars.find((card) => card.id === "r2");
    expect(r2?.driverHasPhone).toBe(expected);
    expect(sentOrganiserNumbers(board)).not.toContain("eve");
  });

  it("O3.4: a car says whether its driver has a number, and carries no number of anyone in it", () => {
    const [aller, retour] = organiserBoard(sceneWithEve("a passenger"), RIGHT) ?? [];
    const r1 = aller.cars[0];
    expect(r1.driverHasPhone).toBe(true);
    expect(r1.driver).toStrictEqual({ id: "marc", firstName: "marc" });
    expect(r1.passengers).toStrictEqual([
      { id: "lea", firstName: "lea" },
      { id: "eve", firstName: "eve" },
    ]);
    expect(sentOrganiserNumbers(aller.cars)).toEqual([]);
    expect(sentOrganiserNumbers(retour.cars)).toEqual([]);
  });

  it("copies only the known fields: a board that already carries numbers gives none of them away", () => {
    // TypeScript accepts a VisibleBoard where a Board is expected: the rule must not trust it.
    const deviceIds = new Set(["lea", "tom"]);
    const visible = withVisiblePhones(buildBoard(sceneWithEve("a passenger"), ["aller", "retour"], deviceIds), ORGANISER_PHONES, deviceIds);
    expect(sentOrganiserNumbers(visible.map((leg) => leg.cars)).sort()).toEqual(["ana", "eve", "lea", "marc", "tom"]);
    const board = withOrganiserPhones(visible, ORGANISER_PHONES, RIGHT, EVENT_ID) ?? [];
    expect(sentOrganiserNumbers(board.map((leg) => leg.cars))).toEqual([]);
    expect(board[0].cars[0]).toStrictEqual({
      id: "r1",
      leg: "aller",
      driver: { id: "marc", firstName: "marc" },
      location: "Gymnase",
      departureTime: "07:00:00",
      note: null,
      position: null,
      seats: 3,
      passengers: [
        { id: "lea", firstName: "lea" },
        { id: "eve", firstName: "eve" },
      ],
      stops: [],
      freeSeats: 1,
      full: false,
      driverHasPhone: true,
    });
    expect(board[0].withoutCar).toStrictEqual([{ id: "tom", firstName: "tom", phone: "+33 6 33 33 33 33" }]);
  });

  it("a car's position, or null, arrives in the organiser's car", () => {
    const rows = sceneWithEve("a driver");
    const located: BoardRows = { ...rows, rides: rows.rides.map((row) => (row.id === "r2" ? { ...row, position: GYMNASE } : row)) };
    const [aller, retour] = organiserBoard(located, RIGHT) ?? [];
    expect(aller.cars.map((card) => [card.id, card.position])).toStrictEqual([
      ["r1", null],
      ["r2", GYMNASE],
    ]);
    expect(retour.cars.map((card) => [card.id, card.position])).toStrictEqual([["r3", null]]);
    expect(JSON.parse(JSON.stringify(aller.cars[0]))).toHaveProperty("position", null);
  });

  it("RV8.3: a car's stops arrive as they are, with their passengers' ids, and no field more", () => {
    const rows = sceneWithEve("a passenger");
    const withStops: BoardRows = {
      ...rows,
      stops: [{ id: "s1", rideId: "r1", location: "Gare", time: "07:20:00", position: GYMNASE }],
      placements: rows.placements.map((row) => (row.personId === "eve" ? { ...row, stopId: "s1" } : row)),
    };
    const board = buildBoard(withStops, ["aller", "retour"], new Set());
    // A stop that carried a number would not go through: the fields are copied one by one.
    const stop = board[0].cars[0].stops[0];
    Object.assign(stop, { phone: EVE_PHONE });

    const [aller, retour] = withOrganiserPhones(board, ORGANISER_PHONES, RIGHT, EVENT_ID) ?? [];

    expect(aller.cars[0].stops).toStrictEqual([
      { id: "s1", location: "Gare", time: "07:20:00", position: GYMNASE, passengerIds: ["eve"] },
    ]);
    expect(retour.cars[0].stops).toStrictEqual([]);
    expect(sentOrganiserNumbers(aller.cars[0].stops)).toEqual([]);
  });

  it("does not take the device's section: only the leg, its cars and its list without a car", () => {
    const board = buildBoard(sceneWithEve("without a car"), ["aller", "retour"], new Set(["tom"]));
    const organiser = withOrganiserPhones(board, ORGANISER_PHONES, RIGHT, EVENT_ID) ?? [];
    expect(organiser.map((leg) => Object.keys(leg).sort())).toEqual([
      ["cars", "leg", "withoutCar"],
      ["cars", "leg", "withoutCar"],
    ]);
  });

  it("PL7.2: does not read the persons not concerned, and sets no number on them", () => {
    const board = buildBoard(sceneWithEve("not concerned"), ["aller", "retour"], new Set(["eve"]));
    expect(board[0].notConcerned.map((person) => person.id)).toContain("eve");
    const organiser = withOrganiserPhones(board, ORGANISER_PHONES, RIGHT, EVENT_ID) ?? [];
    expect(JSON.stringify(organiser)).not.toContain("notConcerned");
    expect(sentOrganiserNumbers(organiser)).not.toContain("eve");
  });

  it("leaves the board it is given as it was", () => {
    const board = buildBoard(sceneWithEve("a passenger"), ["aller", "retour"], new Set());
    const before = structuredClone(board);
    const organiser = withOrganiserPhones(board, ORGANISER_PHONES, RIGHT, EVENT_ID) ?? [];
    organiser[0].cars[0].driver.firstName = "changed";
    organiser[0].cars[0].passengers[0].firstName = "changed";
    organiser[0].withoutCar[0].firstName = "changed";
    expect(board).toStrictEqual(before);
    expect(sentOrganiserNumbers(board)).toEqual([]);
  });
});
