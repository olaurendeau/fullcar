"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { SetPersonLeg } from "@/components/event/cell-sheet";
import { EventView, type EventViewProps } from "@/components/event/event-view";
import { focusLandmark } from "@/components/event/focus";
import type { FromSheet } from "@/components/event/hidden-page";
import { MessageBar, type BarMessage } from "@/components/event/message-bar";
import type { AddPerson, Registration, UpdatePerson } from "@/components/event/person-form";
import type { RemoveRide } from "@/components/event/remove-ride-dialog";
import type { OfferRide } from "@/components/event/ride-form";
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
  const [board, setBoard] = useState(rendered);
  useImperativeHandle(
    ref,
    () => ({ read: () => sendAction(() => loadEventState(id, readDeviceToken(id))), apply: setBoard }),
    [id],
  );
  const [tab, setTab] = useState<Leg>("aller");
  const [message, setMessage] = useState<BarMessage | null>(null);
  const retrying = useRef(false);
  // Every action of the page goes through it; nothing else changes on a failure: what was typed stays.
  const [runAction] = useState(() => actionRunner({ message: setMessage, state: setBoard }));

  const device = useDevice(
    id,
    async (token) => {
      // The first read is not an action: its failure shows in the section alone.
      const read = () => loadEventState(id, token);
      const sent = retrying.current ? await runAction("retry", read) : await sendAction(read);
      retrying.current = false;
      if (sent?.ok && sent.value) return sent.value;
      throw new Error("The device's persons could not be read.");
    },
    setBoard,
  );

  // What became of a person's form, sent from `sheet`.
  function personFormOutcome(sent: Sent<PersonOutcome> | undefined, sheet: FromSheet): Registration | undefined {
    if (sent === undefined) return undefined;
    sheet.answered();
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) return { kind: "done" };
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    // A refusal has no words of its own: the generic message, and the page shows the state it carries.
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, problem);
    return { kind: "problem", problem };
  }

  // Each action runs once per sheet (`FromSheet.key`): one on its way never drops the action
  // of a sheet opened since, which Next sends once the first has its answer (#167).
  // The token is drawn and stored only once the request is about to leave: offline, nothing is (C1.5, C1.13).
  const addPerson: AddPerson = async ({ person, creationId, sending, ...sheet }) => {
    const sent = await runAction(
      `addPerson:${sheet.key}`,
      () => storePerson(id, ensureDeviceToken(id), { ...person, id: creationId() }),
      sending,
    );
    const outcome = personFormOutcome(sent, sheet);
    if (outcome?.kind === "done") device.registered();
    return outcome;
  };

  const updatePerson: UpdatePerson = async ({ personId, person, sending, ...sheet }) => {
    const sent = await runAction(
      `updatePerson:${sheet.key}`,
      () => storePersonFields(id, readDeviceToken(id), { ...person, personId }),
      sending,
    );
    return personFormOutcome(sent, sheet);
  };

  // In the sheet while it is open and the one that sent. Otherwise in the bar, once no sheet
  // hides the page: until then, it would be neither seen nor announced. Written after what the
  // actions ending meanwhile write there, it is not cleared by them. Every failure waits, each
  // withdrawn alone by a send or answer from any sheet about its subject that carries all its
  // fields; a cell has none, only its subject (#167, #208).
  function failedIn(sheet: FromSheet, problem: ActionProblem) {
    setMessage(null);
    if (!sheet.inSheet()) sheet.whenClosed(() => setMessage({ kind: "problem", problem }));
  }

  // The page takes the state a refusal carries too (C11.6).
  const setPersonLeg: SetPersonLeg = async (change, sheet) => {
    const sent = await runAction(`setPersonLeg:${sheet.key}`, () => storePersonLeg(id, readDeviceToken(id), change));
    if (sent === undefined) return undefined;
    sheet.answered();
    if (sent.ok && sent.value.ok) return null;
    // A refusal has no words of its own (`drives`, `forbidden`…): the generic message.
    const failure = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, failure);
    return failure;
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
    const sent = await runAction(`offerRide:${sheet.key}`, send, sending);
    if (sent === undefined) return undefined;
    sheet.answered();
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) {
      device.registered();
      return { kind: "done" };
    }
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, problem);
    return { kind: "problem", problem };
  };

  // A success waits for the page to show, as a failure does, and goes to the bar, where it does not
  // replace a failure said since this action ended (one that waited too); a refusal or a failure is
  // said in the sheet that sent while it shows it, in the bar otherwise.
  const takeSeats: TakeSeats = async ({ rideId, leg, personIds }, { sending, said, ...sheet }) => {
    const send = () => storeSeats(id, readDeviceToken(id), rideId, leg, personIds);
    const sent = await runAction(`takeSeats:${sheet.key}`, send, sending);
    if (sent === undefined) return undefined;
    sheet.answered();
    const taken = sent.ok ? seatsTaken(sent.value) : ({ kind: "problem", problem: sent.problem } as const);
    setMessage(null);
    const message = said(taken);
    const shown = (current: BarMessage | null) => (message.kind === "done" && current && current.kind !== "done" ? current : message);
    if (taken.kind === "done" || !sheet.inSheet()) sheet.whenClosed(() => setMessage(shown));
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
    const sent = await runAction(`removeRide:${rideId}`, remove, sending);
    if (sent === undefined) return undefined;
    confirmation.answered();
    if (sent.ok && sent.value.ok) return null;
    // A refusal has no words of its own (`forbidden`, `invalid`…): the generic message.
    const failure = sent.ok ? "failed" : sent.problem;
    failedIn(confirmation, failure);
    return failure;
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
        removeRide,
      }}
      messageBar={<MessageBar message={message} onClose={() => setMessage(null)} refocus={focusLandmark} />}
    />
  );
}
