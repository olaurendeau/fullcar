"use client";

import { useRef, useState } from "react";
import { EventView, type EventViewProps } from "@/components/event/event-view";
import { focusLandmark } from "@/components/event/focus";
import { MessageBar } from "@/components/event/message-bar";
import type { AddPerson } from "@/components/event/person-form";
import { addPerson as storePerson, loadEventState } from "./actions";
import { ensureDeviceToken, useDevice } from "./device-token";
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
}: { id: string; board: EventState } & Omit<EventViewProps, "board" | "device" | "messageBar">) {
  const [board, setBoard] = useState(rendered);
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
  const addPerson: AddPerson = async ({ person, creationId, sending, open }) => {
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
    // In the form while it is open, in the bar once it is closed.
    setProblem(open() ? null : problem);
    return { kind: "problem", problem };
  };

  return (
    <EventView
      {...event}
      board={board}
      device={{
        status: device.status,
        retry: () => {
          retrying.current = true;
          device.retry();
        },
        refocus: focusLandmark,
        addPerson,
      }}
      messageBar={<MessageBar problem={problem} onClose={() => setProblem(null)} refocus={focusLandmark} />}
    />
  );
}
