import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * The page's sheet, opened from the bottom of the screen: its title, its content, then
 * « Fermer », translated, in place of the sheet's own cross. Escape closes it too. Every
 * sheet of the event's page goes through here, so that they all look and close alike.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Where the focus goes once it is closed: Radix's default is the trigger, when it has one. */
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
  children: ReactNode;
}) {
  const t = useTranslations("Actions");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={onCloseAutoFocus}
        className="mx-auto max-w-md gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3.5 p-4">{children}</div>
        <SheetFooter className="pt-0">
          <SheetClose asChild>
            <Button variant="outline" className="h-11 w-full">
              {t("close")}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
