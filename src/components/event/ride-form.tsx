import { Car } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { newCreationId, storageAvailable } from "@/app/e/[id]/device-token";
import type { OfferErrors, OfferField } from "@/app/e/[id]/offer-ride";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { DevicePerson } from "@/domain/board";
import type { Leg } from "@/domain/leg";
import { validatePerson, type PersonField } from "@/domain/person";
import { RIDE_SEATS_DEFAULT, validateRide, type RideField } from "@/domain/ride";
import { driverChoice, NEW_DRIVER } from "@/domain/tap";
import { wallClockAsUtc, wallClockParts, type WallClock } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { useSends, type FromSheet } from "./hidden-page";
import { personErrorMessage } from "./person-error";
import { StorageNotice, type Registering, type Registration } from "./person-form";
import { rideErrorMessage } from "./ride-error";

/** What the form sends, before its creation ids: who drives, and the car on the tab's leg (R4). */
export interface RideDraft extends Record<"location" | "time" | "seats" | "note", string> {
  leg: Leg;
  driver: { kind: "device"; personId: string } | { kind: "new"; firstName: string; phone: string };
}

/** An offer as the form sends it; sending, and where a failure is said, as for a registration. */
export interface Offering extends FromSheet, Pick<Registering, "sending"> {
  offer: RideDraft;
  /** The form's creation ids, the car's and a new driver's, drawn at its first send and kept until one succeeds. */
  creationIds: () => { rideId: string; personId: string };
}

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
  offerRide: OfferRide;
}

type Values = Record<PersonField | RideField, string>;

/** A field's control: an input of a type, or the note's text area. */
type Control = { type: "text" | "tel" | "time"; autoComplete?: string; inputMode?: "numeric" } | "textarea";

/** The message of a field's error, under `FormErrors`, if it has one. */
function messageOf(errors: OfferErrors, name: PersonField | RideField) {
  if (name === "firstName" || name === "phone") {
    const error = errors[name];
    return error && personErrorMessage(name, error);
  }
  const error = errors[name];
  return error && rideErrorMessage(name, error);
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
 * The fields of R4, in its order: who drives, the place, the time, the seats, the note. None of
 * an option (C4.9), nor of the other leg, which the server keeps (C4.4). Errors, failures and
 * creation ids as in « Ajouter une personne » (C4.7, C4.10).
 */
function RideForm({ leg, at, persons, offerRide, open, onDone }: FormProps & { open: () => boolean; onDone: () => void }) {
  const t = useTranslations("RideForm");
  const tPerson = useTranslations("PersonForm");
  const tErrors = useTranslations("FormErrors");
  const tActions = useTranslations("Actions");
  const format = useFormatter();
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const { candidates, chosen } = driverChoice(persons);
  const [driver, setDriver] = useState(chosen);
  const [values, setValues] = useState<Values>(() => {
    const blank = { firstName: "", phone: "", location: "", note: "" };
    return { ...blank, time: wallClockParts(at).time, seats: String(RIDE_SEATS_DEFAULT) };
  });
  const [errors, setErrors] = useState<OfferErrors>({});
  const [noDriver, setNoDriver] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<"offline" | "failed" | null>(null);
  const creationIds = useRef<{ rideId: string; personId: string } | undefined>(undefined);
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
    if (driver === undefined || person?.ok === false || !ride.ok) {
      const found = { ...(person?.ok === false && person.errors), ...(!ride.ok && ride.errors) };
      return showErrors(found, driver === undefined, person?.ok === false ? person.first : !ride.ok ? ride.first : undefined);
    }
    showErrors({}, false, undefined);
    const sheet = sends();
    const { firstName, phone, ...car } = values;
    const answer = await offerRide({
      offer: { leg, ...car, driver: isNew ? { kind: "new", firstName, phone } : { kind: "device", personId: driver } },
      creationIds: () => (creationIds.current ??= { rideId: newCreationId(), personId: newCreationId() }),
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

  const field = (name: PersonField | RideField, label: string, control: Control, hint?: string) => {
    const message = messageOf(errors, name);
    const describedBy = [message && idOf(`${name}-error`), hint && idOf(`${name}-hint`)].filter(Boolean).join(" ");
    const props = {
      id: idOf(name),
      value: values[name],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValues((current) => ({ ...current, [name]: e.target.value })),
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
