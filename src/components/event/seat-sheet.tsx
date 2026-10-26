import { UserPlus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { storageAvailable } from "@/app/e/[id]/device-token";
import { Button } from "@/components/ui/button";
import type { Leg } from "@/domain/leg";
import type { VisibleCar, VisibleLegBoard } from "@/domain/phone-visibility";
import { sheetCandidates, sheetSubmit, tapOutcome } from "@/domain/tap";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { Box } from "./create-event-form";
import { nameList, personGone, whyOf, wordsOf, type Why } from "./failure-words";
import { focusCar, focusCarTitle, focusFirstShown } from "./focus";
import { aboutOf, sendAbout, useSends, type FromSheet } from "./hidden-page";
import type { BoardDevice } from "./leg-panel";
import type { BarProblem } from "./message-bar";
import { PersonForm, StorageNotice, type AddPerson } from "./person-form";

/** A refusal said in the sheet: the car gone (C6.8), too few seats left (C6.5), someone in a car already. */
export type SeatRefusal = "rideGone" | "notEnoughSeats" | "alreadyInCar";

/**
 * What became of the seats asked: in the sheet, a refusal or a problem in its own words (v4.1);
 * in the bar, `why` after the persons who could not get in (C11.11).
 */
export type SeatsTaken =
  | { kind: "done" }
  | { kind: "refused"; refusal: SeatRefusal; why: Why }
  | { kind: "problem"; problem: BarProblem; why: Why }
  /** The car's retour is gone: the sheet closes, and the bar says why (rule 9). */
  | { kind: "noRetour"; why: Why }
  /** Someone sent was removed from the event meanwhile: the sheet closes, and the bar names her (RP5.4). */
  | { kind: "personGone"; why: Why };

/** What the server answers `takeSeats`, an unknown event included. */
type SeatsAnswer =
  | { ok: true }
  | { ok: false; error: "invalid" | "forbidden" | "rideGone" | "alreadyInCar" | "seatTaken" | "eventNotFound" | "eventEnded" | "noRetour" }
  | { ok: false; error: "notEnoughSeats"; freeSeats: number }
  | { ok: false; error: "personGone"; goneIds: string[] };

/**
 * `takeSeats`'s answer as the page says it, for the persons sent, `names`, whose ids are `personIds`
 * in the same order. The sheet has no words of its own for `forbidden`, `eventNotFound` and
 * `invalid`: `failed` there (§ 2.6).
 */
export function seatsTaken(
  sent: { ok: true; value: SeatsAnswer } | { ok: false; problem: BarProblem },
  names: readonly string[],
  personIds: readonly string[] = [],
): SeatsTaken {
  if (!sent.ok) return { kind: "problem", problem: sent.problem, why: whyOf(sent.problem) };
  const answer = sent.value;
  if (answer.ok) return { kind: "done" };
  switch (answer.error) {
    case "personGone": {
      const persons = personIds.map((id, index) => ({ id, firstName: names[index] ?? "" }));
      return { kind: "personGone", why: personGone(persons, answer.goneIds) };
    }
    case "rideGone":
      return { kind: "refused", refusal: "rideGone", why: whyOf("rideGone") };
    case "alreadyInCar":
      return { kind: "refused", refusal: "alreadyInCar", why: { kind: "alreadyInCar", names } };
    case "seatTaken":
      return { kind: "refused", refusal: "notEnoughSeats", why: whyOf("seatTaken") };
    case "notEnoughSeats":
      return { kind: "refused", refusal: "notEnoughSeats", why: { kind: "notEnoughSeats", free: answer.freeSeats } };
    case "noRetour":
      return { kind: "noRetour", why: whyOf("noRetour") };
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

/** A person sent, and where she stood on the leg before, as the page showed it: what « Annuler » gives her back (C5.10). */
export interface Seated {
  personId: string;
  before: "withoutCar" | "notConcerned";
}

/** Takes seats in a car for persons of the device (R6); `undefined` when seats are already on their way. */
export type TakeSeats = (seats: { rideId: string; leg: Leg; persons: Seated[] }, sheet: SendingSheet) => Promise<SeatsTaken | undefined>;

/** The car's title, or the active tab once it is gone. */
const toCar = (leg: Leg, rideId: string) => focusFirstShown([() => focusCarTitle(leg, rideId)]);

/** The car's title, or its leg's banner once it is gone, or the active tab (« Le focus après une action »). */
const toCarOrBanner = (leg: Leg, rideId: string) => focusFirstShown([focusCar(leg, rideId)]);

/**
 * What a seat's send is given when no sheet shows what comes back: the bar says it, success or
 * failure, once no sheet hides the page. About the car and the person, as the sheet's sends are.
 */
function toBar(key: string, rideId: string, person: { id: string; firstName: string }, driver: string, placed: string): SendingSheet {
  const send = sendAbout(aboutOf([`seats:${rideId}`], [person.id]));
  return { key, inSheet: () => false, ...send, sending: () => {}, seats: { names: [person.firstName], driver }, placed };
}

/**
 * The car a free seat opened a sheet for, and that seat: the sheet that chooses who boards, or
 * the first registration of a device without a person (C5.4). Each opening is a new sheet.
 */
type Opening = { kind: "sheet" | "register"; rideId: string; driver: string; seat: HTMLElement; open: boolean; count: number };

/**
 * A leg's free seats (#91, #92): `tap(car, seat)` for a free seat's tap, which follows
 * `tapOutcome` (R5), and `sheet`, to render once on the leg. The only person of the device
 * without a car on the leg boards at once (C5.2); a device without a person gets the first
 * registration (C5.4); any other device, the sheet (C5.5); nothing until its persons are
 * known (C5.9). The sheets live on the leg, not on the car: the car may go while one is open
 * (C6.8). A success closes the sheet that sent it, never one opened since.
 */
export function useSeatSheet(board: VisibleLegBoard, device: BoardDevice, hasRetour: boolean) {
  const t = useTranslations();
  const [opening, setOpening] = useState<Opening | null>(null);
  // Once the page shows what a tap's answer carried, the focus goes to the car, if the seat
  // still had it or it fell with the seat: never from a sheet opened meanwhile (C5.2, C5.7).
  const [landed, setLanded] = useState<{ seat: HTMLElement; rideId: string } | null>(null);
  useEffect(() => {
    if (!landed) return;
    const active = document.activeElement;
    if (active === landed.seat || active === null || active === document.body) toCarOrBanner(board.leg, landed.rideId);
  }, [landed, board.leg]);

  const open = (kind: Opening["kind"], car: VisibleCar, seat: HTMLElement) =>
    setOpening((current) => ({ kind, rideId: car.id, driver: car.driver.firstName, seat, open: true, count: (current?.count ?? 0) + 1 }));

  // One tap, no other step (C5.2): what comes back is the bar's, as from a sheet closed meanwhile.
  // A tap again while it is on its way sends nothing: `runAction` drops the run of the same key.
  async function place(car: VisibleCar, seat: HTMLElement, person: { id: string; firstName: string }) {
    const { id: rideId } = car;
    const driver = car.driver.firstName;
    const placed = t("Seat.placed", { firstName: person.firstName, driver });
    const taken = await device.takeSeats(
      { rideId, leg: board.leg, persons: [{ personId: person.id, before: "withoutCar" }] },
      toBar(`tap:${rideId}`, rideId, person, driver, placed),
    );
    // Offline or a server error changes nothing on the page: the focus stays where it is.
    if (taken && taken.kind !== "problem") setLanded({ seat, rideId });
  }

  function tap(car: VisibleCar, seat: HTMLElement) {
    const outcome = tapOutcome(device.status, board.device);
    if (outcome.kind === "wait") return;
    const person = outcome.kind === "place" && board.device.find(({ id }) => id === outcome.personId);
    if (person) void place(car, seat, person);
    else open(outcome.kind === "register" ? "register" : "sheet", car, seat);
  }

  const onOpenChange = (count: number) => (open: boolean) =>
    setOpening((current) => (current?.count === count ? { ...current, open } : current));
  const sheet =
    opening &&
    (opening.kind === "register" ? (
      <RegisterSheet key={opening.count} leg={board.leg} opening={opening} onOpenChange={onOpenChange(opening.count)} device={device} hasRetour={hasRetour} />
    ) : (
      <SeatSheet
        key={opening.count}
        leg={board.leg}
        opening={opening}
        car={board.cars.find((car) => car.id === opening.rideId)}
        persons={board.device}
        onOpenChange={onOpenChange(opening.count)}
        device={device}
        hasRetour={hasRetour}
      />
    ));
  return { tap, sheet };
}

/**
 * The first registration from a free seat, on a device without a person (C5.4): « Ajouter une
 * personne », then « Cette personne prendra une place dans la voiture de {driver}. » and the
 * fields of R1. « Valider » registers her, then seats her in that car, and the bar says what
 * came of the seat: placed, or not, why, with the person kept without a car on the leg (#92).
 * The focus then goes to the car's title, or to the leg's banner once the car is gone. A
 * registration that fails stays in the form, as from « Ajouter une personne ». Closed without
 * effect, the focus goes back to the seat.
 */
function RegisterSheet({
  leg,
  opening: { rideId, driver, seat, open },
  onOpenChange,
  device,
  hasRetour,
}: {
  leg: Leg;
  opening: Opening;
  onOpenChange: (open: boolean) => void;
  device: BoardDevice;
  hasRetour: boolean;
}) {
  const t = useTranslations();
  // Probed as the sheet opens, with a key that names no event (C1.13).
  const [kept] = useState(storageAvailable);
  const isOpen = useRef(open);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);
  const afterClose = useRef(() => (seat.isConnected ? seat.focus() : toCarOrBanner(leg, rideId)));

  const addPerson: AddPerson = async (registering) => {
    const added = await device.addPerson(registering);
    if (added?.kind !== "done") return added;
    // Her creation id is her id; her first name as sent, its spaces trimmed.
    const person = { id: registering.creationId(), firstName: registering.notDone.kind === "addPerson" ? registering.notDone.firstName : registering.person.firstName };
    afterClose.current = () => toCarOrBanner(leg, rideId);
    const placed = t("Seat.placed", { firstName: person.firstName, driver });
    // Registered from the seat, she was without a car on its leg.
    await device.takeSeats({ rideId, leg, persons: [{ personId: person.id, before: "withoutCar" }] }, { ...toBar(`register:${person.id}`, rideId, person, driver, placed), sending: registering.sending });
    return added;
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("PersonForm.title.add")}
      description={
        <>
          <span className="block">{t("PersonForm.forSeat", { driver })}</span>
          {kept && <span className="block">{t("PersonForm.remember")}</span>}
        </>
      }
      // It has fields: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        afterClose.current();
      }}
    >
      {!kept && <StorageNotice title={t("PersonForm.storage.title")} body={t("PersonForm.storage.body")} />}
      <PersonForm
        mode={{ kind: "add", leg, hasRetour, addPerson, landmark: focusCar(leg, rideId) }}
        open={() => isOpen.current}
        onDone={() => onOpenChange(false)}
        onGone={() => onOpenChange(false)}
      />
    </BottomSheet>
  );
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
  const said = (taken: Exclude<SeatsTaken, { kind: "done" | "noRetour" | "personGone" }>, count: number): string => {
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
    // Ticked by default exactly when without a car (C6.1): unticked, she did not do the leg.
    const persons = chosen.map(({ id, checked }): Seated => ({ personId: id, before: checked ? "withoutCar" : "notConcerned" }));
    const taken = await takeSeats({ rideId, leg, persons }, { ...sheet, sending: setSending, seats: { names, driver }, placed });
    // Not the sheet opened since: what came back is the bar's.
    if (taken === undefined || !sheet.inSheet()) return;
    if (taken.kind === "done") {
      afterClose.current = () => toCar(leg, rideId);
      onOpenChange(false);
      return;
    }
    // Its leg is gone (rule 9), or someone ticked is gone from the event (RP5.4): it closes, the
    // focus back on the seat, which shows until then, and the bar says why.
    if (taken.kind === "noRetour" || taken.kind === "personGone") return onOpenChange(false);
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
                className="h-11 w-full aria-disabled:bg-muted aria-disabled:text-muted-foreground"
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
              mode={{ kind: "add", leg, hasRetour, addPerson, landmark: focusCar(leg, rideId) }}
              open={() => isOpen.current}
              onGone={() => onOpenChange(false)}
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
