import type { createFormatter, createTranslator, Messages } from "next-intl";
import type { DeviceState } from "@/domain/board";
import type { CellAction } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";

/*
 * What a failure says in the bar (« Ce que dit un échec », docs/design/event-board/README.md,
 * v4.2, C11.11): what was not done, then why and what to do, `Actions.failure`. Pure: the page
 * gives its translator and its list format (`wordsOf`).
 */

/** What was not done, named as the send showed it: the persons and the car of the send, a person's name before the change. */
export type NotDone =
  | { kind: "seats"; names: readonly string[]; driver: string }
  | { kind: "leave"; names: readonly string[]; driver: string }
  | { kind: "choice"; firstName: string; leg: Leg; choice: "notConcerned" | "lookingForSeat" }
  | { kind: "addPerson"; firstName: string }
  | { kind: "editPerson"; firstName: string; fields: "firstName" | "phone" | "both" }
  | { kind: "offerRide"; driver: string; legs: Leg | "both" }
  | { kind: "removeRide"; driver: string; leg: Leg }
  | { kind: "editRide"; driver: string; leg: Leg }
  | { kind: "readDevice" };

/** The reasons said by their key alone. */
type Plain = "offline" | "failed" | "seatTaken" | "rideGone" | "passengersChanged" | "forbidden" | "eventNotFound";

/** Why, and what to do: offline (nothing left), a server error, or the server's refusal. */
export type Why =
  | { kind: Plain }
  | { kind: "retryUndo"; problem: "offline" | "failed" }
  | { kind: "notEnoughSeats"; free: number }
  | { kind: "alreadyInCar"; names: readonly string[] }
  | { kind: "passengerInCar"; names: readonly string[] }
  | { kind: "drives"; firstName: string; leg: Leg }
  | { kind: "alreadyDriving"; driver: string };

/**
 * The reason of a problem or of a refusal that names nobody. `invalid` and `idTaken`, which
 * only a forged request or a collision of ids gives, take the generic one; so does `noRetour`,
 * the retour removed meanwhile, until #265 gives it its own words.
 */
export function whyOf(error: Plain | "invalid" | "idTaken" | "noRetour"): Why {
  return { kind: error === "invalid" || error === "idTaken" || error === "noRetour" ? "failed" : error };
}

/** A cell of « Vos inscriptions » as its sheet showed it at the send: the person, the leg, and her state there. */
export interface Cell {
  firstName: string;
  leg: Leg;
  state: DeviceState;
}

/**
 * What a cell's action did not do (« Ce que dit un échec »): the sheet's title and the button
 * touched, or the car for « Sortir de la voiture », which only a passenger is offered.
 */
export function cellNotDone(action: Exclude<CellAction, "seeCar">, { firstName, leg, state }: Cell): NotDone {
  if (action === "leaveCar" && state.kind === "passenger") return { kind: "leave", names: [firstName], driver: state.driver.firstName };
  return { kind: "choice", firstName, leg, choice: action === "notConcerned" ? "notConcerned" : "lookingForSeat" };
}

/** Why a cell's action was not done: as `whyOf`, and `drives` names who drives, on the cell's leg. */
export function cellWhy(error: Parameters<typeof whyOf>[0] | "drives", { firstName, leg }: Cell): Why {
  return error === "drives" ? { kind: "drives", firstName, leg } : whyOf(error);
}

/** The page's words: a translator from the root of the messages, and a list in its language. */
export interface Words {
  t: ReturnType<typeof createTranslator<Messages>>;
  list: (items: readonly string[]) => string;
}

/** `Words` from next-intl's translator and formatter, a list being a conjunction (« Tom et Léa »). */
export function wordsOf(t: Words["t"], format: ReturnType<typeof createFormatter>): Words {
  return { t, list: (items) => format.list(items, { type: "conjunction" }) };
}

/** « Plusieurs prénoms »: one, two or three by the list; beyond, the first two and « et N autres ». */
export function nameList({ t, list }: Words, names: readonly string[]): string {
  if (names.length <= 3) return list(names);
  return t("Actions.names.andOthers", { first: names[0], second: names[1], others: names.length - 2 });
}

function notDoneText(words: Words, notDone: NotDone): string {
  const { t } = words;
  switch (notDone.kind) {
    case "seats":
    case "leave":
      return t(`Actions.notDone.${notDone.kind}`, { names: nameList(words, notDone.names), count: notDone.names.length, driver: notDone.driver });
    case "choice": {
      const person = t("DevicePersons.sheetTitle", { firstName: notDone.firstName, leg: t(`Event.legs.${notDone.leg}`) });
      const choice = notDone.choice === "notConcerned" ? t(`DevicePersons.notConcerned.${notDone.leg}`) : t("DevicePersons.lookingForSeat");
      return t("Actions.notDone.choice", { person, choice });
    }
    default: {
      const { kind, ...values } = notDone;
      return t(`Actions.notDone.${kind}`, values);
    }
  }
}

function whyText(words: Words, why: Why): string {
  const { t } = words;
  switch (why.kind) {
    case "alreadyInCar":
    case "passengerInCar":
      return t(`Actions.why.${why.kind}`, { names: nameList(words, why.names), count: why.names.length });
    case "notEnoughSeats":
      return t("Actions.why.notEnoughSeats", { free: why.free });
    default: {
      const { kind, ...values } = why;
      return t(`Actions.why.${kind}`, values);
    }
  }
}

/** The failure's line in the bar: « {notDone} {why} ». */
export function failureText(words: Words, notDone: NotDone, why: Why): string {
  return words.t("Actions.failure", { notDone: notDoneText(words, notDone), why: whyText(words, why) });
}
