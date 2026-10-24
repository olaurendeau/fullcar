import { samePlace, type Position } from "@/domain/place";
import { RIDE_FIELDS, type RideField } from "@/domain/ride";

/** A car as « Modifier la voiture » holds it: its fields' texts, and its place's position beside. */
export type RideShown = Record<RideField, string> & { position: Position | null };

/** What a change sends: the fields of R4 changed, the place's position with its text. */
export type RideChange = Partial<Record<RideField, string>> & { position?: Position | null };

/**
 * What changed since the form showed (#208): a field left as it was is not sent. The place is
 * one value (« Un lieu, une valeur »): changed when its text or its position is (`samePlace`),
 * it goes `location` and `position` together; « Retirer » alone, or the suggestion of the same
 * text, is a change of it.
 */
export function rideChange(shown: RideShown, current: RideShown): { fields: RideField[]; ride: RideChange } {
  const fields = RIDE_FIELDS.filter((name) =>
    name === "location"
      ? !samePlace({ text: shown.location, position: shown.position }, { text: current.location, position: current.position })
      : current[name] !== shown[name],
  );
  const ride: RideChange = Object.fromEntries(fields.map((name) => [name, current[name]]));
  return { fields, ride: fields.includes("location") ? { ...ride, position: current.position } : ride };
}
