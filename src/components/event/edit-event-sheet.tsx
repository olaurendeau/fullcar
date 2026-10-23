"use client";

import { TriangleAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { EventFormFields, eventFieldsChanged, loadedEventFields, withSavedFields } from "./event-fields";

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

/** What the sheet says above « Valider » after an answer (« Enregistrer », feuille ouverte). */
type Said = ActionProblem | "changed" | "invalid" | "eventNotFound";

/**
 * The form, mounted with each opening: what it loaded is what the page showed then. Nothing
 * changed, « Valider » closes it, with no request (M2.5). The fields are checked against the
 * device's date, a saved date kept even past (M2.4), then sent; while the request runs,
 * « Valider » is `aria-disabled` and keeps the focus, and a second tap or Enter sends nothing.
 * Saved, the sheet closes; a field refused shows under it, the focus on the first. Otherwise
 * the sheet says why above « Valider », which gets the focus, and what was typed stays:
 * offline, a failure, or the link refused (M8.2). Changed on another device (M6.1, M6.2), the
 * fields not changed take the saved values, which become the ones loaded and `before`. The event
 * gone (M8.3), « Valider » is `disabled` for good, and the focus goes to « Annuler ».
 */
function EditEventForm({ event, onEdit, onDone }: { event: EventHeader; onEdit: EditEvent; onDone: () => void }) {
  const tActions = useTranslations("Actions");
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const [before, setBefore] = useState(event);
  const [loaded, setLoaded] = useState(() => loadedEventFields(event));
  const [fields, setFields] = useState(loaded);
  const [errors, setErrors] = useState<EventErrors>({});
  const [said, setSaid] = useState<Said | null>(null);
  const [sending, setSending] = useState(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing.
  const inFlight = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
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
    if (said === "eventNotFound") return;
    if (!eventFieldsChanged(fields.values, loaded.values)) return onDone();
    setSaid(null);
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
    if (answer.kind === "refused" && answer.reason === "eventNotFound") {
      setSaid("eventNotFound");
      return cancelButton.current?.focus();
    }
    if (answer.kind === "changed") {
      const saved = loadedEventFields(answer.event);
      setFields(withSavedFields(loaded.values, saved));
      setLoaded(saved);
      setBefore(answer.event);
      setSaid("changed");
    } else {
      setSaid(answer.kind === "problem" ? answer.problem : answer.reason);
    }
    submitButton.current?.focus();
  }

  const gone = said === "eventNotFound";
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      <EventFormFields idOf={idOf} state={fields} errors={errors} onChange={setFields} />
      {(said === "offline" || said === "failed") && (
        <p role="alert" className="text-sm text-destructive">
          {tActions(said)}
        </p>
      )}
      {said === "changed" && <SheetNotice said={said} />}
      {(said === "invalid" || gone) && <SheetNotice said={said} destructive />}
      <Button
        ref={submitButton}
        type="submit"
        className="h-11 w-full aria-disabled:bg-muted aria-disabled:text-muted-foreground"
        aria-disabled={sending || undefined}
        disabled={gone}
      >
        {tActions("submit")}
      </Button>
      <Button ref={cancelButton} type="button" variant="outline" className="h-11 w-full" onClick={onDone}>
        {tActions("cancel")}
      </Button>
    </form>
  );
}

/**
 * An answer said with a title and a body, above « Valider »: changed on another device (M6.1),
 * or, in the destructive colour, the link refused (M8.2) and the event gone (M8.3).
 */
function SheetNotice({ said, destructive = false }: { said: "changed" | "invalid" | "eventNotFound"; destructive?: boolean }) {
  const t = useTranslations();
  const [title, body] = {
    changed: [t("EditEvent.changed.title"), t("EditEvent.changed.body")],
    invalid: [t("Admin.invalid.title"), t("Admin.invalid.body")],
    eventNotFound: [t("Actions.notDone.editEvent"), t("Actions.why.eventNotFound")],
  }[said];
  return (
    <div
      role="alert"
      className={cn(
        "grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-[10px] border p-3 text-sm",
        destructive && "border-destructive bg-background",
      )}
    >
      <TriangleAlert aria-hidden className={cn("row-span-2 mt-0.5 size-4", destructive && "text-destructive")} />
      <p className={cn("font-semibold", destructive && "text-destructive")}>{title}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}
