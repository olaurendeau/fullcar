/**
 * « Vos inscriptions » (epic #66, C2.2, C3.6): the device's persons as a matrix, one row per
 * person and one cell per leg, read from each leg's device section (`LegBoard.device`).
 * Rows carry no number (v4-16): the matrix knows nothing of the device, so that the
 * organiser's view can show it for the whole event.
 */
import type { DeviceState, LegBoard } from "./board";
import type { Leg } from "./leg";

export interface MatrixCell {
  leg: Leg;
  state: DeviceState;
}

export interface MatrixRow {
  id: string;
  firstName: string;
  /** One per leg of the board, in its order. */
  cells: MatrixCell[];
}

/** A copy of the state with its known fields alone: whatever else the board carries stays behind. */
function stateOf(state: DeviceState): DeviceState {
  switch (state.kind) {
    case "driver":
      return { kind: "driver", rideId: state.rideId };
    case "passenger":
      return { kind: "passenger", rideId: state.rideId, driver: { id: state.driver.id, firstName: state.driver.firstName } };
    default:
      return { kind: state.kind };
  }
}

/**
 * A row per person of the device, in the event's order, with a cell per leg of `board`. A
 * person that a leg's section does not list is not concerned there.
 */
export function deviceMatrix(board: readonly Pick<LegBoard, "leg" | "device">[]): MatrixRow[] {
  const persons = new Map<string, string>();
  for (const { device } of board) {
    for (const person of device) if (!persons.has(person.id)) persons.set(person.id, person.firstName);
  }

  return Array.from(persons, ([id, firstName]) => ({
    id,
    firstName,
    cells: board.map(({ leg, device }) => {
      const person = device.find((candidate) => candidate.id === id);
      return { leg, state: person ? stateOf(person.state) : { kind: "notConcerned" } };
    }),
  }));
}

const waits = (row: MatrixRow) => row.cells.some((cell) => cell.state.kind === "withoutCar");

/** `DevicePersons.summary`: the persons, then those without a car on at least one leg. */
export function matrixSummary(rows: readonly MatrixRow[]): { persons: number; withoutCar: number } {
  return { persons: rows.length, withoutCar: rows.filter(waits).length };
}

/** Unfolded when there is something to do: a cell « Sans voiture » (C3.6, v4-3). */
export function startsExpanded(rows: readonly MatrixRow[]): boolean {
  return rows.some(waits);
}

/**
 * What a cell's sheet offers (« Les cellules », #89): « Voir la voiture », and the changes
 * `setPersonLeg` makes on the cell's leg. A driver's car is managed on its card (C8.1).
 * « Trouver une place » comes first for a person without a car with #172.
 */
export type CellAction = "seeCar" | "leaveCar" | "notConcerned" | "lookingForSeat";

export function cellActions(state: DeviceState): CellAction[] {
  switch (state.kind) {
    case "withoutCar":
      return ["notConcerned"];
    case "passenger":
      return ["seeCar", "leaveCar", "notConcerned"];
    case "driver":
      return ["seeCar"];
    case "notConcerned":
      return ["lookingForSeat"];
  }
}

/** What `setPersonLeg` is asked: « Sortir de la voiture » and « Je cherche une place » are both without a car. */
export function declaredBy(action: Exclude<CellAction, "seeCar">): "withoutCar" | "notConcerned" {
  return action === "notConcerned" ? "notConcerned" : "withoutCar";
}
