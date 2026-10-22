"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventErrors, EventField, EventFields as SentFields } from "@/domain/event";
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
 * A change of the fields, applied to the state current when it runs, not to the one of the
 * render it came from: a state set meanwhile (a merge with the saved values, #269) is kept.
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
