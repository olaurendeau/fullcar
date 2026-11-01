"use client";

import { ChevronRight, Clock, Eraser, MapPin } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { EventTime, FULL } from "@/components/event/event-dates";
import type { ErasedEvent, PastEvent, UpcomingEvent } from "@/domain/my-events";
import { wallClockAsUtc, type WallDate } from "@/domain/wall-clock";
import { useFormatDate } from "@/i18n/format-date";

const LINE = "flex min-w-0 items-start gap-2 text-[13px] leading-[18px] text-muted-foreground";
const SMALL = "text-[13px] leading-[18px] text-muted-foreground";

/**
 * One event of « Mes événements » (OA6.2 to OA6.4): a link to its organiser area, 44 px at
 * least, with its title, start and place. Not anonymised: its persons, and an amber pill per
 * leg with someone without a car; a handover waiting, whose pill wraps and grows (OT2.8, OT8.3),
 * its link expired or not; past, the day its sign-ups are erased, or « sous peu » once
 * day 30 has begun before the purge has run (#607). Anonymised: « Inscriptions effacées »,
 * with neither count nor pill. Every text wraps, even without a space (OA6.9).
 */
export function MyEventRow({ event, linkRef }: { event: UpcomingEvent | PastEvent | ErasedEvent; linkRef?: Ref<HTMLAnchorElement> }) {
  const t = useTranslations("MyEvents");
  const tLegs = useTranslations("Event.legs");
  const formatDate = useFormatDate();
  const erasedOn = (date: WallDate) => formatDate(wallClockAsUtc(`${date} 00:00:00`), { dateStyle: "long" });

  return (
    <li className="min-w-0">
      <Link
        ref={linkRef}
        href={`/e/${event.id}/admin`}
        className="relative flex min-h-11 min-w-0 flex-col gap-1 rounded-xl border py-3 pr-9 pl-3 hover:bg-muted/50 focus-visible:focus-ring"
      >
        <span className="font-semibold [overflow-wrap:anywhere]">{event.title}</span>
        <span className={LINE}>
          <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">
            <EventTime at={event.start} format={FULL} />
          </span>
        </span>
        <span className={LINE}>
          <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{event.location}</span>
        </span>
        {event.state === "erased" ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
            <Eraser aria-hidden className="size-3.5 shrink-0" />
            {t("erased")}
          </span>
        ) : (
          <>
            <span className={SMALL}>{t("persons", { count: event.persons })}</span>
            {event.transferEmail !== null && (
              <span className="mt-0.5 w-fit max-w-full rounded-xl border bg-muted px-2 py-0.5 text-xs leading-4 font-medium [overflow-wrap:anywhere]">
                {t("transferPending", { email: event.transferEmail })}
              </span>
            )}
            {event.withoutCar.length > 0 && (
              <span className="mt-0.5 flex flex-wrap gap-1.5">
                {event.withoutCar.map(({ leg, count }) => (
                  <span
                    key={leg}
                    className="rounded-full bg-amber-100 px-2 text-xs leading-[18px] font-medium whitespace-nowrap text-amber-950"
                  >
                    {t("withoutCar", { leg: tLegs(leg), count })}
                  </span>
                ))}
              </span>
            )}
            {event.state === "past" && (
              <span className={SMALL}>
                {event.erasedOn === null ? t("erasedSoon") : t("erasedOn", { date: erasedOn(event.erasedOn) })}
              </span>
            )}
          </>
        )}
        <ChevronRight aria-hidden className="absolute top-[calc(50%-8px)] right-3 size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}
