import { Car, Pencil, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeviceState } from "@/domain/board";
import { cellActions, declaredBy, deviceMatrix, otherPersonActions, type CellAction, type CellChange } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import { removalConfirmation, type RemovalConfirmation } from "@/domain/person-removal";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import { findSeat } from "@/domain/tap";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import type { CellSending, SetPersonLeg } from "./cell-sheet";
import { cellNotDone, type NotDone } from "./failure-words";
import { focusAfterRemoval, focusBoardName, focusFirstShown, focusFreeSeat, focusNotConcerned, focusOffer } from "./focus";
import { useSends } from "./hidden-page";
import type { BoardDevice } from "./leg-panel";
import type { BarProblem } from "./message-bar";
import { PersonForm, type UpdatePerson } from "./person-form";
import { PhoneLink } from "./phone-link";
import { RemovePersonButton, type RemovePerson } from "./remove-person-dialog";
import type { OpenPerson } from "./without-car-list";

/**
 * What the sheet of a person of the board can show of her state on its leg. « Sans voiture » and
 * « Ne fait pas ce leg » come from the lists under the cars (PL1.1, PL1.2); a passenger comes from
 * the card of her car (PL1.3, #982).
 */
export type BoardPersonState = Extract<DeviceState, { kind: "withoutCar" | "notConcerned" | "passenger" }>;

/**
 * « Sortir de la voiture » for a passenger of any device (#982): `undoSeats` with her state before,
 * `withoutCar`, so that a person who entered another car meanwhile stays there (PL4.5). It answers
 * as `SetPersonLeg` does; when she was already out, the bar says so, without « Annuler » (PL3.7).
 */
export type LeaveCar = (request: { personId: string; rideId: string; leg: Leg }, sheet: CellSending) => ReturnType<SetPersonLeg>;

/** What only the device's own persons have: her number, whether she drives, and what her removal says. */
interface Own {
  phone: string | null;
  drives: boolean;
  removal: RemovalConfirmation;
  updatePerson: UpdatePerson;
  removePerson: RemovePerson;
}

/** The person as she was when the sheet opened: what it shows while it closes, once she is gone. */
type Opening = { id: string; firstName: string; state: BoardPersonState; phone: string | null; open: boolean; count: number; order: string[] };

/** Person `id` in a car of the leg, as the card shows her: her state, and the number it carries (PL3.5). */
function inCar({ cars }: VisibleLegBoard, id: string): { state: Extract<BoardPersonState, { kind: "passenger" }>; phone: string | null } | undefined {
  for (const car of cars) {
    const passenger = car.passengers.find((candidate) => candidate.id === id);
    if (passenger) return { state: { kind: "passenger", rideId: car.id, driver: { id: car.driver.id, firstName: car.driver.firstName } }, phone: passenger.phone };
  }
  return undefined;
}

/**
 * The sheets of the persons listed under a leg's cars (#981) or passengers of one (#982): `open(person, state)` for the
 * button touched, `sheet` rendered once on the leg. Each opening is a new sheet. `legs` are the
 * event's legs as the page shows them, for her number and for what her removal says.
 */
export function useBoardPersonSheet(board: VisibleLegBoard, legs: readonly VisibleLegBoard[], device: BoardDevice) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const open: OpenPerson = (person, kind) => {
    // From the card of her car she is a passenger, with her driver and the number the state carries; from a list, her list's state.
    const car = kind === "passenger" ? inCar(board, person.id) : undefined;
    const state: BoardPersonState | undefined = kind === "passenger" ? car?.state : { kind };
    if (!state) return;
    setOpening((current) => ({
      id: person.id,
      firstName: person.firstName,
      state,
      phone: car?.phone ?? null,
      open: true,
      count: (current?.count ?? 0) + 1,
      order: deviceMatrix(legs).map(({ id }) => id),
    }));
  };
  const onOpenChange = (count: number) => (isOpen: boolean) =>
    setOpening((current) => (current?.count === count ? { ...current, open: isOpen } : current));

  let sheet = null;
  if (opening) {
    const { id } = opening;
    const car = inCar(board, id);
    const listed = board.withoutCar.some((person) => person.id === id)
      ? "withoutCar"
      : board.notConcerned.some((person) => person.id === id)
        ? "notConcerned"
        : undefined;
    // Her state on this leg as the page shows it now, where the sheet was opened from: her list, or her car.
    // Out of that car (to the list, to another car, or gone) or out of her list, the sheet closes over what it showed:
    // an action never applies to a place the user did not open it from.
    const shown: BoardPersonState | undefined =
      opening.state.kind === "passenger" ? (car?.state.rideId === opening.state.rideId ? car.state : undefined) : listed && { kind: listed };
    const own = legs.flatMap((leg) => leg.device).find((person) => person.id === id);
    sheet = (
      <BoardPersonSheet
        key={opening.count}
        person={{ id, firstName: opening.firstName }}
        leg={board.leg}
        state={shown ?? opening.state}
        phone={car ? car.phone : opening.phone}
        open={opening.open && shown !== undefined}
        present={listed !== undefined}
        onOpenChange={onOpenChange(opening.count)}
        setPersonLeg={device.setPersonLeg}
        leaveCar={device.leaveCar}
        own={
          own && {
            phone: own.phone,
            drives: legs.some((leg) => leg.device.some((person) => person.id === id && person.state.kind === "driver")),
            removal: removalConfirmation(legs, id),
            updatePerson: device.updatePerson,
            removePerson: device.removePerson,
          }
        }
        freeCar={findSeat(board)?.id}
        inform={device.inform}
        pickSeat={device.pickSeat}
        order={opening.order}
      />
    );
  }
  return { open, sheet };
}

/**
 * The sheet of a person listed under a leg's cars (#981), « {prénom} · {leg} »: her state in a
 * box, amber without a car, then her actions. One of the device's persons has those of her cell
 * in « Vos inscriptions » (PL3.3), « Trouver une place » included, then « Modifier » and « Retirer
 * de l’événement » as her sheet there (PL1.3b). One of another device (PL3.2) has « Ne fait pas
 * le retour », or « Passer sans voiture » if she does not do the leg, and a sentence that says why
 * she has nothing more (PL3.4, D7); her « Trouver une place » comes with its mode (#983). A passenger,
 * opened from the card of her car, is « Dans la voiture de {conducteur} »: « Sortir de la voiture » and
 * « Ne fait pas le retour », never « Voir la voiture », where one already is (PL3.2); under the state,
 * her number when the state received carries it (PL3.5), and « Modifier » and « Retirer » if she is the device's (PL1.3b).
 *
 * An action that succeeds closes it, with no message (PL3.6, PL4.2; already so, in silence,
 * PL3.7); one refused keeps it open with its message. Closed, the focus goes back to her first name
 * in the lists, or to the fold that holds it; removed, to the next person of « Vos inscriptions ».
 */
function BoardPersonSheet({
  person,
  leg,
  state,
  open,
  present,
  onOpenChange,
  setPersonLeg,
  leaveCar,
  phone,
  own,
  freeCar,
  inform,
  pickSeat,
  order,
}: {
  person: { id: string; firstName: string };
  leg: Leg;
  state: BoardPersonState;
  open: boolean;
  /** She is in one of the leg's lists now, wherever she was opened from: not in a car, nor gone with a removal. */
  present: boolean;
  onOpenChange: (open: boolean) => void;
  setPersonLeg: SetPersonLeg;
  leaveCar: LeaveCar;
  /** The number the state carries for a passenger (PL3.5): read from it, never derived. */
  phone: string | null;
  /** Present for one of the device's persons. */
  own?: Own;
  /** The first car of `leg` with a free seat, if any. */
  freeCar: string | undefined;
  inform: BoardDevice["inform"];
  /** The page's mode of « Trouver une place » for a person of another device (PL3.8). */
  pickSeat: BoardDevice["pickSeat"];
  /** The device's persons as « Vos inscriptions » listed them at the opening, for the focus after a removal (RP1.5). */
  order: readonly string[];
}) {
  const t = useTranslations();
  const tActions = useTranslations("Actions");
  const [problem, setProblem] = useState<BarProblem | null>(null);
  // The first name when « Modifier » was pressed: the title stays while the sheet closes.
  const [editing, setEditing] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const isOpen = useRef(open);
  const isPresent = useRef(present);
  // Her first name; or its fold, closed; or, she gone, the next person of « Vos inscriptions » (RP1.5); never <body>.
  const afterClose = useRef<() => unknown>(() =>
    focusFirstShown([
      () => focusBoardName(person.id, leg),
      () => isPresent.current && focusNotConcerned(leg),
      () => focusAfterRemoval(order, person.id),
    ]),
  );
  // The same subject as the cell of « Vos inscriptions »: a sheet of the same person and leg withdraws its failure.
  const sends = useSends(() => isOpen.current, `cell:${person.id}:${leg}`);
  useEffect(() => {
    isOpen.current = open;
    isPresent.current = present;
  }, [open, present]);

  // A refusal can change the actions. Radix then puts the focus on the sheet itself, and it goes to the first action.
  useEffect(() => {
    const active = document.activeElement;
    if (problem && (active === document.body || active?.getAttribute("role") === "dialog")) first.current?.focus();
  }, [problem, state.kind]);

  async function declare(action: CellChange) {
    const change = { personId: person.id, leg, kind: declaredBy(action) };
    const cell = { firstName: person.firstName, leg, state };
    // « Sortir de la voiture » names the car, which only a passenger has to leave.
    const notDone: NotDone = own || state.kind === "passenger"
      ? cellNotDone(action, cell)
      : { kind: "choice", firstName: person.firstName, leg, choice: action === "notConcerned" ? "notConcerned" : "setWithoutCar" };
    const sheet = { ...sends(), cell, notDone };
    const outcome =
      action === "leaveCar" && state.kind === "passenger"
        ? await leaveCar({ personId: person.id, rideId: state.rideId, leg }, sheet)
        : await setPersonLeg(change, sheet);
    if (outcome === undefined) return;
    const closes = outcome === null || outcome === "noRetour" || outcome === "personGone";
    if (sheet.inSheet()) setProblem(closes ? null : outcome);
    if (closes) onOpenChange(false);
  }

  // Nothing sent, nobody placed (v4-6). Without a free seat, an information, written once the sheet is gone.
  // One of another device enters the page's mode: its information, and the next tap on a free seat seats her (PL3.8).
  function findSeatOnLeg() {
    const car = freeCar;
    const offer = () => focusOffer(leg);
    if (car === undefined) inform({ text: t(`DevicePersons.noFreeSeat.${leg}`), landmark: offer }, leg);
    else if (!own) pickSeat.start({ personId: person.id, firstName: person.firstName, leg }, { text: t("OtherPerson.pickSeat", { firstName: person.firstName }), landmark: () => focusFreeSeat(leg, car) });
    afterClose.current = () => focusFirstShown(car === undefined ? [offer] : [() => focusFreeSeat(leg, car), offer]);
    onOpenChange(false);
  }

  // « Voir la voiture » has nothing to show where one already is (PL3.2).
  const actions: CellAction[] = (own ? cellActions(state) : otherPersonActions(state)).filter((action) => action !== "seeCar");
  const label: Record<CellAction, string> = {
    seeCar: t("DevicePersons.seeCar"),
    findSeat: t("DevicePersons.findSeat"),
    leaveCar: t("DevicePersons.leaveCar"),
    notConcerned: t(`DevicePersons.notConcerned.${leg}`),
    lookingForSeat: own ? t("DevicePersons.lookingForSeat") : t("OtherPerson.setWithoutCar"),
  };
  const Icon = state.kind === "withoutCar" ? Users : state.kind === "notConcerned" ? null : Car;
  const form = own && editing !== null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing === null ? t("DevicePersons.sheetTitle", { firstName: person.firstName, leg: t(`Event.legs.${leg}`) }) : t("PersonForm.title.edit", { firstName: editing })}
      // « Modifier {prénom} » has fields: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight={form}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        afterClose.current();
      }}
    >
      {own && form ? (
        <PersonForm
          mode={{ kind: "edit", person: { id: person.id, firstName: person.firstName, phone: own.phone, drives: own.drives }, updatePerson: own.updatePerson }}
          open={() => isOpen.current}
          onDone={() => onOpenChange(false)}
        />
      ) : (
        <>
          <p
            className={cn(
              "flex items-start gap-2 rounded-[10px] px-3 py-2.5",
              state.kind === "withoutCar" ? "bg-amber-100 text-amber-950" : "bg-muted",
            )}
          >
            {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 wrap-anywhere">
              {state.kind === "passenger"
                ? t("DevicePersons.state.passenger", { driver: state.driver.firstName })
                : state.kind === "notConcerned"
                  ? t(`DevicePersons.state.notConcerned.${leg}`)
                  : t("DevicePersons.state.withoutCar")}
            </span>
          </p>
          {state.kind === "passenger" && phone && <PhoneLink firstName={person.firstName} phone={phone} />}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {tActions(problem)}
            </p>
          )}
          {actions.map((action, index) => (
            <Button
              key={action}
              ref={index === 0 ? first : undefined}
              variant={action === "findSeat" ? "default" : "outline"}
              className="h-auto min-h-11 w-full whitespace-normal"
              onClick={() => {
                if (action === "findSeat") findSeatOnLeg();
                else if (action !== "seeCar") void declare(action);
              }}
            >
              {label[action]}
            </Button>
          ))}
          {own ? (
            <>
              <Button variant="outline" className="h-11 w-full" onClick={() => setEditing(person.firstName)}>
                <Pencil aria-hidden />
                {t("DevicePersons.edit")}
              </Button>
              <RemovePersonButton person={person} removal={own.removal} removePerson={own.removePerson} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground wrap-anywhere">{t("OtherPerson.note")}</p>
          )}
        </>
      )}
    </BottomSheet>
  );
}
