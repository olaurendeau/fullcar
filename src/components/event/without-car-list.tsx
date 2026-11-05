import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { BoardPerson } from "@/domain/board";
import type { Leg } from "@/domain/leg";

/** Opens the sheet of `person`, from the list she is in (#981), or from the card of her car (#982). */
export type OpenPerson = (person: BoardPerson, state: "withoutCar" | "notConcerned" | "passenger") => void;

function PersonButtons({
  leg,
  persons,
  state,
  active,
  onOpen,
}: {
  leg: Leg;
  persons: readonly BoardPerson[];
  state: "withoutCar" | "notConcerned";
  active: boolean;
  onOpen: OpenPerson;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {persons.map((person) => (
        <li key={person.id} className="max-w-full">
          <button
            type="button"
            aria-haspopup="dialog"
            disabled={!active}
            data-board-person={person.id}
            data-leg={leg}
            onClick={() => onOpen(person, state)}
            className="inline-flex min-h-11 max-w-full items-center rounded-full border px-3 py-1 text-left text-sm wrap-anywhere focus-visible:focus-ring disabled:opacity-50"
          >
            {person.firstName}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The leg's persons without a car, by first name, in the order they declared it (C3.4), each a
 * button of 44 px that opens the person's sheet (PL1.1); under them, when there are any, the
 * persons who do not do this leg, in a fold closed at first (PL1.2, « Ne font pas le retour (n) »).
 * That fold is there without the list « Sans voiture », which is then not (a heading over
 * nobody), and shows no person at 0. The buttons are inactive until the device is known (C5.9).
 */
export function WithoutCarList({
  leg,
  persons,
  notConcerned,
  active,
  onOpen,
}: {
  leg: Leg;
  persons: readonly BoardPerson[];
  notConcerned: readonly BoardPerson[];
  /** The device's persons are read (C5.9): before, a sheet would take its own person for another device's. */
  active: boolean;
  onOpen: OpenPerson;
}) {
  const t = useTranslations("Board");
  const headingId = `without-car-${leg}`;
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <div className="flex flex-col gap-2">
      {persons.length > 0 && (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
          <h3 id={headingId} className="font-semibold">
            {t("withoutCar")}
          </h3>
          <PersonButtons leg={leg} persons={persons} state="withoutCar" active={active} onOpen={onOpen} />
        </section>
      )}
      {notConcerned.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            data-not-concerned={leg}
            onClick={() => setExpanded(!expanded)}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm text-muted-foreground focus-visible:focus-ring"
          >
            <span className="min-w-0">{t(`notConcerned.${leg}`, { count: notConcerned.length })}</span>
            <Chevron aria-hidden className="size-4 shrink-0" />
          </button>
          {expanded && (
            <div id={listId}>
              <PersonButtons leg={leg} persons={notConcerned} state="notConcerned" active={active} onOpen={onOpen} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
