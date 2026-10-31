import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VisibleCar, VisibleLegBoard } from "@/domain/phone-visibility";
import type { WallDate } from "@/domain/wall-clock";
import { BottomSheet } from "./bottom-sheet";
import { personGone, whyOf, wordsOf, type Why, type Words } from "./failure-words";
import { focusCar, focusFirstShown } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
import type { BoardDevice } from "./leg-panel";
import { StopChoice } from "./stop-choice";

/** What the server answers `setBoardingStop`, an unknown event included. */
type StopAnswer =
  | { ok: true; stopGone?: true }
  | { ok: false; error: "invalid" | "forbidden" | "rideGone" | "notInCar" | "stopsOff" | "eventNotFound" | "eventEnded" }
  | { ok: false; error: "personGone"; goneIds: string[] };

/**
 * What became of the point asked (RV4.3): a success, which may be `stopGone` (the point went
 * before the send, the person boards at the car's start); a failure, said in the sheet by the
 * `Actions` key `message` and in the bar by `why`; or the person removed from the event, which
 * closes the sheet, the bar naming her (RP5.4).
 */
export type StopChanged =
  | { kind: "done"; stopGone?: true }
  | { kind: "failed"; message: "offline" | "failed" | "rideGone"; why: Why }
  | { kind: "personGone"; why: Why };

/** `setBoardingStop`'s answer as the page says it, for `person`, as the sheet showed her. */
export function boardingStopTaken(
  sent: { ok: true; value: StopAnswer } | { ok: false; problem: "offline" | "failed" },
  person: { id: string; firstName: string },
): StopChanged {
  if (!sent.ok) return { kind: "failed", message: sent.problem, why: whyOf(sent.problem) };
  const answer = sent.value;
  if (answer.ok) return answer.stopGone ? { kind: "done", stopGone: true } : { kind: "done" };
  switch (answer.error) {
    case "personGone":
      return { kind: "personGone", why: personGone([person], answer.goneIds) };
    case "rideGone":
      return { kind: "failed", message: "rideGone", why: whyOf("rideGone") };
    case "forbidden":
    case "eventNotFound":
    case "eventEnded":
      return { kind: "failed", message: "failed", why: whyOf(answer.error) };
    default:
      // `invalid`, `stopsOff` and `notInCar` come from a page out of date: nothing of its own to say.
      return { kind: "failed", message: "failed", why: whyOf("failed") };
  }
}

/** What the bar says of a point changed (RV4.2): at `place`, or at the car's start with none. */
export function boardingStopText(words: Words, firstName: string, place: string | null): string {
  return place === null ? words.t("Sheet.stop.changedStart", { firstName }) : words.t("Sheet.stop.changed", { firstName, place });
}

/** The sheet that sends: whether it still shows what comes back, and what the bar says otherwise. */
export interface SendingStop extends FromSheet {
  /** True until the answer: « Valider » is inactive meanwhile. */
  sending: (sending: boolean) => void;
  firstName: string;
  /** What the bar says of a success. */
  said: string;
  /** What the bar says once « Annuler » gave the point before back. */
  restored: string;
}

/** Puts a person of the device, already in a car of the aller, at a Stop of it or at its start (`null`), as RV4.2 has it. */
export type SetBoardingStop = (
  request: {
    rideId: string;
    personId: string;
    /** The Stop where she boards; `null`: at the car's start. */
    stopId: string | null;
    /** The point she boarded at, which « Annuler » sends again. */
    before: string | null;
  },
  sheet: SendingStop,
) => Promise<StopChanged | undefined>;

/** The point where `personId` boards in `car`: a Stop's id, `null` at its start. */
export const boardingStopOf = (car: VisibleCar, personId: string): string | null =>
  car.stops.find(({ passengerIds }) => passengerIds.includes(personId))?.id ?? null;

/** The person whose point changes, and the button that opened the sheet. */
type Opening = { rideId: string; personId: string; firstName: string; button: HTMLElement; open: boolean; count: number };

/**
 * « Changer le point » (#892): `change(car, person, button)` opens the sheet for a passenger of the
 * device, `sheet` renders once on the leg. Each opening is a new sheet.
 */
export function useStopSheet(board: VisibleLegBoard, device: BoardDevice, date: WallDate) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const change = (car: VisibleCar, person: { id: string; firstName: string }, button: HTMLElement) =>
    setOpening((current) => ({ rideId: car.id, personId: person.id, firstName: person.firstName, button, open: true, count: (current?.count ?? 0) + 1 }));
  const onOpenChange = (count: number) => (open: boolean) =>
    setOpening((current) => (current?.count === count ? { ...current, open } : current));
  const sheet = opening && (
    <StopSheet
      key={opening.count}
      opening={opening}
      car={board.cars.find((car) => car.id === opening.rideId)}
      date={date}
      onOpenChange={onOpenChange(opening.count)}
      setBoardingStop={device.setBoardingStop}
    />
  );
  return { change, sheet };
}

/**
 * « Où monte {prénom} ? » (RV4.2, RV4.3, RV7.2): the car's departure and each of its Stops, the
 * point of now ticked and focused, « Annuler » and « Valider ». The same point closes it without
 * a write; a success closes it and the bar says so, with « Annuler »; a failure keeps it open
 * with the choice, says it, and the focus goes to « Valider ». The car gone, it says so and only
 * « Fermer » is left. Closed, the focus goes back to the button that opened it.
 */
function StopSheet({
  opening: { rideId, personId, firstName, button, open },
  car,
  date,
  onOpenChange,
  setBoardingStop,
}: {
  opening: Opening;
  /** The car as the page now shows it; gone when it is no longer offered. */
  car: VisibleCar | undefined;
  date: WallDate;
  onOpenChange: (open: boolean) => void;
  setBoardingStop: SetBoardingStop;
}) {
  const t = useTranslations();
  const words = wordsOf(t, useFormatter());
  const passenger = car?.passengers.some(({ id }) => id === personId) ?? false;
  const current = car ? boardingStopOf(car, personId) : null;
  // The point of now as the sheet opens; what the person chose after it is kept through a failure.
  const [choice, setChoice] = useState(current);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const isOpen = useRef(open);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);
  // The same subject as the car's seats: a car removed takes what this said (`forget`).
  const sends = useSends(() => isOpen.current, `seats:${rideId}`);
  const body = useRef<HTMLDivElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const afterClose = useRef(() => (button.isConnected ? button.focus() : focusFirstShown([focusCar("aller", rideId)])));
  // « Valider » after a failure, « Fermer » once the car is gone and it is the only button left.
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus === 0) return;
    const footer = body.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-slot=sheet-footer] button");
    (submit.current ?? footer)?.focus();
  }, [refocus]);

  const placeOf = (stopId: string | null) => (stopId === null ? null : (car?.stops.find(({ id }) => id === stopId)?.location ?? null));

  async function validate() {
    if (sending || !car) return;
    // The same point: nothing to write (RV4.2).
    if (choice === current) return onOpenChange(false);
    setRefused(null);
    const sheet = sends([personId]);
    const taken = await setBoardingStop(
      { rideId, personId, stopId: choice, before: current },
      {
        ...sheet,
        sending: setSending,
        firstName,
        said: boardingStopText(words, firstName, placeOf(choice)),
        restored: boardingStopText(words, firstName, placeOf(current)),
      },
    );
    // Not the sheet opened since: what came back is the bar's.
    if (taken === undefined || !sheet.inSheet()) return;
    if (taken.kind !== "failed") return onOpenChange(false);
    setRefused(t(`Actions.${taken.message}`));
    setRefocus((count) => count + 1);
  }

  const message = refused ?? (!car ? t("Actions.rideGone") : !passenger ? t("Actions.failed") : null);
  const gone = !car || !passenger;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Sheet.stop.title", { firstName })}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        afterClose.current();
      }}
      closable={gone}
      actions={
        <>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          {!gone && (
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
                {t("Actions.cancel")}
              </Button>
              {/* Never `disabled`: the focus would fall out of the sheet while it is sent. */}
              <Button ref={submit} className="h-11 flex-1" aria-disabled={sending || undefined} onClick={() => void validate()}>
                {t("Actions.submit")}
              </Button>
            </div>
          )}
        </>
      }
    >
      <div ref={body} className="contents">
        {car && passenger && (
          <StopChoice
            legend={t("Sheet.stop.legend")}
            hideLegend
            date={date}
            start={{ location: car.location, time: car.departureTime }}
            stops={car.stops}
            value={choice}
            onChange={setChoice}
            autoFocus
          />
        )}
      </div>
    </BottomSheet>
  );
}
