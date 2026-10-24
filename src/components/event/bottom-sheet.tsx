import { useTranslations } from "next-intl";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
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
import { HidesPage } from "./hidden-page";

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

/**
 * The page's sheet, opened from the bottom of the screen: its title, its content, then
 * « Fermer », translated, in place of the sheet's own cross. Escape closes it too, unless it
 * comes from an open list of suggestions, which it closes alone. Every sheet of the event's
 * page goes through here, so that they all look and close alike. Given a `trigger`, the
 * button that opens it, Radix gives that button the focus back once it is closed. While its
 * content is mounted, closing included, the page counts as hidden (`whenPageShown`).
 */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  onCloseAutoFocus,
  actions,
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
  /** False while a form takes the sheet's place, with its own way back: no « Fermer » then (Escape still closes). */
  closable?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Actions");
  const content = useRef<HTMLDivElement>(null);

  // Radix focuses the sheet when its content mounts. Reopened while it closes, its content is
  // still mounted, and the focus would stay behind it, in the hidden page (#447): the same focus,
  // then. At any other opening, Radix has focused it already, or will once its content mounts.
  useEffect(() => {
    const sheet = content.current;
    if (open && sheet && !sheet.contains(document.activeElement)) focusFirstIn(sheet);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        ref={content}
        side="bottom"
        showCloseButton={false}
        // Without a description, Radix would warn of a missing one; with it, Radix links it.
        {...(description ? {} : { "aria-describedby": undefined })}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={keepOpenForList}
        // Taller than the screen (« Proposer une voiture » with a new driver), it scrolls inside it.
        className="mx-auto max-h-dvh max-w-md gap-0 overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <HidesPage />
        <SheetHeader className="pb-0">
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-3.5 p-4">{children}</div>
        <SheetFooter className="pt-0 empty:hidden">
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
