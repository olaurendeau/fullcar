import { Car, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeviceState } from "@/domain/board";
import { cellActions, declaredBy, type CellAction, type CellChange } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { cellNotDone, type Cell, type NotDone } from "./failure-words";
import type { Message } from "./bar-state";
import { focusCarTitle, focusCell, focusFirstShown, focusFreeSeat, focusOffer } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
import type { BarProblem } from "./message-bar";

/** The cell's sheet that sends: what a failure in the bar names, as the sheet showed it at the send (C11.11). */
export interface CellSending extends FromSheet {
  cell: Cell;
  notDone: NotDone;
}

/**
 * Declares one of the device's persons without a car, or not concerned, on a leg
 * (`setPersonLeg`). `null` once done; `noRetour` when the leg is gone, which closes the sheet
 * as the bar says why (rule 9), or, out of a car or not doing the retour, that the retour is
 * gone, an information (decision 45); the problem to show otherwise; `undefined` when a change from
 * this sheet is already on its way (#167). A problem the sheet no longer shows goes to the bar.
 */
export type SetPersonLeg = (
  change: { personId: string; leg: Leg; kind: "withoutCar" | "notConcerned" },
  sheet: CellSending,
) => Promise<BarProblem | "noRetour" | null | undefined>;

/**
 * The sheet of a cell of « Vos inscriptions » (#89, « Les cellules »): « {prénom} · {leg} »,
 * the person's state on that leg in a box, amber without a car, then its actions in the
 * README's order. An action that succeeds closes it, and the focus goes to the cell, which
 * reads its new state; one refused keeps it open with its message, over the page's current
 * state, and the focus on the first action if the one it was on is gone. « Voir la voiture »
 * makes the leg's tab active and gives the focus to the car's title. Closed by « Fermer » or Escape, it gives the focus back to the cell.
 *
 * « Trouver une place » (C3.8, v4-6) sends nothing and places nobody: it closes, makes the leg's
 * tab active, and gives the focus to the first free seat of `freeCar`, scrolled into view. With
 * no free seat on the leg, the bar says so, an information, and the focus goes to « Proposer une
 * voiture » of the leg; never to <body> (rule 8).
 */
export function CellSheet({
  person,
  leg,
  state,
  open,
  onOpenChange,
  setPersonLeg,
  showLeg,
  freeCar,
  inform,
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
  /** The first car of `leg` with a free seat (`findSeat`), if any. */
  freeCar: string | undefined;
  /** Writes an information about `leg` in the bar, once no sheet hides the page. */
  inform: (message: Message, leg: Leg) => void;
}) {
  const t = useTranslations("DevicePersons");
  const tLegs = useTranslations("Event.legs");
  const tActions = useTranslations("Actions");
  const [problem, setProblem] = useState<BarProblem | null>(null);
  const afterClose = useRef<() => unknown>(() => focusCell(person.id, leg));
  const first = useRef<HTMLButtonElement>(null);
  const isOpen = useRef(open);
  // Each opening is a new sheet (`key`): the one that sent may be gone. What it says is about the cell.
  const sends = useSends(() => isOpen.current, `cell:${person.id}:${leg}`);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  // A refusal can change the actions (`drives`: « Voir la voiture » alone). Radix then puts the
  // focus on the sheet itself, and it goes to the first action.
  useEffect(() => {
    const active = document.activeElement;
    if (problem && (active === document.body || active?.getAttribute("role") === "dialog")) first.current?.focus();
  }, [problem, state.kind]);

  async function declare(action: CellChange) {
    const change = { personId: person.id, leg, kind: declaredBy(action) };
    const cell = { firstName: person.firstName, leg, state };
    const sheet = { ...sends(), cell, notDone: cellNotDone(action, cell) };
    const outcome = await setPersonLeg(change, sheet);
    if (outcome === undefined) return;
    if (sheet.inSheet()) setProblem(outcome === "noRetour" ? null : outcome);
    // Done, or its leg gone (rule 9): it closes, the focus back on the cell, shown until then.
    if (outcome === null || outcome === "noRetour") onOpenChange(false);
  }

  function seeCar(rideId: string) {
    showLeg(leg);
    afterClose.current = () => focusCarTitle(leg, rideId);
    onOpenChange(false);
  }

  // Nothing sent, nobody placed (v4-6). Without a free seat, an information, written once the sheet is gone.
  function findSeat() {
    const car = freeCar;
    const offer = () => focusOffer(leg);
    showLeg(leg);
    if (car === undefined) inform({ text: t(`noFreeSeat.${leg}`), landmark: offer }, leg);
    afterClose.current = () => focusFirstShown(car === undefined ? [offer] : [() => focusFreeSeat(leg, car), offer]);
    onOpenChange(false);
  }

  const label: Record<CellAction, string> = {
    seeCar: t("seeCar"),
    findSeat: t("findSeat"),
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
      {cellActions(state).map((action, index) => (
        <Button
          key={action}
          ref={index === 0 ? first : undefined}
          variant={action === "findSeat" ? "default" : "outline"}
          className="h-auto min-h-11 w-full whitespace-normal"
          onClick={() => {
            if (action === "findSeat") findSeat();
            else if (action !== "seeCar") void declare(action);
            else if (state.kind === "driver" || state.kind === "passenger") seeCar(state.rideId);
          }}
        >
          {label[action]}
        </Button>
      ))}
    </BottomSheet>
  );
}
