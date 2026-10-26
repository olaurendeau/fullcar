import { Car, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { newCreationId, storageAvailable } from "@/app/e/[id]/device-token";
import type { OfferErrors, OfferField } from "@/app/e/[id]/offer-ride";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { BoardPerson, DevicePerson } from "@/domain/board";
import { otherLeg as otherLegOf, type Leg } from "@/domain/leg";
import { otherLegField, otherLegKind, type OtherLegChoice } from "@/domain/offer";
import { validatePerson } from "@/domain/person";
import type { VisibleCar } from "@/domain/phone-visibility";
import type { Position } from "@/domain/place";
import { passengersFit, RIDE_SEATS_DEFAULT, validateRide, validSeats } from "@/domain/ride";
import { currentDriver, driverChoice, NEW_DRIVER, passengerCandidates } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { useFormatDate } from "@/i18n/format-date";
import { cn } from "@/lib/utils";
import { BottomSheet, SheetBar } from "./bottom-sheet";
import { Box } from "./event-fields";
import type { NotDone } from "./failure-words";
import { focusCar, focusFirstShown, focusOffer } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
import { LeavingStep } from "./leaving-step";
import { personErrorMessage } from "./person-error";
import { StorageNotice, type Registering, type Registration } from "./person-form";
import { PlaceField } from "./place-field";
import type { PlaceValue } from "./place-field-state";
import { rideChange, type RideChange } from "./ride-change";
import { rideErrorMessage } from "./ride-error";

/**
 * What the form sends, before its creation ids: who drives, the car on the tab's leg (R4),
 * and what becomes of her on the other leg, unchanged when absent (C4.11). Each place goes
 * with its position, `null` without one (« Un lieu, une valeur »).
 */
export interface RideDraft extends Record<"location" | "time" | "seats" | "note", string> {
  leg: Leg;
  position: Position | null;
  driver: { kind: "device"; personId: string } | { kind: "new"; firstName: string; phone: string };
  otherLeg?: { kind: "keep" | "withoutCar" | "notConcerned" } | { kind: "drive"; location: string; position: Position | null; time: string };
}

/** An offer as the form sends it; sending, and where a failure is said, as for a registration. */
export interface Offering extends FromSheet, Pick<Registering, "sending"> {
  offer: RideDraft;
  /** Those ticked in « Qui monte avec vous ? », in the order of « Vos inscriptions »: they board the car (C4.13). */
  passengers: BoardPerson[];
  /** What the bar says was not done: who drives, as the form named her, and each leg offered (C11.11). */
  notDone: NotDone & { kind: "offerRide" };
  /** Where the focus goes from the bar: « Proposer une voiture » of the leg it was sent from. */
  landmark: () => boolean;
  /** The form's creation ids, the cars' and a new driver's, drawn at its first send and kept until one succeeds. */
  creationIds: () => CreationIds;
}

type CreationIds = Record<"rideId" | "personId" | "otherRideId", string>;

/** What became of an offer, for its form, as for a registration but with the errors of R4. */
export type Offered = Exclude<Registration, { kind: "errors" }> | { kind: "errors"; errors: OfferErrors; first: OfferField };

/** Offers a car (R4): the device's token if the driver is new, then the form's creation ids, then the request. */
export type OfferRide = (offering: Offering) => Promise<Offered | undefined>;

/**
 * A change of one of the device's cars, as the form sends it (C8.2): only the fields changed
 * since it showed, so that it undoes no change made meanwhile (#208), the place with its
 * position (`rideChange`); the passengers it showed, and who leaves among them (C8.4).
 */
export interface Changing extends FromSheet, Pick<Registering, "sending"> {
  rideId: string;
  leg: Leg;
  ride: RideChange;
  seenPassengerIds: string[];
  leaving: string[];
  /** What the bar says was not done: the changes to this car, named by its driver and its leg (C11.11). */
  notDone: NotDone;
}

/** What became of a change, as for an offer; `passengersChanged` gives how many passengers there are now (C8.5). */
export type Changed = Offered | { kind: "passengersChanged"; passengers: number };

/** Changes one of the device's cars (R8), with the device's token. */
export type UpdateRide = (changing: Changing) => Promise<Changed | undefined>;

/** The other leg, as « Proposer une voiture » shows it: its line says where and when it leaves (v4.5). */
export interface OtherLegOf {
  at: WallClock;
  /** The event's place, its text whole: its position is not read (v4.5-6). */
  location: string;
  persons: readonly DevicePerson[];
}

interface FormProps {
  leg: Leg;
  /** The leg's date and time: the car's date, and its time before it is changed. */
  at: WallClock;
  /** The device's persons and where they stand on the leg. */
  persons: readonly DevicePerson[];
  /**
   * The other leg's date and time, the event's place as typed, and where the device's persons
   * stand there; none without a retour.
   */
  other?: OtherLegOf;
  offerRide: OfferRide;
  /** The event's position, which brings the suggestions for a car's places closer (AL4.1). */
  near?: Position | null;
}

/** What the form does: offer a car on a leg, or change one of the device's (C8.2). */
type FormMode =
  | ({ kind: "offer" } & Pick<FormProps, "persons" | "other" | "offerRide" | "near">)
  | ({ kind: "edit"; car: VisibleCar; updateRide: UpdateRide } & Pick<FormProps, "near">);

type FieldName = Exclude<OfferField, "passengers">;
type Values = Record<FieldName, string>;

/** The places of an offer, which propose suggestions; their texts are in `Values`, their positions beside. */
type PlaceName = "location" | "otherLocation";
type PlaceMark = Pick<PlaceValue, "position" | "label">;
const UNMARKED: PlaceMark = { position: null, label: null };

/** A field's control: an input of a type, or the note's text area. */
type Control = { type: "text" | "tel" | "time"; autoComplete?: string; inputMode?: "numeric" } | "textarea";

/** The message of a field's error, under `FormErrors`, if it has one. */
function messageOf(errors: OfferErrors, name: FieldName) {
  if (name === "firstName" || name === "phone") {
    const error = errors[name];
    return error && personErrorMessage(name, error);
  }
  const error = errors[name];
  return error && rideErrorMessage(name === "otherLocation" ? "location" : name === "otherTime" ? "time" : name, error);
}

/** The errors of the other car's place and time, checked by R4 as this car's; its seats and note are this car's. */
function otherLegErrors({ otherLocation, otherTime, seats, note }: Values): OfferErrors {
  const check = validateRide({ location: otherLocation, time: otherTime, seats, note });
  if (check.ok) return {};
  const { location, time } = check.errors;
  return { ...(location && { otherLocation: location }), ...(time && { otherTime: time }) };
}

/**
 * « Proposer une voiture » on a leg (C1.1), and its form in a sheet (R4): the main button where
 * seats are missing (C9.7), inactive until the device's persons are known (C5.9). Whether this
 * device can keep its token is probed as the sheet opens, with a key that names no event (C1.13).
 */
export function OfferRideButton({ main, disabled, ...form }: FormProps & { main: boolean; disabled: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(true);
  // Read when an answer comes, as for « Ajouter une personne »: once the sheet is closing, a failure goes to the bar.
  const isOpen = useRef(false);
  // Where the focus lands once closed, if not on this button: the new car's title, after passengers boarded it.
  const landing = useRef<(() => void) | undefined>(undefined);
  const toggle = (next: boolean) => {
    isOpen.current = next;
    setOpen(next);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (next) setKept(storageAvailable());
        toggle(next);
      }}
      trigger={
        <Button
          variant={main ? "default" : "outline"}
          disabled={disabled}
          // The landmark of its failure in the bar (`focusOffer`).
          data-offer-ride={form.leg}
          className="h-auto min-h-11 whitespace-normal"
        >
          <Car aria-hidden />
          {t("Board.offerRide")}
        </Button>
      }
      title={t("RideForm.title.offer")}
      // Its fields: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight
      onCloseAutoFocus={(event) => {
        const land = landing.current;
        landing.current = undefined;
        if (!land) return;
        event.preventDefault();
        land();
      }}
    >
      {!kept && <StorageNotice title={t("RideForm.storage.title")} body={t("RideForm.storage.body")} />}
      <RideForm
        leg={form.leg}
        at={form.at}
        mode={{ kind: "offer", ...form }}
        open={() => isOpen.current}
        onDone={(land) => {
          landing.current = land;
          toggle(false);
        }}
      />
    </BottomSheet>
  );
}

/**
 * « Modifier » on one of the device's cars (C8.1), and the form « Modifier la voiture » in a
 * sheet (C8.2), « Qui sort de la voiture ? » in its place when the seats go below the passengers
 * (C8.4). Each opening is a new form: the one that sent may be gone. Closed, after a success
 * too, the sheet gives the focus back to « Modifier » (Radix's default).
 */
export function EditRideButton({ car, at, updateRide, near }: { car: VisibleCar; at: WallClock; updateRide: UpdateRide } & Pick<FormProps, "near">) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const isOpen = useRef(false);
  const toggle = (next: boolean) => {
    if (next) setOpened((count) => count + 1);
    isOpen.current = next;
    setOpen(next);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={toggle}
      trigger={
        <Button variant="outline" className="h-11 flex-1">
          <Pencil aria-hidden />
          {t("Board.car.edit")}
        </Button>
      }
      title={t(choosing ? "RideChanges.leaving.title" : "RideForm.title.edit")}
      // Its fields, and its step while they wait to be sent: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight
    >
      <RideForm
        key={opened}
        leg={car.leg}
        at={at}
        mode={{ kind: "edit", car, updateRide, near }}
        open={() => isOpen.current}
        onDone={() => toggle(false)}
        onStep={setChoosing}
      />
    </BottomSheet>
  );
}

/**
 * The fields of R4, in its order: who drives, the place, the time, the seats, the note, then
 * the other leg (#169), then « Qui monte avec vous ? » (#171). None of an option (C4.9). Errors, failures and creation ids as in
 * « Ajouter une personne » (C4.7, C4.10).
 *
 * Each place proposes suggestions (#430, #431). In `edit` mode (C8.2), the place, the time, the
 * seats and the note alone, filled with the car's, its position as « Position enregistrée »,
 * under the same rules; below the passengers, « Valider » opens the step (C8.4).
 */
function RideForm({
  leg,
  at,
  mode,
  open,
  onDone,
  onStep,
}: Pick<FormProps, "leg" | "at"> & {
  mode: FormMode;
  open: () => boolean;
  /** Closes the form; `land`, where the focus goes then, if not back on the button that opened it. */
  onDone: (land?: () => void) => void;
  onStep?: (choosing: boolean) => void;
}) {
  const t = useTranslations("RideForm");
  const tPerson = useTranslations("PersonForm");
  const tErrors = useTranslations("FormErrors");
  const tActions = useTranslations("Actions");
  const tChanges = useTranslations("RideChanges.leaving");
  const tStates = useTranslations("DevicePersons.state");
  const formatDate = useFormatDate();
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const editing = mode.kind === "edit" ? mode : undefined;
  // The other leg as the sheet opened with it (the page holds it while the sheet shows), until
  // its own send is refused by `noRetour` (decision 41): the aller alone, then.
  const [problem, setProblem] = useState<"offline" | "failed" | "noRetour" | null>(null);
  const [gone, setGone] = useState(false);
  const { persons, other } = mode.kind === "offer" ? { ...mode, other: gone ? undefined : mode.other } : { persons: [], other: undefined };
  // What the form showed, in `edit` mode, its place with its position: a field left as it was is not sent (#208).
  const [shown] = useState(() => {
    const car = editing?.car;
    return car && { location: car.location, position: car.position, time: car.departureTime.slice(0, 5), seats: String(car.seats), note: car.note ?? "" };
  });
  const { candidates, chosen } = driverChoice(persons);
  const [picked, setDriver] = useState(chosen);
  // A choice the page's state no longer allows is none (review of #200).
  const driver = currentDriver(candidates, picked);
  const [typed, setValues] = useState<Values>(() => {
    const blank = { firstName: "", phone: "", location: "", note: "", otherLocation: "" };
    const times = { time: wallClockParts(at).time, otherTime: other ? wallClockParts(other.at).time : "" };
    return { ...blank, ...times, seats: String(RIDE_SEATS_DEFAULT), ...(shown && { location: shown.location, time: shown.time, seats: shown.seats, note: shown.note }) };
  });
  // The other car's place follows this one's until it is changed (v4-9), its position with it (AL4.2).
  const [follows, setFollows] = useState(true);
  const values = { ...typed, otherLocation: follows ? typed.location : typed.otherLocation };
  // A car's saved position has no label: « Position enregistrée » (AL5.1).
  const [marks, setMarks] = useState<Record<PlaceName, PlaceMark>>(() => ({
    location: { ...UNMARKED, position: shown?.position ?? null },
    otherLocation: UNMARKED,
  }));
  const placeOf = (name: PlaceName): PlaceValue => ({ text: values[name], ...marks[name === "otherLocation" && follows ? "location" : name] });
  // The car as the form holds it, in `edit` mode: what `rideChange` compares with `shown`.
  const edited = () => ({ ...values, position: placeOf("location").position });
  // The other leg follows who drives, from her state there (v4-8).
  const there = driver === NEW_DRIVER ? undefined : other?.persons.find((person) => person.id === driver)?.state;
  const otherField = other && otherLegField(there ?? "new");
  // One made for a driver is hers alone; one made with nobody chosen goes to whoever is chosen next.
  const [otherPick, setOtherPick] = useState<{ driver: string | undefined; choice: OtherLegChoice }>();
  const kept = otherPick && otherPick.driver === driver && otherField?.choices.includes(otherPick.choice);
  const otherChoice = kept ? otherPick.choice : otherField?.chosen;
  const drivesThere = otherChoice === "drive";
  // « Qui monte avec vous ? »: those without a car on the leg but who drives, unticked until ticked (v4-10).
  const passengerChoices = editing ? [] : passengerCandidates(persons, driver);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const boarding = passengerChoices.filter((person) => ticked[person.id]);
  const [errors, setErrors] = useState<OfferErrors>({});
  const [seatsSent, setSeatsSent] = useState(0);
  const [noDriver, setNoDriver] = useState(false);
  const [sending, setSending] = useState(false);
  // In `edit` mode: the step shown, by its round, a new one at each refusal (C8.5), and that refusal said.
  const [step, setStep] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);
  const alert = problem ? tActions(problem) : changed ? tChanges("changed") : null;
  // « Annuler » pressed in the step: the seats take the focus once the form shows again, and only then.
  const backFromStep = useRef(false);
  const creationIds = useRef<CreationIds | undefined>(undefined);
  const submitButton = useRef<HTMLButtonElement>(null);
  // Each form its own. An offer is about each leg it offers, and who drives there, whichever form
  // sends it (`offer:{leg}:{personId}`, or `offer:{leg}:new:{prénom}`, #228). A change is about its
  // car, whichever form sends it, apart from its removal (`ride:{id}`, #213): neither withdraws the other's failure.
  const sends = useSends(open, editing && `ride:${editing.car.id}:edit`);
  const isNew = !editing && driver === NEW_DRIVER;

  useEffect(() => onStep?.(step !== null), [step, onStep]);

  // What had the focus is gone or inactive (« Valider » while it sent, the step left): « Valider »
  // after a refusal, the seats once back from the step. Not as the form mounts: a browser that
  // does not focus a button on a click (Safari) opens it from <body>, and Radix gives its first field the focus.
  useEffect(() => {
    const back = backFromStep.current;
    if (step === null) backFromStep.current = false;
    const active = document.activeElement;
    if (sending || step !== null) return;
    // The other leg gone from the form, wherever the focus was: « Valider » (M7.6).
    if (problem === "noRetour") {
      submitButton.current?.focus();
      return;
    }
    if (active !== null && active !== document.body) return;
    if (problem || changed) submitButton.current?.focus();
    else if (back) document.getElementById(`${ids}-seats`)?.focus();
  }, [problem, changed, sending, step, ids]);

  function showErrors(found: OfferErrors, missing: boolean, first: OfferField | undefined) {
    setProblem(null);
    setErrors(found);
    setNoDriver(missing);
    // The seats sent, which the message of too many ticked counts, whatever is typed since.
    setSeatsSent(validSeats(values.seats) ?? 0);
    // Too many ticked: the group's first box, as the first radio button when nobody drives.
    const target = missing ? `driver-${candidates[0]?.id}` : first === "passengers" ? `passenger-${passengerChoices[0]?.id}` : first;
    if (target) document.getElementById(idOf(target))?.focus();
  }

  // Only what changed since the form showed is sent, with the passengers shown and who leaves.
  async function change(seen: string[], leaving: string[], seats: number) {
    if (!editing || !shown) return;
    setProblem(null);
    setChanged(false);
    const { fields, ride } = rideChange(shown, edited());
    // Withdraws a failure any form about this car left for the bar, if this send carries all its fields.
    const sheet = sends(fields);
    const answer = await editing.updateRide({
      rideId: editing.car.id,
      leg,
      ride,
      seenPassengerIds: seen,
      leaving,
      sending: setSending,
      notDone: { kind: "editRide", driver: editing.car.driver.firstName, leg },
      ...sheet,
    });
    if (answer?.kind === "errors") {
      setStep(null);
      showErrors(answer.errors, false, answer.first);
      // Not the sheet opened since: it shows another form.
    } else if (answer === undefined || !sheet.inSheet()) return;
    // Done, or its car's retour gone (rule 9): the sheet closes.
    else if (answer.kind === "done" || answer.kind === "noRetour") onDone();
    else if (answer.kind === "problem") setProblem(answer.problem);
    else {
      setChanged(true);
      setStep((round) => (seats < answer.passengers ? (round ?? 0) + 1 : null));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode.kind === "edit") {
      // Nothing changed since the form showed, character for character and the place as one
      // value (AL5.2): the sheet closes, the focus back on « Modifier »; nothing is checked nor
      // sent, the step does not open, and the bar keeps what it holds (v4.4.5, #313).
      if (shown && rideChange(shown, edited()).fields.length === 0) return onDone();
      const ride = validateRide(values);
      if (!ride.ok) return showErrors(ride.errors, false, ride.first);
      showErrors({}, false, undefined);
      const seen = mode.car.passengers.map(({ id }) => id);
      if (ride.ride.seats >= seen.length) return change(seen, [], ride.ride.seats);
      // Below the passengers, who leaves is chosen first (C8.4).
      setProblem(null);
      setChanged(false);
      return setStep((round) => (round ?? 0) + 1);
    }
    const person = isNew ? validatePerson(values) : undefined;
    const ride = validateRide(values);
    const otherErrors = drivesThere ? otherLegErrors(values) : {};
    // More ticked than seats, counted as the server does (C4.13): the last field of the form.
    const seats = validSeats(values.seats);
    const tooMany: OfferErrors = seats !== undefined && !passengersFit(boarding.length, seats) ? { passengers: "tooMany" } : {};
    const lastFirst = otherErrors.otherLocation ? "otherLocation" : otherErrors.otherTime ? "otherTime" : tooMany.passengers && "passengers";
    if (driver === undefined || person?.ok === false || !ride.ok || lastFirst) {
      const found = { ...(person?.ok === false && person.errors), ...(!ride.ok && ride.errors), ...otherErrors, ...tooMany };
      return showErrors(found, driver === undefined, person?.ok === false ? person.first : !ride.ok ? ride.first : lastFirst);
    }
    showErrors({}, false, undefined);
    const { firstName, phone, otherLocation, otherTime, ...car } = values;
    const kind = otherField && otherChoice && otherLegKind(otherField, otherChoice);
    const otherLeg = kind === "drive" ? { kind, location: otherLocation, position: placeOf("otherLocation").position, time: otherTime } : kind && { kind };
    // As the form names her: the first name typed, its spaces trimmed, or the one chosen.
    const name = person?.ok ? person.person.firstName : (candidates.find((candidate) => candidate.id === driver)?.firstName ?? "");
    const legs = kind === "drive" ? [leg, otherLegOf(leg)] : [leg];
    const sheet = sends([], legs.map((offered) => `offer:${offered}:${isNew ? `new:${name}` : driver}`));
    const answer = await mode.offerRide({
      offer: {
        leg,
        ...car,
        position: placeOf("location").position,
        driver: isNew ? { kind: "new", firstName, phone } : { kind: "device", personId: driver },
        otherLeg,
      },
      passengers: boarding,
      notDone: { kind: "offerRide", driver: name, legs: kind === "drive" ? "both" : leg },
      landmark: () => focusOffer(leg),
      creationIds: () => (creationIds.current ??= { rideId: newCreationId(), personId: newCreationId(), otherRideId: newCreationId() }),
      sending: setSending,
      ...sheet,
    });
    if (answer?.kind === "done") {
      const rideId = creationIds.current?.rideId;
      creationIds.current = undefined;
      // Not the sheet opened since: it shows another form. With passengers, the new car's title takes the focus.
      if (sheet.inSheet()) onDone(boarding.length > 0 && rideId ? () => focusFirstShown([focusCar(leg, rideId)]) : undefined);
    } else if (answer?.kind === "errors") showErrors(answer.errors, false, answer.first);
    else if (answer?.kind === "problem" && sheet.inSheet()) setProblem(answer.problem);
    // The retour is gone. Offered on it, the sheet closes (rule 9); from the aller, it stays without
    // the other leg, what was typed kept, and a second « Valider » offers the aller alone (M7.6).
    else if (answer?.kind === "noRetour" && sheet.inSheet()) {
      if (leg === "retour") return onDone();
      setGone(true);
      setProblem("noRetour");
    }
  }

  const field = (name: FieldName, label: string, control: Control, hint?: string) => {
    const message = messageOf(errors, name);
    const describedBy = [message && idOf(`${name}-error`), hint && idOf(`${name}-hint`)].filter(Boolean).join(" ");
    const props = {
      id: idOf(name),
      value: values[name],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = e.target;
        if (name === "otherLocation") setFollows(false);
        setValues((current) => ({ ...current, [name]: value }));
      },
      "aria-invalid": message ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idOf(name)} className={cn(message && "text-destructive")}>
          {label}
        </Label>
        {control === "textarea" ? (
          <Textarea {...props} />
        ) : (
          // Safari on iOS gives a time field of native appearance its value's width (#114).
          <Input {...control} {...props} className={cn("h-10", control.type === "time" && "appearance-none")} />
        )}
        {message && (
          <p id={idOf(`${name}-error`)} className="text-[13px] leading-[18px] text-destructive">
            {tErrors(message.key, message.values)}
          </p>
        )}
        {hint && (
          <p id={idOf(`${name}-hint`)} className="text-[13px] leading-[18px] text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  };
  // A car's place, with suggestions: a change of its text takes its position (v3), and the
  // sentence under it says who sees it (AL4.4). Sending, it asks nothing and « Retirer » does nothing (AL5.4).
  const place = (name: PlaceName, label: string) => {
    const message = messageOf(errors, name);
    return (
      <PlaceField
        id={idOf(name)}
        label={label}
        value={placeOf(name)}
        onChange={({ text, position, label: chosen }) => {
          if (name === "otherLocation") setFollows(false);
          setValues((current) => ({ ...current, [name]: text }));
          setMarks((current) => ({ ...current, [name]: { position, label: chosen } }));
        }}
        rule="car"
        near={mode.near}
        locked={sending}
        error={message && { id: idOf(`${name}-error`), message: tErrors(message.key, message.values) }}
        hint={t("locationHint")}
      />
    );
  };
  const choices = [...candidates, { id: NEW_DRIVER, firstName: t("newDriver") }];
  const otherLegName = otherLegOf(leg);
  const choiceLabel = (choice: OtherLegChoice) =>
    choice === "stay"
      ? t("otherLeg.stay", { driver: otherField?.leaves?.firstName ?? "" })
      : t(choice === "withoutCar" ? "otherLeg.withoutCar" : `otherLeg.${choice}.${otherLegName}`);

  const stepSeats = validSeats(values.seats);
  if (editing && step !== null && stepSeats !== undefined) {
    return (
      <LeavingStep
        key={step}
        passengers={editing.car.passengers}
        seats={stepSeats}
        alert={alert}
        sending={sending}
        onSubmit={(seen, leaving) => void change(seen, leaving, stepSeats)}
        onCancel={() => {
          backFromStep.current = true;
          setStep(null);
          setChanged(false);
          setProblem(null);
        }}
      />
    );
  }

  return (
    <form id={idOf("form")} noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      {!editing && (
        <div
          {...(candidates.length === 0 && { role: "group", "aria-labelledby": idOf("driver") })}
          className={cn("flex flex-col gap-1 rounded-xl border px-3.5 py-2", noDriver && "border-destructive")}
        >
          <span id={idOf("driver")} className={cn("pt-1.5 text-sm font-semibold", noDriver && "text-destructive")}>
            {t("driver")}
          </span>
          {candidates.length > 0 && (
            <RadioGroup
              value={driver ?? ""}
              onValueChange={(next) => {
                setDriver(next);
                setNoDriver(false);
                // Who drives leaves « Qui monte avec vous ? », and her tick with her.
                setTicked((current) => ({ ...current, [next]: false }));
                setOtherPick((pick) => (pick && pick.driver === undefined ? { ...pick, driver: next } : pick));
              }}
              aria-labelledby={idOf("driver")}
              aria-invalid={noDriver || undefined}
              aria-describedby={noDriver ? idOf("driver-error") : undefined}
              className="gap-0"
            >
              {choices.map((choice) => (
                <label key={choice.id} htmlFor={idOf(`driver-${choice.id}`)} className="flex min-h-11 cursor-pointer items-center gap-2.5">
                  <RadioGroupItem id={idOf(`driver-${choice.id}`)} value={choice.id} aria-labelledby={idOf(`driver-${choice.id}-label`)} />
                  <span id={idOf(`driver-${choice.id}-label`)} className="min-w-0 text-sm font-medium wrap-anywhere">
                    {choice.firstName}
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
          {noDriver && (
            <p id={idOf("driver-error")} className="text-[13px] leading-[18px] text-destructive">
              {tErrors("chooseDriver")}
            </p>
          )}
          {isNew && (
            <div className="flex flex-col gap-3.5 pt-1 pb-2">
              {field("firstName", tPerson("firstName"), { type: "text", autoComplete: "given-name" })}
              {field("phone", tPerson("phone"), { type: "tel", autoComplete: "tel" }, tPerson("phoneHint"))}
            </div>
          )}
        </div>
      )}
      {place("location", t(`location.${leg}`))}
      {field("time", t("time"), { type: "time" }, t("timeHint", { date: formatDate(wallClockAsUtc(at), { dateStyle: "full" }) }))}
      {field("seats", t("seats"), { type: "text", inputMode: "numeric" }, t("seatsHint"))}
      {field("note", t("note"), "textarea", t("noteHint"))}
      {other && otherField && (
        <div className="flex flex-col gap-1 rounded-xl border px-3.5 py-2">
          <span id={idOf("other")} className="pt-1.5 text-sm font-semibold">
            {t(`otherLeg.title.${otherLegName}`)}
          </span>
          {/* Where and when the other leg leaves, from the event, not from the car (v4.5-2): it describes the group (v4.5-4). */}
          <p id={idOf("other-hint")} className="text-[13px] leading-[18px] text-muted-foreground wrap-anywhere">
            {t(`otherLeg.hint.${otherLegName}`, {
              location: other.location,
              date: formatDate(wallClockAsUtc(other.at), { dateStyle: "full", timeStyle: "short" }),
            })}
          </p>
          <RadioGroup
            value={otherChoice}
            onValueChange={(next) => setOtherPick({ driver, choice: otherField.choices.find((choice) => choice === next) ?? otherField.chosen })}
            aria-labelledby={idOf("other")}
            aria-describedby={idOf("other-hint")}
            className="gap-0"
          >
            {otherField.choices.map((choice) => {
              const leaves = choice !== "stay" && otherField.leaves;
              const id = idOf(`other-${choice}`);
              return (
                <Fragment key={choice}>
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2.5">
                    <RadioGroupItem id={id} value={choice} aria-labelledby={`${id}-label`} aria-describedby={leaves ? `${id}-leaves` : undefined} />
                    <span className="flex min-w-0 flex-col">
                      <span id={`${id}-label`} className="text-sm font-medium wrap-anywhere">
                        {choiceLabel(choice)}
                      </span>
                      {leaves && (
                        <span id={`${id}-leaves`} className="text-[13px] leading-[18px] text-muted-foreground wrap-anywhere">
                          {t("leavesCar", { driver: leaves.firstName })}
                        </span>
                      )}
                    </span>
                  </label>
                  {choice === "drive" && drivesThere && (
                    <div className="flex flex-col gap-3.5 pt-1 pb-2 pl-6.5">
                      {place("otherLocation", t(`location.${otherLegName}`))}
                      {field("otherTime", t(`otherLeg.time.${otherLegName}`), { type: "time" }, t("timeHint", { date: formatDate(wallClockAsUtc(other.at), { dateStyle: "full" }) }))}
                      <p className="text-[13px] leading-[18px] text-muted-foreground">{t("otherLeg.same")}</p>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </RadioGroup>
        </div>
      )}
      {passengerChoices.length > 0 && (
        <div
          role="group"
          aria-labelledby={idOf("passengers")}
          aria-describedby={errors.passengers ? idOf("passengers-error") : undefined}
          className={cn("flex flex-col gap-1 rounded-xl border px-3.5 py-2", errors.passengers && "border-destructive")}
        >
          <span id={idOf("passengers")} className={cn("pt-1.5 text-sm font-semibold", errors.passengers && "text-destructive")}>
            {t("passengers")}
          </span>
          {passengerChoices.map((person) => (
            <Box
              key={person.id}
              id={idOf(`passenger-${person.id}`)}
              label={person.firstName}
              hint={tStates("withoutCar")}
              checked={ticked[person.id] ?? false}
              onChange={(value) => setTicked((current) => ({ ...current, [person.id]: value }))}
              invalid={!!errors.passengers}
            />
          ))}
          {errors.passengers && (
            <p id={idOf("passengers-error")} className="text-[13px] leading-[18px] text-destructive">
              {tErrors("tooManyPassengers", { seats: seatsSent })}
            </p>
          )}
        </div>
      )}
      {/* In the sheet's bar, out of the form: « Valider » is its submit button by `form` (v4.6, rule 1). */}
      <SheetBar
        messages={
          alert && (
            <p role="alert" className="text-sm text-destructive">
              {alert}
            </p>
          )
        }
      >
        <Button ref={submitButton} type="submit" form={idOf("form")} className="h-11 w-full" disabled={sending}>
          {tActions("submit")}
        </Button>
      </SheetBar>
    </form>
  );
}
