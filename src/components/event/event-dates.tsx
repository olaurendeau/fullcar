import { useTranslations } from "next-intl";
import { sameWallDate, wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { useFormatDate } from "@/i18n/format-date";

export const FULL = { dateStyle: "full", timeStyle: "short" } as const;
const TIME_ONLY = { timeStyle: "short" } as const;

/** A wall-clock time, formatted in UTC (its digits), its `dateTime` always complete. */
export function EventTime({ at, format }: { at: WallClock; format: typeof FULL | typeof TIME_ONLY }) {
  const formatDate = useFormatDate();
  const { date, time } = wallClockParts(at);
  return <time dateTime={`${date}T${time}`}>{formatDate(wallClockAsUtc(at), format)}</time>;
}

/**
 * When the event starts and ends (v4.3, #235): « Début », then « Fin » with a retour only.
 * The end shows its time alone on the start's wall-clock day (D1.7), its full date otherwise.
 * No leg is named here: the tabs below are the legs (D1.4).
 */
export function EventDates({ start, end }: { start: WallClock; end: WallClock | null }) {
  const t = useTranslations("Event.dates");
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
      <dt className="text-sm text-muted-foreground">{t("start")}</dt>
      <dd>
        <EventTime at={start} format={FULL} />
      </dd>
      {end && (
        <>
          <dt className="text-sm text-muted-foreground">{t("end")}</dt>
          <dd>
            <EventTime at={end} format={sameWallDate(start, end) ? TIME_ONLY : FULL} />
          </dd>
        </>
      )}
    </dl>
  );
}
