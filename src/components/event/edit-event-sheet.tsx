"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { EditAnswer } from "@/app/e/[id]/admin/screen-state";
import type { ActionProblem } from "@/app/e/[id]/run-action";
import { Button } from "@/components/ui/button";
import {
  deviceBounds,
  firstInvalidField,
  validateEventChange,
  type EventErrors,
  type EventFields,
  type EventHeader,
} from "@/domain/event";
import { BottomSheet } from "./bottom-sheet";
import { EventFormFields, eventFieldsChanged, loadedEventFields } from "./event-fields";

/** Sends the organiser's change: `fields` as the form holds them, `before` the values it loaded. */
export type EditEvent = (fields: EventFields, before: EventHeader) => Promise<EditAnswer>;

/**
 * « Modifier l’événement » (organizer-view v3.3.6, « Le formulaire »): a sheet with the fields of
 * the creation and no option, loaded with `event`, the values the page shows as it opens. Neither
 * « Fermer »: « Annuler » and Escape close it. Closed, by them or once saved, the focus goes back
 * to `onClosed`'s place, « Modifier l’événement ».
 */
export function EditEventSheet({
  open,
  onOpenChange,
  event,
  onEdit,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventHeader;
  onEdit: EditEvent;
  onClosed: () => void;
}) {
  const t = useTranslations("EditEvent");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      closable={false}
      onCloseAutoFocus={(focus) => {
        focus.preventDefault();
        onClosed();
      }}
    >
      <EditEventForm event={event} onEdit={onEdit} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

/**
 * The form, mounted with each opening: what it loaded is what the page showed then. Nothing
 * changed, « Valider » closes it, with no request (M2.5). The fields are checked against the
 * device's date, a saved date kept even past (M2.4), then sent; while the request runs,
 * « Valider » is `aria-disabled` and keeps the focus, and a second tap or Enter sends nothing.
 * Saved, the sheet closes; a field refused shows under it, the focus on the first; offline or on
 * a failure, the sheet says so above « Valider », which gets the focus, and what was typed stays.
 */
function EditEventForm({ event, onEdit, onDone }: { event: EventHeader; onEdit: EditEvent; onDone: () => void }) {
  const tActions = useTranslations("Actions");
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const [before] = useState(event);
  const [loaded] = useState(() => loadedEventFields(event));
  const [fields, setFields] = useState(loaded);
  const [errors, setErrors] = useState<EventErrors>({});
  const [problem, setProblem] = useState<ActionProblem | null>(null);
  const [sending, setSending] = useState(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing.
  const inFlight = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  // An answer that comes once this form is gone closes no sheet opened since.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function showErrors(found: EventErrors) {
    setErrors(found);
    const first = firstInvalidField(found);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  async function submit(submitted: FormEvent<HTMLFormElement>) {
    submitted.preventDefault();
    if (inFlight.current) return;
    if (!eventFieldsChanged(fields.values, loaded.values)) return onDone();
    setProblem(null);
    const checked = validateEventChange(fields.values, deviceBounds(new Date()), before);
    if (!checked.ok) return showErrors(checked.errors);
    setErrors({});

    inFlight.current = true;
    setSending(true);
    const answer = await onEdit(fields.values, before);
    inFlight.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (answer.kind === "saved") return onDone();
    if (answer.kind === "errors") return showErrors(answer.errors);
    setProblem(answer.problem);
    submitButton.current?.focus();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      <EventFormFields idOf={idOf} state={fields} errors={errors} onChange={setFields} />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {tActions(problem)}
        </p>
      )}
      <Button
        ref={submitButton}
        type="submit"
        className="h-11 w-full aria-disabled:bg-muted aria-disabled:text-muted-foreground"
        aria-disabled={sending || undefined}
      >
        {tActions("submit")}
      </Button>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={onDone}>
        {tActions("cancel")}
      </Button>
    </form>
  );
}
