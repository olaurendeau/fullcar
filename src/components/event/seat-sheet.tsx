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
import { focusBanner, focusCarTitle, focusLandmark } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
import type { BoardDevice } from "./leg-panel";
import type { BarMessage, BarProblem } from "./message-bar";
import { PersonForm, StorageNotice } from "./person-form";

/** A refusal said in the sheet: the car gone (C6.8), too few seats left (C6.5), someone in a car already. */
export type SeatRefusal = "rideGone" | "notEnoughSeats" | "alreadyInCar";

/** What became of the seats asked. */
export type SeatsTaken = { kind: "done" } | { kind: "refused"; refusal: SeatRefusal } | { kind: "problem"; problem: BarProblem };

/** `takeSeats`'s answer as the page says it. The refusals with no words of their own are `failed` (§ 2.6). */
export function seatsTaken(answer: { ok: true } | { ok: false; error: string }): SeatsTaken {
  if (answer.ok) return { kind: "done" };
  if (answer.error === "rideGone" || answer.error === "alreadyInCar") return { kind: "refused", refusal: answer.error };
  if (answer.error === "notEnoughSeats" || answer.error === "seatTaken") return { kind: "refused", refusal: "notEnoughSeats" };
  return { kind: "problem", problem: "failed" };
}

/** The sheet that sends: whether it still shows what comes back, and what the bar says otherwise. */
export interface SendingSheet extends FromSheet {
  /** True until the answer: « Placer » is inactive meanwhile. */
  sending: (sending: boolean) => void;
  said: (taken: SeatsTaken) => BarMessage;
}

/** Takes seats in a car for persons of the device (R6); `undefined` when seats are already on their way. */
export type TakeSeats = (seats: { rideId: string; leg: Leg; personIds: string[] }, sheet: SendingSheet) => Promise<SeatsTaken | undefined>;

/** The car's title, or the active tab once it is gone. */
function toCar(leg: Leg, rideId: string) {
  if (!focusCarTitle(leg, rideId)) focusLandmark();
}

/** After a refusal that may remove the target: the car's title if it is still there, else the leg's banner (README). */
function toCarOrBanner(leg: Leg, rideId: string) {
  if (!focusCarTitle(leg, rideId) && !focusBanner(leg)) focusLandmark();
}

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
  const format = useFormatter();
  const ids = useId();
  const boxId = (personId: string) => `${ids}-${personId}`;
  const candidates = sheetCandidates(persons);
  // What the person changed; the others keep their default (C6.1), a person added since included.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const chosen = candidates.filter((candidate) => ticked[candidate.id] ?? candidate.checked);
  const gone = car === undefined;
  const submit = sheetSubmit(chosen.length, car?.freeSeats ?? 0);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<BarMessage | null>(null);
  const [adding, setAdding] = useState<{ kept: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const afterClose = useRef(() => (seat.isConnected ? seat.focus() : toCarOrBanner(leg, rideId)));
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

  // What is said of an outcome, in the sheet or in the bar: the same words.
  const said = (taken: SeatsTaken, names: string[]): BarMessage => {
    if (taken.kind === "problem") return taken;
    if (taken.kind === "refused") {
      const { refusal } = taken;
      const text = refusal === "notEnoughSeats" ? t("Sheet.notEnoughSeats") : t(`Actions.${refusal}`, { count: names.length });
      return { kind: "refused", text, landmark: () => toCarOrBanner(leg, rideId) };
    }
    const text = names.length === 1 ? t("Seat.placed", { firstName: names[0], driver }) : t("Sheet.placed", { names: format.list(names), driver });
    return { kind: "done", text, landmark: () => toCar(leg, rideId) };
  };

  async function place() {
    if (sending || submit.kind !== "ready") return;
    const names = chosen.map((person) => person.firstName);
    setRefused(null);
    const personIds = chosen.map((person) => person.id);
    const sheet = sends(personIds);
    const taken = await takeSeats({ rideId, leg, personIds }, { ...sheet, sending: setSending, said: (outcome) => said(outcome, names) });
    // Not the sheet opened since: what came back is the bar's.
    if (taken === undefined || !sheet.inSheet()) return;
    if (taken.kind === "done") {
      afterClose.current = () => toCar(leg, rideId);
      onOpenChange(false);
      return;
    }
    setRefused(said(taken, names));
    if (taken.kind === "refused" && taken.refusal === "rideGone") {
      focusNext.current = () => body.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-slot=sheet-footer] button");
    }
  }

  const message = refused ? (refused.kind === "problem" ? t(`Actions.${refused.problem}`) : refused.text) : gone && t("Actions.rideGone");
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
