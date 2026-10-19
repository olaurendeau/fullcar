import { useFormatter, useTranslations } from "next-intl";
import type { DevicePerson } from "@/domain/board";
import { coverage, coverageBanner, hasBanner } from "@/domain/coverage";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import { deviceKnown, type DeviceStatus } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import type { SetPersonLeg } from "./cell-sheet";
import { CoverageBanner } from "./coverage-banner";
import { EmptyLeg } from "./empty-leg";
import { AddPersonButton, type AddPerson, type UpdatePerson } from "./person-form";
import { RideCard } from "./ride-card";
import { OfferRideButton, type OfferRide } from "./ride-form";
import { useSeatSheet, type TakeSeats } from "./seat-sheet";
import { WithoutCarList } from "./without-car-list";

/** What the page knows of the device's persons, and how to read them again after a failure. */
export interface BoardDevice {
  status: DeviceStatus;
  retry: () => void;
  /** Gives the focus to a stable landmark, when what had it is gone. */
  refocus: () => void;
  /** Registers a person on this device (R1), with the device's token. */
  addPerson: AddPerson;
  /** Changes the first name and the number of one of the device's persons (C2.3). */
  updatePerson: UpdatePerson;
  /** Without a car, or not concerned, on a leg, for one of the device's persons (#89). */
  setPersonLeg: SetPersonLeg;
  /** Offers a car on a leg (R4), with the device's token. */
  offerRide: OfferRide;
  /** Seats in a car for persons of the device, from the sheet (#91). */
  takeSeats: TakeSeats;
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
 * One leg (#86): its coverage first, then its actions, side by side (v4-12), « Proposer une
 * voiture » the main one where seats are missing (C9.7), its cars, and
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
  other,
}: {
  at: WallClock;
  board: VisibleLegBoard;
  device: BoardDevice;
  hasRetour: boolean;
  /** The other leg's date and time, and the device's persons there, for « Proposer une voiture » (#169). */
  other?: { at: WallClock; persons: readonly DevicePerson[] };
}) {
  const t = useTranslations("Event");
  const tBoard = useTranslations("Board");
  const { leg, cars, withoutCar } = board;
  const legDate = wallClockParts(at).date;
  const seats = useSeatSheet(board, device, hasRetour);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasBanner(board) && <CoverageBanner coverage={coverage(board)} leg={leg} />}
      <div className="grid grid-cols-2 gap-2">
        <AddPersonButton
          leg={leg}
          hasRetour={hasRetour}
          disabled={!deviceKnown(device.status)}
          addPerson={device.addPerson}
        />
        <OfferRideButton
          leg={leg}
          at={at}
          persons={board.device}
          other={other}
          main={coverageBanner(coverage(board)).kind === "missingSeats"}
          disabled={!deviceKnown(device.status)}
          offerRide={device.offerRide}
        />
      </div>
      <noscript>
        <p className="text-sm text-muted-foreground">{tBoard("needsJavaScript")}</p>
      </noscript>
      {hasBanner(board) ? (
        <>
          {cars.length > 0 ? (
            cars.map((car) => (
              <RideCard
                key={car.id}
                car={car}
                date={legDate}
                seatsActive={deviceKnown(device.status)}
                onTakeSeat={(seat) => seats.openFor(car, seat)}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t(`noCar.${leg}`)}</p>
          )}
          {withoutCar.length > 0 && <WithoutCarList leg={leg} persons={withoutCar} />}
        </>
      ) : (
        <EmptyLeg leg={leg} />
      )}
      {seats.sheet}
    </div>
  );
}
