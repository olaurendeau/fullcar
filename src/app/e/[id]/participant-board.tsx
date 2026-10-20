"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { SetPersonLeg } from "@/components/event/cell-sheet";
import { EventView, type EventViewProps } from "@/components/event/event-view";
import { cellWhy, failureText, personWhy, whyOf, wordsOf, type NotDone, type Why } from "@/components/event/failure-words";
import { focusCar, focusCell, focusLandmark, focusName, focusRetry } from "@/components/event/focus";
import { forget, sendAbout, type FromSheet } from "@/components/event/hidden-page";
import { MessageBar, useMessageBar } from "@/components/event/message-bar";
import type { AddPerson, Registration, UpdatePerson } from "@/components/event/person-form";
import type { RemoveRide } from "@/components/event/remove-ride-dialog";
import type { OfferRide, UpdateRide } from "@/components/event/ride-form";
import { seatsTaken, type TakeSeats } from "@/components/event/seat-sheet";
import type { Leg } from "@/domain/leg";
import {
  addPerson as storePerson,
  loadEventState,
  offerRide as storeRideOffer,
  removeRide as storeRideRemoval,
  setPersonLeg as storePersonLeg,
  takeSeats as storeSeats,
  updatePerson as storePersonFields,
  updateRide as storeRideChange,
} from "./actions";
import { ensureDeviceToken, readDeviceToken, useDevice } from "./device-token";
import type { EventState } from "./event-state";
import type { PersonOutcome } from "./persons";
import { actionRunner, sendAction, type ActionProblem, type Sent } from "./run-action";

/**
 * What the organiser's screen asks of the board (#182): `read()` reads the state this device
 * sees and applies nothing, `apply(state)` shows it. The personal token stays in this file.
 */
export interface BoardHandle {
  read(): Promise<Sent<EventState | undefined>>;
  apply(state: EventState): void;
}

/** No landmark of its own yet (« Proposer »): rule 8 goes on to the other lines, then to the active tab. */
const noLandmark = () => false;

/**
 * The event's board on `/e/{id}` and `/e/{id}/admin` (C11.7), under `organiser-screen.tsx`
 * there. It starts from the state the server rendered, with no device and no
 * number, then reads the device's persons with its token (`useDevice`) and takes the state
 * the server answers, which carries the numbers this device may see (C10.1).
 */
export function ParticipantBoard({
  id,
  board: rendered,
  ref,
  ...event
}: { id: string; board: EventState; ref?: Ref<BoardHandle> } & Omit<
  EventViewProps,
  "board" | "device" | "messageBar" | "tab" | "onTab"
>) {
  const words = wordsOf(useTranslations(), useFormatter());
  const [board, setBoard] = useState(rendered);
  useImperativeHandle(
    ref,
    () => ({ read: () => sendAction(() => loadEventState(id, readDeviceToken(id))), apply: setBoard }),
    [id],
  );
  const [tab, setTab] = useState<Leg>("aller");
  const messages = useMessageBar();
  const retrying = useRef(false);
  // Every action of the page goes through it; nothing else changes on a failure: what was typed stays.
  const [runAction] = useState(() => actionRunner({ state: setBoard, ended: messages.ended }));

  /** A problem with no words of its own yet: only its reason, offline or not (#87). */
  const failure = (problem: ActionProblem, landmark: () => boolean) => ({ why: whyOf(problem), landmark });

  // In the sheet while it is open and the one that sent. Otherwise in the bar, once no sheet
  // hides the page: until then, it would be neither seen nor announced. It joins the others
  // there, and only a send that covers it, or « Fermer », takes it away (#167, #208, #216).
  // What was not done, then why (C11.11); without `notDone`, the generic words, until #226
  // names theirs.
  function failedIn(sheet: FromSheet, { notDone, why, landmark }: { notDone?: NotDone; why: Why; landmark: () => boolean }) {
    if (sheet.inSheet()) return;
    const offline = why.kind === "offline" || (why.kind === "retryUndo" && why.problem === "offline");
    const text = notDone ? failureText(words, notDone, why) : words.t(offline ? "Actions.offline" : "Actions.failed");
    sheet.whenClosed(() => messages.fail({ text, landmark, offline, about: sheet.about, sent: sheet.seq }), true);
  }

  const device = useDevice(
    id,
    async (token) => {
      // The first read is not an action: its failure shows in the section alone. « Réessayer »
      // is one, about the read of « Vos inscriptions »: the next one withdraws its failure.
      const read = () => loadEventState(id, token);
      const retry = retrying.current && { key: "retry", inSheet: () => false, ...sendAbout(["device:read"]) };
      retrying.current = false;
      const sent = retry ? await runAction("retry", read, undefined, retry.leaves) : await sendAction(read);
      if (retry && sent) {
        retry.answered();
        if (sent.ok) messages.succeed(null);
        else failedIn(retry, { notDone: { kind: "readDevice" }, why: whyOf(sent.problem), landmark: focusRetry });
      }
      if (sent?.ok && sent.value) return sent.value;
      throw new Error("The device's persons could not be read.");
    },
    setBoard,
  );

  // What became of a person's form, sent from `sheet`. In the bar, the failure names who, and
  // the fields sent for a change, then why; the form keeps the generic words.
  function personFormOutcome(
    sent: Sent<PersonOutcome> | undefined,
    sheet: FromSheet & { notDone: NotDone },
    landmark: () => boolean,
  ): Registration | undefined {
    if (sent === undefined) return undefined;
    sheet.answered();
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) {
      messages.succeed(null);
      return { kind: "done" };
    }
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    // The page shows the state a refusal carries.
    const problem = sent.ok ? "failed" : sent.problem;
    const why = outcome ? personWhy(outcome.error) : whyOf(problem);
    failedIn(sheet, { notDone: sheet.notDone, why, landmark });
    return { kind: "problem", problem };
  }

  // Each action runs once per sheet (`FromSheet.key`): one on its way never drops the action
  // of a sheet opened since, which Next sends once the first has its answer (#167).
  // The token is drawn and stored only once the request is about to leave: offline, nothing is (C1.5, C1.13).
  const addPerson: AddPerson = async ({ person, creationId, sending, landmark, ...sheet }) => {
    const sent = await runAction(
      `addPerson:${sheet.key}`,
      () => storePerson(id, ensureDeviceToken(id), { ...person, id: creationId() }),
      sending,
      sheet.leaves,
    );
    const outcome = personFormOutcome(sent, sheet, landmark);
    if (outcome?.kind === "done") device.registered();
    return outcome;
  };

  const updatePerson: UpdatePerson = async ({ personId, person, sending, ...sheet }) => {
    const sent = await runAction(
      `updatePerson:${sheet.key}`,
      () => storePersonFields(id, readDeviceToken(id), { ...person, personId }),
      sending,
      sheet.leaves,
    );
    return personFormOutcome(sent, sheet, () => focusName(personId));
  };

  // The page takes the state a refusal carries too (C11.6). In the bar, the failure names the
  // cell and the button touched, and says the refusal (`drives`, `forbidden`…); the sheet keeps the generic words.
  const setPersonLeg: SetPersonLeg = async (change, { cell, notDone, ...sheet }) => {
    const sent = await runAction(`setPersonLeg:${sheet.key}`, () => storePersonLeg(id, readDeviceToken(id), change), undefined, sheet.leaves);
    if (sent === undefined) return undefined;
    sheet.answered();
    if (sent.ok && sent.value.ok) {
      messages.succeed(null);
      return null;
    }
    const error = !sent.ok ? sent.problem : "error" in sent.value ? sent.value.error : "failed";
    const landmark = () => focusCell(change.personId, change.leg);
    failedIn(sheet, { notDone, why: cellWhy(error, cell), landmark });
    return sent.ok ? "failed" : sent.problem;
  };

  // As addPerson, the same way: the device's token is drawn only for a new driver, as the request leaves.
  const offerRide: OfferRide = async ({ offer: { driver, otherLeg, ...car }, creationIds, sending, ...sheet }) => {
    const send = () => {
      const { rideId, personId, otherRideId } = creationIds();
      // The car on the other leg has its own creation id (C4.10).
      const ride = { ...car, otherLeg: otherLeg?.kind === "drive" ? { ...otherLeg, rideId: otherRideId } : otherLeg };
      const token = driver.kind === "new" ? ensureDeviceToken(id) : readDeviceToken(id);
      return storeRideOffer(id, token, { ...ride, rideId, driver: driver.kind === "new" ? { ...driver, personId } : driver });
    };
    const sent = await runAction(`offerRide:${sheet.key}`, send, sending, sheet.leaves);
    if (sent === undefined) return undefined;
    sheet.answered();
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) {
      messages.succeed(null);
      device.registered();
      return { kind: "done" };
    }
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, failure(problem, noLandmark));
    return { kind: "problem", problem };
  };

  // A success waits for the page to show, as a failure does, and replaces the success alone: it
  // never takes a failure away (#216). A refusal or a failure is said in the sheet that sent
  // while it shows it, in the bar otherwise.
  const takeSeats: TakeSeats = async ({ rideId, leg, personIds }, { sending, seats, placed, ...sheet }) => {
    const send = () => storeSeats(id, readDeviceToken(id), rideId, leg, personIds);
    const sent = await runAction(`takeSeats:${sheet.key}`, send, sending, sheet.leaves);
    if (sent === undefined) return undefined;
    sheet.answered();
    const taken = seatsTaken(sent, seats.names);
    const landmark = focusCar(leg, rideId);
    if (taken.kind === "done") sheet.whenClosed(() => messages.succeed({ text: placed, landmark }));
    else failedIn(sheet, { notDone: { kind: "seats", ...seats }, why: taken.why, landmark });
    return taken;
  };

  // The car's id and leg, and the device's token, in the body; the page takes the state a refusal carries too.
  // Once per car, not per confirmation: removing it is the same whichever sends, and one reopened meanwhile waits.
  const removeRide: RemoveRide = async ({ rideId, leg, sending, removed }, confirmation) => {
    const remove = async () => {
      const answer = await storeRideRemoval(id, readDeviceToken(id), rideId, leg);
      // Known before the page takes the state without the car, whenever React renders it.
      if (answer.ok) removed();
      return answer;
    };
    const sent = await runAction(`removeRide:${rideId}`, remove, sending, confirmation.leaves);
    if (sent === undefined) return undefined;
    confirmation.answered();
    if (sent.ok && sent.value.ok) {
      messages.succeed(null);
      // The car is gone: what was sent about its seats or its change, nothing says any more (#213, #218).
      forget([`seats:${rideId}`, `ride:${rideId}:edit`]);
      return null;
    }
    // A refusal has no words of its own (`forbidden`, `invalid`…): the generic message.
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn(confirmation, failure(problem, focusCar(leg, rideId)));
    return problem;
  };

  // Once per sheet, as offerRide: only the fields the form changed, its passengers and who leaves.
  const updateRide: UpdateRide = async ({ rideId, leg, ride, seenPassengerIds, leaving, sending, ...sheet }) => {
    const change = { ...ride, seenPassengerIds, leaving };
    const sent = await runAction(
      `updateRide:${sheet.key}`,
      () => storeRideChange(id, readDeviceToken(id), rideId, leg, change),
      sending,
      sheet.leaves,
    );
    if (sent === undefined) return undefined;
    sheet.answered();
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) {
      messages.succeed(null);
      return { kind: "done" };
    }
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    // Said in the step while it is open (C8.5); any other refusal has no words of its own.
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, failure(problem, focusCar(leg, rideId)));
    if (outcome?.error === "passengersChanged") return { kind: "passengersChanged", passengers: outcome.passengerIds.length };
    return { kind: "problem", problem };
  };

  return (
    <EventView
      {...event}
      board={board}
      tab={tab}
      onTab={setTab}
      device={{
        status: device.status,
        retry: () => {
          retrying.current = true;
          device.retry();
        },
        refocus: focusLandmark,
        addPerson,
        updatePerson,
        setPersonLeg,
        offerRide,
        takeSeats,
        updateRide,
        removeRide,
      }}
      messageBar={<MessageBar messages={messages} />}
    />
  );
}
