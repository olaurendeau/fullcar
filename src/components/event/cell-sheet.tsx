import { Car, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeviceState } from "@/domain/board";
import { cellActions, declaredBy, type CellAction } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { focusCarTitle, focusCell } from "./focus";
import type { BarProblem } from "./message-bar";

/**
 * Declares one of the device's persons without a car, or not concerned, on a leg
 * (`setPersonLeg`). `null` once done; the problem to show otherwise; `undefined` when the
 * same change is already on its way. `open` says whether the sheet still shows: a problem
 * goes to the bar once it is closed.
 */
export type SetPersonLeg = (
  change: { personId: string; leg: Leg; kind: "withoutCar" | "notConcerned" },
  open: () => boolean,
) => Promise<BarProblem | null | undefined>;

/**
 * The sheet of a cell of « Vos inscriptions » (#89, « Les cellules »): « {prénom} · {leg} »,
 * the person's state on that leg in a box, amber without a car, then its actions in the
 * README's order. An action that succeeds closes it, and the focus goes to the cell, which
 * reads its new state; one refused keeps it open with its message, over the page's current
 * state. « Voir la voiture » makes the leg's tab active and gives the focus to the car's title.
 * Closed by « Fermer » or Escape, it gives the focus back to the cell.
 */
export function CellSheet({
  person,
  leg,
  state,
  open,
  onOpenChange,
  setPersonLeg,
  showLeg,
}: {
  person: { id: string; firstName: string };
  leg: Leg;
  /** The page's current state of the person on `leg`. */
  state: DeviceState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setPersonLeg: SetPersonLeg;
  /** Makes `leg`'s tab the active one. */
  showLeg: (leg: Leg) => void;
}) {
  const t = useTranslations("DevicePersons");
  const tLegs = useTranslations("Event.legs");
  const tActions = useTranslations("Actions");
  const [problem, setProblem] = useState<BarProblem | null>(null);
  const afterClose = useRef(() => focusCell(person.id, leg));
  const isOpen = useRef(open);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  async function declare(action: Exclude<CellAction, "seeCar">) {
    const change = { personId: person.id, leg, kind: declaredBy(action) };
    const outcome = await setPersonLeg(change, () => isOpen.current);
    if (outcome === undefined) return;
    setProblem(outcome);
    if (outcome === null) onOpenChange(false);
  }

  function seeCar(rideId: string) {
    showLeg(leg);
    afterClose.current = () => focusCarTitle(leg, rideId);
    onOpenChange(false);
  }

  const label: Record<CellAction, string> = {
    seeCar: t("seeCar"),
    leaveCar: t("leaveCar"),
    notConcerned: t(`notConcerned.${leg}`),
    lookingForSeat: t("lookingForSeat"),
  };
  const Icon = state.kind === "withoutCar" ? Users : state.kind === "notConcerned" ? null : Car;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("sheetTitle", { firstName: person.firstName, leg: tLegs(leg) })}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        afterClose.current();
      }}
    >
      <p
        className={cn(
          "flex items-start gap-2 rounded-[10px] px-3 py-2.5",
          state.kind === "withoutCar" ? "bg-amber-100 text-amber-950" : "bg-muted",
        )}
      >
        {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 wrap-anywhere">
          {state.kind === "passenger"
            ? t("state.passenger", { driver: state.driver.firstName })
            : state.kind === "notConcerned"
              ? t(`state.notConcerned.${leg}`)
              : t(`state.${state.kind}`)}
        </span>
      </p>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {tActions(problem)}
        </p>
      )}
      {cellActions(state).map((action) => (
        <Button
          key={action}
          variant="outline"
          className="h-auto min-h-11 w-full whitespace-normal"
          onClick={() => {
            if (action !== "seeCar") void declare(action);
            else if (state.kind === "driver" || state.kind === "passenger") seeCar(state.rideId);
          }}
        >
          {label[action]}
        </Button>
      ))}
    </BottomSheet>
  );
}
