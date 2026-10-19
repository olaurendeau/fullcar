import { Car } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { newCreationId, storageAvailable } from "@/app/e/[id]/device-token";
import type { OfferErrors, OfferField } from "@/app/e/[id]/offer-ride";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { DevicePerson } from "@/domain/board";
import { otherLeg as otherLegOf, type Leg } from "@/domain/leg";
import { otherLegField, otherLegKind, type OtherLegChoice } from "@/domain/offer";
import { validatePerson } from "@/domain/person";
import { RIDE_SEATS_DEFAULT, validateRide } from "@/domain/ride";
import { currentDriver, driverChoice, NEW_DRIVER } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { useSends, type FromSheet } from "./hidden-page";
import { personErrorMessage } from "./person-error";
import { StorageNotice, type Registering, type Registration } from "./person-form";
import { rideErrorMessage } from "./ride-error";

/**
 * What the form sends, before its creation ids: who drives, the car on the tab's leg (R4),
 * and what becomes of her on the other leg, unchanged when absent (C4.11).
 */
export interface RideDraft extends Record<"location" | "time" | "seats" | "note", string> {
  leg: Leg;
  driver: { kind: "device"; personId: string } | { kind: "new"; firstName: string; phone: string };
  otherLeg?: { kind: "keep" | "withoutCar" | "notConcerned" } | { kind: "drive"; location: string; time: string };
}

/** An offer as the form sends it; sending, and where a failure is said, as for a registration. */
export interface Offering extends FromSheet, Pick<Registering, "sending"> {
  offer: RideDraft;
  /** The form's creation ids, the cars' and a new driver's, drawn at its first send and kept until one succeeds. */
  creationIds: () => CreationIds;
}

type CreationIds = Record<"rideId" | "personId" | "otherRideId", string>;

/** What became of an offer, for its form, as for a registration but with the errors of R4. */
export type Offered = Exclude<Registration, { kind: "errors" }> | { kind: "errors"; errors: OfferErrors; first: OfferField };

/** Offers a car (R4): the device's token if the driver is new, then the form's creation ids, then the request. */
export type OfferRide = (offering: Offering) => Promise<Offered | undefined>;

interface FormProps {
  leg: Leg;
  /** The leg's date and time: the car's date, and its time before it is changed. */
  at: WallClock;
  /** The device's persons and where they stand on the leg. */
  persons: readonly DevicePerson[];
  /** The other leg's date and time, and where the device's persons stand there; none without a retour. */
  other?: { at: WallClock; persons: readonly DevicePerson[] };
  offerRide: OfferRide;
}

type FieldName = Exclude<OfferField, "passengers">;
type Values = Record<FieldName, string>;

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
        <Button variant={main ? "default" : "outline"} disabled={disabled} className="h-auto min-h-11 whitespace-normal">
          <Car aria-hidden />
          {t("Board.offerRide")}
        </Button>
      }
      title={t("RideForm.title.offer")}
    >
      {!kept && <StorageNotice title={t("RideForm.storage.title")} body={t("RideForm.storage.body")} />}
      <RideForm {...form} open={() => isOpen.current} onDone={() => toggle(false)} />
    </BottomSheet>
  );
}

/**
 * The fields of R4, in its order: who drives, the place, the time, the seats, the note, then
 * the other leg (#169). None of an option (C4.9). Errors, failures and creation ids as in
 * « Ajouter une personne » (C4.7, C4.10).
 */
function RideForm({ leg, at, persons, other, offerRide, open, onDone }: FormProps & { open: () => boolean; onDone: () => void }) {
  const t = useTranslations("RideForm");
  const tPerson = useTranslations("PersonForm");
  const tErrors = useTranslations("FormErrors");
  const tActions = useTranslations("Actions");
  const format = useFormatter();
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const { candidates, chosen } = driverChoice(persons);
  const [picked, setDriver] = useState(chosen);
  // A choice the page's state no longer allows is none (review of #200).
  const driver = currentDriver(candidates, picked);
  const [typed, setValues] = useState<Values>(() => {
    const blank = { firstName: "", phone: "", location: "", note: "", otherLocation: "" };
    const times = { time: wallClockParts(at).time, otherTime: other ? wallClockParts(other.at).time : "" };
    return { ...blank, ...times, seats: String(RIDE_SEATS_DEFAULT) };
  });
  // The other car's place follows this one's until it is changed (v4-9).
  const [follows, setFollows] = useState(true);
  const values = { ...typed, otherLocation: follows ? typed.location : typed.otherLocation };
  // The other leg follows who drives, from her state there (v4-8).
  const there = driver === NEW_DRIVER ? undefined : other?.persons.find((person) => person.id === driver)?.state;
  const otherField = other && otherLegField(there ?? "new");
  const [otherPick, setOtherPick] = useState<{ driver: string | undefined; choice: OtherLegChoice }>();
  const kept = otherPick && otherPick.driver === driver && otherField?.choices.includes(otherPick.choice);
  const otherChoice = kept ? otherPick.choice : otherField?.chosen;
  const drivesThere = otherChoice === "drive";
  const [errors, setErrors] = useState<OfferErrors>({});
  const [noDriver, setNoDriver] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<"offline" | "failed" | null>(null);
  const creationIds = useRef<CreationIds | undefined>(undefined);
  const submitButton = useRef<HTMLButtonElement>(null);
  // Each form its own, and its own subject, as in « Ajouter une personne »: an offer is a new car.
  const sends = useSends(open);
  const isNew = driver === NEW_DRIVER;

  // « Valider » lost the focus while it was inactive: after a refusal, it gets it back.
  useEffect(() => {
    if (problem && !sending && document.activeElement === document.body) submitButton.current?.focus();
  }, [problem, sending]);

  function showErrors(found: OfferErrors, missing: boolean, first: OfferField | undefined) {
    setProblem(null);
    setErrors(found);
    setNoDriver(missing);
    const target = missing ? `driver-${candidates[0]?.id}` : first;
    if (target) document.getElementById(idOf(target))?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = isNew ? validatePerson(values) : undefined;
    const ride = validateRide(values);
    const otherErrors = drivesThere ? otherLegErrors(values) : {};
    const otherFirst = otherErrors.otherLocation ? "otherLocation" : otherErrors.otherTime ? "otherTime" : undefined;
    if (driver === undefined || person?.ok === false || !ride.ok || otherFirst) {
      const found = { ...(person?.ok === false && person.errors), ...(!ride.ok && ride.errors), ...otherErrors };
      return showErrors(found, driver === undefined, person?.ok === false ? person.first : !ride.ok ? ride.first : otherFirst);
    }
    showErrors({}, false, undefined);
    const sheet = sends();
    const { firstName, phone, otherLocation, otherTime, ...car } = values;
    const kind = otherField && otherChoice && otherLegKind(otherField, otherChoice);
    const otherLeg = kind === "drive" ? { kind, location: otherLocation, time: otherTime } : kind && { kind };
    const answer = await offerRide({
      offer: { leg, ...car, driver: isNew ? { kind: "new", firstName, phone } : { kind: "device", personId: driver }, otherLeg },
      creationIds: () => (creationIds.current ??= { rideId: newCreationId(), personId: newCreationId(), otherRideId: newCreationId() }),
      sending: setSending,
      ...sheet,
    });
    if (answer?.kind === "done") {
      creationIds.current = undefined;
      // Not the sheet opened since: it shows another form.
      if (sheet.inSheet()) onDone();
    } else if (answer?.kind === "errors") showErrors(answer.errors, false, answer.first);
    else if (answer?.kind === "problem" && sheet.inSheet()) setProblem(answer.problem);
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
  const choices = [...candidates, { id: NEW_DRIVER, firstName: t("newDriver") }];
  const otherLegName = otherLegOf(leg);
  const choiceLabel = (choice: OtherLegChoice) =>
    choice === "stay"
      ? t("otherLeg.stay", { driver: otherField?.leaves?.firstName ?? "" })
      : t(choice === "withoutCar" ? "otherLeg.withoutCar" : `otherLeg.${choice}.${otherLegName}`);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3.5">
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
      {field("location", t(`location.${leg}`), { type: "text" })}
      {field("time", t("time"), { type: "time" }, t("timeHint", { date: format.dateTime(wallClockAsUtc(at), { dateStyle: "full" }) }))}
      {field("seats", t("seats"), { type: "text", inputMode: "numeric" }, t("seatsHint"))}
      {field("note", t("note"), "textarea", t("noteHint"))}
      {other && otherField && (
        <div className="flex flex-col gap-1 rounded-xl border px-3.5 py-2">
          <span id={idOf("other")} className="pt-1.5 text-sm font-semibold">
            {t(`otherLeg.title.${otherLegName}`)}
          </span>
          <RadioGroup
            value={otherChoice}
            onValueChange={(next) => setOtherPick({ driver, choice: otherField.choices.find((choice) => choice === next) ?? otherField.chosen })}
            aria-labelledby={idOf("other")}
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
                      {field("otherLocation", t(`location.${otherLegName}`), { type: "text" })}
                      {field("otherTime", t(`otherLeg.time.${otherLegName}`), { type: "time" }, t("timeHint", { date: format.dateTime(wallClockAsUtc(other.at), { dateStyle: "full" }) }))}
                      <p className="text-[13px] leading-[18px] text-muted-foreground">{t("otherLeg.same")}</p>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </RadioGroup>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {tActions(problem)}
        </p>
      )}
      <Button ref={submitButton} type="submit" className="h-11 w-full" disabled={sending}>
        {tActions("submit")}
      </Button>
    </form>
  );
}
