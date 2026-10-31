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

  it("#889, RV1.7: no Stop shown or held, nothing is sent", () => {
    expect(rideChange({ ...SHOWN, stops: [] }, { ...SHOWN, stops: [] })).toEqual({ fields: [], ride: {} });
  });

  it("#889: a Stop changed alone is a change, sent whole with the others, the car's fields left out", () => {
    const stop = { id: "00000000-0000-4000-8000-000000000001", location: "Prelles", position: null, time: "08:25" };
    const shown = { ...SHOWN, stops: [stop] };
    const edited = { ...stop, time: "08:30" };
    expect(rideChange(shown, { ...shown, stops: [edited] })).toEqual({ fields: ["stops"], ride: { stops: [edited] } });
  });

  it("#889: a Stop left as it was is not sent", () => {
    const stop = { id: "00000000-0000-4000-8000-000000000001", location: "Prelles", position: null, time: "08:25" };
    const shown = { ...SHOWN, stops: [stop] };
    expect(rideChange(shown, { ...shown, note: "Coffre plein", stops: [{ ...stop }] })).toEqual({ fields: ["note"], ride: { note: "Coffre plein" } });
  });

  it("#208: a field left as it was is not sent, the place included", () => {
    expect(rideChange(SHOWN, { ...SHOWN, time: "09:30", note: "Coffre plein" })).toEqual({
      fields: ["time", "note"],
      ride: { time: "09:30", note: "Coffre plein" },
    });
    expect(rideChange(SHOWN, { ...SHOWN, seats: "4" })).toEqual({ fields: ["seats"], ride: { seats: "4" } });
  });
});
