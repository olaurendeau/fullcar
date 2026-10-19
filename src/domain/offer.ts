/**
 * « Au retour » / « À l'aller » in « Proposer une voiture » (#169, R4 amended, v4-8): what
 * becomes of the person who drives on the other leg. Pure decisions on her state there: the
 * form asks, the server decides (`offerRide`).
 */
import type { BoardPerson, DeviceState } from "./board";

/** The choices, in the form's order: drive there too, stay in her car, without a car, not concerned. */
export type OtherLegChoice = "drive" | "stay" | "withoutCar" | "notConcerned";

export interface OtherLegField {
  choices: OtherLegChoice[];
  /** The choice before any tap: her state there now (v4-8). */
  chosen: OtherLegChoice;
  /** Who drives the car she sits in there, which every choice but `stay` leaves (`RideForm.leavesCar`). */
  leaves: BoardPerson | undefined;
}

/**
 * The field for her state on the other leg, or a new person's, who has none: absent when she
 * drives there already (C4.6). « Je reste dans la voiture de… » only when she sits in one.
 * The view leaves it out too on an event without a retour.
 */
export function otherLegField(state: DeviceState | "new"): OtherLegField | undefined {
  const kind = state === "new" ? "notConcerned" : state.kind;
  if (kind === "driver") return undefined;
  if (state !== "new" && state.kind === "passenger") {
    return { choices: ["drive", "stay", "withoutCar", "notConcerned"], chosen: "stay", leaves: state.driver };
  }
  return { choices: ["drive", "withoutCar", "notConcerned"], chosen: kind === "withoutCar" ? kind : "notConcerned", leaves: undefined };
}

/**
 * What the offer sends for a choice (`otherLeg.kind`): `keep` for the one she is in already,
 * so that nothing she did not choose changes there (C3.5); any other, as it is.
 */
export function otherLegKind(field: OtherLegField, choice: OtherLegChoice): Exclude<OtherLegChoice, "stay"> | "keep" {
  return choice === field.chosen || choice === "stay" ? "keep" : choice;
}
