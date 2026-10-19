"use client";

import { useRef, useState } from "react";
import type { SetPersonLeg } from "@/components/event/cell-sheet";
import { EventView, type EventViewProps } from "@/components/event/event-view";
import { focusLandmark } from "@/components/event/focus";
import { messageWaits, type FromSheet } from "@/components/event/hidden-page";
import { MessageBar } from "@/components/event/message-bar";
import type { AddPerson } from "@/components/event/person-form";
import type { OfferRide } from "@/components/event/ride-form";
import type { Leg } from "@/domain/leg";
import { addPerson as storePerson, loadEventState, offerRide as storeRideOffer, setPersonLeg as storePersonLeg } from "./actions";
import { ensureDeviceToken, readDeviceToken, useDevice } from "./device-token";
import type { EventState } from "./event-state";
import { actionRunner, sendAction, type ActionProblem } from "./run-action";

/**
 * The event's board on `/e/{id}` and `/e/{id}/admin` (C11.7), as `admin-arrival.tsx` is for
 * the organiser's panel. It starts from the state the server rendered, with no device and no
 * number, then reads the device's persons with its token (`useDevice`) and takes the state
 * the server answers, which carries the numbers this device may see (C10.1).
 */
export function ParticipantBoard({
  id,
  board: rendered,
  ...event
}: { id: string; board: EventState } & Omit<EventViewProps, "board" | "device" | "messageBar" | "tab" | "onTab">) {
  const [board, setBoard] = useState(rendered);
  const [tab, setTab] = useState<Leg>("aller");
  const [problem, setProblem] = useState<ActionProblem | null>(null);
  const retrying = useRef(false);
  // Every action of the page goes through it; nothing else changes on a failure: what was typed stays.
  const [runAction] = useState(() => actionRunner({ problem: setProblem, state: setBoard }));

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

  // The token is drawn and stored only once the request is about to leave: offline, nothing is (C1.5, C1.13).
  const addPerson: AddPerson = async ({ person, creationId, sending, inSheet, whenClosed }) => {
    const sent = await runAction(
      "addPerson",
      () => storePerson(id, ensureDeviceToken(id), { ...person, id: creationId() }),
      sending,
    );
    if (sent === undefined) return undefined;
    const outcome = sent.ok ? sent.value : undefined;
    if (outcome?.ok) {
      device.registered();
      return { kind: "done" };
    }
    if (outcome && "errors" in outcome) return { kind: "errors", errors: outcome.errors, first: outcome.first };
    // A refusal has no words of its own: the generic message, and the page shows the state it carries.
    const problem = sent.ok ? "failed" : sent.problem;
    failedIn({ inSheet, whenClosed }, problem);
    return { kind: "problem", problem };
  };

  // In the sheet while it is open and the one that sent. Otherwise in the bar, once no sheet
  // hides the page: until then, it would be neither seen nor announced. Written after what the
  // actions ending meanwhile write there, it is not cleared by them; nor replaced, one at a time.
  function failedIn(sheet: FromSheet, problem: ActionProblem) {
    setProblem(null);
    if (!sheet.inSheet() && !messageWaits()) sheet.whenClosed(() => setProblem(problem));
  }

  // The page takes the state a refusal carries too (C11.6).
  const setPersonLeg: SetPersonLeg = async (change, sheet) => {
    const sent = await runAction("setPersonLeg", () => storePersonLeg(id, readDeviceToken(id), change));
    if (sent === undefined) return undefined;
    if (sent.ok && sent.value.ok) return null;
    // A refusal has no words of its own (`drives`, `forbidden`…): the generic message.
    const failure = sent.ok ? "failed" : sent.problem;
    failedIn(sheet, failure);
    return failure;
  };

  // As addPerson, the same way: the device's token is drawn only for a new driver, as the request leaves.
  const offerRide: OfferRide = async ({ offer: { driver, ...ride }, creationIds, sending, ...sheet }) => {
    const send = () => {
      const { rideId, personId } = creationIds();
      const token = driver.kind === "new" ? ensureDeviceToken(id) : readDeviceToken(id);
      return storeRideOffer(id, token, { ...ride, rideId, driver: driver.kind === "new" ? { ...driver, personId } : driver });
    };
    const sent = await runAction("offerRide", send, sending);
    if (sent === undefined) return undefined;
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
        setPersonLeg,
        offerRide,
      }}
      messageBar={<MessageBar problem={problem} onClose={() => setProblem(null)} refocus={focusLandmark} />}
    />
  );
}
