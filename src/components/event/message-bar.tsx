import { TriangleAlert, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The failures an action on the page reports here (`Actions.*`). */
export type BarProblem = "offline" | "failed";

/**
 * The page's one bar of messages, placed in the DOM before the tabs and shown fixed at the
 * bottom. Its two live regions are always there, empty without a message, and hold the
 * text alone; the icon and « Fermer » are beside them. A failure stays until « Fermer »,
 * Escape or the next action. Closing from inside the bar gives the focus to `refocus`.
 * Success messages, which expire, come with the first action that succeeds (#92).
 */
export function MessageBar({
  problem,
  onClose,
  refocus,
}: {
  problem: BarProblem | null;
  onClose: () => void;
  refocus: () => void;
}) {
  const t = useTranslations("Actions");
  const bar = useRef<HTMLDivElement>(null);
  const open = problem !== null;

  function close(focusInBar: boolean) {
    onClose();
    if (focusInBar) refocus();
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

  const Icon = problem === "offline" ? WifiOff : TriangleAlert;
  return (
    <div
      ref={bar}
      data-message-bar={open ? "open" : undefined}
      // Fixed even when empty: out of the page's flow, it adds no gap above the tabs.
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md",
        open &&
          "flex items-center gap-3 rounded-xl border border-destructive bg-background py-1 pr-1 pl-4 text-sm text-foreground shadow-lg",
      )}
    >
      {open && <Icon aria-hidden className="size-4 shrink-0 text-destructive" />}
      {/* Never `display: none`: a region hidden that way announces nothing when it fills. */}
      <div className="min-w-0 flex-1">
        <div role="status" />
        <div role="alert" className="py-2.5 empty:p-0">
          {problem && t(problem)}
        </div>
      </div>
      {open && (
        <Button variant="ghost" size="icon" className="size-11" aria-label={t("close")} onClick={() => close(true)}>
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
