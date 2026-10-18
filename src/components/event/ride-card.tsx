import { Clock, MapPin, Plus, User } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { VisibleCar } from "@/domain/phone-visibility";
import { wallClockAsUtc, type WallDate } from "@/domain/wall-clock";
import { PhoneLink } from "./phone-link";

/**
 * A car of the leg (C4.3): its driver, place, time and note, then a line per passenger
 * and one per free seat; with none left, « Complet ». The numbers the state carries are
 * `tel:` links (C10.1). A free seat is a button, inactive until the device's persons are
 * known (C5.9) and without JavaScript; the tap itself comes with #92. Long values wrap
 * anywhere rather than scrolling sideways (C11.3).
 */
export function RideCard({ car, date, seatsActive }: { car: VisibleCar; date: WallDate; seatsActive: boolean }) {
  const t = useTranslations("Board.car");
  const format = useFormatter();
  const headingId = `car-${car.id}`;
  // At the leg's date, its digits shown as they are: formatted in UTC, like the leg's time.
  const departure = wallClockAsUtc(`${date} ${car.departureTime}`);
  const driver = car.driver.firstName;

  return (
    <article aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 id={headingId} className="min-w-0 font-semibold wrap-anywhere">
          {t("title", { driver })}
        </h3>
        {car.full && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t("full")}</span>
        )}
      </div>
      {car.driver.phone && <PhoneLink firstName={driver} phone={car.driver.phone} icon className="-my-2" />}
      <div className="flex flex-col gap-1 text-sm">
        <p className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 wrap-anywhere">{car.location}</span>
        </p>
        <p className="flex items-center gap-2">
          <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <time dateTime={`${date}T${car.departureTime.slice(0, 5)}`}>
            {format.dateTime(departure, { timeStyle: "short" })}
          </time>
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
              disabled={!seatsActive}
              aria-label={t("takeSeat", { driver })}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-foreground/25 bg-background px-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {t("freeSeat")}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
