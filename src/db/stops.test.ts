import { describe, expect, it } from "vitest";
import type { ValidStop } from "@/domain/stop";
import { countStopRides, insertStops, replaceStops, rideStops } from "./stops";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide, seedStop } from "./test-participants";

describe("rideStops", () => {
  it("gives the Stops of a Ride by time, then by rank", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const late = await seedStop(trx, eventId, rideId, { rank: 0, time: "07:50:00", location: "Gare" });
      const tieFirst = await seedStop(trx, eventId, rideId, { rank: 1, time: "07:30:00", location: "Mairie" });
      const tieSecond = await seedStop(trx, eventId, rideId, { rank: 2, time: "07:30:00", location: "Église" });
      const early = await seedStop(trx, eventId, rideId, {
        rank: 3,
        time: "07:20:00",
        location: "Poste",
        position: { lat: 48.1, lng: -1.6 },
      });

      const stops = await rideStops(trx, { id: rideId, eventId, leg: "aller" });

      expect(stops.map((stop) => stop.id)).toEqual([early, tieFirst, tieSecond, late]);
      expect(stops[0]).toEqual({
        id: early,
        location: "Poste",
        time: "07:20:00",
        position: { lat: 48.1, lng: -1.6 },
        rank: 3,
      });
      expect(stops[1]?.position).toBeNull();
    });
  });

  it("gives nothing for a Ride without Stops, or one of another event", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherEvent } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      expect(await rideStops(trx, { id: rideId, eventId, leg: "aller" })).toEqual([]);
      await seedStop(trx, eventId, rideId);
      expect(await rideStops(trx, { id: rideId, eventId: otherEvent, leg: "aller" })).toEqual([]);
      expect(await rideStops(trx, { id: rideId, eventId, leg: "retour" })).toEqual([]);
    });
  });
});

describe("countStopRides", () => {
  it("counts the Rides of the event that have at least one Stop", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const { id: otherEvent } = await seedEvent(trx);
      const withTwo = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const withOne = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const elsewhere = await seedRide(trx, otherEvent, (await seedPerson(trx, otherEvent)).id);
      expect(await countStopRides(trx, eventId)).toBe(0);

      await seedStop(trx, eventId, withTwo);
      await seedStop(trx, eventId, withTwo);
      await seedStop(trx, eventId, withOne);
      await seedStop(trx, otherEvent, elsewhere);

      expect(await countStopRides(trx, eventId)).toBe(2);
      expect(await countStopRides(trx, otherEvent)).toBe(1);
    });
  });
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

function stop(id: string, fields: Partial<ValidStop> = {}): ValidStop {
  return { id, location: "Mairie", position: null, time: "07:30", ...fields };
}

describe("insertStops", () => {
  it("writes the Stops with their rank at their index in the list, and their position", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const position = { lat: 48.1, lng: -1.6 };
      const ref = { id: rideId, eventId, leg: "aller" as const };

      const done = await insertStops(trx, ref, [stop(A, { time: "07:20", location: "Poste", position }), stop(B, { time: "07:40" }), stop(C, { time: "07:40" })]);

      expect(done).toBe(true);
      const stops = await rideStops(trx, ref);
      expect(stops.map((s) => [s.id, s.rank, s.time])).toEqual([
        [A, 0, "07:20:00"],
        [B, 1, "07:40:00"],
        [C, 2, "07:40:00"],
      ]);
      expect(stops[0]).toMatchObject({ location: "Poste", position });
    });
  });

  it("writes nothing for an empty list, and says no when an id is already a Stop", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const otherRide = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const ref = { id: rideId, eventId, leg: "aller" as const };
      expect(await insertStops(trx, ref, [])).toBe(true);
      expect(await rideStops(trx, ref)).toEqual([]);

      await insertStops(trx, { ...ref, id: otherRide }, [stop(A)]);
      expect(await insertStops(trx, ref, [stop(B), stop(A)])).toBe(false);
    });
  });
});

describe("replaceStops", () => {
  it("adds, changes, removes and reorders in one go, the rank constraint being deferred", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const ref = { id: rideId, eventId, leg: "aller" as const };
      await insertStops(trx, ref, [stop(A, { time: "07:20" }), stop(B, { time: "07:30" }), stop(C, { time: "07:40" })]);

      // A is gone, B changes (place, position, time) and now comes after D, new.
      const position = { lat: 48.2, lng: -1.7 };
      const done = await replaceStops(trx, ref, [stop(D, { time: "07:25", location: "Gare" }), stop(C, { time: "07:40" }), stop(B, { time: "07:50", location: "Église", position })]);

      expect(done).toBe(true);
      const stops = await rideStops(trx, ref);
      expect(stops.map((s) => [s.id, s.rank, s.time, s.location])).toEqual([
        [D, 0, "07:25:00", "Gare"],
        [C, 1, "07:40:00", "Mairie"],
        [B, 2, "07:50:00", "Église"],
      ]);
      expect(stops[2]?.position).toEqual(position);
    });
  });

  it("swaps two ranks without a collision, and leaves a Ride with none when the list is empty", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const ref = { id: rideId, eventId, leg: "aller" as const };
      await insertStops(trx, ref, [stop(A, { time: "07:30" }), stop(B, { time: "07:30" })]);

      await replaceStops(trx, ref, [stop(B, { time: "07:30" }), stop(A, { time: "07:30" })]);
      expect((await rideStops(trx, ref)).map((s) => s.id)).toEqual([B, A]);

      await replaceStops(trx, ref, []);
      expect(await rideStops(trx, ref)).toEqual([]);
    });
  });

  it("keeps the passengers of a Stop that changes, and sends those of a Stop removed to the start", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const ref = { id: rideId, eventId, leg: "aller" as const };
      await insertStops(trx, ref, [stop(A), stop(B, { time: "07:40" })]);
      const kept = await seedPerson(trx, eventId);
      const moved = await seedPerson(trx, eventId);
      await seedPlacement(trx, { personId: kept.id, eventId, leg: "aller", rideId, stopId: A });
      await seedPlacement(trx, { personId: moved.id, eventId, leg: "aller", rideId, stopId: B });

      await replaceStops(trx, ref, [stop(A, { time: "07:35", location: "Autre" })]);

      const rows = await trx.selectFrom("placement").select(["person_id", "ride_id", "stop_id"]).where("event_id", "=", eventId).execute();
      const byPerson = Object.fromEntries(rows.map((row) => [row.person_id, row]));
      expect(byPerson[kept.id]).toMatchObject({ ride_id: rideId, stop_id: A });
      expect(byPerson[moved.id]).toMatchObject({ ride_id: rideId, stop_id: null });
    });
  });

  it("says no and writes nothing when an id is a Stop of another Ride", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const rideId = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const otherRide = await seedRide(trx, eventId, (await seedPerson(trx, eventId)).id);
      const ref = { id: rideId, eventId, leg: "aller" as const };
      const other = { ...ref, id: otherRide };
      await insertStops(trx, ref, [stop(A)]);
      await insertStops(trx, other, [stop(B, { location: "Chez l'autre" })]);

      expect(await replaceStops(trx, ref, [stop(C), stop(B, { location: "Volé" })])).toBe(false);

      expect((await rideStops(trx, ref)).map((s) => s.id)).toEqual([A]);
      expect((await rideStops(trx, other)).map((s) => s.location)).toEqual(["Chez l'autre"]);
    });
  });
});
