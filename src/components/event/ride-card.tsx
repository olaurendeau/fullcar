import { Clock, MapPin, User } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { VisibleCar } from "@/domain/phone-visibility";
import { wallClockAsUtc, type WallDate } from "@/domain/wall-clock";

/**
 * A car of the leg (C4.3): its driver, place, time and note, then a line per passenger
 * and one per free seat; with none left, « Complet ». No action in this task. Long values
 * wrap anywhere rather than scrolling sideways (C11.3).
 */
export function RideCard({ car, date }: { car: VisibleCar; date: WallDate }) {
  const t = useTranslations("Board.car");
  const format = useFormatter();
  const headingId = `car-${car.id}`;
  // At the leg's date, its digits shown as they are: formatted in UTC, like the leg's time.
  const departure = wallClockAsUtc(`${date} ${car.departureTime}`);

  return (
    <article aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className="min-w-0 font-semibold wrap-anywhere">
          {t("title", { driver: car.driver.firstName })}
        </h2>
        {car.full && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{t("full")}</span>
        )}
      </div>
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
          <li key={passenger.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm">
            <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 wrap-anywhere">{passenger.firstName}</span>
          </li>
        ))}
        {Array.from({ length: car.freeSeats }, (_, seat) => (
          <li
            key={`free-${seat}`}
            className="flex min-h-11 items-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
          >
            {t("freeSeat")}
          </li>
        ))}
      </ul>
    </article>
  );
}
