import { Car, Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { hasBanner } from "@/domain/coverage";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { CoverageBanner } from "./coverage-banner";
import { RideCard } from "./ride-card";
import { WithoutCarList } from "./without-car-list";

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

/**
 * One leg (#86): its coverage first, then its cars, then its persons without a car. A leg
 * with neither a car nor a person shows the empty state of #3 instead, without a banner
 * (C9.6). No action in this task.
 */
export function LegPanel({ at, board }: { at: WallClock; board: VisibleLegBoard }) {
  const t = useTranslations("Event");
  const { leg, cars, withoutCar } = board;
  const legDate = wallClockParts(at).date;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasBanner(board) && <CoverageBanner board={board} />}
      <p className="flex items-center gap-2 text-sm text-foreground/80">
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <LegTime at={at} />
      </p>
      {hasBanner(board) ? (
        <>
          {cars.length > 0 ? (
            cars.map((car) => <RideCard key={car.id} car={car} date={legDate} />)
          ) : (
            <p className="text-sm text-muted-foreground">{t(`noCar.${leg}`)}</p>
          )}
          {withoutCar.length > 0 && <WithoutCarList leg={leg} persons={withoutCar} />}
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center">
          <div className="mb-1.5 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Car className="size-5" />
          </div>
          <p className="font-semibold">{t(`noCar.${leg}`)}</p>
          <p className="text-sm text-muted-foreground">{t("nobody")}</p>
        </div>
      )}
    </div>
  );
}
