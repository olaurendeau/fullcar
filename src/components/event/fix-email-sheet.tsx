"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { FixAnswer } from "@/app/e/[id]/admin/screen-state";
import { Button } from "@/components/ui/button";
import { emailAddress } from "@/domain/email-address";
import { BottomSheet, SheetBar } from "./bottom-sheet";
import { EmailField, type EmailProblem } from "./create-event-session";

/** Sends the corrected address: what came of it, as the page takes it (`fixAnswer`). */
export type FixEmail = (typed: string) => Promise<FixAnswer>;

/**
 * « Corriger l’adresse » (epic #581, organizer-account v4, OA2.5): a sheet with the address the
 * notice shows, loaded in the field with the focus there, then `FixEmail.note`, « Envoyer le lien »
 * and « Annuler », in the sheet's bar (event-board v4.6) with neither « Fermer ». « Annuler » and
 * Escape close it and change nothing. Closed, by them or once the link is sent, the focus goes
 * back to `onClosed`'s place, « Corriger l’adresse ». Each `opening` mounts a form of its own,
 * loaded with `email`, the address as the notice showed it as the sheet opened.
 */
export function FixEmailSheet({
  open,
  onOpenChange,
  email,
  onFix,
  onClosed,
  opening,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onFix: FixEmail;
  onClosed: () => void;
  opening: number;
}) {
  const t = useTranslations("FixEmail");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      fullHeight
      closable={false}
      onCloseAutoFocus={(focus) => {
        focus.preventDefault();
        onClosed();
      }}
    >
      <FixEmailForm key={opening} email={email} onFix={onFix} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

/**
 * The form, mounted with each opening. The address is checked as the creation checks it
 * (`emailAddress`): one that is not one shows its error under the field, which takes the focus,
 * and nothing is sent. Sent, « Envoyer le lien » is `aria-disabled` and keeps the focus, the
 * field is read-only, and a second tap or Enter sends nothing. Sent for good, the sheet closes;
 * an address the server refuses shows under the field too. Otherwise the sheet says why above
 * « Envoyer le lien », which gets the focus, and what was typed stays: the limit
 * (`Admin.pending.tooMany`), or any other reason, a refusal included (`FixEmail.offline`), and a
 * failure of Brevo too: the correction is kept and the notice behind shows the new address, but the
 * sheet stays open for a retry, which counts as one more email. An event
 * no longer awaiting confirmation, or ended, closes the sheet: the page says the rest.
 */
function FixEmailForm({ email, onFix, onDone }: { email: string; onFix: FixEmail; onDone: () => void }) {
  const t = useTranslations("FixEmail");
  const tPending = useTranslations("Admin.pending");
  const ids = useId();
  // The address the link was sent to, as the note says it, whatever the notice shows meanwhile;
  // after a failure of Brevo, the address of the attempt: a retry makes its link stop working too.
  const [was, setWas] = useState(email);
  const [value, setValue] = useState(email);
  const [problem, setProblem] = useState<EmailProblem>();
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
    const answer = await onFix(value);
    inFlight.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (answer.kind === "address") {
      setProblem(answer.reason);
      return field.current?.focus();
    }
    // A failure of Brevo came after the correction was kept: the page behind shows the new address,
    // and a retry from the sheet is one more correction, which deletes the failed attempt's link.
    const failed = answer.kind === "answered" && answer.pending.send === "failed";
    if (failed) setWas(answer.pending.email);
    if (answer.kind === "tooMany" || answer.kind === "notSent" || failed) {
      setSaid(answer.kind === "tooMany" ? "tooMany" : "offline");
      return submitButton.current?.focus();
    }
    onDone();
  }

  return (
    <form id={`${ids}-form`} noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      <EmailField id={`${ids}-email`} value={value} problem={problem} inputRef={field} onChange={setValue} readOnly={sending} />
      <p className="flex items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
        <Info aria-hidden className="mt-px size-4 shrink-0" />
        <span className="min-w-0 wrap-anywhere">{t("note", { email: was })}</span>
      </p>
      {/* In the sheet's bar, out of the form: « Envoyer le lien » is its submit button by `form` (event-board v4.6, rule 1). */}
      <SheetBar
        messages={
          said && (
            <p role="alert" className="text-sm text-destructive">
              {said === "tooMany" ? tPending("tooMany") : t("offline")}
            </p>
          )
        }
      >
        <Button type="submit" ref={submitButton} form={`${ids}-form`} className="h-11 w-full aria-disabled:bg-muted aria-disabled:text-muted-foreground" aria-disabled={sending || undefined}>
          {t("send")}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onDone}>
          {t("cancel")}
        </Button>
      </SheetBar>
    </form>
  );
}
