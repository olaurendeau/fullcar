"use client";

import { LoaderCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { AdminLinkProblem, AdminPanel } from "@/components/event/admin-panel";
import { OrganiserRefused } from "@/components/event/admin-states";
import { EditEventSheet, LONG_WAIT } from "@/components/event/edit-event-sheet";
import { failureText, wordsOf } from "@/components/event/failure-words";
import { focusLandmark, focusMapHint, focusMapToggle } from "@/components/event/focus";
import { sendAbout, usePageHidden } from "@/components/event/hidden-page";
import { legHeadingId } from "@/components/event/organiser-leg";
import type { LegCounts } from "@/db/legs";
import type { EventFields, EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import type { EventState } from "../event-state";
import { ParticipantBoard, type BoardHandle } from "../participant-board";
import { cn } from "@/lib/utils";
import { useOrganiserCheck } from "./admin-token-store";
import { useKeepBoardInPlace } from "./keep-board-in-place";
import { keepFolded, readFolded } from "./organiser-fold";
import { usePendingPoll } from "./pending-poll";
import {
  alertShown,
  announcement,
  editAnswer,
  editFailure,
  panelRead,
  resendAnswer,
  screenRead,
  screenReducer,
  type EditAnswer,
} from "./screen-state";

/**
 * The organiser's screen (epic #154): the organiser area, then the event's board, with
 * `children` under it.
 *
 * - The area: the panel once the server has accepted this browser's session or admin token
 *   (C4.9, #596), and a status line while the first check runs (O5.1). Refused, the screen of
 *   why, in place of the panel and of the board (admin-states.tsx, #598): « Voir l’événement »
 *   leads to the board. Hidden without JavaScript, where the page says why instead (O5.5).
 * - After « Réessayer », the focus goes to the button of the panel's title, or to the area's
 *   title when refused, before the browser paints, and stays on the button on a new failure (O5.8).
 * - The panel arrives folded or not as the device kept it, read as it is applied, never before
 *   (O8.5); its button alone folds and unfolds it, and keeps that on the device (#204).
 * - « Actualiser » reads the panel and the board together, and applies both or nothing (O1.9).
 *   After an action of the board, which shows its outcome already, the panel alone is read
 *   again, and withdrawn should that fail (O1.10). Only the latest read counts.
 * - Once a panel is applied, the focus on a line or a button it took away goes to its list's
 *   title, or to the button of its section's title when the list went too (O5.8 amended,
 *   decision 60); in a section gone, the retour's, to Aller's button (decision 57); never to
 *   `<body>`.
 * - While the notice « Confirmez votre adresse » says « Envoi du lien… », it alone is read again,
 *   every 2 s, until the email's result is kept, for 30 s at most (OA1.7).
 * - Its frame keeps the board in place on screen as it changes height (O1.11).
 * - While a sheet hides the page, the live regions keep what they said: their next words wait
 *   for it to show. The legs' dates are the page's, from the header of the state the board
 *   shows last (epic #250): the panel's answer does not carry them.
 * - « Modifier l’événement » opens a sheet loaded with the header shown; a change saved shows at
 *   once, the bar says so, and the screen is read again (epic #250, v3.3).
 * - Once the link is checked, an event without a position has, in each leg, the organiser's
 *   sentence and its own « Modifier l’événement » (#485, event-map v15, CA2.1). The screen keeps
 *   where the sheet was opened from: closed, and as the landmark of « Événement modifié. », the
 *   focus goes back there, or to « Carte » of that leg once the event has a position.
 */
export function OrganiserScreen({ id, state, children }: { id: string; state: EventState; children: ReactNode }) {
  const t = useTranslations("Admin");
  const link = useOrganiserCheck(id);
  const [screen, dispatch] = useReducer(screenReducer, { state: "loading" });
  const boardRef = useRef<BoardHandle>(null);
  const latest = useRef(0);
  const retried = useRef(false);
  const title = useRef<HTMLButtonElement>(null);
  const refused = useRef<HTMLHeadingElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  // The state the board shows last: its header, and its cars on each leg for the sheet (M5.1).
  const [shown, setShown] = useState(state);
  const { event } = shown;
  const carsOn = (leg: Leg) => shown.legs.find((each) => each.leg === leg)?.cars.length ?? 0;
  const focused = useRef<{ element: Element; fallbacks: (HTMLElement | null)[] } | null>(null);
  useKeepBoardInPlace(frame);

  // « Envoi du lien… » is read again until the email's result is kept (OA1.7).
  usePendingPoll(screen, link.read, dispatch);

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
    (screen.state === "ready" ? title : refused).current?.focus();
  }, [screen.state]);

  // After the commit that applied a panel: where the focus goes, should its element be gone.
  useLayoutEffect(() => {
    const noted = focused.current;
    focused.current = null;
    if (noted && !noted.element.isConnected) noted.fallbacks.find((each) => each?.isConnected)?.focus();
  }, [screen]);

  /**
   * Notes, before a panel is applied, the focus in the panel: its list's title, the button of its
   * section's title, Aller's button, then the panel's title's.
   */
  function noteFocus() {
    const element = document.activeElement;
    if (!element || !frame.current?.contains(element)) return;
    const list = element.closest("[data-organiser-list]")?.querySelector("h4");
    const section = element.closest('section[aria-labelledby^="organiser-leg-"]')?.querySelector<HTMLElement>("h3 > button");
    const aller = section && document.getElementById(legHeadingId("aller"))?.querySelector<HTMLElement>("button");
    focused.current = { element, fallbacks: [list ?? null, section ?? null, aller ?? null, title.current] };
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

  // « Modifier l’événement » (epic #250): the sheet, and what a change saved does to the screen.
  const tEdit = useTranslations("EditEvent");
  const words = wordsOf(useTranslations(), useFormatter());
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditingState] = useState(false);
  // Read when the answer comes: the sheet that sent, still open, says it; otherwise the bar.
  // Each opening is a form of its own (its `key`), even one reopened while the sheet closes:
  // one opened since did not send.
  const openSheet = useRef<number | null>(null);
  const openings = useRef(0);
  const [opening, setOpening] = useState(0);
  const setEditing = (open: boolean) => {
    if (open) setOpening((openings.current += 1));
    openSheet.current = open ? openings.current : null;
    setEditingState(open);
  };
  // While a change is on its way, « Modifier l’événement » opens nothing, for 10 s at most (M2.11, decision 51).
  const [editSending, setEditSending] = useState(false);
  const editWaits = useRef(0);
  // The sheet opened since a change left, to which its late `ok` gives the values saved (decision 51).
  const lateSaved = useRef<((event: EventHeader) => void) | null>(null);
  const focusEdit = () => {
    editButton.current?.focus();
    return !!editButton.current && document.activeElement === editButton.current;
  };
  // Where the sheet was opened from: the area's button (`null`), or a leg's sentence (#485, CA2.1).
  const editFrom = useRef<Leg | null>(null);
  const openEdit = (from: Leg | null) => {
    if (editSending) return;
    editFrom.current = from;
    setEditing(true);
  };
  /**
   * The place of the sheet opened from `from` (event-map v15, « Mises à jour et focus »): the area's
   * button, or the sentence's of that leg, « Carte » there once the event has a position.
   */
  const focusFrom = (from: Leg | null) => () => (from === null ? focusEdit() : focusMapToggle(from) || focusMapHint(from));

  /**
   * Sends the change. Saved, the board shows the header saved at once, the bar says so once no
   * sheet hides the page, and a read of the screen follows, as one block (O1.9): should it fail,
   * the header stays the answer's, and the panel is withdrawn as after an action (O1.10).
   * Changed on another device, the whole page takes the header stored, then the same read
   * (M6.1, M6.2). Anything but saved, once the sheet is closed, is a failure in the bar: what
   * was not done, then why, its landmark « Modifier l’événement », its subject `event:edit`,
   * which the next change takes away as it leaves (M2.8 to M2.10); a removal's, its own words
   * (M3.7). After 10 s with no answer, the button opens a sheet again; a late `ok` gives that
   * sheet the values saved (decision 51).
   */
  async function edit(fields: EventFields, before: EventHeader, removal?: LegCounts): Promise<EditAnswer> {
    const send = sendAbout(["event:edit"]);
    const from = openSheet.current;
    // The landmark of « Événement modifié. », from where the sheet that sends was opened.
    const savedLandmark = focusFrom(editFrom.current);
    send.leaves();
    const wait = (editWaits.current += 1);
    setEditSending(true);
    const letGo = setTimeout(() => wait === editWaits.current && setEditSending(false), LONG_WAIT);
    const answer = editAnswer(await link.edit(fields, before, removal));
    send.answered();
    clearTimeout(letGo);
    if (wait === editWaits.current) setEditSending(false);
    const handle = boardRef.current;
    if (!handle) return answer;
    const sheetSays = from !== null && openSheet.current === from;
    if (answer.kind === "saved" || answer.kind === "changed") {
      handle.applyEvent(answer.event);
      void readScreen(handle);
    }
    if (answer.kind === "saved") {
      if (!sheetSays) lateSaved.current?.(answer.event);
      send.whenClosed(() => handle.succeed({ text: tEdit("saved"), landmark: savedLandmark }));
    } else if (!sheetSays) {
      const { notDone, why } = editFailure(answer, removal !== undefined);
      const text = failureText(words, notDone, why);
      const failure = { text, landmark: focusEdit, offline: why.kind === "offline", about: send.about, sent: send.seq };
      send.whenClosed(() => handle.fail(failure), true);
    }
    return answer;
  }

  /**
   * « Renvoyer l’e-mail » (OA2.4): the notice says « Envoi du lien… » while the email is on its
   * way, then what the server kept; the bar says `resent`, or why nothing went (`tooMany`,
   * `offline`) once no sheet hides the page, and the focus stays on the button. A failure of
   * Brevo is the notice's alert alone. An event ended meanwhile switches the page to « Événement
   * terminé », as the other actions do. Decision: any other refusal or a server error takes the
   * words of `offline`, and the notice is as it was. — Reason: the design has no other sentence for an
   * email not sent again, and the organiser can only try again. An event no longer awaiting
   * confirmation loses its notice.
   */
  async function resend() {
    const handle = boardRef.current;
    const before = current.current.state === "ready" ? current.current.panel.pending : undefined;
    if (!handle || !before) return;
    const send = sendAbout(["pending:resend"]);
    send.leaves();
    dispatch({ type: "pendingRead", pending: { ...before, send: "sending" } });
    const answer = resendAnswer(await link.resend());
    send.answered();
    const kept = answer.kind === "answered" ? answer.pending : answer.kind === "notPending" ? undefined : before;
    dispatch({ type: "pendingRead", ...(kept && { pending: kept }) });
    // Anonymised meanwhile: the board's read says so, and the page that comes is « Événement terminé ».
    if (answer.kind === "eventEnded") return void readScreen(handle);
    const landmark = () => {
      const button = document.querySelector<HTMLElement>("[data-pending-action=resend]");
      button?.focus();
      return !!button && document.activeElement === button;
    };
    if (answer.kind === "answered" && answer.pending.send === "sent") {
      const email = answer.pending.email;
      send.whenClosed(() => handle.succeed({ text: t("pending.resent", { email }), landmark }));
    } else if (answer.kind === "tooMany" || answer.kind === "notResent") {
      const text = answer.kind === "tooMany" ? t("pending.tooMany") : t("pending.offline");
      const offline = answer.kind === "notResent" && answer.offline;
      send.whenClosed(() => handle.fail({ text, landmark, offline, about: send.about, sent: send.seq }), true);
    }
  }

  async function readScreen(handle: BoardHandle) {
    if (current.current.state !== "ready") return;
    const read = ++latest.current;
    const [panel, board] = await Promise.all([link.read(), handle.read()]);
    if (read !== latest.current) return;
    const outcome = screenRead(panel, board);
    noteFocus();
    if (outcome) handle.apply(outcome.board);
    dispatch({ type: "reread", legs: outcome?.legs });
  }

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
        unfolded={screen.unfolded}
        onToggleLeg={(leg) => dispatch({ type: "legToggled", leg })}
        folded={screen.folded}
        onToggleFolded={() => {
          dispatch({ type: "toggleFolded" });
          keepFolded(id, !screen.folded);
        }}
        editRef={editButton}
        editSending={editSending}
        onEdit={() => openEdit(null)}
        onResend={resend}
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
  } else if (screen.state === "refused") {
    area = <OrganiserRefused id={id} refusal={screen.refusal} headingRef={refused} />;
  } else {
    area = (
      <AdminLinkProblem
        retrying={screen.retrying}
        onRetry={() => {
          retried.current = true;
          link.retry();
        }}
      />
    );
  }

  return (
    <>
      {/* Refused, its screen takes the board's room too, and centres there. */}
      <div ref={frame} className={cn("flex flex-col", screen.state === "refused" && "flex-1")}>
        {area}
      </div>
      {screen.state === "ready" && (
        <EditEventSheet
          open={editing}
          onOpenChange={setEditing}
          event={event}
          cars={{ aller: carsOn("aller"), retour: carsOn("retour") }}
          onEdit={edit}
          // Its place gone (the retour removed under a sentence), the active tab or the title: never `<body>`.
          onClosed={() => focusFrom(editFrom.current)() || focusLandmark()}
          lateSavedRef={lateSaved}
          opening={opening}
        />
      )}
      <div className="mx-auto flex w-full max-w-board flex-col gap-6">
        {screen.state !== "refused" && (
          <ParticipantBoard
            ref={boardRef}
            id={id}
            state={state}
            onAction={reread}
            onState={setShown}
            hint={screen.state === "ready" ? { onEdit: openEdit, sending: editSending } : undefined}
            // The screen's, not `link.check`'s: the check is applied in a layout effect, and the area with it.
            linkChecking={screen.state === "loading"}
          />
        )}
        {children}
      </div>
    </>
  );
}

/**
 * `/e/{id}/admin` of an anonymised event (OA8.4, #598): no board is left, and the HTML says
 * nothing of the event but what the metadata does. The check decides, as on any event: its
 * organiser's session reads what is left, its place included, and « Inscriptions effacées »;
 * anyone else, the screen the rule gives. A failed check has « Réessayer », the focus going to
 * the screen's title once it answers (O5.8). The rule never opens the panel here: should an
 * answer say otherwise, the area's title alone.
 */
export function EndedOrganiserScreen({ id, children }: { id: string; children: ReactNode }) {
  const t = useTranslations("Admin");
  const { check, retry } = useOrganiserCheck(id);
  const heading = useRef<HTMLHeadingElement>(null);
  const retried = useRef(false);

  useLayoutEffect(() => {
    if (!retried.current || check.state === "checking" || check.state === "failed") return;
    retried.current = false;
    heading.current?.focus();
  }, [check.state]);

  let area: ReactNode;
  if (check.state === "checking") {
    area = (
      <p role="status" className="mx-auto flex w-full max-w-board items-center gap-2 text-sm text-muted-foreground noscript:hidden">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("loading")}
      </p>
    );
  } else if (check.state === "failed") {
    area = (
      <AdminLinkProblem
        retrying={check.retrying}
        onRetry={() => {
          retried.current = true;
          retry();
        }}
      />
    );
  } else {
    const refusal = check.state === "refused" ? check.refusal : ({ kind: "invalid" } as const);
    area = <OrganiserRefused id={id} refusal={refusal} headingRef={heading} />;
  }

  return (
    <>
      <div className={cn("flex flex-col", check.state === "refused" && "flex-1")}>{area}</div>
      <div className="mx-auto flex w-full max-w-board flex-col gap-6">{children}</div>
    </>
  );
}
