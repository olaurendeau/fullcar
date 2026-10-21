"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import type { SetPersonLeg } from "@/components/event/cell-sheet";
import { EventView } from "@/components/event/event-view";
import type { Undo } from "@/components/event/bar-state";
import { cellWhy, failureText, nameList, offerWhy, personWhy, undoWhy, whyOf, wordsOf, type NotDone, type Why } from "@/components/event/failure-words";
import { focusCar, focusCell, focusFirstShown, focusLandmark, focusName, focusRetry } from "@/components/event/focus";
import { aboutOf, forget, sendAbout, type FromSheet } from "@/components/event/hidden-page";
import { MessageBar, useMessageBar } from "@/components/event/message-bar";
import type { AddPerson, Registration, UpdatePerson } from "@/components/event/person-form";
import type { RemoveRide } from "@/components/event/remove-ride-dialog";
import type { OfferRide, UpdateRide } from "@/components/event/ride-form";
import { seatsTaken, type TakeSeats } from "@/components/event/seat-sheet";
import type { EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import {
  addPerson as storePerson,
  loadEventState,
  offerRide as storeRideOffer,
  removeRide as storeRideRemoval,
  setPersonLeg as storePersonLeg,
  takeSeats as storeSeats,
  undoSeats as storeUndo,
  updatePerson as storePersonFields,
  updateRide as storeRideChange,
} from "./actions";
import { ensureDeviceToken, readDeviceToken, useDevice } from "./device-token";
import type { EventState } from "./event-state";
import type { PersonOutcome } from "./persons";
import { actionRunner, sendAction, stateOf, stateRead, stateShown, type Sent } from "./run-action";

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
 * the server answers, which carries the numbers this device may see (C10.1). `onAction` is
 * told each time the state an action answered is shown: never for the first read, nor `apply`.
 *
 * Each state shown brings the event's header too (epic #250): its title, place, start and end,
 * the tabs, the legs' dates and `document.title` follow it, and `onState` is told it. Should
 * the retour go while its tab is active, the aller shows; should what had the focus go with
 * the tabs, the event's title takes it, never `<body>`.
 */
export function ParticipantBoard({
  id,
  state: rendered,
  ref,
  onAction,
  onState,
}: {
  id: string;
  state: EventState;
  ref?: Ref<BoardHandle>;
  onAction?: () => void;
  onState?: (event: EventHeader) => void;
}) {
  const words = wordsOf(useTranslations(), useFormatter());
  const [state, setState] = useState(rendered);
  const [tab, setTab] = useState<Leg>("aller");
  // The state last given, and what had the focus when the tabs went or came.
  const latest = useRef(rendered);
  const focused = useRef<Element | null>(null);
  // Every state the page shows goes through here: an action's, a read's, `apply`.
  // What is not a state (the legs alone, from a server not yet deployed) is not shown.
  const [setBoard] = useState(() => (next: EventState) => {
    const shown = stateShown(latest.current, next);
    if (!shown) return;
    latest.current = shown.state;
    if (shown.tabsChange) {
      // The aller's panel mounts anew, in or out of the tabs; without a retour, the aller shows.
      focused.current = document.activeElement;
      setTab("aller");
    }
    setState(shown.state);
  });
  useImperativeHandle(
    ref,
    () => ({ read: () => sendAction(() => loadEventState(id, readDeviceToken(id))), apply: setBoard }),
    [id, setBoard],
  );
  const messages = useMessageBar();

  useLayoutEffect(() => {
    const element = focused.current;
    focused.current = null;
    if (element && !element.isConnected) document.getElementById("event-title")?.focus();
  }, [state]);

  const { event } = state;
  useEffect(() => {
    document.title = event.title;
    onState?.(event);
  }, [event, onState]);

  const retrying = useRef(false);
  // Every action of the page goes through it; nothing else changes on a failure: what was typed stays.
  const [runner] = useState(() => actionRunner({ state: setBoard, ended: messages.ended }));
  // Once the runner has shown the state an action answered, refusal included.
  const runAction: typeof runner = async (...run) => {
    const sent = await runner(...run);
    if (sent?.ok && stateOf(sent.value)) onAction?.();
    return sent;
  };

  // In the sheet while it is open and the one that sent. Otherwise in the bar, once no sheet
  // hides the page: until then, it would be neither seen nor announced. It joins the others
  // there, and only a send that covers it, or « Fermer », takes it away (#167, #208, #216).
  // What was not done, then why (C11.11): no failure of the bar is generic.
  // A failure of « Annuler » carries it again (rule 6).
  function failedIn(sheet: FromSheet, { notDone, why, landmark, undo }: { notDone: NotDone; why: Why; landmark: () => boolean; undo?: Undo }) {
    if (sheet.inSheet()) return;
    const offline = why.kind === "offline" || (why.kind === "retryUndo" && why.problem === "offline");
    const text = failureText(words, notDone, why);
    sheet.whenClosed(() => messages.fail({ text, landmark, offline, about: sheet.about, sent: sheet.seq, undo }), true);
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
      // An answer that is not a state fails the read, as an unknown event does.
      const answered = stateRead(sent);
      if (answered) return answered;
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
  // In the bar, the failure names who drives and each leg offered, then why, `alreadyDriving` included.
  const offerRide: OfferRide = async ({ offer: { driver, otherLeg, ...car }, creationIds, sending, notDone, landmark, ...sheet }) => {
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
    const why = outcome ? offerWhy(outcome.error, notDone.driver) : whyOf(problem);
    failedIn(sheet, { notDone, why, landmark });
    return { kind: "problem", problem };
  };

  // « Annuler » (C5.10, rule 6): the persons placed get their state before on the leg back, if
  // still in the car. Its failure names them and the car, and carries the same « Annuler »; its
  // success, those given back, the focus on the car's title once the page shows it.
  const [undoneIn, setUndoneIn] = useState<{ landmark: () => boolean } | null>(null);
  useEffect(() => {
    if (undoneIn && (document.activeElement === null || document.activeElement === document.body)) focusFirstShown([undoneIn.landmark]);
  }, [undoneIn]);
  function undoOf(key: number, { rideId, leg, persons }: Parameters<TakeSeats>[0], { names, driver }: { names: string[]; driver: string }): Undo {
    const personIds = persons.map(({ personId }) => personId);
    const landmark = focusCar(leg, rideId);
    async function giveBack() {
      const send = { key: "undo", inSheet: () => false, ...sendAbout(aboutOf([`undo:${rideId}`], personIds)) };
      const sent = await runAction(`undo:${key}`, () => storeUndo(id, readDeviceToken(id), rideId, leg, persons), undefined, send.leaves);
      if (sent === undefined) return;
      send.answered();
      const answer = sent.ok ? sent.value : { ok: false as const, error: sent.problem };
      if (!answer.ok) return failedIn(send, { notDone: { kind: "leave", names, driver }, why: undoWhy(answer.error), landmark, undo });
      const { undoneIds } = answer;
      const undone = names.filter((_, index) => undoneIds.includes(personIds[index]));
      const text = words.t("Seat.undone", { names: nameList(words, undone), count: undone.length, driver });
      send.whenClosed(() => {
        // Nobody given back, the bar has nothing to say: it closes.
        messages.succeed(undone.length > 0 ? { text, landmark } : null);
        setUndoneIn({ landmark });
      });
    }
    const undo: Undo = { run: () => void giveBack() };
    return undo;
  }

  // A success waits for the page to show, as a failure does, and replaces the success alone: it
  // never takes a failure away (#216). A refusal or a failure is said in the sheet that sent
  // while it shows it, in the bar otherwise. A success carries its « Annuler ».
  const takeSeats: TakeSeats = async (request, { sending, seats, placed, ...sheet }) => {
    const { rideId, leg, persons } = request;
    const send = () => storeSeats(id, readDeviceToken(id), rideId, leg, persons.map(({ personId }) => personId));
    const sent = await runAction(`takeSeats:${sheet.key}`, send, sending, sheet.leaves);
    if (sent === undefined) return undefined;
    sheet.answered();
    const taken = seatsTaken(sent, seats.names);
    const landmark = focusCar(leg, rideId);
    if (taken.kind === "done") sheet.whenClosed(() => messages.succeed({ text: placed, landmark, undo: undoOf(sheet.seq, request, seats) }));
    else failedIn(sheet, { notDone: { kind: "seats", ...seats }, why: taken.why, landmark });
    return taken;
  };

  // The car's id and leg, and the device's token, in the body; the page takes the state a refusal carries too.
  // Once per car, not per confirmation: removing it is the same whichever sends, and one reopened meanwhile waits.
  const removeRide: RemoveRide = async ({ rideId, leg, sending, removed, notDone }, confirmation) => {
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
      forget([`seats:${rideId}`, `undo:${rideId}`, `ride:${rideId}:edit`]);
      return null;
    }
    // In the bar, the failure names the car and its leg, then why, a refusal included; the confirmation keeps the generic words.
    const why = whyOf(!sent.ok ? sent.problem : "error" in sent.value ? sent.value.error : "failed");
    failedIn(confirmation, { notDone, why, landmark: focusCar(leg, rideId) });
    return sent.ok ? "failed" : sent.problem;
  };

  // Once per sheet, as offerRide: only the fields the form changed, its passengers and who leaves.
  const updateRide: UpdateRide = async ({ rideId, leg, ride, seenPassengerIds, leaving, sending, notDone, ...sheet }) => {
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
    // `passengersChanged` is said in the step while it is open (C8.5). In the bar, the failure
    // names the car and its leg, then why, a refusal included.
    const problem = sent.ok ? "failed" : sent.problem;
    const why = outcome ? whyOf(outcome.error) : whyOf(problem);
    failedIn(sheet, { notDone, why, landmark: focusCar(leg, rideId) });
    if (outcome?.error === "passengersChanged") return { kind: "passengersChanged", passengers: outcome.passengerIds.length };
    return { kind: "problem", problem };
  };

  return (
    <EventView
      {...event}
      board={state.legs}
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
