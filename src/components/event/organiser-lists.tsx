import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { FOLDED_LINES as FOLD } from "@/app/e/[id]/admin/screen-state";
import { Button } from "@/components/ui/button";
import type { CarWithoutPhone, OrganiserLeg } from "@/domain/organiser-panel";
import { wallClockAsUtc, type WallDate } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { PhoneLink } from "./phone-link";

/**
 * What takes the focus in a line, its first name or its car's title: inline, so that the
 * ring follows the text, not the line (O5.8).
 */
const focusTarget = "rounded-sm focus-visible:focus-ring";

/** Whether a list is unfolded, and how to fold or unfold it: kept by the organiser's screen, never here. */
export interface Fold {
  expanded: boolean;
  onToggle: () => void;
}

/**
 * « Sans voiture ({count}) » of a leg: a line per person, its first name on the left and,
 * always on the right, the number DO1 lets the organiser see, or « Pas de numéro » (O2.2).
 */
export function OrganiserWithoutCar({ persons, fold }: { persons: OrganiserLeg["withoutCar"]; fold: Fold }) {
  const t = useTranslations("Admin");
  return (
    <FoldList
      title={t("withoutCar.title", { count: persons.length })}
      hint={t("withoutCar.hint")}
      empty={t("withoutCar.empty")}
      fold={fold}
      lines={persons.map((person) => (
        <li
          key={person.id}
          className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t first:border-t-0"
        >
          <span className="flex min-w-0 items-center py-1.5">
            <span data-line-focus tabIndex={-1} className={cn("min-w-0 font-medium wrap-anywhere", focusTarget)}>
              {person.firstName}
            </span>
          </span>
          {person.phone ? (
            <PhoneLink firstName={person.firstName} phone={person.phone} icon />
          ) : (
            <span className="inline-flex min-h-11 items-center self-start text-[13px] text-muted-foreground">
              {t("noPhone")}
            </span>
          )}
        </li>
      ))}
    />
  );
}

/**
 * « Voitures sans numéro ({count}) » of a leg: a line per car whose driver has no number,
 * its title, its time and place as on its card, and its seats. No action (O3.3).
 */
export function OrganiserCarsWithoutPhone({
  cars,
  date,
  fold,
}: {
  cars: CarWithoutPhone[];
  date: WallDate;
  fold: Fold;
}) {
  const t = useTranslations("Admin");
  const tCar = useTranslations("Board.car");
  const format = useFormatter();
  return (
    <FoldList
      title={t("carsWithoutPhone.title", { count: cars.length })}
      hint={t("carsWithoutPhone.hint")}
      empty={t("carsWithoutPhone.empty")}
      fold={fold}
      lines={cars.map((car) => (
        <li
          key={car.id}
          className="flex min-w-0 flex-col items-start gap-0.5 border-t py-2.5 first:border-t-0 first:pt-1"
        >
          <span data-line-focus tabIndex={-1} className={cn("max-w-full font-medium wrap-anywhere", focusTarget)}>
            {tCar("title", { driver: car.driverFirstName })}
          </span>
          <span className="max-w-full text-[13px] leading-[18px] text-muted-foreground wrap-anywhere">
            <time dateTime={`${date}T${car.departureTime.slice(0, 5)}`}>
              {format.dateTime(wallClockAsUtc(`${date} ${car.departureTime}`), { timeStyle: "short" })}
            </time>
            {" · "}
            {car.location}
          </span>
          <span>{t("car.summary", { taken: car.taken, free: car.free })}</span>
        </li>
      ))}
    />
  );
}

/**
 * A list's title (h4, the focus's fallback), its sentence, or the empty one at 0, then its
 * lines: the first five, then « Afficher les {n} autres », which shows them all and puts the
 * focus on the 6th; « Réduire la liste » keeps it (O5.6, O5.8). `data-organiser-list`: where
 * the focus goes back to its title, should a read take away the line or the button it was on (O5.7).
 */
function FoldList({
  title,
  hint,
  empty,
  lines,
  fold,
}: {
  title: string;
  hint: string;
  empty: string;
  lines: ReactNode[];
  fold: Fold;
}) {
  const t = useTranslations("Admin");
  const titleId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const focusSixth = useRef(false);
  const folds = lines.length > FOLD;
  const expanded = folds && fold.expanded;

  useEffect(() => {
    if (!expanded || !focusSixth.current) return;
    focusSixth.current = false;
    listRef.current?.querySelectorAll<HTMLElement>("[data-line-focus]")[FOLD]?.focus();
  }, [expanded]);

  return (
    <div data-organiser-list className="flex min-w-0 flex-col gap-1.5 text-sm">
      <h4 id={titleId} tabIndex={-1} className="self-start font-semibold outline-none">
        {title}
      </h4>
      {lines.length > 0 ? (
        <>
          <p className="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>
          <ul ref={listRef} aria-labelledby={titleId} className="mt-1 flex flex-col">
            {expanded || !folds ? lines : lines.slice(0, FOLD)}
          </ul>
          {folds && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={(event) => {
                focusSixth.current = !expanded;
                // Safari does not focus a button it clicks: folding would leave the focus on a
                // line it removes, so on <body>.
                if (expanded) event.currentTarget.focus();
                fold.onToggle();
              }}
            >
              {expanded ? t("list.less") : t("list.more", { count: lines.length - FOLD })}
            </Button>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
