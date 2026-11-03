import { describe, expect, it } from "vitest";
import { STOPS_MAX, stopsOf, validateStops, type SentStop } from "./stop";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const E = "55555555-5555-4555-8555-555555555555";
const F = "66666666-6666-4666-8666-666666666666";
const G = "77777777-7777-4777-8777-777777777777";

function sent(id: string, fields: Partial<SentStop> = {}): SentStop {
  return { id, location: "Mairie", position: null, time: "07:30", ...fields };
}

function stopsIn(result: ReturnType<typeof validateStops>) {
  if (!result.ok) throw new Error(`expected Stops, got ${JSON.stringify(result.errors)}`);
  return result.stops;
}

describe("stopsOf", () => {
  it("reads the list as sent, the position by positionOf, none being null", () => {
    const read = stopsOf([
      { id: A, location: "Mairie", position: { lat: 48.123456789, lng: -1.6 }, time: "07:30" },
      { id: B, location: "Gare", time: "07:40" },
    ]);
    expect(read).toEqual({
      value: [
        { id: A, location: "Mairie", position: { lat: 48.12346, lng: -1.6 }, time: "07:30" },
        { id: B, location: "Gare", position: null, time: "07:40" },
      ],
    });
  });

  it("reads an empty list, and STOPS_MAX Stops", () => {
    expect(STOPS_MAX).toBe(6);
    expect(stopsOf([])).toEqual({ value: [] });
    const six = [A, B, C, D, E, F].map((id) => ({ id, location: "x", time: "07:30" }));
    expect(stopsOf(six)).toHaveProperty("value");
  });

  it("RV1.4: 7 Stops, or an id twice, are invalid", () => {
    const seven = [A, B, C, D, E, F, G].map((id) => ({ id, location: "x", time: "07:30" }));
    expect(stopsOf(seven)).toEqual({ error: "invalid" });
    const twice = [
      { id: A, location: "x", time: "07:30" },
      { id: A, location: "y", time: "07:40" },
    ];
    expect(stopsOf(twice)).toEqual({ error: "invalid" });
  });

  it.each([
    ["not a list", { 0: { id: A, location: "x", time: "07:30" } }],
    ["a string", "stops"],
    ["null", null],
    ["an item that is not an object", [null]],
    ["an id that is not a creation id", [{ id: "nope", location: "x", time: "07:30" }]],
    ["an id that is not a string", [{ id: 1, location: "x", time: "07:30" }]],
    ["a location that is not text", [{ id: A, location: 3, time: "07:30" }]],
    ["a location with a NUL", [{ id: A, location: "a\u0000b", time: "07:30" }]],
    ["a time that is not text", [{ id: A, location: "x", time: 730 }]],
    ["a position that is not one", [{ id: A, location: "x", position: { lat: 91, lng: 0 }, time: "07:30" }]],
  ])("is invalid for %s", (_name, input) => {
    expect(stopsOf(input)).toEqual({ error: "invalid" });
  });
});

describe("validateStops", () => {
  it("RV1.4: a Stop is checked by its place and its time; the errors come per line, with the first line", () => {
    const result = validateStops(
      [sent(A), sent(B, { location: "  ", time: "25:00" }), sent(C, { location: "x".repeat(121), time: "07:00" })],
      "07:15",
    );
    expect(result).toEqual({
      ok: false,
      errors: [{}, { location: "required", time: "badTime" }, { location: "tooLong", time: "notAfterDeparture" }],
      first: 1,
    });
  });

  it("RV1.4: a place of 120 characters passes, an empty time is a bad time", () => {
    expect(validateStops([sent(A, { location: "x".repeat(120) })], "07:00")).toMatchObject({ ok: true });
    expect(validateStops([sent(A, { time: "" })], "07:00")).toMatchObject({ ok: false, errors: [{ time: "badTime" }] });
  });

  it("RV1.4: the time equal to the departure is refused, 23:59 passes, a minute after passes", () => {
    expect(validateStops([sent(A, { time: "07:30" })], "07:30")).toMatchObject({
      ok: false,
      errors: [{ time: "notAfterDeparture" }],
      first: 0,
    });
    expect(validateStops([sent(A, { time: "07:29" })], "07:30")).toMatchObject({ ok: false });
    expect(validateStops([sent(A, { time: "07:31" })], "07:30")).toMatchObject({ ok: true });
    expect(validateStops([sent(A, { time: "23:59" })], "23:58")).toMatchObject({ ok: true });
    expect(validateStops([sent(A, { time: "23:59" })], "00:00")).toMatchObject({ ok: true });
  });

  it("does not compare to a departure time that is not known", () => {
    expect(validateStops([sent(A, { time: "00:01" })], undefined)).toMatchObject({ ok: true });
    expect(validateStops([sent(A, { time: "xx" })], undefined)).toMatchObject({ ok: false });
  });

  it("RV1.5: sorts by time, and keeps the order of entry at the same time", () => {
    const ids = (stops: SentStop[]) => stopsIn(validateStops(stops, "07:00")).map((stop) => stop.id);
    expect(ids([sent(A, { time: "07:50" }), sent(B, { time: "07:40" }), sent(C, { time: "07:40" }), sent(D, { time: "07:35" })])).toEqual([D, B, C, A]);
    expect(ids([sent(C, { time: "07:40" }), sent(B, { time: "07:40" })])).toEqual([C, B]);
    expect(ids([sent(B, { time: "07:40" }), sent(C, { time: "07:40" })])).toEqual([B, C]);
  });

  it("gives the Stops with the place trimmed and their position, and none for an empty list", () => {
    const position = { lat: 48.1, lng: -1.6 };
    expect(validateStops([sent(A, { location: "  Mairie ", position })], "07:00")).toEqual({
      ok: true,
      stops: [{ id: A, location: "Mairie", position, time: "07:30" }],
    });
    expect(validateStops([], "07:00")).toEqual({ ok: true, stops: [] });
  });
});
