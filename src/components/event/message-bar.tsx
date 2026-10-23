import { CircleCheck, TriangleAlert, Users, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createAnnouncer, type Announcer } from "./announce";
import * as bar from "./bar-state";
import { focusFirstShown } from "./focus";
import { onWithdraw } from "./hidden-page";

/** The failures an action on the page reports here (`Actions.*`). */
export type BarProblem = "offline" | "failed";

/**
 * The page's bar (`bar-state.ts` decides what it shows): what an action says there, and what
 * withdraws it. Each change is written at once; a failure waits for no sheet to hide the page
 * before it calls `fail` (`Send.whenClosed`), and a send withdraws what it covers (`sendAbout`).
 */
export function useMessageBar() {
  const [state, setState] = useState(bar.emptyBar);
  useEffect(() => onWithdraw((withdrawal) => setState((current) => bar.withdraw(current, withdrawal))), []);
  const [write] = useState(() => {
    // One clock for the information and the actions: one that began before an information leaves it (rule 4).
    let clock = 0;
    return {
      succeed: (message: bar.Message | null) => setState((current) => bar.succeed(current, message)),
      fail: (failure: bar.Failure) => setState((current) => bar.fail(current, failure)),
      inform: (message: bar.Message) => {
        const at = (clock += 1);
        const { text, landmark, leg, saysRetourGone } = message;
        setState((current) => bar.inform(current, { text, landmark, leg, saysRetourGone, at }));
      },
      /** The page shows a state without the retour its last one had (decision 44): once, before what its answer says. */
      retourGone: () => setState(bar.retourGone),
      /** The page shows a state with the retour its last one had not (#271): what said it was gone goes. */
      retourBack: () => setState(bar.retourBack),
      /** An action begins: call what it returns once it ends. */
      begins: () => {
        const began = (clock += 1);
        return () => setState((current) => bar.ended(current, began));
      },
      close: () => setState(bar.close),
      // Rule 6: gone from every line as it is sent, in the same render as the failure its send withdraws.
      undo: (undo: bar.Undo) => {
        setState((current) => bar.undoing(current, undo));
        undo.run();
      },
    };
  });
  return { state, ...write };
}

/** A new text for a region, or none: the region empties (`createAnnouncer`). */
const announce = (announcer: Announcer | undefined, text: string) => (text ? announcer?.say(text) : announcer?.clear());

const iconOf = (line: bar.Line) =>
  line.kind === "success" ? CircleCheck : line.kind === "info" ? Users : line.offline ? WifiOff : TriangleAlert;

/** The bar's height, measured, which the page's `main` keeps as room below it. */
const HEIGHT = "--message-bar-height";

/** The element that last had the focus, whether it is the bar's, and the bar's line it belongs to (NaN: none, as « Fermer »). */
interface Focused {
  element: Element;
  inBar: boolean;
  line: number;
}

/** The element that had the focus is gone, or can no longer take it. */
const fell = (element: Element) => !element.isConnected || element.matches(":disabled");

/** The focus fell on nothing: <body>. */
const onNothing = () => document.activeElement === null || document.activeElement === document.body;

/**
 * The bar's lines, a group that is no live region (« À 360 px », v4.2.3). It stops at 40dvh
 * and scrolls beyond; overflowing, it takes the focus, to scroll from the keyboard, and keeps
 * it while it has it, even once it no longer overflows, lest the focus fall on <body>. A new
 * failure brings it back to its top, where it shows; a new success scrolls into view, at its bottom.
 */
function MessageList({
  lines,
  failing,
  written,
  label,
  onUndo,
}: {
  lines: bar.Line[];
  failing: boolean;
  written?: bar.Line;
  label: string;
  onUndo: (undo: bar.Undo) => void;
}) {
  const t = useTranslations("Seat");
  const ids = useId();
  const list = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setOverflows(element.scrollHeight > element.clientHeight));
    for (const watched of [element, ...element.children]) observer.observe(watched);
    return () => observer.disconnect();
  }, [lines]);
  useEffect(() => {
    if (written?.kind === "failure") list.current?.scrollTo({ top: 0 });
    if (written?.kind === "success") list.current?.querySelector(`[data-bar-line="${written.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [written?.id, written?.kind]);

  return (
    <div
      ref={list}
      role="group"
      aria-label={label}
      tabIndex={overflows || focused ? 0 : undefined}
      onFocus={(event) => event.target === event.currentTarget && setFocused(true)}
      // The window left (Alt+Tab): the list is still the active element, and gets the focus back with the window.
      onBlur={(event) => event.target === event.currentTarget && document.hasFocus() && setFocused(false)}
      className="grid max-h-[40dvh] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] content-start overflow-y-auto rounded-md focus-visible:focus-ring focus-visible:outline-offset-0"
    >
      {lines.map((line) => {
        const Icon = iconOf(line);
        const text = `${ids}-${line.id}`;
        return (
          <Fragment key={line.id}>
            <p
              data-bar-line={line.id}
              className={cn("flex gap-2.5 border-t py-2.5 first:border-t-0 wrap-anywhere", line.undo ? "items-center" : "col-span-2 items-start")}
            >
              <Icon aria-hidden className={cn("size-4 shrink-0", !line.undo && "mt-0.5", failing && line.kind === "failure" && "text-destructive")} />
              <span id={text} className={cn("min-w-0 flex-1", failing && line.kind === "success" && "font-medium")}>
                {line.text}
              </span>
            </p>
            {/* Rule 6: after its line's text, out of the regions; a sibling of the line, which keeps its words alone. */}
            {/* The list clips its ring at 0 px: 2 px on the right, and 4 px above or below once the keyboard scrolls to it (#350). */}
            {line.undo && (
              <div data-bar-line={line.id} className="flex items-center border-t py-1 pr-0.5 pl-2 [p:first-child+&]:border-t-0">
                <Button
                  variant="outline"
                  className={cn(
                    "h-11 scroll-my-1 px-3 focus-visible:outline-offset-0",
                    !failing && "border-primary-foreground/45 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
                  )}
                  aria-describedby={text}
                  onClick={() => line.undo && onUndo(line.undo)}
                >
                  {t("undo")}
                </Button>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The page's one bar of messages, placed in the DOM before the tabs and shown fixed at the
 * bottom (« La barre de messages », v4.2.3): one line per message, the failures first, and one
 * « Fermer » for them all. The list is no live region: two regions, visually hidden and always
 * there, say the last failure written (`alert`) and the last success or information
 * (`status`), each emptied as its line goes, and each new text written 100 ms after the region
 * is emptied (`createAnnouncer`). Nothing expires. Closing from inside the bar gives the focus
 * to the first landmark shown, the most recent line's first (rule 8).
 */
export function MessageBar({ messages }: { messages: ReturnType<typeof useMessageBar> }) {
  const t = useTranslations("Actions");
  const element = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => bar.lines(messages.state), [messages.state]);
  const { alert, status } = bar.regions(messages.state);
  const open = lines.length > 0;
  const failing = lines.some((line) => line.kind === "failure");
  const { next } = messages.state;
  const written = messages.state.lines.find((line) => line.id === next - 1);
  const alertRegion = useRef<HTMLDivElement>(null);
  const statusRegion = useRef<HTMLDivElement>(null);
  // Written in the DOM, never rendered: React would write a text at once, and nothing when it is the same.
  const announcers = useRef<Record<"alert" | "status", Announcer>>(null);
  useEffect(() => {
    const into = (region: HTMLDivElement | null) => (text: string) => void (region && (region.textContent = text));
    const made = { alert: createAnnouncer(into(alertRegion.current)), status: createAnnouncer(into(statusRegion.current)) };
    announcers.current = made;
    return () => {
      made.alert.clear();
      made.status.clear();
    };
  }, []);

  function close(focusInBar: boolean) {
    messages.close();
    // « Fermer » belongs to no line: the landmarks of all, the most recent first.
    if (focusInBar) focusFirstShown([...lines].sort((a, b) => b.id - a.id).map((line) => line.landmark));
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    // A sheet or a confirmation keeps its own Escape.
    if (event.key !== "Escape" || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    close(element.current?.contains(document.activeElement) ?? false);
  });

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open]);

  // A new line in a region: emptied, then its text 100 ms later; its line gone: emptied. The
  // failure first, when both come in the same render (« Lecteurs d’écran », points 3 and 7).
  // Its line cut to its aller part is not writing it (`cutSince`, event-board v4.4.6): what was
  // said is emptied, what waits takes the words.
  const alerted = useRef(messages.state);
  const alerting = useEffectEvent(() => {
    const before = alerted.current;
    alerted.current = messages.state;
    const announcer = announcers.current?.alert;
    if (bar.cutSince(before, messages.state)) announcer?.amend(alert);
    else announce(announcer, alert);
  });
  useEffect(() => alerting(), [messages.state.alert, alert]);
  useEffect(() => announce(announcers.current?.status, status), [messages.state.status, status]);

  // A seat taken, or a car removed, by a send from a sheet closed meanwhile can remove the
  // element that had the focus: the line it writes then gives the focus to its landmark (« Le
  // focus après une action »). A focus put on nothing, as a tap on the page's text does, stays:
  // what had it is forgotten as it leaves, unless it leaves because it is gone or disabled.
  const focused = useRef<Focused | null>(null);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target as Element;
      const inBar = !!element.current?.contains(target);
      focused.current = { element: target, inBar, line: Number(target.closest("[data-bar-line]")?.getAttribute("data-bar-line")) };
    };
    const forget = (event: FocusEvent) => {
      const lost = focused.current;
      // The window left (Alt+Tab) is no focus put on nothing: the element gets it back with the window.
      if (event.relatedTarget || !document.hasFocus() || lost?.element !== event.target) return;
      queueMicrotask(() => void (focused.current === lost && !fell(lost.element) && (focused.current = null)));
    };
    document.addEventListener("focusin", remember);
    document.addEventListener("focusout", forget);
    return () => {
      document.removeEventListener("focusin", remember);
      document.removeEventListener("focusout", forget);
    };
  }, []);
  // Rule 8: an element of the bar that had the focus is gone, or disabled, and the focus fell
  // on <body>, as when an action without words empties the bar while « Fermer » has the focus.
  // Its line's landmark first, then those of the other lines, still there or just gone, the
  // most recent first; else the active tab, or the title.
  const shown = useRef<bar.Line[]>([]);
  const leftBar = useEffectEvent(() => {
    const before = shown.current;
    shown.current = lines;
    const lost = focused.current;
    if (!lost?.inBar || !onNothing() || !fell(lost.element)) return;
    const all = [...new Map([...before, ...lines].map((line) => [line.id, line])).values()];
    const rank = (line: bar.Line) => (line.id === lost.line ? Infinity : line.id);
    focusFirstShown(all.sort((a, b) => rank(b) - rank(a)).map((line) => line.landmark));
  });
  useEffect(() => leftBar(), [messages.state]);

  // After rule 8, which goes first (#311's review): an element of the bar gone in the same render
  // as a line is written, as a late success that replaces the one whose « Annuler » had the focus,
  // gives it to its own line's landmark, not to the written line's.
  const writtenLandmark = useEffectEvent(() => {
    const lost = focused.current?.element;
    if (onNothing() && lost && fell(lost)) written?.landmark();
  });
  useEffect(() => writtenLandmark(), [written?.id]);

  // The page keeps room below it for the bar, as measured (« À 360 px »): `main` reads the height.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => root.style.setProperty(HEIGHT, `${entry.target.getBoundingClientRect().height}px`));
    if (element.current) observer.observe(element.current);
    return () => {
      observer.disconnect();
      root.style.removeProperty(HEIGHT);
    };
  }, []);

  return (
    <div
      ref={element}
      data-message-bar={open ? "open" : undefined}
      // Fixed even when empty: out of the page's flow, it adds no gap above the tabs.
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md",
        open && "flex items-start gap-3 rounded-xl border py-1 pr-1 pl-4 text-sm shadow-lg",
        // With a failure, the whole bar takes the failure's style; a success alone keeps its own (« À 360 px »).
        open && (failing ? "border-destructive bg-background text-foreground" : "border-transparent bg-primary font-medium text-primary-foreground"),
      )}
    >
      {open && <MessageList lines={lines} failing={failing} written={written} label={t("messages")} onUndo={messages.undo} />}
      {open && (
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-11 shrink-0 focus-visible:outline-offset-0", !failing && "hover:bg-primary-foreground/15 hover:text-primary-foreground")}
          aria-label={t("close")}
          onClick={() => close(true)}
        >
          <X aria-hidden />
        </Button>
      )}
      {/* Never `display: none`: a region hidden that way announces nothing when it fills. */}
      <div ref={statusRegion} role="status" className="sr-only" />
      <div ref={alertRegion} role="alert" className="sr-only" />
    </div>
  );
}
