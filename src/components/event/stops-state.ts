import { samePlace } from "@/domain/place";
import { STOPS_MAX, validateStops, type SentStop, type StopLineErrors } from "@/domain/stop";
import { isWallTime } from "@/domain/wall-clock";

/**
 * The lines of « Points de RDV » in the car's form (epic #881, RV1): what the form holds of a
 * Stop, as `stopsOf` reads it on the server. The time is as an `<input type="time">` gives it,
 * empty while not filled. Pure functions; the section, `StopsFields`, draws them.
 */
export type StopLine = SentStop;

/** RV1.2: six Stops at most, the button « Ajouter » gives way to « 6 points au maximum. ». */
export function atMaximum(lines: readonly StopLine[]): boolean {
  return lines.length >= STOPS_MAX;
}

/** RV1.2: a blank line, last, with the creation id the caller drew; none beyond the sixth (the same list). */
export function addStop(lines: StopLine[], id: string): StopLine[] {
  return atMaximum(lines) ? lines : [...lines, { id, location: "", position: null, time: "" }];
}

/**
 * RV1.6: the list without the line. `focus` is the id of the line before it, whose « Retirer »
 * takes the focus, or `null` when there is none: « Ajouter un point de RDV » does.
 */
export function removeStop(lines: StopLine[], id: string): { lines: StopLine[]; focus: string | null } {
  const at = lines.findIndex((line) => line.id === id);
  return { lines: lines.filter((line) => line.id !== id), focus: at > 0 ? lines[at - 1].id : null };
}

/**
 * RV1.5: the lines by time, a stable sort (at the same time, the order of entry), and whether
 * the order changed. A line without a valid time stays where it is: the others are sorted in
 * the places that remain. The same list, when nothing moved.
 */
export function sortByTime(lines: StopLine[]): { lines: StopLine[]; changed: boolean } {
  const slots = lines.flatMap((line, at) => (isWallTime(line.time) ? [at] : []));
  const sorted = slots.map((at) => lines[at]).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const next = [...lines];
  slots.forEach((at, n) => (next[at] = sorted[n]));
  const changed = next.some((line, at) => line !== lines[at]);
  return changed ? { lines: next, changed } : { lines, changed };
}

/**
 * RV1.4: the errors of each line, and the first line in error; `undefined` when all are right.
 * The time of a line is after the departure's, when that one is valid: its own error is said
 * in its own field.
 */
export function lineErrors(lines: readonly StopLine[], departure: string): { errors: StopLineErrors[]; first: number } | undefined {
  const checked = validateStops(lines, isWallTime(departure) ? departure : undefined);
  return checked.ok ? undefined : { errors: checked.errors, first: checked.first };
}

function sameLine(a: StopLine, b: StopLine): boolean {
  return a.id === b.id && a.time === b.time && samePlace({ text: a.location, position: a.position }, { text: b.location, position: b.position });
}

/**
 * What the form sends of its Stops. An offer (`shown` is `undefined`) sends its lines, none
 * when it has none (RV1.7). A change sends the list whole as soon as a line, or their order,
 * differs from what the form showed, and nothing otherwise: the Stops stay as they are.
 */
export function stopsToSend(shown: readonly StopLine[] | undefined, current: StopLine[]): StopLine[] | undefined {
  if (shown === undefined) return current.length > 0 ? current : undefined;
  const same = shown.length === current.length && shown.every((line, at) => sameLine(line, current[at]));
  return same ? undefined : current;
}

/** A Stop the car has, as the page shows it: how many people chose it as their point of boarding. */
export interface KnownStop {
  id: string;
  location: string;
  passengers: number;
}

/**
 * RV6.1: the Stops of the car that people chose and that the form no longer holds, in the car's
 * order. A line kept or changed (RV6.2) is in the form; one added has an id the car does not know.
 */
export function removedWithPassengers(known: readonly KnownStop[], lines: readonly StopLine[]): KnownStop[] {
  return known.filter((stop) => stop.passengers > 0 && !lines.some((line) => line.id === stop.id));
}
