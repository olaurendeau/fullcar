import { TriangleAlert, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { newCreationId, storageAvailable } from "@/app/e/[id]/device-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Leg } from "@/domain/leg";
import { validatePerson, type PersonErrors, type PersonField } from "@/domain/person";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { Box } from "./create-event-form";
import { whenPageShown, type FromSheet } from "./hidden-page";
import { personErrorMessage } from "./person-error";

/** What the form sends, before its creation id: the person, « Aller et retour », and the tab's leg. */
export interface PersonDraft {
  firstName: string;
  phone: string;
  bothLegs: boolean;
  leg: Leg;
}

/** A registration as the form sends it. */
export interface Registering extends FromSheet {
  person: PersonDraft;
  /** The form's creation id, drawn at its first send and kept until one succeeds. */
  creationId: () => string;
  /** True until the answer: « Valider » is inactive meanwhile (C1.9). */
  sending: (sending: boolean) => void;
}

/** What became of a registration, for its form. A second tap while one is sent gets nothing. */
export type Registration =
  | { kind: "done" }
  | { kind: "errors"; errors: PersonErrors; first: PersonField }
  /** Offline, a server error, or a refusal (`Actions.failed`): nothing changed. */
  | { kind: "problem"; problem: "offline" | "failed" };

/** Registers a person (R1): the device's token, then the form's creation id, then the request. */
export type AddPerson = (registering: Registering) => Promise<Registration | undefined>;

/** Before « Valider », when this device cannot keep what it registers (C1.14, D5). */
export function StorageNotice({ title, body }: { title: string; body: string }) {
  return (
    <div role="note" className="grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-[10px] border p-3 text-sm">
      <TriangleAlert aria-hidden className="row-span-2 mt-0.5 size-4" />
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * « Ajouter une personne » on a leg (C1.1), and its form in a sheet (R1, R2). Inactive until
 * the device's persons are known (C5.9). Whether this device can keep its token is probed
 * as the sheet opens, with a key that names no event (C1.13).
 */
export function AddPersonButton({
  leg,
  hasRetour,
  disabled,
  addPerson,
}: {
  leg: Leg;
  hasRetour: boolean;
  disabled: boolean;
  addPerson: AddPerson;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(true);
  // Read when an answer comes. Radix keeps the form mounted while the sheet closes: once
  // « Fermer » or Escape is pressed, a failure goes to the bar.
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
        <Button variant="outline" disabled={disabled} className="h-auto min-h-11 whitespace-normal">
          <UserPlus aria-hidden />
          {t("Board.addPerson")}
        </Button>
      }
      title={t("PersonForm.title.add")}
      description={kept ? t("PersonForm.remember") : undefined}
    >
      {!kept && <StorageNotice title={t("PersonForm.storage.title")} body={t("PersonForm.storage.body")} />}
      <PersonForm
        leg={leg}
        hasRetour={hasRetour}
        addPerson={addPerson}
        open={() => isOpen.current}
        onDone={() => toggle(false)}
      />
    </BottomSheet>
  );
}

/**
 * The fields of R1: first name, number with who will see it (D2), and « Aller et retour »,
 * checked, absent without a retour (C1.3, C1.4). The browser checks them as the server does;
 * either way, each error shows under its field, the focus goes to the first, and what was
 * typed stays (C1.8), and a field error replaces a failure's message. Offline or a failure
 * is said in the form, above « Valider », which keeps the focus, and the form stays open.
 * The creation id is drawn at the first send and kept until one succeeds: sent again after
 * a lost answer, the same creation creates nothing more (C1.12).
 */
function PersonForm({
  leg,
  hasRetour,
  addPerson,
  open,
  onDone,
}: {
  leg: Leg;
  hasRetour: boolean;
  addPerson: AddPerson;
  open: () => boolean;
  onDone: () => void;
}) {
  const t = useTranslations("PersonForm");
  const tErrors = useTranslations("FormErrors");
  const tActions = useTranslations("Actions");
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  const [values, setValues] = useState<Record<PersonField, string>>({ firstName: "", phone: "" });
  const [bothLegs, setBothLegs] = useState(true);
  const [errors, setErrors] = useState<PersonErrors>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<"offline" | "failed" | null>(null);
  const creationId = useRef<string | undefined>(undefined);
  const submitButton = useRef<HTMLButtonElement>(null);
  // Each form its own: a sheet reopened during a send shows a new form, and the sending one is gone.
  const mounted = useRef(false);
  // Withdraws the failure this form left for the bar: sent again, the form says what comes of it.
  const closed = useRef<(() => void) | undefined>(undefined);
  const inForm = () => open() && mounted.current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // « Valider » lost the focus while it was inactive: after a refusal, it gets it back
  // (« refus dans une feuille : ne bouge pas »).
  useEffect(() => {
    if (problem && !sending && document.activeElement === document.body) submitButton.current?.focus();
  }, [problem, sending]);

  function showErrors(found: PersonErrors, first: PersonField) {
    setProblem(null);
    setErrors(found);
    document.getElementById(idOf(first))?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validatePerson(values);
    if (!checked.ok) return showErrors(checked.errors, checked.first);
    setErrors({});
    setProblem(null);
    closed.current?.();
    closed.current = undefined;
    const answer = await addPerson({
      person: { ...values, bothLegs: hasRetour && bothLegs, leg },
      creationId: () => (creationId.current ??= newCreationId()),
      sending: setSending,
      inSheet: inForm,
      whenClosed: (then) => (closed.current = whenPageShown(then)),
    });
    if (answer?.kind === "done") {
      creationId.current = undefined;
      // Not the sheet opened since: it shows another form.
      if (inForm()) onDone();
    } else if (answer?.kind === "errors") showErrors(answer.errors, answer.first);
    else if (answer?.kind === "problem" && inForm()) setProblem(answer.problem);
  }

  const field = (name: PersonField, input: { type: "text" | "tel"; autoComplete: string }, hint?: string) => {
    const error = errors[name];
    const message = error && personErrorMessage(name, error);
    const describedBy = [message && idOf(`${name}-error`), hint && idOf(`${name}-hint`)].filter(Boolean).join(" ");
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idOf(name)} className={cn(error && "text-destructive")}>
          {t(name)}
        </Label>
        <Input
          id={idOf(name)}
          {...input}
          className="h-10"
          value={values[name]}
          onChange={(e) => setValues((current) => ({ ...current, [name]: e.target.value }))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
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

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      {field("firstName", { type: "text", autoComplete: "given-name" })}
      {field("phone", { type: "tel", autoComplete: "tel" }, t("phoneHint"))}
      {hasRetour && (
        <Box id={idOf("both")} label={t("both")} hint={t(`bothHint.${leg}`)} checked={bothLegs} onChange={setBothLegs} />
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
