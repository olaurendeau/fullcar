import { useTranslations } from "next-intl";
import { coverage, coverageBanner, hasBanner } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import { phoneAsk } from "@/domain/phone-ask";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import type { Position } from "@/domain/place";
import { deviceKnown, type DeviceStatus } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { useFormatDate } from "@/i18n/format-date";
import type { Message } from "./bar-state";
import type { SetPersonLeg } from "./cell-sheet";
import { CoverageBanner } from "./coverage-banner";
import { personOf } from "./device-persons";
import { EmptyLeg } from "./empty-leg";
import { EventMap, OrganiserHint, type LegMap, type MapHint } from "./event-map";
import { AddPersonButton, type AddPerson, type UpdatePerson } from "./person-form";
import { PhoneAskButton } from "./phone-ask";
import { RideCard } from "./ride-card";
import type { RemovePerson } from "./remove-person-dialog";
import type { RemoveRide } from "./remove-ride-dialog";
import { OfferRideButton, type OfferRide, type OtherLegOf, type UpdateRide } from "./ride-form";
import { useSeatSheet, type TakeSeats } from "./seat-sheet";
import { WithoutCarList } from "./without-car-list";

/** What the page knows of the device's persons, and how to read them again after a failure. */
export interface BoardDevice {
  status: DeviceStatus;
  retry: () => void;
  /** Gives the focus to a stable landmark, when what had it is gone. */
  refocus: () => void;
  /**
   * Writes an information about `leg` in the bar once no sheet hides the page (« Aucune place
   * libre… », rule 4); never about a retour gone by then (#330, rule 9).
   */
  inform: (message: Message, leg: Leg) => void;
  /** Registers a person on this device (R1), with the device's token. */
  addPerson: AddPerson;
  /** Changes the first name and the number of one of the device's persons (C2.3). */
  updatePerson: UpdatePerson;
  /** Without a car, or not concerned, on a leg, for one of the device's persons (#89). */
  setPersonLeg: SetPersonLeg;
  /** Offers a car on a leg (R4), with the device's token. */
  offerRide: OfferRide;
  /** Seats in a car for persons of the device, from a tap (#92) or the sheet (#91). */
  takeSeats: TakeSeats;
  /** Changes a car driven by one of the device's persons (C8.2), with the device's token. */
  updateRide: UpdateRide;
  /** Removes a car driven by one of the device's persons (C8.6), with the device's token. */
  removeRide: RemoveRide;
  /** Removes one of the device's persons from the event (RP1), with the device's token. */
  removePerson: RemovePerson;
}

/**
 * A leg's date and time as the locale writes them, with no conversion: the wall-clock
 * digits, formatted in UTC (`timeZone` in src/i18n/request.ts).
 */
export function LegTime({ at }: { at: WallClock }) {
  const formatDate = useFormatDate();
  const { date, time } = wallClockParts(at);
  return (
    <time dateTime={`${date}T${time}`}>
      {formatDate(wallClockAsUtc(at), { dateStyle: "full", timeStyle: "short" })}
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
 * When the event's place has a position, its map comes after the actions, before the cards,
 * « Aucune voiture… » or the empty state (#478, event-map v11). Without one, on `/e/{id}/admin`
 * once the link is checked, the organiser's sentence takes its place (#485, CA2.1).
 */
export function LegPanel({
  at,
  board,
  device,
  hasRetour,
  other,
  near,
  map,
  hint,
}: {
  at: WallClock;
  board: VisibleLegBoard;
  device: BoardDevice;
  hasRetour: boolean;
  /** The other leg's date and time, the event's place, and the device's persons there, for « Proposer une voiture » (#169, #649). */
  other?: OtherLegOf;
  /** The event's position, for the suggestions of a car's places (AL4.1). */
  near: Position | null;
  /** The event's place and the page's open or folded map; none without a position (CA2.1). */
  map?: LegMap;
  /** The organiser's sentence, shown without a map. */
  hint?: MapHint;
}) {
  const t = useTranslations("Event");
  const tBoard = useTranslations("Board");
  const { leg, cars, withoutCar } = board;
  const legDate = wallClockParts(at).date;
  const seats = useSeatSheet(board, device, hasRetour);
  // A car is the device's when one of its persons drives it on this leg (C8.1).
  const drivesIt = (rideId: string) => board.device.some(({ state }) => state.kind === "driver" && state.rideId === rideId);
  // Only once the device's persons are known (v4.8 rule 1, C5.9); her driving read on both legs (rule 8).
  const known = deviceKnown(device.status);
  const askOf = (car: (typeof cars)[number]) => {
    const ask = known ? phoneAsk(car, board.device) : null;
    const person = ask && personOf([board, { device: other?.persons ?? [] }], ask.personId);
    return <PhoneAskButton ask={ask} person={person || null} leg={leg} rideId={car.id} updatePerson={device.updatePerson} />;
  };

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
          near={near}
          main={coverageBanner(coverage(board)).kind === "missingSeats"}
          disabled={!deviceKnown(device.status)}
          offerRide={device.offerRide}
        />
      </div>
      <noscript>
        <p className="text-sm text-muted-foreground">{tBoard("needsJavaScript")}</p>
      </noscript>
      {map ? <EventMap leg={leg} map={map} cars={cars} /> : hint && <OrganiserHint leg={leg} hint={hint} />}
      {hasBanner(board) ? (
        <>
          {cars.length > 0 ? (
            cars.map((car) => (
              <RideCard
                key={car.id}
                car={car}
                date={legDate}
                seatsActive={deviceKnown(device.status)}
                onTakeSeat={(seat) => seats.tap(car, seat)}
                updateRide={drivesIt(car.id) ? device.updateRide : undefined}
                removeRide={drivesIt(car.id) ? device.removeRide : undefined}
                near={near}
                ask={askOf(car)}
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
