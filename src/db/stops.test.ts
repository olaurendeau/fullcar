import { describe, expect, it } from "vitest";
import { countStopRides, rideStops } from "./stops";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson, seedRide, seedStop } from "./test-participants";

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
