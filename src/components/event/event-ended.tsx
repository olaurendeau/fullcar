import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContactFooter } from "@/components/contact/contact-footer";
import { Button } from "@/components/ui/button";
import type { WallClock } from "@/domain/wall-clock";
import { EventTime, FULL } from "./event-dates";

/**
 * « Événement terminé » (organizer-account, OA8.3, #590): the link of an event anonymised at
 * day 30. Its title and its start, for the participants to recognise it; not its place, which
 * may be someone's address, and nobody's first name: none is left. Drawn as « Événement
 * introuvable », without Fullcar's mark (VI4.4).
 */
export function EventEnded({ title, allerAt }: { title: string; allerAt: WallClock }) {
  const t = useTranslations("EventEnded");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-primary">
        <CalendarCheck className="size-6" />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{t("title")}</h1>
        <p className="flex flex-col gap-0.5 [overflow-wrap:anywhere]">
          <strong>{title}</strong>
          <EventTime at={allerAt} format={FULL} />
        </p>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>
      <Button asChild className="mt-6 h-11">
        <Link href="/nouveau">{t("create")}</Link>
      </Button>
      <ContactFooter />
    </main>
  );
}
