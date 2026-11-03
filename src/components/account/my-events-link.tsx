import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * « Mes événements », above the title of the organiser's screens (OA7.3, OA8.4): a link of 44 px
 * back to the list, on the left. Shown when the browser keeps a session (« une session gardée »), whichever account it belongs to.
 */
export function MyEventsLink() {
  const t = useTranslations("Admin");
  return (
    <Link
      href="/mes-evenements"
      prefetch={false}
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm font-medium underline underline-offset-3 focus-visible:focus-ring"
    >
      <ChevronLeft aria-hidden className="size-4" />
      {t("myEvents")}
    </Link>
  );
}
