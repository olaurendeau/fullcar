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
import { useKeepBoardInPlace } from "./keep-board-in-place";
import { keepFolded, readFolded } from "./organiser-fold";
import { alertShown, announcement, panelRead, screenRead, screenReducer } from "./screen-state";

/**
 * The organiser's screen (epic #154): the organiser area, then the event's board, with
 * `children` under it.
 *
 * - The area: the panel once the server has accepted the link's token (C4.9), the "not valid"
 *   message otherwise (C6.5), and a status line while the first check runs (O5.1). Hidden
 *   without JavaScript, where the page says why instead (O5.5).
 * - After « Réessayer », the focus goes to the button of the panel's title, or to the "not
 *   valid" message, before the browser paints, and stays on the button on a new failure (O5.8).
 * - The panel arrives folded or not as the device kept it, read as it is applied, never before
 *   (O8.5); its button alone folds and unfolds it, and keeps that on the device (#204).
 * - « Actualiser » reads the panel and the board together, and applies both or nothing (O1.9).
 *   After an action of the board, which shows its outcome already, the panel alone is read
 *   again, and withdrawn should that fail (O1.10). Only the latest read counts.
 * - Once a panel is applied, the focus on a line or a button it took away goes to its list's
 *   title, or to its section's when the list went too (O5.7); never to `<body>`.
 * - Its frame keeps the board in place on screen as it changes height (O1.11).
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
  const title = useRef<HTMLButtonElement>(null);
  const invalid = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const focused = useRef<{ element: Element; fallbacks: (HTMLElement | null)[] } | null>(null);
  useKeepBoardInPlace(frame);

  const { check } = link;
  useLayoutEffect(() => {
    // A link checked again outlives any read still running.
    latest.current += 1;
    // Read with the panel only, in this continuation: it shows folded from its first frame.
    dispatch({ type: "checked", check, folded: check.state === "valid" && readFolded(id) });
  }, [check, id]);

  useLayoutEffect(() => {
    if (!retried.current || screen.state === "loading" || screen.state === "failed") return;
    retried.current = false;
    (screen.state === "ready" ? title : invalid).current?.focus();
  }, [screen.state]);

  // After the commit that applied a panel: where the focus goes, should its element be gone.
  useLayoutEffect(() => {
    const noted = focused.current;
    focused.current = null;
    if (noted && !noted.element.isConnected) noted.fallbacks.find((each) => each?.isConnected)?.focus();
  }, [screen]);

  /** Notes, before a panel is applied, the focus in the panel: its list's title, its section's, then the panel's. */
  function noteFocus() {
    const element = document.activeElement;
    if (!element || !frame.current?.contains(element)) return;
    const list = element.closest("[data-organiser-list]")?.querySelector("h4");
    const section = element.closest('section[aria-labelledby^="organiser-leg-"]')?.querySelector("h3");
    focused.current = { element, fallbacks: [list ?? null, section ?? null, title.current] };
  }

  // The screen now, not when the action left: one sent during « Chargement » may end after it.
  const current = useRef(screen);
  useLayoutEffect(() => {
    current.current = screen;
  }, [screen]);

  // The board shows the action's outcome already: the panel alone is read again (O1.10).
  async function reread() {
    if (current.current.state !== "ready") return;
    const read = ++latest.current;
    const legs = panelRead(await link.read());
    if (read !== latest.current) return;
    noteFocus();
    dispatch({ type: "reread", legs });
  }

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
    if (outcome) {
      noteFocus();
      handle.apply(outcome.board);
    }
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
        shown={alertShown(screen)}
        onRefresh={refresh}
        expanded={screen.expanded}
        onToggle={(key) => dispatch({ type: "listToggled", key })}
        folded={screen.folded}
        onToggleFolded={() => {
          dispatch({ type: "toggleFolded" });
          keepFolded(id, !screen.folded);
        }}
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
      <div ref={frame} className="flex flex-col">
        {area}
      </div>
      <div className="mx-auto flex w-full max-w-board flex-col gap-6">
        <ParticipantBoard ref={boardRef} id={id} board={board} onAction={reread} {...event} />
        {children}
      </div>
    </>
  );
}
