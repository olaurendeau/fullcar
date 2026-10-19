import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The amber pill of a leg with persons without a car (#66 C9.3): « 4 sans voiture », in the
 * amber of a banner with seats missing. Under a tab's name, and in the organiser area's
 * tiles (#180). Only the pill: whatever goes around it is its caller's.
 */
export function NoCarPill({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("Board");
  return (
    <span className={cn("rounded-full bg-amber-100 px-2 text-xs leading-[18px] text-amber-950", className)}>
      {t("tabCount", { count })}
    </span>
  );
}
