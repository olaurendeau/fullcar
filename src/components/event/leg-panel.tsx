import { Car, Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";

export type Leg = "aller" | "retour";

/**
 * A leg's date and time as the locale writes them, with no conversion: the wall-clock
 * digits, formatted in UTC (`timeZone` in src/i18n/request.ts).
 */
export function LegTime({ at }: { at: WallClock }) {
  const format = useFormatter();
  const { date, time } = wallClockParts(at);
  return (
    <time dateTime={`${date}T${time}`}>
      {format.dateTime(wallClockAsUtc(at), { dateStyle: "full", timeStyle: "short" })}
    </time>
  );
}

/** One leg of an empty event: its date, and nobody yet (#3, C5.3). No action in this epic. */
export function LegPanel({ leg, at }: { leg: Leg; at: WallClock }) {
  const t = useTranslations("Event");

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-foreground/80">
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <LegTime at={at} />
      </p>
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center">
        <div className="mb-1.5 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Car className="size-5" />
        </div>
        <p className="font-semibold">{t(`noCar.${leg}`)}</p>
        <p className="text-sm text-muted-foreground">{t("nobody")}</p>
      </div>
    </div>
  );
}
