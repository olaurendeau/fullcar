import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
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
import { HidesPage, useSends, type FromSheet } from "./hidden-page";
import type { BarProblem } from "./message-bar";

/**
 * Removes one of the device's persons from the event (`removePerson`, remove-person v2, RP1):
 * `null` once done, `alreadyRemoved` included (RP1.8); the problem to show otherwise, `undefined`
 * when it is on its way already. A problem the confirmation no longer shows goes to the bar.
 */
export type RemovePerson = (
  removal: { personId: string; firstName: string; sending: (sending: boolean) => void },
  confirmation: FromSheet,
) => Promise<BarProblem | null | undefined>;

interface Person {
  id: string;
  firstName: string;
}

/**
 * « Retirer de l’événement » in the sheet of one of the device's persons, under « Modifier »
 * (RP1.1), and its confirmation (RP1.2). The removal stays inactive, on each opening, until its
 * answer (RP1.4). Removed, the person goes with her sheet, this button and its confirmation: the
 * sheet's closing gives the focus to the next first name (RP1.5).
 */
export function RemovePersonButton({
  person,
  removal,
  removePerson,
}: {
  person: Person;
  /** What the confirmation says, counted on the state the page shows (decision 15). */
  removal: RemovalConfirmation;
  removePerson: RemovePerson;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // Each opening is a new confirmation, even one reopened while it closes.
  const [opened, setOpened] = useState(0);
  const [sending, setSending] = useState(false);
  const isOpen = useRef(false);

  const toggle = (next: boolean) => {
    if (next) setOpened((count) => count + 1);
    isOpen.current = next;
    setOpen(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={toggle}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-11 w-full text-destructive hover:text-destructive aria-expanded:text-destructive">
          <Trash2 aria-hidden />
          {t("DevicePersons.remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <HidesPage />
        <Confirmation
          key={opened}
          person={person}
          removal={removal}
          isOpen={() => isOpen.current}
          sending={sending}
          send={(confirmation) => removePerson({ personId: person.id, firstName: person.firstName, sending: setSending }, confirmation)}
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
 * one that sent; in the bar otherwise, once nothing hides the page.
 */
function Confirmation({
  person,
  removal: { lines, cars },
  isOpen,
  sending,
  send,
  close,
}: {
  person: Person;
  removal: RemovalConfirmation;
  isOpen: () => boolean;
  sending: boolean;
  send: (confirmation: FromSheet) => Promise<BarProblem | null | undefined>;
  close: () => void;
}) {
  const t = useTranslations();
  const [problem, setProblem] = useState<BarProblem | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const sends = useSends(isOpen, `removePerson:${person.id}`);

  // The confirmation button lost the focus while it was inactive: after a failure, it gets it back.
  useEffect(() => {
    if (problem && !sending && document.activeElement === document.body) confirmButton.current?.focus();
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
            {lines.map((line) => (
              <p key={line.leg}>
                {line.key === "drives"
                  ? t("PersonRemoval.drives", { leg: line.leg, passengers: line.passengers }).trim()
                  : t("PersonRemoval.passenger", { leg: line.leg, driver: line.driver })}
              </p>
            ))}
            {cars > 0 && <p>{t("PersonRemoval.notified", { cars })}</p>}
            <p>{t("PersonRemoval.erased")}</p>
            <p>{t("PersonRemoval.final")}</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {t(`Actions.${problem}`)}
        </p>
      )}
      <div className="flex flex-col gap-2">
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
        <AlertDialogCancel className="h-11 w-full">{t("Actions.cancel")}</AlertDialogCancel>
      </div>
    </>
  );
}
