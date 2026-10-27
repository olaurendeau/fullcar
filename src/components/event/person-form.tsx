import { TriangleAlert, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { newCreationId, storageAvailable } from "@/app/e/[id]/device-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Leg } from "@/domain/leg";
import { PERSON_FIELDS, validateDriverPhone, validatePerson, type PersonError, type PersonErrors, type PersonField } from "@/domain/person";
import { cn } from "@/lib/utils";
import { BottomSheet, SheetBar } from "./bottom-sheet";
import { Box } from "./create-event-form";
import { editedFields, type NotDone } from "./failure-words";
import { focusAddPerson } from "./focus";
import { useSends, type FromSheet } from "./hidden-page";
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
  /** What the bar says was not done: the first name sent, its spaces trimmed (C11.11). */
  notDone: NotDone;
  /** Where the focus goes from the bar: the leg's « Ajouter une personne », or the car's title from a seat's sheet. */
  landmark: () => boolean;
  /** The form's creation id, drawn at its first send and kept until one succeeds. */
  creationId: () => string;
  /** True until the answer: « Valider » is inactive meanwhile (C1.9). */
  sending: (sending: boolean) => void;
}

/** What became of a registration or a change, for its form. A second tap while one is sent gets nothing. */
export type Registration =
  | { kind: "done" }
  | { kind: "errors"; errors: PersonErrors; first: PersonField }
  /** Offline, a server error, or a refusal (`Actions.failed`): nothing changed. */
  | { kind: "problem"; problem: "offline" | "failed" }
  /** Sent on the retour, which is gone: a sheet of the retour closes, and the bar says why (rule 9); one of the aller stays, without it. */
  | { kind: "noRetour" };

/** Registers a person (R1): the device's token, then the form's creation id, then the request. */
export type AddPerson = (registering: Registering) => Promise<Registration | undefined>;

/**
 * A change of one of the device's persons, as the form sends it (C2.3): an empty number removes
 * it. Only the fields changed since the form showed: one left out stays as it is (#208).
 */
export interface Updating extends FromSheet {
  personId: string;
  person: Partial<Record<PersonField, string>>;
  /** What the bar says was not done: the fields sent, and the first name as it showed (C11.11). */
  notDone: NotDone;
  /** True until the answer: « Valider » is inactive meanwhile (C1.9). */
  sending: (sending: boolean) => void;
}

/**
 * What became of a change, as of a registration; `phoneWhileDriving`, her number sent empty while
 * she drives, which she began elsewhere since the form showed: the state it carries shows her
 * driving (v4.8 rule 8).
 */
export type PersonChange = Registration | { kind: "phoneWhileDriving" };

/** Changes the first name and the number of one of the device's persons, with the device's token. */
export type UpdatePerson = (updating: Updating) => Promise<PersonChange | undefined>;

/** What the form does: register a person on a leg, or change one of the device's persons. */
export type PersonFormMode =
  | { kind: "add"; leg: Leg; hasRetour: boolean; addPerson: AddPerson; landmark: () => boolean }
  | { kind: "edit"; person: { id: string; firstName: string; phone: string | null; drives: boolean }; updatePerson: UpdatePerson };

/** The errors the form shows: those of R1, and a number emptied while she drives (v4.8 rule 8). */
type FormErrors = Omit<PersonErrors, "phone"> & { phone?: PersonError | "phoneWhileDriving" };

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
        <Button variant="outline" disabled={disabled} data-add-person={leg} className="h-auto min-h-11 whitespace-normal">
          <UserPlus aria-hidden />
          {t("Board.addPerson")}
        </Button>
      }
      title={t("PersonForm.title.add")}
      description={kept ? t("PersonForm.remember") : undefined}
      // It has fields: on a phone, it fills the screen (v4.6, rule 2).
      fullHeight
    >
      {!kept && <StorageNotice title={t("PersonForm.storage.title")} body={t("PersonForm.storage.body")} />}
      <PersonForm
        mode={{ kind: "add", leg, hasRetour, addPerson, landmark: () => focusAddPerson(leg) }}
        open={() => isOpen.current}
        onDone={() => toggle(false)}
        onGone={() => toggle(false)}
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
 *
 * In `edit` mode (C2.3), the first name and the number are filled with the person's, under the
 * same rules, without « Aller et retour »; the first name has the focus as the form shows. For a
 * person who drives, the number is « Téléphone », with the help for who drives, and emptied, it is
 * refused, here as on the server (v4.8 rule 8); left as it was, it is not sent, and nothing refuses it.
 * Opened from the sheet of a free seat, « Annuler » under « Valider » goes back to its list (C6.6).
 * Sent on the retour once it is gone, `onGone` closes its sheet (rule 9); sent from the aller with
 * « Aller et retour », the form stays without it (decision 41).
 */
export function PersonForm({
  mode,
  open,
  onDone,
  onCancel,
  onGone,
}: {
  mode: PersonFormMode;
  open: () => boolean;
  onDone: (personId: string) => void;
  onCancel?: () => void;
  onGone?: () => void;
}) {
  const t = useTranslations("PersonForm");
  const tErrors = useTranslations("FormErrors");
  const tActions = useTranslations("Actions");
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  // What the form showed: in `edit` mode, a field the user left as it was is not sent.
  const [shown] = useState<Record<PersonField, string>>(() =>
    mode.kind === "edit" ? { firstName: mode.person.firstName, phone: mode.person.phone ?? "" } : { firstName: "", phone: "" },
  );
  const [values, setValues] = useState(shown);
  const [bothLegs, setBothLegs] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<"offline" | "failed" | "noRetour" | null>(null);
  // « Aller et retour » as the sheet opened with it (the page holds the retour while the sheet
  // shows), until its own send is refused by `noRetour` (decision 41): the aller alone, then.
  const [gone, setGone] = useState(false);
  const creationId = useRef<string | undefined>(undefined);
  const submitButton = useRef<HTMLButtonElement>(null);
  // Each form its own: a sheet reopened during a send shows a new form, and the sending one is gone.
  // A change is about its person, whichever form sends it; a registration, about the first name it
  // sends, whichever form, tab or seat's sheet sends it (`person:new:{prénom}`, #228).
  const sends = useSends(open, mode.kind === "edit" ? `person:${mode.person.id}` : undefined);
  const editing = mode.kind === "edit";
  const drives = mode.kind === "edit" && mode.person.drives;
  const { leg, hasRetour } = mode.kind === "add" ? { leg: mode.leg, hasRetour: mode.hasRetour && !gone } : { leg: "aller" as const, hasRetour: false };

  // « Modifier » is gone as the form takes its place: the focus goes to the first name.
  useEffect(() => {
    if (editing) document.getElementById(`${ids}-firstName`)?.focus();
  }, [editing, ids]);

  // « Valider » lost the focus while it was inactive: after a refusal, it gets it back
  // (« refus dans une feuille : ne bouge pas »). « Aller et retour » gone, it takes it wherever it was (M7.8).
  useEffect(() => {
    if (problem && !sending && (problem === "noRetour" || document.activeElement === document.body)) submitButton.current?.focus();
  }, [problem, sending]);

  function showErrors(found: FormErrors, first: PersonField) {
    setProblem(null);
    setErrors(found);
    document.getElementById(idOf(first))?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A field is changed when it differs, character for character, from what the form showed:
    // put back as it was, it is not (v4.4-2). In `edit` mode, only what changed is sent.
    const changed = PERSON_FIELDS.filter((name) => values[name] !== shown[name]);
    // Nothing changed: the sheet closes, as after a change done; nothing is checked nor sent,
    // and the bar keeps what it holds (v4.4, #298).
    if (mode.kind === "edit" && changed.length === 0) return onDone(mode.person.id);
    const checked = validatePerson(values);
    // Emptied while she drives: refused before it is sent, as the server would (v4.8 rule 8).
    const given = drives && changed.includes("phone") ? validateDriverPhone(values.phone) : undefined;
    const emptied = given?.ok === false && given.errors.phone === "required";
    if (!checked.ok || emptied) {
      const found: FormErrors = { ...(!checked.ok && checked.errors), ...(emptied && { phone: "phoneWhileDriving" as const }) };
      return showErrors(found, found.firstName ? "firstName" : "phone");
    }
    setErrors({});
    setProblem(null);
    // Withdraws a failure any form about this person left for the bar, if this send carries all its
    // fields; a registration, one of the same first name, its spaces trimmed and its case kept.
    const sheet = mode.kind === "edit" ? sends(changed) : sends([], [`person:new:${checked.person.firstName}`]);
    const answer =
      mode.kind === "add"
        ? await mode.addPerson({
            person: { ...values, bothLegs: hasRetour && bothLegs, leg },
            creationId: () => (creationId.current ??= newCreationId()),
            sending: setSending,
            notDone: { kind: "addPerson", firstName: checked.person.firstName },
            landmark: mode.landmark,
            ...sheet,
          })
        : await mode.updatePerson({
            personId: mode.person.id,
            person: Object.fromEntries(changed.map((name) => [name, values[name]])),
            sending: setSending,
            // The first name before the change: nothing changed (« Ce que dit un échec »).
            notDone: { kind: "editPerson", firstName: mode.person.firstName, fields: editedFields(changed) },
            ...sheet,
          });
    if (answer?.kind === "done") {
      // A registration's creation id is the person's.
      const personId = mode.kind === "add" ? creationId.current : mode.person.id;
      creationId.current = undefined;
      // Not the sheet opened since: it shows another form.
      if (sheet.inSheet() && personId) onDone(personId);
    } else if (answer?.kind === "errors") showErrors(answer.errors, answer.first);
    else if (answer?.kind === "problem" && sheet.inSheet()) setProblem(answer.problem);
    // She drives since the form showed: the state shows it, and her number's field, in error (rule 8).
    else if (answer?.kind === "phoneWhileDriving" && sheet.inSheet()) showErrors({ phone: "phoneWhileDriving" }, "phone");
    // The retour is gone. Sent on it, the sheet closes (rule 9); from the aller, it stays without
    // « Aller et retour », and a second « Valider » registers the person at the aller alone (M7.8).
    else if (answer?.kind === "noRetour" && sheet.inSheet()) {
      if (leg === "retour") return onGone?.();
      setGone(true);
      setProblem("noRetour");
    }
  }

  // `phoneWhileDriving` names her by the first name the form showed, before the change (v4.8 rule 8).
  const messageOf = (name: PersonField, error: PersonError | "phoneWhileDriving") => {
    if (error === "phoneWhileDriving") return tErrors("phoneWhileDriving", { firstName: shown.firstName });
    const message = personErrorMessage(name, error);
    return tErrors(message.key, message.values);
  };

  const field = (name: PersonField, label: string, input: { type: "text" | "tel"; autoComplete: string }, hint?: string) => {
    const error = errors[name];
    const message = error && messageOf(name, error);
    const describedBy = [message && idOf(`${name}-error`), hint && idOf(`${name}-hint`)].filter(Boolean).join(" ");
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={idOf(name)} className={cn(error && "text-destructive")}>
          {label}
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
            {message}
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
    <form id={idOf("form")} noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      {field("firstName", t("firstName"), { type: "text", autoComplete: "given-name" })}
      {drives
        ? field("phone", t("phoneDriving"), { type: "tel", autoComplete: "tel" }, t("phoneHintDriving"))
        : field("phone", t("phone"), { type: "tel", autoComplete: "tel" }, t("phoneHint"))}
      {hasRetour && (
        <Box id={idOf("both")} label={t("both")} hint={t(`bothHint.${leg}`)} checked={bothLegs} onChange={setBothLegs} />
      )}
      {/* In the sheet's bar, out of the form: « Valider » is its submit button by `form` (v4.6, rule 1). */}
      <SheetBar
        messages={
          problem && (
            <p role="alert" className="text-sm text-destructive">
              {tActions(problem)}
            </p>
          )
        }
      >
        <Button ref={submitButton} type="submit" form={idOf("form")} className="h-11 w-full" disabled={sending}>
          {tActions("submit")}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" className="h-11 w-full" onClick={onCancel}>
            {tActions("cancel")}
          </Button>
        )}
      </SheetBar>
    </form>
  );
}
