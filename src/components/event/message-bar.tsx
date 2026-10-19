import { CircleCheck, TriangleAlert, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The failures an action on the page reports here (`Actions.*`). */
export type BarProblem = "offline" | "failed";

/**
 * A message of the bar (§ 2.4 of the design, #91). `landmark` gives the focus to the stable
 * landmark of the action that produced it, or to the next one when it is gone.
 * - `problem`: offline, or the generic failure;
 * - `refused`: a refusal in words of its own (`Actions.rideGone`…), once the sheet that sent
 *   no longer shows it. Decision: a kind of its own rather than `failed`. — Reason: the page
 *   says why nothing changed, as the sheet would have.
 * - `done`: a success. It stays until the next action, « Fermer » or Escape (v4-7).
 */
export type BarMessage = { kind: "problem"; problem: BarProblem } | { kind: "refused" | "done"; text: string; landmark?: () => void };

/**
 * The page's one bar of messages, placed in the DOM before the tabs and shown fixed at the
 * bottom. Its two live regions are always there, empty without a message, and hold the
 * text alone: a success in `status`, a failure in `alert`; the icon and « Fermer » are beside
 * them. Every message stays until « Fermer », Escape or the next action: none expires.
 * Closing from inside the bar gives the focus to the message's landmark, or to `refocus`.
 * A message that comes when the focus is on nothing, its target gone, gives it to its landmark.
 */
export function MessageBar({
  message,
  onClose,
  refocus,
}: {
  message: BarMessage | null;
  onClose: () => void;
  refocus: () => void;
}) {
  const t = useTranslations("Actions");
  const bar = useRef<HTMLDivElement>(null);
  const open = message !== null;
  const landmark = (message?.kind !== "problem" && message?.landmark) || refocus;

  function close(focusInBar: boolean) {
    onClose();
    if (focusInBar) landmark();
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    // A sheet or a confirmation keeps its own Escape.
    if (event.key !== "Escape" || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    close(bar.current?.contains(document.activeElement) ?? false);
  });

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open]);

  // A seat taken from a sheet closed meanwhile can remove the seat that had the focus.
  useEffect(() => {
    const active = document.activeElement;
    if (message?.kind !== "problem" && (active === null || active === document.body)) message?.landmark?.();
  }, [message]);

  const done = message?.kind === "done";
  const text = message && (message.kind === "problem" ? t(message.problem) : message.text);
  const Icon = done ? CircleCheck : message?.kind === "problem" && message.problem === "offline" ? WifiOff : TriangleAlert;
  return (
    <div
      ref={bar}
      data-message-bar={open ? "open" : undefined}
      // Fixed even when empty: out of the page's flow, it adds no gap above the tabs.
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md",
        open && "flex items-center gap-3 rounded-xl py-1 pr-1 pl-4 text-sm shadow-lg",
        open && (done ? "bg-primary font-medium text-primary-foreground" : "border border-destructive bg-background text-foreground"),
      )}
    >
      {open && <Icon aria-hidden className={cn("size-4 shrink-0", !done && "text-destructive")} />}
      {/* Never `display: none`: a region hidden that way announces nothing when it fills. */}
      <div className="min-w-0 flex-1 wrap-anywhere">
        <div role="status" className="py-2.5 empty:p-0">
          {done && text}
        </div>
        <div role="alert" className="py-2.5 empty:p-0">
          {!done && text}
        </div>
      </div>
      {open && (
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-11", done && "hover:bg-primary-foreground/15 hover:text-primary-foreground")}
          aria-label={t("close")}
          onClick={() => close(true)}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
