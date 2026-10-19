"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { createEvent } from "@/app/actions";
import { goToAdminLink } from "@/app/e/[id]/admin/admin-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deviceBounds,
  firstInvalidField,
  validateEvent,
  type EventErrors,
  type EventField,
  type EventFields,
} from "@/domain/event";
import { cn } from "@/lib/utils";
import { eventErrorMessage } from "./event-error";

type Texts = Pick<Required<EventFields>, EventField>;
type Options = Pick<Required<EventFields>, "boosters" | "participation" | "stops">;
const OPTIONS = ["boosters", "participation", "stops"] as const;

const noSubscription = () => () => {};

/**
 * The creation form of the home page (#3, R1 to R3). The browser checks the fields
 * against the device's date, the server checks them again, and either way the errors show
 * by their field. On success, the action's answer goes to `goToAdminLink`, and nowhere else.
 */
export function CreateEventForm() {
  const t = useTranslations("CreateEvent");
  const router = useRouter();
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  // Inactive until hydrated: without JavaScript, nothing can be created (C1.5).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const [texts, setTexts] = useState<Texts>({
    title: "",
    location: "",
    allerDate: "",
    allerTime: "",
    retourDate: "",
    retourTime: "",
  });
  // The retour date follows the aller date until it is changed (C1.3).
  const [retourDateChanged, setRetourDateChanged] = useState(false);
  const [retour, setRetour] = useState(true);
  const [options, setOptions] = useState<Options>({ boosters: false, participation: false, stops: false });
  const [errors, setErrors] = useState<EventErrors>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing (C1.11).
  const inFlight = useRef(false);

  const retourDate = retourDateChanged ? texts.retourDate : texts.allerDate;
  const fields: EventFields = { ...texts, retourDate, retour, ...options };

  function change(name: EventField, value: string) {
    if (name === "retourDate") setRetourDateChanged(true);
    setTexts((current) => ({ ...current, [name]: value }));
  }

  function showErrors(found: EventErrors) {
    setErrors(found);
    const first = firstInvalidField(found);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setFailed(false);
    const checked = validateEvent(fields, deviceBounds(new Date()));
    if (!checked.ok) return showErrors(checked.errors);
    // The fields are right now: an earlier error, from either side, no longer holds.
    setErrors({});

    inFlight.current = true;
    setSending(true);
    try {
      const result = await createEvent(fields);
      if (result.ok) return goToAdminLink(router, result);
      showErrors(result.errors);
    } catch {
      // Offline, or the server failed: one message, no detail (#3, decision 7).
      setFailed(true);
    }
    inFlight.current = false;
    setSending(false);
  }

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
          value={name === "retourDate" ? retourDate : texts[name]}
          onChange={(e) => change(name, e.target.value)}
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
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {text("title")}
      {text("location")}
      <div className="grid grid-cols-2 gap-3">
        {text("allerDate", "date")}
        {text("allerTime", "time")}
      </div>
      <Box id={idOf("retour")} label={t("retour")} hint={t("retourHint")} checked={retour} onChange={setRetour} />
      {retour && (
        <div className="grid grid-cols-2 gap-3">
          {text("retourDate", "date")}
          {text("retourTime", "time")}
        </div>
      )}
      <div role="group" aria-labelledby={idOf("options")} className="flex flex-col gap-1 rounded-xl border px-3.5 py-2">
        <span id={idOf("options")} className="pt-1.5 text-sm font-semibold">
          {t("options")}
        </span>
        {OPTIONS.map((name) => (
          <Box
            key={name}
            id={idOf(name)}
            label={t(`${name}.label`)}
            hint={t(`${name}.hint`)}
            checked={options[name]}
            onChange={(checked) => setOptions((current) => ({ ...current, [name]: checked }))}
          />
        ))}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
      <noscript>
        <p className="text-sm text-muted-foreground">{t("needsJavaScript")}</p>
      </noscript>
      <Button type="submit" className="h-11" disabled={!hydrated || sending}>
        {t("create")}
      </Button>
    </form>
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
}: {
  id: string;
  label: ReactNode;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
