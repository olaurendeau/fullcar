import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { byFirstName, type OrganiserPerson } from "@/domain/organiser-panel";
import { removalConfirmation, type ShownLeg } from "@/domain/person-removal";
import type { RemovalProblem } from "./failure-words";
import { FoldHeading } from "./fold-heading";
import { FoldList, type Fold } from "./organiser-lists";
import { cellText } from "./persons-matrix";
import { RemovePersonButton, type RemovePerson } from "./remove-person-dialog";

/** The id of the section's title (h3), which names it and holds its button. */
export const PERSONS_HEADING_ID = "organiser-persons";
const CONTENT_ID = `${PERSONS_HEADING_ID}-content`;

function focus(target: HTMLElement | null | undefined): boolean {
  target?.focus();
  return !!target && document.activeElement === target;
}

/** The first name of person `id` in the section, when her line is shown. */
export const personName = (id: string) => document.querySelector<HTMLElement>(`[data-person-row="${CSS.escape(id)}"] [data-line-focus]`);

/**
 * The landmark of a removal from the panel (remove-person v2, « Focus, barre, envoi »): the
 * « Retirer » of her line, or, should it be gone or folded, the section's button, or the
 * button of whatever folds that one, the card's title.
 */
export function focusPersonRemoval(personId: string): boolean {
  let target =
    document.querySelector<HTMLElement>(`[data-remove-person="${CSS.escape(personId)}"]`) ??
    document.getElementById(PERSONS_HEADING_ID)?.querySelector<HTMLElement>("button");
  let folded = target?.closest("[hidden]");
  while (target && folded) {
    target = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(folded.id)}"]`);
    folded = target?.closest("[hidden]");
  }
  return focus(target);
}

/**
 * « Personnes inscrites ({count}) » (#672, remove-person v2, RP4; organizer-view v3.5, O5.8): after
 * the legs' sections, in the left column from 1024 px. Its title is the button that folds it,
 * `open` kept by the screen, folded at every appearance, its count in its name, and no summary.
 * Unfolded: the hint, then a line per person of the event, by first name (RP4.1), with her state
 * on each leg, the words of the matrix's cells, and « Retirer »; no number (Q2 = a). Over five
 * lines, the panel's rules for long lists (RP4.3). At 0, `Event.nobody` alone (RP4.4). Folded,
 * its content is `hidden`, still mounted. `legs`, the board's, count the confirmation (decision
 * 15); `refused`, the refusal kept for a person (decision 17).
 */
export function OrganiserPersons({
  persons,
  legs,
  open,
  onToggle,
  fold,
  removePerson,
  refused,
}: {
  persons: OrganiserPerson[];
  legs: readonly ShownLeg[];
  open: boolean;
  onToggle: () => void;
  fold: Fold;
  removePerson: RemovePerson;
  refused: (personId: string) => RemovalProblem | undefined;
}) {
  const t = useTranslations("Admin");
  const tEvent = useTranslations("Event");
  const tCell = useTranslations("DevicePersons");
  const sorted = byFirstName(persons, useLocale());
  const ids = sorted.map(({ id }) => id);
  // Of each line, the first names after it, then those before it: where the focus goes once it is gone (RP4.6).
  const around = (at: number) => [...ids.slice(at + 1), ...ids.slice(0, at).reverse()];

  const states = (person: OrganiserPerson) =>
    person.cells.map((cell) =>
      // Without a retour, the state alone (RP4.2).
      person.cells.length === 1 ? cellText(tCell, cell) : t("persons.leg", { leg: tEvent(`legs.${cell.leg}`), state: cellText(tCell, cell) }),
    );

  /**
   * A success closes the confirmation: while her line is still shown, Radix gives the focus back to
   * its « Retirer », and the screen moves it once the panel read again takes the line away. Gone
   * already: the next first name, else the one before, else the section's button (O5.8 amended by O9.9).
   */
  const focusAfter = (removedId: string, others: string[]) => {
    if (document.querySelector(`[data-remove-person="${CSS.escape(removedId)}"]`)) return false;
    if (!others.some((id) => focus(personName(id)))) focusPersonRemoval(removedId);
    return true;
  };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6">
      <section aria-labelledby={PERSONS_HEADING_ID} className="flex min-w-0 flex-col gap-1 border-t pt-4">
        <FoldHeading id={PERSONS_HEADING_ID} expanded={open} controls={CONTENT_ID} onToggle={onToggle}>
          {t("persons.title", { count: persons.length })}
        </FoldHeading>
        <div id={CONTENT_ID} hidden={!open} className="flex flex-col">
          <FoldList
            labelledBy={PERSONS_HEADING_ID}
            hint={t("persons.hint")}
            empty={tEvent("nobody")}
            fold={fold}
            lines={sorted.map((person, at) => (
              <li
                key={person.id}
                data-person-row={person.id}
                data-around={around(at).join(" ")}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-t py-1.5 first:border-t-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5 py-1">
                  <span data-line-focus tabIndex={-1} className="self-start rounded-sm font-medium wrap-anywhere focus-visible:focus-ring">
                    {person.firstName}
                  </span>
                  {states(person).map((line) => (
                    <span key={line} className="text-[13px] leading-[18px] text-muted-foreground wrap-anywhere">
                      {line}
                    </span>
                  ))}
                </span>
                <RemovePersonButton
                  person={person}
                  removal={removalConfirmation(legs, person.id)}
                  removePerson={removePerson}
                  panel={{ state: states(person), refused: refused(person.id), onRemoved: () => focusAfter(person.id, around(at)) }}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      data-remove-person={person.id}
                      aria-label={t("persons.removeLabel", { firstName: person.firstName })}
                      className="h-11 text-destructive hover:text-destructive aria-expanded:text-destructive"
                    >
                      {t("persons.remove")}
                    </Button>
                  }
                />
              </li>
            ))}
          />
        </div>
      </section>
    </div>
  );
}
