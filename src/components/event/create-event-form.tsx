"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createEvent } from "@/app/actions";
import { goToAdminLink } from "@/app/e/[id]/admin/admin-link";
import { Button } from "@/components/ui/button";
import { deviceBounds, firstInvalidField, validateEvent, type EventErrors, type EventFields } from "@/domain/event";
import { BLANK_EVENT_FIELDS, Box, EventFormFields } from "./event-fields";

// Decision: the box stays importable from here, as `seat-sheet.tsx` and `person-form.tsx` do.
// Reason: the move to `event-fields.tsx` (#264) touches no other file.
export { Box };

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

  const [eventFields, setEventFields] = useState(BLANK_EVENT_FIELDS);
  const [options, setOptions] = useState<Options>({ boosters: false, participation: false, stops: false });
  const [errors, setErrors] = useState<EventErrors>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing (C1.11).
  const inFlight = useRef(false);

  const fields: EventFields = { ...eventFields.values, ...options };

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

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <EventFormFields idOf={idOf} state={eventFields} errors={errors} onChange={setEventFields} />
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
