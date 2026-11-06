"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { TransferAnswer } from "@/app/e/[id]/admin/screen-state";
import { Button } from "@/components/ui/button";
import { emailAddress } from "@/domain/email-address";
import { BottomSheet, SheetBar } from "./bottom-sheet";
import { EmailField, type EmailProblem } from "./create-event-session";

/** Sends the address typed: what came of it, as the page takes it (`transferAnswer`). */
export type TransferTo = (typed: string) => Promise<TransferAnswer>;

/**
 * « Céder l’événement » (epic #935, OT1.2): a sheet with `Transfer.sheet.note`, an empty field with
 * the focus in it and `Transfer.email.hint` under it, then « Envoyer le lien » and « Annuler » in
 * the sheet's bar, with neither « Fermer ». « Annuler » and Escape close it and change nothing.
 * However it closes, `onClosed` places the focus (OT8.5). Each `opening` mounts a form of its own.
 */
export function TransferSheet({
  open,
  onOpenChange,
  onTransfer,
  onClosed,
  opening,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: TransferTo;
  onClosed: () => void;
  opening: number;
}) {
  const t = useTranslations("Transfer");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("sheet.title")}
      fullHeight
      closable={false}
      onCloseAutoFocus={(focus) => {
        focus.preventDefault();
        onClosed();
      }}
    >
      <TransferForm key={opening} onTransfer={onTransfer} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

/**
 * The form, mounted with each opening. What is typed is checked as the creation checks an address
 * (`emailAddress`): empty, "Champ requis." ; not one, or over 254 characters,
 * `CreateEvent.email.invalid` (OT1.3). The error is under the field, which takes the focus, and
 * nothing is sent. The account's own address is refused by the server (OT1.4), the same way. Sent,
 * « Envoyer le lien » is `aria-disabled` and keeps the focus, the field is read-only, and a second
 * tap sends nothing. Sent for good, the sheet closes. Otherwise it says why above « Envoyer le
 * lien », which gets the focus, and what was typed stays: the limit (`Admin.pending.tooMany`), or
 * any other reason (`FixEmail.offline`). An event that no longer takes a handover closes it: the
 * page says the rest.
 */
function TransferForm({ onTransfer, onDone }: { onTransfer: TransferTo; onDone: () => void }) {
  const t = useTranslations("Transfer");
  const tFix = useTranslations("FixEmail");
  const tPending = useTranslations("Admin.pending");
  const ids = useId();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<EmailProblem | "self">();
  const [said, setSaid] = useState<"offline" | "tooMany">();
  const [sending, setSending] = useState(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing.
  const inFlight = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  // An answer that comes once this form is gone changes nothing of a sheet opened since.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(submitted: FormEvent<HTMLFormElement>) {
    submitted.preventDefault();
    if (inFlight.current) return;
    setSaid(undefined);
    const checked = emailAddress(value);
    if ("error" in checked) {
      setProblem(checked.error);
      return field.current?.focus();
    }
    setProblem(undefined);
    inFlight.current = true;
    setSending(true);
    const answer = await onTransfer(value);
    inFlight.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (answer.kind === "address") {
      setProblem(answer.reason);
      return field.current?.focus();
    }
    if (answer.kind === "self") {
      setProblem("self");
      return field.current?.focus();
    }
    if (answer.kind === "tooMany" || answer.kind === "notSent") {
      setSaid(answer.kind === "tooMany" ? "tooMany" : "offline");
      return submitButton.current?.focus();
    }
    onDone();
  }

  return (
    <form id={`${ids}-form`} noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      <p className="flex items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
        <Info aria-hidden className="mt-px size-4 shrink-0" />
        <span className="min-w-0">{t("sheet.note")}</span>
      </p>
      <EmailField
        id={`${ids}-email`}
        value={value}
        // Over 254 characters says what an address that is not one says; so does the account's own, with its words.
        problem={problem === "tooLong" || problem === "self" ? "invalid" : problem}
        inputRef={field}
        onChange={setValue}
        readOnly={sending}
        words={{ label: t("email.label"), hint: t("email.hint"), ...(problem === "self" && { error: t("email.self") }) }}
      />
      {/* In the sheet's bar, out of the form: « Envoyer le lien » is its submit button by `form` (event-board v4.6, rule 1). */}
      <SheetBar
        messages={
          said && (
            <p role="alert" className="text-sm text-destructive">
              {said === "tooMany" ? tPending("tooMany") : tFix("offline")}
            </p>
          )
        }
      >
        <Button
          type="submit"
          ref={submitButton}
          form={`${ids}-form`}
          className="h-11 w-full aria-disabled:bg-muted aria-disabled:text-muted-foreground"
          aria-disabled={sending || undefined}
        >
          {tFix("send")}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onDone}>
          {tFix("cancel")}
        </Button>
      </SheetBar>
    </form>
  );
}
