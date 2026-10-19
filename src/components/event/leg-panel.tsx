import { Car } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { hasBanner } from "@/domain/coverage";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import { deviceKnown, type DeviceStatus } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import type { SetPersonLeg } from "./cell-sheet";
import { CoverageBanner } from "./coverage-banner";
import { AddPersonButton, type AddPerson } from "./person-form";
import { RideCard } from "./ride-card";
import { WithoutCarList } from "./without-car-list";

/** What the page knows of the device's persons, and how to read them again after a failure. */
export interface BoardDevice {
  status: DeviceStatus;
  retry: () => void;
  /** Gives the focus to a stable landmark, when what had it is gone. */
  refocus: () => void;
  /** Registers a person on this device (R1), with the device's token. */
  addPerson: AddPerson;
  /** Without a car, or not concerned, on a leg, for one of the device's persons (#89). */
  setPersonLeg: SetPersonLeg;
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
 * One leg (#86): its coverage first, then its actions, side by side (v4-12), its cars, and
 * its persons without a car. A leg with neither a car nor a person shows the empty state of
 * #3 instead, without a banner, under the same actions (C9.6). The actions come before the
 * cars, however many there are (C1.1), and are inactive until the device's persons are
 * known (C5.9). The device's persons are above the tabs (`DevicePersons`, #162).
 */
export function LegPanel({
  at,
  board,
  device,
  hasRetour,
}: {
  at: WallClock;
  board: VisibleLegBoard;
  device: BoardDevice;
  hasRetour: boolean;
}) {
  const t = useTranslations("Event");
  const tBoard = useTranslations("Board");
  const { leg, cars, withoutCar } = board;
  const legDate = wallClockParts(at).date;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasBanner(board) && <CoverageBanner board={board} />}
      <div className="grid grid-cols-2 gap-2">
        <AddPersonButton
          leg={leg}
          hasRetour={hasRetour}
          disabled={!deviceKnown(device.status)}
          addPerson={device.addPerson}
        />
      </div>
      <noscript>
        <p className="text-sm text-muted-foreground">{tBoard("needsJavaScript")}</p>
      </noscript>
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
