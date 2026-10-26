import { describe, expect, it } from "vitest";
import { buildBoard, type BoardRows, type PlacementRow, type RideRow } from "./board";
import type { Leg } from "./leg";
import { removalConfirmation } from "./person-removal";

/*
 * The « Tournoi de Rennes » of remove-person v2 (« L'exemple, et ses nombres »), as rows:
 * Claire drives on both legs, Marc drives at the aller, Sophie at the retour.
 */
const PERSONS = ["claire", "hugo", "ines", "lea", "doublon", "marc", "sophie", "tom"] as const;
type Name = (typeof PERSONS)[number];
const FIRST_NAMES: Record<Name, string> = {
  claire: "Claire",
  hugo: "Hugo",
  ines: "Inès",
  lea: "Léa",
  doublon: "Léa",
  marc: "Marc",
  sophie: "Sophie",
  tom: "Tom",
};

function ride(id: string, leg: Leg, driverId: Name, seats: number): RideRow {
  return { id, leg, driverId, location: "Mairie de Cesson", departureTime: "07:15:00", seats, note: null, position: null };
}

let clock = 0;
function placed(personId: Name, leg: Leg, rideId: string | null): PlacementRow {
  return { personId, leg, rideId, placedAt: new Date(Date.UTC(2026, 11, 1, 8, 0, clock++)) };
}

const EXAMPLE: BoardRows = {
  persons: PERSONS.map((id) => ({ id, firstName: FIRST_NAMES[id] })),
  rides: [
    ride("claire-aller", "aller", "claire", 2),
    ride("marc-aller", "aller", "marc", 3),
    ride("claire-retour", "retour", "claire", 2),
    ride("sophie-retour", "retour", "sophie", 3),
  ],
  placements: [
    placed("sophie", "aller", "claire-aller"),
    placed("lea", "aller", "marc-aller"),
    placed("ines", "aller", "marc-aller"),
    placed("hugo", "aller", "marc-aller"),
    placed("doublon", "aller", null),
    placed("tom", "aller", null),
    placed("marc", "retour", "sophie-retour"),
    placed("ines", "retour", null),
    placed("lea", "retour", null),
    placed("doublon", "retour", null),
  ],
};

/** The board as a page shows it: the device of the Martins, or nobody's (the organiser area's). */
const MARTINS = buildBoard(EXAMPLE, ["aller", "retour"], new Set(["marc", "lea", "tom"]));
const NOBODYS = buildBoard(EXAMPLE, ["aller", "retour"], new Set());

describe("removalConfirmation", () => {
  it("RP1.2: Marc drives 3 at the aller and sits with Sophie at the retour: two lines, two cars", () => {
    expect(removalConfirmation(MARTINS, "marc")).toEqual({
      lines: [
        { key: "drives", leg: "aller", passengers: 3 },
        { key: "passenger", leg: "retour", driver: "Sophie" },
      ],
      cars: 2,
    });
  });

  it("RP1.2: Léa sits with Marc at the aller and is without a car at the retour: one line, one car", () => {
    expect(removalConfirmation(MARTINS, "lea")).toEqual({
      lines: [{ key: "passenger", leg: "aller", driver: "Marc" }],
      cars: 1,
    });
  });

  it("RP1.2: Tom is without a car at the aller and not concerned at the retour: no line, no car", () => {
    expect(removalConfirmation(MARTINS, "tom")).toEqual({ lines: [], cars: 0 });
  });

  it("RP4.5: from the organiser area, the duplicate without a car on both legs has no line", () => {
    expect(removalConfirmation(NOBODYS, "doublon")).toEqual({ lines: [], cars: 0 });
  });

  it("RP4.5: from the organiser area, Marc has the same lines as on his device", () => {
    expect(removalConfirmation(NOBODYS, "marc")).toEqual(removalConfirmation(MARTINS, "marc"));
  });

  it("a car without a passenger has its line with no number, and is not a car to tell", () => {
    expect(removalConfirmation(NOBODYS, "claire")).toEqual({
      lines: [
        { key: "drives", leg: "aller", passengers: 1 },
        { key: "drives", leg: "retour", passengers: 0 },
      ],
      cars: 1,
    });
  });

  it("follows the order of the legs, whatever she does on each", () => {
    expect(removalConfirmation(NOBODYS, "sophie")).toEqual({
      lines: [
        { key: "passenger", leg: "aller", driver: "Claire" },
        { key: "drives", leg: "retour", passengers: 1 },
      ],
      cars: 2,
    });
  });

  it("counts on the state shown: a leg the page does not show has no line", () => {
    const allerOnly = buildBoard(EXAMPLE, ["aller"], new Set());
    expect(removalConfirmation(allerOnly, "marc")).toEqual({
      lines: [{ key: "drives", leg: "aller", passengers: 3 }],
      cars: 1,
    });
  });

  it("has nothing for a person the state no longer shows", () => {
    expect(removalConfirmation(NOBODYS, "nobody")).toEqual({ lines: [], cars: 0 });
  });
});
