import { UserPlus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { storageAvailable } from "@/app/e/[id]/device-token";
import { Button } from "@/components/ui/button";
import type { Leg } from "@/domain/leg";
import type { VisibleCar, VisibleLegBoard } from "@/domain/phone-visibility";
import { sheetCandidates, sheetSubmit } from "@/domain/tap";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { Box } from "./create-event-form";
import { nameList, whyOf, wordsOf, type Why } from "./failure-words";
import { focusCar, focusCarTitle, focusFirstShown } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
import type { BoardDevice } from "./leg-panel";
import type { BarProblem } from "./message-bar";
import { PersonForm, StorageNotice } from "./person-form";

/** A refusal said in the sheet: the car gone (C6.8), too few seats left (C6.5), someone in a car already. */
export type SeatRefusal = "rideGone" | "notEnoughSeats" | "alreadyInCar";

/**
 * What became of the seats asked: in the sheet, a refusal or a problem in its own words (v4.1);
 * in the bar, `why` after the persons who could not get in (C11.11).
 */
export type SeatsTaken =
  | { kind: "done" }
  | { kind: "refused"; refusal: SeatRefusal; why: Why }
  | { kind: "problem"; problem: BarProblem; why: Why };

/** What the server answers `takeSeats`, an unknown event included. */
type SeatsAnswer =
  | { ok: true }
  | { ok: false; error: "invalid" | "forbidden" | "rideGone" | "alreadyInCar" | "seatTaken" | "eventNotFound" }
  | { ok: false; error: "notEnoughSeats"; freeSeats: number };

/**
 * `takeSeats`'s answer as the page says it, for the persons sent, `names`. The sheet has no words
 * of its own for `forbidden`, `eventNotFound` and `invalid`: `failed` there (§ 2.6).
 */
export function seatsTaken(sent: { ok: true; value: SeatsAnswer } | { ok: false; problem: BarProblem }, names: readonly string[]): SeatsTaken {
  if (!sent.ok) return { kind: "problem", problem: sent.problem, why: whyOf(sent.problem) };
  const answer = sent.value;
  if (answer.ok) return { kind: "done" };
  switch (answer.error) {
    case "rideGone":
      return { kind: "refused", refusal: "rideGone", why: whyOf("rideGone") };
    case "alreadyInCar":
      return { kind: "refused", refusal: "alreadyInCar", why: { kind: "alreadyInCar", names } };
    case "seatTaken":
      return { kind: "refused", refusal: "notEnoughSeats", why: whyOf("seatTaken") };
    case "notEnoughSeats":
      return { kind: "refused", refusal: "notEnoughSeats", why: { kind: "notEnoughSeats", free: answer.freeSeats } };
    default:
      return { kind: "problem", problem: "failed", why: whyOf(answer.error) };
  }
}

/** The sheet that sends: whether it still shows what comes back, and what the bar says otherwise. */
export interface SendingSheet extends FromSheet {
  /** True until the answer: « Placer » is inactive meanwhile. */
  sending: (sending: boolean) => void;
  /** Who was sent, into whose car, as the sheet showed them when it sent: what a failure names. */
  seats: { names: string[]; driver: string };
  /** What the bar says of a success. */
  placed: string;
}

/** Takes seats in a car for persons of the device (R6); `undefined` when seats are already on their way. */
export type TakeSeats = (seats: { rideId: string; leg: Leg; personIds: string[] }, sheet: SendingSheet) => Promise<SeatsTaken | undefined>;

/** The car's title, or the active tab once it is gone. */
const toCar = (leg: Leg, rideId: string) => focusFirstShown([() => focusCarTitle(leg, rideId)]);

/** The car a free seat opened the sheet for, and that seat. Each opening is a new sheet. */
type Opening = { rideId: string; driver: string; seat: HTMLElement; open: boolean; count: number };

/**
 * The sheet of a leg's free seats (#91): `openFor(car, seat)` for the free seat's tap, which
 * always opens it here (C5.5; #92 adds the shortcuts), and `sheet`, to render once on the leg.
 * It lives on the leg, not on the car: the car may go while it is open (C6.8). A success
 * closes the sheet that sent it, never one opened since.
 */
export function useSeatSheet(board: VisibleLegBoard, device: BoardDevice, hasRetour: boolean) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const openFor = (car: VisibleCar, seat: HTMLElement) =>
    setOpening((current) => ({ rideId: car.id, driver: car.driver.firstName, seat, open: true, count: (current?.count ?? 0) + 1 }));
  const sheet = opening && (
    <SeatSheet
      key={opening.count}
      leg={board.leg}
      opening={opening}
      car={board.cars.find((car) => car.id === opening.rideId)}
      persons={board.device}
      onOpenChange={(open) => setOpening((current) => (current?.count === opening.count ? { ...current, open } : current))}
      device={device}
      hasRetour={hasRetour}
    />
  );
  return { openFor, sheet };
}

/**
 * « Qui monte dans la voiture de {driver} ? » (R6): under the title, always, the seats left,
 * red when more are ticked than left or after a refusal; one box per person of the device in
 * no car on the leg, her state under her name (C6.1); « Ajouter une personne », whose form
 * takes the list's place and comes back to it with the new person ticked and focused (C6.6);
 * then « Placer n personnes », inactive at none ticked, beyond the seats left and while it is
 * sent, but focusable all along (C6.2, C6.3), and « Fermer ». A success closes it and says so
 * in the bar, the focus on the car's title; a refusal keeps it open with the ticks and its
 * message (C6.5, C6.8). Closed without effect, the focus goes back to the seat that opened it.
 */
function SeatSheet({
  leg,
  opening: { rideId, driver, seat, open },
  car,
  persons,
  onOpenChange,
  device: { takeSeats, addPerson },
  hasRetour,
}: {
  leg: Leg;
  opening: Opening;
  /** The car as the page now shows it; gone when it is no longer offered. */
  car: VisibleCar | undefined;
  /** The device's persons on the leg, as the page now shows them. */
  persons: VisibleLegBoard["device"];
  onOpenChange: (open: boolean) => void;
  device: BoardDevice;
  hasRetour: boolean;
}) {
  const t = useTranslations();
  const words = wordsOf(t, useFormatter());
  const ids = useId();
  const boxId = (personId: string) => `${ids}-${personId}`;
  const candidates = sheetCandidates(persons);
  // What the person changed; the others keep their default (C6.1), a person added since included.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const chosen = candidates.filter((candidate) => ticked[candidate.id] ?? candidate.checked);
  const gone = car === undefined;
  const submit = sheetSubmit(chosen.length, car?.freeSeats ?? 0);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kept: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const afterClose = useRef(() => (seat.isConnected ? seat.focus() : focusFirstShown([focusCar(leg, rideId)])));
  // What gets the focus once the sheet shows it: the form's first field, « Ajouter une personne »,
  // a new person's box, or « Fermer » when the car is gone with the button that had it.
  const focusNext = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const isOpen = useRef(open);
  // Each opening is a new sheet (`key`): the one that sent may be gone. What it says is about the
  // car, and the persons the send carried: a send of all of them withdraws what an earlier one left.
  const sends = useSends(() => isOpen.current, `seats:${rideId}`);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);
  useEffect(() => {
    const target = focusNext.current?.();
    if (!target) return;
    target.focus();
    focusNext.current = null;
  });

  // What the sheet says of a refusal or a problem: the bar names who could not get in instead.
  const said = (taken: Exclude<SeatsTaken, { kind: "done" }>, count: number): string => {
    if (taken.kind === "problem") return t(`Actions.${taken.problem}`);
    const { refusal } = taken;
    return refusal === "notEnoughSeats" ? t("Sheet.notEnoughSeats") : t(`Actions.${refusal}`, { count });
  };

  async function place() {
    if (sending || submit.kind !== "ready") return;
    // In the order of « Vos inscriptions », as shown now.
    const names = chosen.map((person) => person.firstName);
    setRefused(null);
    const personIds = chosen.map((person) => person.id);
    const sheet = sends(personIds);
    const placed =
      names.length === 1 ? t("Seat.placed", { firstName: names[0], driver }) : t("Sheet.placed", { names: nameList(words, names), driver });
    const taken = await takeSeats({ rideId, leg, personIds }, { ...sheet, sending: setSending, seats: { names, driver }, placed });
    // Not the sheet opened since: what came back is the bar's.
    if (taken === undefined || !sheet.inSheet()) return;
    if (taken.kind === "done") {
      afterClose.current = () => toCar(leg, rideId);
      onOpenChange(false);
      return;
    }
    setRefused(said(taken, names.length));
    if (taken.kind === "refused" && taken.refusal === "rideGone") {
      focusNext.current = () => body.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-slot=sheet-footer] button");
    }
  }

  const message = refused ?? (gone && t("Actions.rideGone"));
  // After a refusal for want of seats, the seats left are fewer than those ticked: red too.
  const over = submit.kind === "notEnoughSeats";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={adding ? t("PersonForm.title.add") : t("Sheet.title", { driver })}
      description={
        !adding && car ? (
          <span aria-live="polite" className={cn(over && "font-medium text-destructive")}>
            {t("Sheet.remaining", { count: car.freeSeats })}
          </span>
        ) : undefined
      }
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        afterClose.current();
      }}
      closable={!adding}
      actions={
        !adding && (
          <>
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            {!gone && candidates.length > 0 && (
              // Never `disabled`: the focus would fall out of the sheet while it is sent.
              <Button
                className="h-11 w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                aria-disabled={sending || submit.kind !== "ready" || undefined}
                onClick={() => void place()}
              >
                {t("Sheet.submit", { count: submit.count })}
              </Button>
            )}
          </>
        )
      }
    >
      <div ref={body} className="contents">
        {adding ? (
          <>
            {!adding.kept && <StorageNotice title={t("PersonForm.storage.title")} body={t("PersonForm.storage.body")} />}
            <PersonForm
              mode={{ kind: "add", leg, hasRetour, addPerson }}
              open={() => isOpen.current}
              onDone={(personId) => {
                focusNext.current = () => document.getElementById(boxId(personId));
                setAdding(null);
              }}
              onCancel={() => {
                focusNext.current = () => addButton.current;
                setAdding(null);
              }}
            />
          </>
        ) : (
          !gone && (
            <>
              {candidates.length === 0 ? (
                <p className="text-sm">{t(`Sheet.nobody.${leg}`)}</p>
              ) : (
                <div className="flex flex-col">
                  {candidates.map((candidate) => (
                    <Box
                      key={candidate.id}
                      id={boxId(candidate.id)}
                      label={candidate.firstName}
                      // Ticked by default exactly when without a car (C6.1).
                      hint={candidate.checked ? t("DevicePersons.state.withoutCar") : t(`DevicePersons.state.notConcerned.${leg}`)}
                      checked={ticked[candidate.id] ?? candidate.checked}
                      onChange={(value) => setTicked((current) => ({ ...current, [candidate.id]: value }))}
                    />
                  ))}
                </div>
              )}
              <Button
                ref={addButton}
                variant="outline"
                className="h-11 w-full"
                onClick={() => {
                  focusNext.current = () => body.current?.querySelector("input");
                  setAdding({ kept: storageAvailable() });
                }}
              >
                <UserPlus aria-hidden />
                {t("Board.addPerson")}
              </Button>
            </>
          )
        )}
      </div>
    </BottomSheet>
  );
}
