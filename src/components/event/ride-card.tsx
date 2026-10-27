import { Clock, MapPin, Plus, User } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
 * removes it (C8.1); `near`, the event's position, brings its place's suggestions closer (AL4.1).
 * `ask`, what the card asks the device, goes under the seats, above those two (v4.8 rule 1).
 */
export function RideCard({
  car,
  date,
  seatsActive,
  onTakeSeat,
  updateRide,
  removeRide,
  near = null,
  ask,
}: {
  car: VisibleCar;
  date: WallDate;
  seatsActive: boolean;
  onTakeSeat: (seat: HTMLElement) => void;
  updateRide?: UpdateRide;
  removeRide?: RemoveRide;
  near?: Position | null;
  ask?: ReactNode;
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
      <ul aria-label={t("seats")} className="flex flex-col gap-2">
        {car.passengers.map((passenger) => (
          <li
            key={passenger.id}
            className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg bg-muted px-3 text-sm"
          >
            <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 wrap-anywhere">{passenger.firstName}</span>
            {passenger.phone && <PhoneLink firstName={passenger.firstName} phone={passenger.phone} />}
          </li>
        ))}
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
      {ask}
      {(updateRide || removeRide) && (
        <div className="flex gap-2">
          {updateRide && <EditRideButton car={car} at={`${date} ${car.departureTime}`} updateRide={updateRide} near={near} />}
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
