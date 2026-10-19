import { Car } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { hasBanner } from "@/domain/coverage";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import { deviceKnown, type DeviceStatus } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { CoverageBanner } from "./coverage-banner";
import { DevicePersons } from "./device-persons";
import { RideCard } from "./ride-card";
import { WithoutCarList } from "./without-car-list";

/** What the page knows of the device's persons, and how to read them again after a failure. */
export interface BoardDevice {
  status: DeviceStatus;
  retry: () => void;
  /** Gives the focus to a stable landmark, when what had it is gone. */
  refocus: () => void;
}

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
 * One leg (#86): its coverage first, then the device's persons (#87), its cars, and its
 * persons without a car. A leg with neither a car nor a person shows the empty state of #3
 * instead, without a banner (C9.6), the device's persons still above it.
 */
export function LegPanel({ at, board, device }: { at: WallClock; board: VisibleLegBoard; device: BoardDevice }) {
  const t = useTranslations("Event");
  const tBoard = useTranslations("Board");
  const { leg, cars, withoutCar } = board;
  const legDate = wallClockParts(at).date;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasBanner(board) && <CoverageBanner board={board} />}
      <noscript>
        <p className="text-sm text-muted-foreground">{tBoard("needsJavaScript")}</p>
      </noscript>
      <DevicePersons leg={leg} persons={board.device} device={device} />
      {hasBanner(board) ? (
        <>
          {cars.length > 0 ? (
            cars.map((car) => (
              <RideCard key={car.id} car={car} date={legDate} seatsActive={deviceKnown(device.status)} />
            ))
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
