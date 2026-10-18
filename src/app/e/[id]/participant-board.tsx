"use client";

import { useRef, useState } from "react";
import { EventView, type EventViewProps } from "@/components/event/event-view";
import { MessageBar } from "@/components/event/message-bar";
import { loadEventState } from "./actions";
import { useDevice } from "./device-token";
import type { EventState } from "./event-state";
import { actionRunner, sendAction, type ActionProblem } from "./run-action";

/**
 * Where the focus goes when what had it is gone (the bar closed from inside, a section that
 * no longer shows): the active tab, or the event's title without tabs.
 */
function focusLandmark() {
  const target =
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
    document.getElementById("event-title");
  target?.focus();
}

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
      }}
      messageBar={<MessageBar problem={problem} onClose={() => setProblem(null)} refocus={focusLandmark} />}
    />
  );
}
