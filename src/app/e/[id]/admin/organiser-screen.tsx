"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { AdminLinkProblem, AdminPanel } from "@/components/event/admin-panel";
import { usePageHidden } from "@/components/event/hidden-page";
import type { WallClock } from "@/domain/wall-clock";
import type { EventState } from "../event-state";
import { ParticipantBoard, type BoardHandle } from "../participant-board";
import { useAdminLinkCheck } from "./admin-link";
import { announcement, screenRead, screenReducer } from "./screen-state";

/**
 * The organiser's screen (epic #154): the organiser area, then the event's board, with
 * `children` under it.
 *
 * - The area: the panel once the server has accepted the link's token (C4.9), the "not valid"
 *   message otherwise (C6.5), and a status line while the first check runs (O5.1). Hidden
 *   without JavaScript, where the page says why instead (O5.5).
 * - After « Réessayer », the focus goes to the panel's title, or to the "not valid" message,
 *   before the browser paints, and stays on the button on a new failure (O5.8).
 * - « Actualiser » reads the panel and the board together, and applies both or nothing (O1.9):
 *   only the latest read counts.
 * - While a sheet hides the page, the live regions keep what they said: their next words wait
 *   for it to show. The legs' dates are the page's: the panel's answer does not carry them.
 */
export function OrganiserScreen({
  id,
  board,
  children,
  ...event
}: {
  id: string;
  title: string;
  location: string;
  allerAt: WallClock;
  retourAt: WallClock | null;
  board: EventState;
  children: ReactNode;
}) {
  const t = useTranslations("Admin");
  const link = useAdminLinkCheck(id);
  const [screen, dispatch] = useReducer(screenReducer, { state: "loading" });
  const boardRef = useRef<BoardHandle>(null);
  const latest = useRef(0);
  const retried = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const invalid = useRef<HTMLDivElement>(null);

  const { check } = link;
  useLayoutEffect(() => {
    // A link checked again outlives any read still running.
    latest.current += 1;
    dispatch({ type: "checked", check });
  }, [check]);

  useLayoutEffect(() => {
    if (!retried.current || screen.state === "loading" || screen.state === "failed") return;
    retried.current = false;
    (screen.state === "ready" ? title : invalid).current?.focus();
  }, [screen.state]);

  const now = announcement(screen);
  const hidden = usePageHidden();
  const [said, setSaid] = useState(now);
  if (!hidden && said !== now) setSaid(now);

  async function refresh() {
    const handle = boardRef.current;
    if (screen.state !== "ready" || screen.refreshing !== null || !handle) return;
    const read = ++latest.current;
    dispatch({ type: "refreshStarted", read });
    const [panel, state] = await Promise.all([link.read(), handle.read()]);
    if (read !== latest.current) return;
    const outcome = screenRead(panel, state);
    // Together, in this continuation: never a panel and a board that disagree.
    if (outcome) handle.apply(outcome.board);
    dispatch({ type: "refreshEnded", read, legs: outcome?.legs });
  }

  let area: ReactNode;
  if (screen.state === "ready") {
    area = (
      <AdminPanel
        {...screen.panel}
        titleRef={title}
        allerAt={event.allerAt}
        retourAt={event.retourAt}
        refreshing={screen.refreshing !== null}
        said={hidden ? said : now}
        onRefresh={refresh}
      />
    );
  } else if (screen.state === "loading") {
    area = (
      <p
        role="status"
        className="mx-auto flex w-full max-w-board items-center gap-2 text-sm text-muted-foreground noscript:hidden"
      >
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("loading")}
      </p>
    );
  } else {
    area = (
      <AdminLinkProblem
        ref={invalid}
        problem={screen.state}
        retrying={screen.state === "failed" && screen.retrying}
        onRetry={() => {
          retried.current = true;
          link.retry();
        }}
      />
    );
  }

  return (
    <>
      {area}
      <div className="mx-auto flex w-full max-w-board flex-col gap-6">
        <ParticipantBoard ref={boardRef} id={id} board={board} {...event} />
        {children}
      </div>
    </>
  );
}
