import { describe, expect, it } from "vitest";
import { buildBoard, type BoardRows } from "./board";
import { deviceMatrix } from "./device-matrix";
import { phonePrefill } from "./phone-prefill";

// The numbers are the test's own, never real ones.
const CLAIRE_PHONE = "06 98 76 54 32";
const TOM_PHONE = "07 11 22 33 44";

const person = (firstName: string, phone: string | null = null) => ({ id: firstName.toLowerCase(), firstName, phone });

describe("phonePrefill (v4.8 rule 4): the number « Ajouter une personne » opens with", () => {
  it("T2.1: the only person of the device who has a number", () => {
    expect(phonePrefill([person("Claire", CLAIRE_PHONE), person("Léa"), person("Tom")])).toEqual({ firstName: "Claire", phone: CLAIRE_PHONE });
  });

  it("T2.2: the last of those who have one, in the order of « Vos inscriptions »", () => {
    expect(phonePrefill([person("Claire", CLAIRE_PHONE), person("Léa"), person("Tom", TOM_PHONE)])).toEqual({ firstName: "Tom", phone: TOM_PHONE });
    expect(phonePrefill([person("Tom", TOM_PHONE), person("Claire", CLAIRE_PHONE), person("Léa")])).toEqual({ firstName: "Claire", phone: CLAIRE_PHONE });
  });

  it("T2.4: nothing when no person of the device has a number, or the device has none", () => {
    expect(phonePrefill([person("Claire"), person("Léa")])).toBeNull();
    expect(phonePrefill([])).toBeNull();
  });

  it("an empty number is no number", () => {
    expect(phonePrefill([person("Claire", CLAIRE_PHONE), person("Léa", "")])).toEqual({ firstName: "Claire", phone: CLAIRE_PHONE });
  });
});

describe("v4.8-9: each leg's device section is in the order of « Vos inscriptions »", () => {
  // Claire drives the aller and is not concerned on the retour; Léa is without a car on the
  // aller only; Tom, registered last, is without a car on both.
  const rows: BoardRows = {
    persons: [
      { id: "marc", firstName: "Marc" },
      { id: "claire", firstName: "Claire" },
      { id: "lea", firstName: "Léa" },
      { id: "tom", firstName: "Tom" },
    ],
    rides: [{ id: "car-of-claire", leg: "aller", driverId: "claire", location: "Gare", departureTime: "08:00:00", seats: 3, note: null, position: null }],
    placements: [
      { personId: "tom", leg: "retour", rideId: null, placedAt: new Date("2026-10-01T08:00:00Z") },
      { personId: "lea", leg: "aller", rideId: null, placedAt: new Date("2026-10-01T09:00:00Z") },
      { personId: "tom", leg: "aller", rideId: null, placedAt: new Date("2026-10-01T10:00:00Z") },
    ],
  };
  const board = buildBoard(rows, ["aller", "retour"], new Set(["claire", "lea", "tom"]));
  const order = deviceMatrix(board).map(({ id }) => id);

  it.each(["aller", "retour"] as const)("on the %s, whatever stands where", (leg) => {
    const section = board.find((each) => each.leg === leg)!;
    expect(section.device.map(({ id }) => id)).toEqual(order);
  });
});
