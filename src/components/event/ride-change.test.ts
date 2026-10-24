import { describe, expect, it } from "vitest";
import { rideChange, type RideShown } from "./ride-change";

// #431: « Modifier la voiture » sends only what changed, its place as one value (« Un lieu, une valeur »).

const AT = { lat: 45.72123, lng: 4.69876 };
const SHOWN: RideShown = { location: "12 rue des Lilas, 69126 Brindas", position: AT, time: "09:15", seats: "3", note: "" };

describe("rideChange", () => {
  it("AL5.2: nothing changed, nothing is sent", () => {
    expect(rideChange(SHOWN, { ...SHOWN })).toEqual({ fields: [], ride: {} });
  });

  it("the same position at 5 decimals is no change", () => {
    expect(rideChange(SHOWN, { ...SHOWN, position: { lat: 45.721234, lng: 4.698762 } })).toEqual({ fields: [], ride: {} });
  });

  it("AL5.2: « Retirer » alone is a change of the place: its text and a null position", () => {
    expect(rideChange(SHOWN, { ...SHOWN, position: null })).toEqual({
      fields: ["location"],
      ride: { location: SHOWN.location, position: null },
    });
  });

  it("AL5.3 case 2: the same text with a position is a change, sent text and position together", () => {
    const shown = { ...SHOWN, location: "Mairie, 69670 Vaugneray", position: null };
    expect(rideChange(shown, { ...shown, position: AT })).toEqual({
      fields: ["location"],
      ride: { location: "Mairie, 69670 Vaugneray", position: AT },
    });
  });

  it("AL3.6: another text goes with its position", () => {
    expect(rideChange(SHOWN, { ...SHOWN, location: "Brindas", position: null })).toEqual({
      fields: ["location"],
      ride: { location: "Brindas", position: null },
    });
  });

  it("#208: a field left as it was is not sent, the place included", () => {
    expect(rideChange(SHOWN, { ...SHOWN, time: "09:30", note: "Coffre plein" })).toEqual({
      fields: ["time", "note"],
      ride: { time: "09:30", note: "Coffre plein" },
    });
    expect(rideChange(SHOWN, { ...SHOWN, seats: "4" })).toEqual({ fields: ["seats"], ride: { seats: "4" } });
  });
});
