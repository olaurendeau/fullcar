"use client";

import { CircleCheck, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoginAlert, LoginOutcome } from "./login-outcome";

/** What the last « Renvoyer l’e-mail » showed, numbered: a second one alike is a new node, announced again. */
type Resent = { n: number; alert?: LoginAlert };

/**
 * « Regardez vos e-mails » (OA4.2, OA4.3): in place of the form, at the same address, the
 * same screen whether the address has an account or not. Its title takes the focus, by
 * `headingRef`, from the form that sent. « Renvoyer l’e-mail » keeps the focus and says what
 * came of it under the buttons; « Changer d’adresse » is the form's again.
 *
 * The same screen answers an expired confirmation link (OA5.6): `body` says what was sent in place
 * of `Check.body` (which names the address), there is no address to change, and `alertText` words
 * the failures of its resend.
 *
 * Decision: a resend that fails says it with the form's alert (`Login.offline`, `failed`,
 * `tooMany`), where `Check.resent` would be. — Reason: the design draws only the resend that
 * goes out; saying nothing would leave « E-mail renvoyé. » unsaid with no reason.
 */
export function CheckEmail({
  email = "",
  body,
  headingRef,
  level = "h1",
  resend,
  onChange,
  alertText,
}: {
  email?: string;
  /** What was sent, in place of `Check.body`. */
  body?: string;
  headingRef: Ref<HTMLHeadingElement>;
  /** An `h2` under another page's title, as the organiser area's (OA7.1). */
  level?: "h1" | "h2";
  resend: () => Promise<LoginOutcome>;
  /** « Changer d’adresse »; none, no button. */
  onChange?: () => void;
  /** The words of an alert, in place of the form's (`Login.offline`, `failed`, `tooMany`). */
  alertText?: (alert: LoginAlert) => string;
}) {
  const t = useTranslations("Check");
  const tLogin = useTranslations("Login");
  const Title = level;
  const [resent, setResent] = useState<Resent>();
  const [sending, setSending] = useState(false);
  // Set at once: a second tap before the next render sends nothing.
  const inFlight = useRef(false);

  async function again() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const outcome = await resend();
    inFlight.current = false;
    setSending(false);
    setResent((last) => ({
      n: (last?.n ?? 0) + 1,
      alert: outcome.kind === "sent" ? undefined : outcome.kind === "alert" ? outcome.alert : "failed",
    }));
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-primary">
        <Mail aria-hidden className="size-6" />
      </div>
      <Title
        ref={headingRef}
        tabIndex={-1}
        className={cn("self-start rounded-sm font-bold focus-visible:focus-ring", level === "h1" ? "text-2xl" : "text-xl")}
      >
        {t("title")}
      </Title>
      <p className="mt-2 mb-6 text-muted-foreground [overflow-wrap:anywhere]">{body ?? t("body", { email })}</p>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" className="h-11 aria-disabled:opacity-50" aria-disabled={sending || undefined} onClick={again}>
          <Mail aria-hidden />
          {t("resend")}
        </Button>
        {onChange && (
          <Button type="button" variant="outline" className="h-11" onClick={onChange}>
            {t("change")}
          </Button>
        )}
      </div>
      {/* In place before it speaks, as a live region must be to be announced. */}
      <div role="status">
        {resent && !resent.alert && (
          <p key={resent.n} className="mt-4 flex items-start gap-2 rounded-[10px] bg-muted px-3 py-2.5 text-sm">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{t("resent")}</span>
          </p>
        )}
      </div>
      {resent?.alert && (
        <p key={resent.n} role="alert" className="mt-4 text-sm text-destructive">
          {alertText ? alertText(resent.alert) : tLogin(resent.alert)}
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">{t("spam")}</p>
    </div>
  );
}
