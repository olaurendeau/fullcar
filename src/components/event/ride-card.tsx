import { Clock, MapPin, Plus, User } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { VisibleCar } from "@/domain/phone-visibility";
import type { Position } from "@/domain/place";
import { wallClockAsUtc, type WallDate } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { PhoneLink } from "./phone-link";
import { RemoveRideButton, type RemoveRide } from "./remove-ride-dialog";
import { EditRideButton, type UpdateRide } from "./ride-form";

/** Scrolled into view, it stops above the bar, as the page keeps room for it (« Trouver une place », C11.4). */
const ABOVE_BAR = "scroll-mb-[calc(1rem+var(--message-bar-height,0px)+12px+env(safe-area-inset-bottom))]";

/**
 * A car of the leg (C4.3): its driver, with its time on the right of that line, then
 * « Complet » when no seat is left (v4-13); under it, its place and note, then a line per
 * passenger and one per free seat. The numbers the state carries are
 * `tel:` links (C10.1). A free seat is a button, inactive until the device's persons are
 * known (C5.9) and without JavaScript; its tap takes a seat or opens a sheet (`onTakeSeat`, #92). Long
 * values wrap anywhere rather than scrolling sideways (C11.3). Given `updateRide` and
 * `removeRide`, the car is the device's: « Modifier » changes it, « Retirer la voiture »
 * removes it (C8.1); on a car with points, each passenger of the device says where she boards and
 * has « Changer le point » (RV4.1, #892); `near`, the event's position, brings its place's suggestions closer (AL4.1).
 */
export function RideCard({
  car,
  date,
  seatsActive,
  onTakeSeat,
  devicePassengers = [],
  onChangeStop,
  updateRide,
  removeRide,
  near = null,
  stopsOn,
}: {
  car: VisibleCar;
  date: WallDate;
  seatsActive: boolean;
  onTakeSeat: (seat: HTMLElement) => void;
  /** The passengers of this car who are the device's: on a car with points, each has « Changer le point » (RV4.1). */
  devicePassengers?: readonly string[];
  onChangeStop?: (passenger: { id: string; firstName: string }, button: HTMLElement) => void;
  updateRide?: UpdateRide;
  removeRide?: RemoveRide;
  near?: Position | null;
  /** The option « Points de RDV » is on: « Modifier la voiture » has its section on the aller. */
  stopsOn?: boolean;
}) {
  const t = useTranslations("Board.car");
  const format = useFormatter();
  const headingId = `car-${car.id}`;
  // At the leg's date, its digits shown as they are: formatted in UTC, like the leg's time.
  const departure = wallClockAsUtc(`${date} ${car.departureTime}`);
  const driver = car.driver.firstName;

  return (
    <article aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-3 rounded-xl border p-4", ABOVE_BAR)}>
      <div className="flex items-start justify-between gap-2">
        {/* Focusable by script alone: « Voir la voiture » leads here (focusCarTitle). */}
        <h3
          id={headingId}
          tabIndex={-1}
          data-car-title={car.id}
          data-leg={car.leg}
          className="min-w-0 rounded-sm font-semibold wrap-anywhere focus-visible:focus-ring"
        >
          {t("title", { driver })}
        </h3>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <time dateTime={`${date}T${car.departureTime.slice(0, 5)}`}>
              {format.dateTime(departure, { timeStyle: "short" })}
            </time>
          </span>
          {car.full && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t("full")}</span>}
        </span>
      </div>
      {car.driver.phone && <PhoneLink firstName={driver} phone={car.driver.phone} icon className="-my-2" />}
      <div className="flex flex-col gap-1 text-sm">
        <p className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 wrap-anywhere">{car.location}</span>
        </p>
        {car.note && <p className="text-muted-foreground wrap-anywhere">{car.note}</p>}
      </div>
      {car.stops.length > 0 && (
        // None, no list and no title (RV2.1): the departure keeps its line above.
        <ul aria-label={t("stops")} className="ml-2 flex min-w-0 flex-col gap-1.5 border-l-2 pl-3 text-sm">
          {car.stops.map((stop) => (
            <li key={stop.id} className="flex min-w-0 items-baseline gap-2">
              <time dateTime={`${date}T${stop.time.slice(0, 5)}`} className="min-w-11 shrink-0 font-semibold tabular-nums">
                {format.dateTime(wallClockAsUtc(`${date} ${stop.time}`), { timeStyle: "short" })}
              </time>
              <span className="min-w-0 wrap-anywhere">{stop.location}</span>
            </li>
          ))}
        </ul>
      )}
      <ul aria-label={t("seats")} className="flex flex-col gap-2">
        {car.passengers.map((passenger) => {
          // Where she boards, if at a point: at the departure, nothing (RV2.2).
          const stop = car.stops.find(({ passengerIds }) => passengerIds.includes(passenger.id));
          // Hers to change: the device's passenger of a car with points, told where she boards even at the departure (RV4.1).
          const changes = onChangeStop !== undefined && car.stops.length > 0 && devicePassengers.includes(passenger.id);
          return (
            <li
              key={passenger.id}
              className={cn("flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg bg-muted px-3 text-sm", (stop || changes) && "py-1.5")}
            >
              <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 wrap-anywhere">{passenger.firstName}</span>
              {passenger.phone && <PhoneLink firstName={passenger.firstName} phone={passenger.phone} />}
              {changes && (
                <button
                  type="button"
                  aria-label={t("changeStopName", { firstName: passenger.firstName })}
                  onClick={(event) => onChangeStop?.(passenger, event.currentTarget)}
                  className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-primary underline underline-offset-3 focus-visible:focus-ring"
                >
                  {t("changeStop")}
                </button>
              )}
              {/* #595959 on `muted`: 6,4:1 where `muted-foreground` makes 4,35:1 (RV7.3). */}
              {(stop || changes) && (
                <span className="basis-full text-xs text-[#595959] wrap-anywhere">
                  {stop ? t("boardsAt", { place: stop.location }) : t("boardsAtStart")}
                </span>
              )}
            </li>
          );
        })}
        {Array.from({ length: car.freeSeats }, (_, seat) => (
          <li key={`free-${seat}`} className="flex">
            <button
              type="button"
              // « Trouver une place » gives the focus to the first (`focusFreeSeat`).
              data-free-seat={car.id}
              data-leg={car.leg}
              disabled={!seatsActive}
              aria-label={t("takeSeat", { driver })}
              onClick={(event) => onTakeSeat(event.currentTarget)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-foreground/25 bg-background px-3 text-left text-sm font-medium focus-visible:focus-ring disabled:opacity-50",
                ABOVE_BAR,
              )}
            >
              <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {t("freeSeat")}
            </button>
          </li>
        ))}
      </ul>
      {(updateRide || removeRide) && (
        <div className="flex gap-2">
          {updateRide && <EditRideButton car={car} at={`${date} ${car.departureTime}`} updateRide={updateRide} near={near} stopsOn={stopsOn} />}
          {removeRide && (
            <RemoveRideButton
              car={{ id: car.id, leg: car.leg, driverId: car.driver.id, driver: car.driver.firstName, passengers: car.passengers.length }}
              removeRide={removeRide}
            />
          )}
        </div>
      )}
    </article>
  );
}
