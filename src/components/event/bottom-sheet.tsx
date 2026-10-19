import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
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
 * The page's sheet, opened from the bottom of the screen: its title, its content, then
 * « Fermer », translated, in place of the sheet's own cross. Escape closes it too. Every
 * sheet of the event's page goes through here, so that they all look and close alike.
 * Given a `trigger`, the button that opens it, Radix gives that button the focus back once
 * it is closed. While its content is mounted, closing included, the page counts as hidden
 * (`whenPageShown`).
 */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  onCloseAutoFocus,
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
  children: ReactNode;
}) {
  const t = useTranslations("Actions");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // Without a description, Radix would warn of a missing one; with it, Radix links it.
        {...(description ? {} : { "aria-describedby": undefined })}
        onCloseAutoFocus={onCloseAutoFocus}
        className="mx-auto max-w-md gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <HidesPage />
        <SheetHeader className="pb-0">
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
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
