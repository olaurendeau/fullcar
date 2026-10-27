import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { RemovalConfirmation } from "@/domain/person-removal";
import type { RemovalProblem } from "./failure-words";
import { HidesPage, useSends, type FromSheet } from "./hidden-page";

/**
 * Removes one of the device's persons from the event (`removePerson`, remove-person v2, RP1):
 * `null` once done, `alreadyRemoved` included (RP1.8); the problem to show otherwise, `undefined`
 * when it is on its way already. A problem the confirmation no longer shows goes to the bar.
 */
export type RemovePerson = (
  removal: { personId: string; firstName: string; sending: (sending: boolean) => void },
  confirmation: FromSheet,
) => Promise<RemovalProblem | null | undefined>;

interface Person {
  id: string;
  firstName: string;
}

/**
 * From the organiser area (#672, RP4.5): `state`, her state on each leg, in a box under the title;
 * whom to tell is always « pas même {prénom} ». `refused`, a refusal that sending again would not
 * change, kept for her until the page reloads (decision 17): each opening shows it, and sends
 * nothing. `onRemoved`, once a success closes the confirmation: whether it moved the focus itself.
 */
export interface FromPanel {
  state: readonly string[];
  refused?: RemovalProblem;
  onRemoved: () => boolean;
}

/**
 * « Retirer de l’événement » in the sheet of one of the device's persons, under « Modifier »
 * (RP1.1), and its confirmation (RP1.2); or `trigger`, « Retirer » of « Personnes inscrites »,
 * `panel` (RP4.5). The removal stays inactive, on each opening, until its answer (RP1.4).
 * Removed, the person goes with her sheet, this button and its confirmation: the sheet's closing
 * gives the focus to the next first name (RP1.5); in the panel, `onRemoved` does.
 */
export function RemovePersonButton({
  person,
  removal,
  removePerson,
  trigger,
  panel,
}: {
  person: Person;
  /** What the confirmation says, counted on the state the page shows (decision 15). */
  removal: RemovalConfirmation;
  removePerson: RemovePerson;
  trigger?: ReactNode;
  panel?: FromPanel;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // Each opening is a new confirmation, even one reopened while it closes.
  const [opened, setOpened] = useState(0);
  const [sending, setSending] = useState(false);
  const isOpen = useRef(false);
  const removed = useRef(false);

  const toggle = (next: boolean) => {
    if (next) setOpened((count) => count + 1);
    isOpen.current = next;
    setOpen(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={toggle}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="h-11 w-full text-destructive hover:text-destructive aria-expanded:text-destructive">
            <Trash2 aria-hidden />
            {t("DevicePersons.remove")}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (panel && removed.current && panel.onRemoved()) event.preventDefault();
        }}
      >
        <HidesPage />
        <Confirmation
          key={opened}
          person={person}
          removal={removal}
          panel={panel}
          isOpen={() => isOpen.current}
          sending={sending}
          send={async (confirmation) => {
            const outcome = await removePerson({ personId: person.id, firstName: person.firstName, sending: setSending }, confirmation);
            if (outcome === null) removed.current = true;
            return outcome;
          }}
          close={() => toggle(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The confirmation's content, one per opening (RP1.2): one line per leg where she drives or sits
 * in a car, in the order of the legs; whom to tell, when a car changes; what is erased, and that
 * it is final. Then the removal in red, and « Annuler », which sends nothing (RP1.3). Confirmed, it
 * stays open, its button inactive, until the answer: a failure is said there while it is open, the
 * one that sent; in the bar otherwise, once nothing hides the page. Offline or on an error, the red
 * button gets the focus back; a refusal that sending again would not change says why, and the red
 * button goes: « Annuler » becomes « Fermer », which takes the focus (« Refus et échecs », decision 12).
 * From the panel, one kept or one that comes while it is open does the same (decision 17, RP1.10).
 */
function Confirmation({
  person,
  removal: { lines, cars },
  panel,
  isOpen,
  sending,
  send,
  close,
}: {
  person: Person;
  removal: RemovalConfirmation;
  panel?: FromPanel;
  isOpen: () => boolean;
  sending: boolean;
  send: (confirmation: FromSheet) => Promise<RemovalProblem | null | undefined>;
  close: () => void;
}) {
  const t = useTranslations();
  const [answered, setProblem] = useState<RemovalProblem | null>(null);
  // A refusal kept from the panel wins, one another opening sent included, as this one is open (RP1.10).
  const problem = panel?.refused ?? answered;
  const confirmButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const sends = useSends(isOpen, `removePerson:${person.id}`);

  // The confirmation button lost the focus while it was inactive: after a failure, it gets it back.
  // After a refusal it is gone, and « Fermer » takes the focus.
  useEffect(() => {
    if (problem?.final) cancelButton.current?.focus();
    else if (problem && !sending && document.activeElement === document.body) confirmButton.current?.focus();
  }, [problem, sending]);

  async function confirm() {
    setProblem(null);
    const confirmation = sends();
    const outcome = await send(confirmation);
    if (outcome === undefined || !confirmation.inSheet()) return;
    if (outcome === null) close();
    else setProblem(outcome);
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="wrap-anywhere">{t("PersonRemoval.title", { firstName: person.firstName })}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-1.5">
            {panel && (
              <p className="flex flex-col gap-0.5 rounded-[10px] bg-muted px-3 py-2 text-foreground">
                {panel.state.map((line) => (
                  <span key={line} className="wrap-anywhere">
                    {line}
                  </span>
                ))}
              </p>
            )}
            {lines.map((line) => (
              <p key={line.leg}>
                {line.key === "drives"
                  ? t("PersonRemoval.drives", { leg: line.leg, passengers: line.passengers }).trim()
                  : t("PersonRemoval.passenger", { leg: line.leg, driver: line.driver })}
              </p>
            ))}
            {panel ? (
              <p>{t("PersonRemoval.notifiedOrganiser", { firstName: person.firstName })}</p>
            ) : (
              cars > 0 && <p>{t("PersonRemoval.notified", { cars })}</p>
            )}
            <p>{t("PersonRemoval.erased")}</p>
            <p>{t("PersonRemoval.final")}</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem.final ? t(`Actions.why.${problem.problem}`) : t(`Actions.${problem.problem}`)}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {!problem?.final && (
          <AlertDialogPrimitive.Action asChild>
            <Button
              ref={confirmButton}
              disabled={sending}
              className="h-11 w-full bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Closed by the answer, not by the press.
                event.preventDefault();
                void confirm();
              }}
            >
              {t("PersonRemoval.confirm")}
            </Button>
          </AlertDialogPrimitive.Action>
        )}
        <AlertDialogCancel ref={cancelButton} className="h-11 w-full">
          {problem?.final ? t("Actions.close") : t("Actions.cancel")}
        </AlertDialogCancel>
      </div>
    </>
  );
}
