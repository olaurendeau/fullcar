"use client";

import { LoaderCircle, Mail, Pencil, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PendingNotice as Notice } from "@/domain/pending-send";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageHidden } from "./hidden-page";

/**
 * The notice « Confirmez votre adresse » of a pending event (organizer-account v4, OA1.7,
 * OA1.9, OA1.10, OA2.1): after the link to share, the result kept of the confirmation email,
 * its address in full, then « Renvoyer l’e-mail » and « Corriger l’adresse », 44 px. A
 * failure, or the limit of the address, is in the destructive colour.
 *
 * It never takes the focus: its words are in a polite live region, a failure's in an alert
 * (OA1.7), both always there, so that a change is announced; a change while a sheet hides
 * the page waits for it to show. While the email is on its way,
 * both buttons are inactive (`aria-disabled`, they keep the focus). Decision: without
 * `onResend` or `onFix`, its button is inactive too. — Reason: « Renvoyer l’e-mail » (#601) is
 * given, « Corriger l’adresse » comes with #602; a button that would do nothing is not shown as active.
 */
export function PendingNotice({ pending, onResend, onFix }: { pending: Notice; onResend?: () => void; onFix?: () => void }) {
  const t = useTranslations("Admin.pending");
  // While a sheet hides the page, under Radix's `aria-hidden`, the notice keeps what it said:
  // its change is written, and announced, once the page shows again (#182, as the panel's regions).
  const hidden = usePageHidden();
  const [said, setSaid] = useState(pending);
  if (!hidden && (said.email !== pending.email || said.send !== pending.send)) setSaid(pending);
  const { email, send } = hidden ? said : pending;
  const failure = send === "failed" || send === "addressLimit";
  const Icon = send === "sending" ? LoaderCircle : failure ? TriangleAlert : Mail;
  const [title, body] =
    send === "failed"
      ? [t("sendFailed.title"), t("sendFailed.body", { email })]
      : send === "addressLimit"
        ? [t("addressLimit.title"), t("addressLimit.body", { email })]
        : [t("title"), t(send === "sending" ? "sending" : "body", { email })];
  const text = (
    <>
      <p className={cn("font-semibold", failure && "text-destructive")}>{title}</p>
      <p className="max-w-prose text-muted-foreground wrap-anywhere">{body}</p>
    </>
  );
  const action = (name: "resend" | "fix", label: string, Glyph: typeof Mail, onPress: (() => void) | undefined) => {
    const inactive = send === "sending" || !onPress;
    return (
      <Button
        type="button"
        variant="outline"
        data-pending-action={name}
        aria-disabled={inactive || undefined}
        onClick={() => {
          if (!inactive) onPress();
        }}
        className="h-11 min-w-0 flex-auto aria-disabled:opacity-50"
      >
        <Glyph aria-hidden />
        {label}
      </Button>
    );
  };

  return (
    <div
      data-pending-notice={send}
      className={cn(
        "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 rounded-lg border p-3 text-sm",
        failure && "border-destructive bg-background",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4", send === "sending" && "animate-spin", failure && "text-destructive")} />
      <div aria-live="polite" className={TEXT}>
        {!failure && text}
      </div>
      <div role="alert" className={TEXT}>
        {failure && text}
      </div>
      <div className="col-start-2 row-start-2 mt-2 flex flex-wrap gap-2">
        {action("resend", t("resend"), Mail, onResend)}
        {action("fix", t("fix"), Pencil, onFix)}
      </div>
    </div>
  );
}

// Both regions in the same cell, never hidden: only one holds words at a time, the other has no height.
const TEXT = "col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5";
