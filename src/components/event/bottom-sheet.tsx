import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { HidesPage } from "./hidden-page";
import { keepPagePlace } from "./page-scroll";
import { MARGIN, sheetFrame, type SheetFrame, type SheetFrameInput } from "./sheet-frame";

/**
 * What Radix's FocusScope does when a sheet's content mounts: the first element the Tab key
 * reaches, links left out, its text selected if it is a field; without one, the sheet itself.
 * Copied from `@radix-ui/react-focus-scope` 1.3.0 (`focusFirst(removeLinks(getTabbableCandidates()),
 * { select: true })`, which it does not export): an upgrade of it checks this again.
 */
function focusFirstIn(sheet: HTMLElement) {
  const before = document.activeElement;
  const candidates = Array.from(sheet.querySelectorAll<HTMLElement>("*")).filter(
    (node) =>
      node.tabIndex >= 0 &&
      node.tagName !== "A" &&
      !node.hidden &&
      !(node as HTMLInputElement).disabled &&
      !(node instanceof HTMLInputElement && node.type === "hidden"),
  );
  for (const candidate of candidates) {
    candidate.focus({ preventScroll: true });
    if (document.activeElement === before) continue;
    if (candidate instanceof HTMLInputElement) candidate.select();
    return;
  }
  sheet.focus({ preventScroll: true });
}

/**
 * Escape from a place field whose list is open closes that list, not the sheet (AL1.5): Radix
 * hears it on the document before the field does. The same rule for every sheet.
 */
function keepOpenForList(event: KeyboardEvent) {
  const from = event.target;
  const listOpen = from instanceof Element && from.getAttribute("role") === "combobox" && from.getAttribute("aria-expanded") === "true";
  if (listOpen) event.preventDefault();
}

/** Where `SheetBar` puts what it is given: the bar's messages, and its buttons above « Fermer ». */
interface BarTargets {
  messages: HTMLElement | null;
  actions: HTMLElement | null;
}

/** None out of a `BottomSheet`'s body. */
const BarOfSheet = createContext<BarTargets | null>(null);

/**
 * A form's message, main button and « Annuler », moved into the bar of the sheet it is in (v4.6,
 * rule 1), by a portal. Out of the `<form>` in the document, its submit button takes the `form`
 * attribute: Enter in a field still sends it. The bar is there from the sheet's second render:
 * its content mounts first, and what is given here shows in it before the browser paints.
 * Out of a `BottomSheet`, it throws: a form would lose « Valider » without a word.
 */
export function SheetBar({ messages, children }: { messages?: ReactNode; children: ReactNode }) {
  const targets = useContext(BarOfSheet);
  if (!targets) throw new Error("SheetBar is rendered out of a BottomSheet: its buttons would show nowhere");
  return (
    <>
      {targets.messages && messages ? createPortal(messages, targets.messages) : null}
      {targets.actions && createPortal(children, targets.actions)}
    </>
  );
}

type VisibleArea = Omit<SheetFrameInput, "fullHeight">;

const sameArea = (one: VisibleArea, other: VisibleArea) =>
  one.innerHeight === other.innerHeight &&
  one.width === other.width &&
  one.viewport?.offsetTop === other.viewport?.offsetTop &&
  one.viewport?.height === other.viewport?.height;

/** What the window shows, read again at each of its changes while the sheet is open (rule 4). */
function useVisibleArea(open: boolean) {
  const [area, setArea] = useState<VisibleArea | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const shown = window.visualViewport;
    const read = () => {
      const next = {
        viewport: shown && { offsetTop: shown.offsetTop, height: shown.height },
        innerHeight: window.innerHeight,
        width: window.innerWidth,
      };
      setArea((current) => (current && sameArea(current, next) ? current : next));
    };
    read();
    shown?.addEventListener("resize", read);
    shown?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    return () => {
      shown?.removeEventListener("resize", read);
      shown?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [open]);
  return area;
}

/** The heights of the header and the bar, measured as they change: what the body scrolls under. */
function useFixedHeights(header: HTMLElement | null, bar: HTMLElement | null) {
  const [heights, setHeights] = useState({ header: 0, bar: 0 });
  useLayoutEffect(() => {
    if (!header || !bar) return;
    const measure = () =>
      setHeights((current) =>
        current.header === header.offsetHeight && current.bar === bar.offsetHeight
          ? current
          : { header: header.offsetHeight, bar: bar.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [header, bar]);
  return heights;
}

/** Where the sheet stands: at the top of the visible area when it fills it, at its bottom otherwise. */
function frameStyle(frame: SheetFrame | null, fixed: { header: number; bar: number }) {
  if (!frame) return undefined;
  // What takes the focus scrolls in between the header and the bar, 8 px from both (rule 5).
  const padding = frame.low
    ? { scrollPaddingTop: MARGIN, scrollPaddingBottom: MARGIN }
    : { scrollPaddingTop: fixed.header + MARGIN, scrollPaddingBottom: fixed.bar + MARGIN };
  const place = frame.fill
    ? { top: frame.top, height: frame.height, bottom: "auto" }
    : { top: "auto", bottom: frame.bottom, maxHeight: frame.height };
  return { ...place, ...padding };
}

/**
 * The page's sheet, opened from the bottom of the screen: its title, its content, then
 * « Fermer », translated, in place of the sheet's own cross. Escape closes it too, unless it
 * comes from an open list of suggestions, which it closes alone. Every sheet of the event's
 * page goes through here, so that they all look and close alike. Given a `trigger`, the
 * button that opens it, Radix gives that button the focus back once it is closed. While its
 * content is mounted, closing included, the page counts as hidden (`whenPageShown`).
 *
 * Its three parts (v4.6, rule 1): the header stays at the top, the bar at the bottom, and the
 * body scrolls between them. The sheet is the one element that scrolls, so that a list of places
 * can still cover the bar (rule 6). It stands in the visible area, above an iPhone's keyboard
 * (`sheet-frame.ts`); on a phone, a `fullHeight` sheet fills it. Closed, the page is where it was.
 */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  onCloseAutoFocus,
  actions,
  messages,
  fullHeight = false,
  closable = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  /** A sentence under the title, which describes the sheet. */
  description?: ReactNode;
  /** Where the focus goes once it is closed: Radix's default is the trigger, when it has one. */
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
  /** At the bottom, above « Fermer »: the sheet's own action and its message. */
  actions?: ReactNode;
  /** At the top of the bar, above its buttons: what answers them. */
  messages?: ReactNode;
  /** A field, or a form's step, in it: on a phone, it fills the visible height (rule 2). */
  fullHeight?: boolean;
  /** False while a form takes the sheet's place, with its own way back: no « Fermer » then (Escape still closes). */
  closable?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Actions");
  const content = useRef<HTMLDivElement>(null);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const [messagesTarget, setMessagesTarget] = useState<HTMLDivElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const targets = useMemo(() => ({ messages: messagesTarget, actions: actionsTarget }), [messagesTarget, actionsTarget]);
  const area = useVisibleArea(open);
  const frame = area && sheetFrame({ ...area, fullHeight });
  const fixed = useFixedHeights(header, bar);
  // Where the page was as the sheet opened, moved by what the page scrolls itself since: Safari
  // may scroll it to show a field (rule 7, v4.6-15), /admin to keep its board in place (O1.11).
  const pageAt = useRef<ReturnType<typeof keepPagePlace> | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    pageAt.current?.release();
    pageAt.current = keepPagePlace();
  }, [open]);
  useEffect(() => {
    const kept = pageAt;
    return () => kept.current?.release();
  }, []);

  // Radix focuses the sheet when its content mounts. Reopened while it closes, its content is
  // still mounted, and the focus would stay behind it, in the hidden page (#447): the same focus,
  // then. At any other opening, Radix has focused it already, or will once its content mounts.
  useEffect(() => {
    const sheet = content.current;
    if (open && sheet && !sheet.contains(document.activeElement)) focusFirstIn(sheet);
  }, [open]);

  // Under 240 px of visible height, they scroll with the body (rule 8).
  const fixedParts = frame?.low ? "" : "sticky";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        ref={content}
        side="bottom"
        showCloseButton={false}
        // Without a description, Radix would warn of a missing one; with it, Radix links it.
        {...(description ? {} : { "aria-describedby": undefined })}
        onCloseAutoFocus={(event) => {
          // The page first, then the focus, which scrolls it if it must.
          const kept = pageAt.current;
          pageAt.current = null;
          kept?.release();
          if (kept && window.scrollY !== kept.place.top) window.scrollTo({ top: kept.place.top, behavior: "instant" });
          onCloseAutoFocus?.(event);
        }}
        onEscapeKeyDown={keepOpenForList}
        // The one element that scrolls; at its end, it does not scroll the page (rule 7).
        className={cn(
          "mx-auto gap-0 overflow-y-auto overscroll-contain",
          frame?.fill ? "max-w-none rounded-none border-t-0" : "max-w-md rounded-t-xl",
          !frame && "max-h-dvh",
        )}
        style={frameStyle(frame, fixed)}
      >
        <HidesPage />
        <SheetHeader ref={setHeader} className={cn("top-0 z-10 border-b bg-popover pb-3", fixedParts)}>
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-3.5 px-4 pt-1 pb-4">
          <BarOfSheet.Provider value={targets}>{children}</BarOfSheet.Provider>
        </div>
        {/* Hidden while nothing is in it. Under a list of places, z-20, which can cover it (rule 6). */}
        <SheetFooter
          ref={setBar}
          className={cn(
            "bottom-0 z-10 hidden border-t bg-popover pt-3 [&:has(>:not(:empty))]:flex",
            fixedParts,
            // The phone's safe area, but not above a keyboard (rule 4).
            frame?.keyboard ? "pb-4" : "pb-[calc(1rem+env(safe-area-inset-bottom))]",
          )}
        >
          <div ref={setMessagesTarget} className="flex flex-col gap-2 empty:hidden">
            {messages}
          </div>
          <div ref={setActionsTarget} className="contents" />
          {actions}
          {closable && (
            <SheetClose asChild>
              <Button variant="outline" className="h-11 w-full">
                {t("close")}
              </Button>
            </SheetClose>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
