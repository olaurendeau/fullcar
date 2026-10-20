import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BoardPerson } from "@/domain/board";

/**
 * « Qui sort de la voiture ? » (C8.4), in place of the form « Modifier la voiture » once its
 * seats go below its passengers: the passengers now, none ticked, and « Valider » inactive
 * until exactly passengers − seats are. « Annuler » goes back to the form. After a refusal, a
 * new step says it (`RideChanges.leaving.changed`, C8.5), with the passengers then. Whenever
 * the focus is on nothing (the form's « Valider » gone, this one inactive while it sent), it
 * goes to « Valider » if it can be pressed, to the first box otherwise.
 */
export function LeavingStep({
  passengers,
  seats,
  alert,
  sending,
  onSubmit,
  onCancel,
}: {
  passengers: readonly BoardPerson[];
  seats: number;
  /** A refusal or a failure, said above the boxes. */
  alert: string | null;
  sending: boolean;
  /** The passengers it showed, and who leaves among them. */
  onSubmit: (seen: string[], leaving: string[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const ids = useId();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const submitButton = useRef<HTMLButtonElement>(null);
  const leaving = passengers.length - seats;
  const ready = chosen.length === leaving;
  const firstId = passengers[0] && `${ids}-${passengers[0].id}`;

  useEffect(() => {
    const active = document.activeElement;
    if (sending || (active !== null && active !== document.body)) return;
    if (ready) submitButton.current?.focus();
    else if (firstId) document.getElementById(firstId)?.focus();
  }, [sending, ready, firstId, alert]);

  return (
    <div className="flex flex-col gap-3.5">
      <div id={`${ids}-body`} className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{t("RideChanges.leaving.body", { passengers: passengers.length, seats, leaving })}</p>
        <p>{t("RideChanges.leaving.rule")}</p>
      </div>
      {alert && (
        <p role="alert" className="text-sm text-destructive">
          {alert}
        </p>
      )}
      <div role="group" aria-labelledby={`${ids}-body`} className="flex flex-col">
        {passengers.map(({ id, firstName }) => (
          <label key={id} htmlFor={`${ids}-${id}`} className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <Checkbox
              id={`${ids}-${id}`}
              checked={chosen.includes(id)}
              onCheckedChange={(on) => setChosen((now) => (on === true ? [...now, id] : now.filter((other) => other !== id)))}
            />
            <span className="min-w-0 text-sm font-medium wrap-anywhere">{firstName}</span>
          </label>
        ))}
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t("RideChanges.leaving.count", { chosen: chosen.length, leaving })}
      </p>
      <Button
        ref={submitButton}
        className="h-11 w-full"
        disabled={sending || !ready}
        onClick={() => onSubmit(passengers.map(({ id }) => id), [...chosen])}
      >
        {t("Actions.submit")}
      </Button>
      <Button variant="outline" className="h-11 w-full" onClick={onCancel}>
        {t("Actions.cancel")}
      </Button>
    </div>
  );
}
