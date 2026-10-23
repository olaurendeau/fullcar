"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENT_FIELDS, type EventErrors, type EventField, type EventFields as SentFields, type EventHeader } from "@/domain/event";
import { wallClockParts } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { eventErrorMessage } from "./event-error";

/** The values of the fields, as they show: the retour date is the one displayed. */
export type EventFieldValues = Pick<Required<SentFields>, EventField | "retour">;

/**
 * The fields' state. `retourDateFollows`: the retour date follows the aller date until it is
 * changed (C1.3). The creation starts it true; a form opened on saved values chooses it.
 */
export interface EventFieldsState {
  values: EventFieldValues;
  retourDateFollows: boolean;
}

/** The creation's start: every text empty, Retour checked (C1.1). */
export const BLANK_EVENT_FIELDS: EventFieldsState = {
  values: { title: "", location: "", allerDate: "", allerTime: "", retourDate: "", retourTime: "", retour: true },
  retourDateFollows: true,
};

/**
 * The fields of a form opened on saved values (organizer-view v3.3.6, « Le formulaire »): the box
 * Retour checked if and only if there is a retour. The end date follows the start date when both
 * were on the same day (decision 43), or when there is no end yet: checking the box shows the
 * start's date, then the end's time empty (M1.6).
 */
export function loadedEventFields({ title, location, allerAt, retourAt }: EventHeader): EventFieldsState {
  const aller = wallClockParts(allerAt);
  const retour = retourAt === null ? undefined : wallClockParts(retourAt);
  return {
    values: {
      title,
      location,
      allerDate: aller.date,
      allerTime: aller.time,
      retour: retour !== undefined,
      retourDate: retour?.date ?? aller.date,
      retourTime: retour?.time ?? "",
    },
    retourDateFollows: retour === undefined || retour.date === aller.date,
  };
}

/**
 * Whether a field differs from its loaded value: one put back as it was is not changed (M2.5).
 * The end's fields count only while the box is checked: unchecked, they are neither shown nor saved.
 */
export function eventFieldsChanged(values: EventFieldValues, loaded: EventFieldValues): boolean {
  const shown = (each: EventFieldValues) =>
    EVENT_FIELDS.filter((name) => each.retour || (name !== "retourDate" && name !== "retourTime")).map((name) => each[name]);
  return values.retour !== loaded.retour || shown(values).some((value, n) => value !== shown(loaded)[n]);
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
    if (name === "retourDate") return { values, retourDateFollows: false };
    if (name === "allerDate" && state.retourDateFollows) values.retourDate = value;
    return { values, retourDateFollows: state.retourDateFollows };
  };
}

/** The box Retour changes. */
export function withRetour(retour: boolean): EventFieldsUpdate {
  return (state) => ({ ...state, values: { ...state.values, retour } });
}

/**
 * The saved values arrive, the event changed on another device (organizer-view v3.3.6,
 * « Modifications simultanées »): each field not changed, its value still `loaded`'s, takes the
 * saved value, and each field changed keeps what was typed; the box Retour too (M6.1, M6.2).
 * The end date then follows as the saved values have it, unless it was typed.
 */
export function withSavedFields(loaded: EventFieldValues, saved: EventFieldsState): EventFieldsUpdate {
  return (state) => {
    const kept = <K extends keyof EventFieldValues>(name: K) =>
      state.values[name] === loaded[name] ? saved.values[name] : state.values[name];
    const values: EventFieldValues = {
      title: kept("title"),
      location: kept("location"),
      allerDate: kept("allerDate"),
      allerTime: kept("allerTime"),
      retour: kept("retour"),
      retourDate: kept("retourDate"),
      retourTime: kept("retourTime"),
    };
    const typed = state.values.retourDate !== loaded.retourDate;
    return { values, retourDateFollows: typed ? state.retourDateFollows : saved.retourDateFollows };
  };
}

/**
 * The fields of an Event (#264): Titre, Lieu, the start's date and time, the box Retour and,
 * while it is checked, the end's date and time. Shared by the creation and, with epic #250,
 * the organiser's change of the Event. Each error shows under its field; `idOf` names the
 * fields, so that the form around them can focus the first error. `onChange` receives an
 * update, as a state setter takes it.
 */
export function EventFormFields({
  idOf,
  state,
  errors,
  onChange,
}: {
  idOf: (name: string) => string;
  state: EventFieldsState;
  errors: EventErrors;
  onChange: (update: EventFieldsUpdate) => void;
}) {
  const t = useTranslations("CreateEvent");
  const { values } = state;

  const text = (name: EventField, type: "text" | "date" | "time" = "text") => {
    const error = errors[name];
    const message = error && eventErrorMessage(name, error);
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
          onChange={(e) => onChange(withEventField(name, e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={message && idOf(`${name}-error`)}
        />
        {message && (
          <p id={idOf(`${name}-error`)} className="text-[13px] leading-[18px] text-destructive">
            {t(`errors.${message.key}`, message.values)}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {text("title")}
      {text("location")}
      <div className="grid grid-cols-2 gap-3">
        {text("allerDate", "date")}
        {text("allerTime", "time")}
      </div>
      <Box
        id={idOf("retour")}
        label={t("retour")}
        hint={t("retourHint")}
        checked={values.retour}
        onChange={(retour) => onChange(withRetour(retour))}
      />
      {values.retour && (
        <div className="grid grid-cols-2 gap-3">
          {text("retourDate", "date")}
          {text("retourTime", "time")}
        </div>
      )}
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
}: {
  id: string;
  label: ReactNode;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** In a group in error (« Qui monte avec vous ? », C4.13): each box says so, as a radio group does. */
  invalid?: boolean;
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
