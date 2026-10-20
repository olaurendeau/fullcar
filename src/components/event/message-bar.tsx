import { CircleCheck, TriangleAlert, Users, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const [write] = useState(() => ({
    succeed: (message: bar.Message | null) => setState((current) => bar.succeed(current, message)),
    fail: (failure: bar.Failure) => setState((current) => bar.fail(current, failure)),
    ended: () => setState(bar.ended),
    close: () => setState(bar.close),
  }));
  return { state, ...write };
}

const iconOf = (line: bar.Line) =>
  line.kind === "success" ? CircleCheck : line.kind === "info" ? Users : line.offline ? WifiOff : TriangleAlert;

/**
 * The page's one bar of messages, placed in the DOM before the tabs and shown fixed at the
 * bottom (« La barre de messages », v4.2.3): one line per message, the failures first, and one
 * « Fermer » for them all. The list is no live region: two regions, visually hidden and always
 * there, say the last failure written (`alert`) and the last success or information
 * (`status`), each emptied as its line goes. Nothing expires. Closing from inside the bar
 * gives the focus to the first landmark shown, the most recent line's first (rule 8).
 */
export function MessageBar({ messages }: { messages: ReturnType<typeof useMessageBar> }) {
  const t = useTranslations("Actions");
  const element = useRef<HTMLDivElement>(null);
  const lines = bar.lines(messages.state);
  const { alert, status } = bar.regions(messages.state);
  const open = lines.length > 0;
  const failing = lines.some((line) => line.kind === "failure");
  const newest = messages.state.lines.at(-1);

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

  // A seat taken from a sheet closed meanwhile can remove the seat that had the focus: a line
  // written while the focus is on nothing gives it to its landmark.
  const newestLandmark = useEffectEvent(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) newest?.landmark();
  });
  useEffect(() => newestLandmark(), [newest?.id]);

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
      {open && (
        <div role="group" aria-label={t("messages")} className="min-w-0 flex-1">
          {lines.map((line) => {
            const Icon = iconOf(line);
            return (
              <p key={line.id} className="flex items-start gap-2.5 border-t py-2.5 first:border-t-0 wrap-anywhere">
                <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", failing && line.kind === "failure" && "text-destructive")} />
                <span className={cn("min-w-0 flex-1", failing && line.kind === "success" && "font-medium")}>{line.text}</span>
              </p>
            );
          })}
        </div>
      )}
      {open && (
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-11 shrink-0", !failing && "hover:bg-primary-foreground/15 hover:text-primary-foreground")}
          aria-label={t("close")}
          onClick={() => close(true)}
        >
          <X aria-hidden />
        </Button>
      )}
      {/* Never `display: none`: a region hidden that way announces nothing when it fills. */}
      <div role="status" className="sr-only">
        {status}
      </div>
      <div role="alert" className="sr-only">
        {alert}
      </div>
    </div>
  );
}
