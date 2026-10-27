"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_MAX, type EmailError } from "@/domain/email-address";
import { cn } from "@/lib/utils";

/** What is wrong with the address: a code of email-address.ts, or the session that ended under the form (OA1.5). */
export type EmailProblem = EmailError | "sessionEnded";

/**
 * Under the title of the creation form (OA1.3, OA1.8): with a session open, whose the event
 * will be, and « Se déconnecter », a button; its failure under the line (`Account.signOutFailed`),
 * the session open. Once signed out here, « Session fermée » in the line's place. Nothing
 * without an address to show, and nothing otherwise: the HTML depends on no session.
 */
export function SessionLine({
  account,
  signedOut,
  signingOut,
  failures,
  onSignOut,
}: {
  account: string | undefined;
  signedOut: boolean;
  signingOut: boolean;
  failures: number;
  onSignOut: () => void;
}) {
  const t = useTranslations("CreateEvent");
  const tAccount = useTranslations("Account");

  if (signedOut) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-[10px] bg-muted px-3 py-2.5 text-sm">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">{t("signedOut")}</span>
      </p>
    );
  }
  if (account === undefined) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] leading-[18px] text-muted-foreground [overflow-wrap:anywhere]">
        {t("signedIn", { email: account })}{" "}
        {t.rich("notYou", {
          signOut: (label) => (
            <button
              type="button"
              aria-disabled={signingOut || undefined}
              onClick={onSignOut}
              className="rounded-sm underline underline-offset-4 focus-visible:focus-ring"
            >
              {label}
            </button>
          ),
        })}
      </p>
      {failures > 0 && (
        // A new alert for each failure, announced again.
        <p key={failures} role="alert" className="text-[13px] leading-[18px] text-destructive">
          {tAccount("signOutFailed")}
        </p>
      )}
    </div>
  );
}

/**
 * The address field, just above « Créer » (OA1.1, OA1.4, OA1.5): shown once a session has ended
 * or been closed here. Its error, or the words of the ended session, shows under it and
 * describes it.
 */
export function EmailField({
  id,
  value,
  problem,
  inputRef,
  onChange,
}: {
  id: string;
  value: string;
  problem: EmailProblem | undefined;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("CreateEvent");
  const tErrors = useTranslations("FormErrors");
  const errorId = `${id}-error`;
  const message =
    problem === "sessionEnded"
      ? t("email.sessionEnded")
      : problem === "invalid"
        ? t("email.invalid")
        : problem === "tooLong"
          ? tErrors("tooLong", { max: String(EMAIL_MAX) })
          : problem && tErrors("required");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className={cn(problem && "text-destructive")}>
        {t("email.label")}
      </Label>
      <Input
        ref={inputRef}
        id={id}
        type="email"
        autoComplete="email"
        className="h-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errorId : undefined}
      />
      {message && (
        <p id={errorId} className="text-[13px] leading-[18px] text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
