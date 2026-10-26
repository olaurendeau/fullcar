"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENT_FIELDS, type EventErrors, type EventField, type EventFields as SentFields, type EventHeader } from "@/domain/event";
import { LEGS, type Leg } from "@/domain/leg";
import { samePlace, type Position } from "@/domain/place";
import { wallClockParts } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { eventErrorMessage } from "./event-error";
import { PlaceField } from "./place-field";
import type { PlaceValue } from "./place-field-state";

/**
 * The values of the fields, as they show: the retour date is the one displayed. The place is
 * its text, `location`, and its position, `locationPosition`, `null` without one: one value.
 * Decision: the position is among the values, its label outside them (#432). Reason: the change
 * sends its values whole, so the place and its position always leave together (« Un lieu, une
 * valeur »); and a merge (M6.1) or a comparison (M2.5) that reads the values sees the couple, where
 * a position beside them was dropped (review of #515). The label never leaves the browser.
 * The description is its text as typed, empty without one: the rules normalise it as they check it.
 */
export type EventFieldValues = Pick<Required<SentFields>, Exclude<EventField, "description"> | "retour"> & {
  locationPosition: Position | null;
  description: string;
};

/**
 * The fields' state. `retourDateFollows`: the retour date follows the aller date until it is
 * changed (C1.3). The creation starts it true; a form opened on saved values chooses it.
 */
export interface EventFieldsState {
  values: EventFieldValues;
  retourDateFollows: boolean;
  /**
   * The label of the suggestion the place's position came from, absent or `null` for a saved
   * one (« Position enregistrée »): shown, never sent.
   */
  locationLabel?: string | null;
}

/** The creation's start: every text empty, Retour checked (C1.1). */
export const BLANK_EVENT_FIELDS: EventFieldsState = {
  values: {
    title: "",
    location: "",
    locationPosition: null,
    allerDate: "",
    allerTime: "",
    retourDate: "",
    retourTime: "",
    retour: true,
    description: "",
  },
  retourDateFollows: true,
};

/**
 * The fields of a form opened on saved values (organizer-view v3.3.6, « Le formulaire »): the box
 * Retour checked if and only if there is a retour. The end date follows the start date when both
 * were on the same day (decision 43), or when there is no end yet: checking the box shows the
 * start's date, then the end's time empty (M1.6). Without a description, its field is empty.
 */
export function loadedEventFields({ title, location, locationPosition, allerAt, retourAt, description }: EventHeader): EventFieldsState {
  const aller = wallClockParts(allerAt);
  const retour = retourAt === null ? undefined : wallClockParts(retourAt);
  return {
    values: {
      title,
      location,
      locationPosition,
      allerDate: aller.date,
      allerTime: aller.time,
      retour: retour !== undefined,
      retourDate: retour?.date ?? aller.date,
      retourTime: retour?.time ?? "",
      // A header from a server before the description has none (`isHeader`).
      description: description ?? "",
    },
    retourDateFollows: retour === undefined || retour.date === aller.date,
  };
}

/** The place of `values`, its text and its position: the couple a place is compared by. */
const placeOf = (values: EventFieldValues) => ({ text: values.location, position: values.locationPosition });

/**
 * Whether a field differs from its loaded value: one put back as it was is not changed (M2.5).
 * The place differs by its text or its position: « Retirer » alone is a change (AL5.2). The end's
 * fields count only while the box is checked: unchecked, they are neither shown nor saved.
 */
export function eventFieldsChanged(values: EventFieldValues, loaded: EventFieldValues): boolean {
  const shown = (each: EventFieldValues) =>
    EVENT_FIELDS.filter((name) => each.retour || (name !== "retourDate" && name !== "retourTime")).map((name) => each[name]);
  return (
    values.retour !== loaded.retour ||
    !samePlace(placeOf(values), placeOf(loaded)) ||
    shown(values).some((value, n) => value !== shown(loaded)[n])
  );
}

/**
 * The cars that keep their time while their leg moves (organizer-view v3.3.8, « Les voitures
 * gardent leur heure », M5.1): for each leg whose date or time differs from its loaded value,
 * the retour while its box is checked, its number of cars in `cars`, if it has one.
 */
export function carTimesKept(values: EventFieldValues, loaded: EventFieldValues, cars: Record<Leg, number>): Partial<Record<Leg, number>> {
  const moved = {
    aller: values.allerDate !== loaded.allerDate || values.allerTime !== loaded.allerTime,
    retour: values.retour && (values.retourDate !== loaded.retourDate || values.retourTime !== loaded.retourTime),
  };
  return Object.fromEntries(LEGS.filter((leg) => moved[leg] && cars[leg] > 0).map((leg) => [leg, cars[leg]]));
}

/**
 * A change of the fields, applied to the state current when it runs, not to the one of the
 * render it came from: a state set meanwhile (the saved values, `withSavedFields`) is kept.
 */
export type EventFieldsUpdate = (state: EventFieldsState) => EventFieldsState;

/** A text field changes: the aller date carries the retour date while it follows. */
export function withEventField(name: EventField, value: string): EventFieldsUpdate {
  return (state) => {
    const values = { ...state.values, [name]: value };
    if (name === "retourDate") return { ...state, values, retourDateFollows: false };
    if (name === "allerDate" && state.retourDateFollows) values.retourDate = value;
    return { ...state, values };
  };
}

/** The place changes, with suggestions: its text, its position and its label together. */
export function withLocation({ text, position, label }: PlaceValue): EventFieldsUpdate {
  return (state) => ({ ...state, values: { ...state.values, location: text, locationPosition: position }, locationLabel: label });
}

/** The box Retour changes. */
export function withRetour(retour: boolean): EventFieldsUpdate {
  return (state) => ({ ...state, values: { ...state.values, retour } });
}

/**
 * The saved values arrive, the event changed on another device (organizer-view v3.3.6,
 * « Modifications simultanées »): each field not changed, its value still `loaded`'s, takes the
 * saved value, and each field changed keeps what was typed; the box Retour too (M6.1, M6.2).
 * The place is one field, its text and its position (« Un lieu, une valeur »): not changed, it
 * takes the saved couple, « Position enregistrée » if it has one (AL5.3); changed, it keeps its
 * couple and its label. The end date then follows as the saved values have it, unless it was typed.
 */
export function withSavedFields(loaded: EventFieldValues, saved: EventFieldsState): EventFieldsUpdate {
  return (state) => {
    const kept = <K extends keyof EventFieldValues>(name: K) =>
      state.values[name] === loaded[name] ? saved.values[name] : state.values[name];
    const placeChanged = !samePlace(placeOf(state.values), placeOf(loaded));
    const place = placeChanged ? state.values : saved.values;
    const values: EventFieldValues = {
      title: kept("title"),
      location: place.location,
      locationPosition: place.locationPosition,
      allerDate: kept("allerDate"),
      allerTime: kept("allerTime"),
      retour: kept("retour"),
      retourDate: kept("retourDate"),
      retourTime: kept("retourTime"),
      description: kept("description"),
    };
    const typed = state.values.retourDate !== loaded.retourDate;
    const retourDateFollows = typed ? state.retourDateFollows : saved.retourDateFollows;
    return placeChanged ? { values, retourDateFollows, locationLabel: state.locationLabel } : { values, retourDateFollows };
  };
}

/**
 * The fields of an Event (#264): Titre, Lieu, the start's date and time, the box Retour and,
 * while it is checked, the end's date and time. Shared by the creation and, with epic #250,
 * the organiser's change of the Event. Each error shows under its field; `idOf` names the
 * fields, so that the form around them can focus the first error. `onChange` receives an
 * update, as a state setter takes it. A leg's `notes` show under its date and time, which they
 * describe after their error (M5.1, review of #293).
 */
export function EventFormFields({
  idOf,
  state,
  errors,
  onChange,
  notes = {},
  locked = false,
  suggestions = false,
  sending = false,
}: {
  idOf: (name: string) => string;
  state: EventFieldsState;
  errors: EventErrors;
  onChange: (update: EventFieldsUpdate) => void;
  notes?: Partial<Record<Leg, string>>;
  /** While a change is sent (M2.6, decision 52): each field read-only, the box `aria-disabled`, and no input taken. */
  locked?: boolean;
  /** The place proposes suggestions (place-autocomplete); without, it is the text field it always was. */
  suggestions?: boolean;
  /** The form is sending: the place proposes nothing, and its « Retirer » does nothing (AL5.4). */
  sending?: boolean;
}) {
  const t = useTranslations("CreateEvent");
  const { values } = state;

  const note = (leg: Leg) =>
    notes[leg] && (
      <p id={idOf(`${leg}-note`)} className="-mt-1 grid grid-cols-[14px_1fr] gap-2 text-[13px] leading-[18px] text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5" />
        <span>{notes[leg]}</span>
      </p>
    );

  /** A field's error: its message, and the id that describes the field. */
  const errorOf = (name: EventField) => {
    const error = errors[name];
    const message = error && eventErrorMessage(name, error);
    return message ? { id: idOf(`${name}-error`), message: t(`errors.${message.key}`, message.values) } : undefined;
  };

  const text = (name: Exclude<EventField, "description">, type: "text" | "date" | "time" = "text") => {
    const error = errorOf(name);
    const leg = name.startsWith("aller") ? "aller" : name.startsWith("retour") ? "retour" : undefined;
    const describedBy = [error && error.id, leg && notes[leg] && idOf(`${leg}-note`)].filter(Boolean).join(" ");
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idOf(name)} className={cn(error && "text-destructive")}>
          {t(name)}
        </Label>
        <Input
          id={idOf(name)}
          type={type}
          // Safari on iOS gives a date or time field of native appearance the width of its
          // longest value, past `min-w-0` and `w-full`: out of its column (#114).
          className={cn("h-10", type !== "text" && "appearance-none")}
          value={values[name]}
          readOnly={locked || undefined}
          onChange={(e) => !locked && onChange(withEventField(name, e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {error && (
          <p id={error.id} className="text-[13px] leading-[18px] text-destructive">
            {error.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {text("title")}
      {suggestions ? (
        <PlaceField
          id={idOf("location")}
          label={t("location")}
          value={{ text: values.location, position: values.locationPosition, label: state.locationLabel ?? null }}
          onChange={(value) => !locked && onChange(withLocation(value))}
          rule="event"
          locked={locked || sending}
          readOnly={locked}
          error={errorOf("location")}
        />
      ) : (
        text("location")
      )}
      <div className="grid grid-cols-2 gap-3">
        {text("allerDate", "date")}
        {text("allerTime", "time")}
      </div>
      {note("aller")}
      <Box
        id={idOf("retour")}
        label={t("retour")}
        hint={t("retourHint")}
        checked={values.retour}
        onChange={(retour) => !locked && onChange(withRetour(retour))}
        locked={locked}
      />
      {values.retour && (
        <div className="grid grid-cols-2 gap-3">
          {text("retourDate", "date")}
          {text("retourTime", "time")}
        </div>
      )}
      {values.retour && note("retour")}
    </>
  );
}

/**
 * A box with its name and a one-line explanation. The whole row is its label, a target of
 * 44 px at least; its accessible name is the name alone, the explanation its description.
 */
export function Box({
  id,
  label,
  hint,
  checked,
  onChange,
  invalid,
  locked,
}: {
  id: string;
  label: ReactNode;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** In a group in error (« Qui monte avec vous ? », C4.13): each box says so, as a radio group does. */
  invalid?: boolean;
  /** Reachable and read, but not to be changed now: `aria-disabled`, its form ignoring what `onChange` says. */
  locked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        aria-invalid={invalid || undefined}
        aria-disabled={locked || undefined}
      />
      <span className="flex flex-col gap-1">
        <span id={`${id}-label`} className="text-sm leading-5 font-medium">
          {label}
        </span>
        <span id={`${id}-hint`} className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}
