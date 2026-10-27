"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { sendAction } from "@/app/e/[id]/run-action";
import { readSessionToken } from "@/app/session-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_MAX, emailAddress, type EmailError } from "@/domain/email-address";
import { cn } from "@/lib/utils";
import { requestLink, signedInAs } from "./actions";
import { CheckEmail } from "./check-email";
import { loginOutcome, type LoginAlert, type LoginOutcome } from "./login-outcome";

const noSubscription = () => () => {};

/** Without JavaScript, nothing can send the address: the sentence of OA4.7 alone, from a `<noscript>`. */
const WITHOUT_SCRIPT = "#login-intro,#login-form{display:none}";

/** Where the focus goes once the screen has changed: the title of « Regardez vos e-mails », or the field. */
type FocusNext = "check" | "field" | undefined;

/**
 * The sign-in of /connexion (OA4.1 to OA4.3, OA4.5 to OA4.7): the address, sent to
 * `requestLink` with the event the request comes from (`returnEventId`, where the link lands,
 * OA4.4), then « Regardez vos e-mails » in its place. The address is read as the server reads
 * it before anything goes; a refusal shows by the field, a failure above the button. The
 * field has no `name`: a submission before hydration would put nothing in the URL.
 *
 * With a session, « Session ouverte avec … » above the title (OA4.6), asked after the load
 * with the token of session-token.ts, in the body: the HTML depends on no session.
 */
export function LoginForm({ returnEventId = null }: { returnEventId?: string | null }) {
  const t = useTranslations("Login");
  const tErrors = useTranslations("FormErrors");
  const tHome = useTranslations("Home");
  const ids = useId();
  // Inactive until hydrated, as the creation form is (C1.5).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const [email, setEmail] = useState("");
  const [error, setError] = useState<EmailError>();
  const [alert, setAlert] = useState<{ n: number; alert: LoginAlert }>();
  const [sending, setSending] = useState(false);
  // The address « Regardez vos e-mails » shows, once a link went to it.
  const [sentTo, setSentTo] = useState<string>();
  const [signedIn, setSignedIn] = useState<string>();
  // Set at once, unlike `sending`: a second tap before the next render sends nothing (OA4.1).
  const inFlight = useRef(false);
  const focusNext = useRef<FocusNext>(undefined);
  const fieldRef = useRef<HTMLInputElement>(null);
  const checkRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const token = readSessionToken();
    if (token === undefined) return;
    let current = true;
    void sendAction(() => signedInAs(token)).then((sent) => {
      // A failure says nothing of the session: the line is left out.
      const answer = sent.ok ? (sent.value as { email?: unknown } | null) : null;
      if (current && typeof answer?.email === "string") setSignedIn(answer.email);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = undefined;
    if (next === "check") checkRef.current?.focus();
    if (next === "field") fieldRef.current?.focus();
  }, [sentTo]);

  const request = async (address: string): Promise<LoginOutcome> =>
    loginOutcome(await sendAction(() => requestLink(address, returnEventId)));

  function showError(found: EmailError) {
    setError(found);
    // The first field in error takes the focus (C1.6): here, the only one.
    fieldRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setAlert(undefined);
    const read = emailAddress(email);
    if ("error" in read) return showError(read.error);
    setError(undefined);

    inFlight.current = true;
    setSending(true);
    const outcome = await request(email);
    inFlight.current = false;
    setSending(false);
    if (outcome.kind === "invalid") return showError(outcome.error);
    if (outcome.kind === "alert") return setAlert((last) => ({ n: (last?.n ?? 0) + 1, alert: outcome.alert }));
    focusNext.current = "check";
    setSentTo(email.trim());
  }

  if (sentTo !== undefined) {
    return (
      <CheckEmail
        email={sentTo}
        headingRef={checkRef}
        resend={() => request(sentTo)}
        onChange={() => {
          focusNext.current = "field";
          setSentTo(undefined);
        }}
      />
    );
  }

  const errorId = `${ids}-error`;
  const errorMessage =
    error === "invalid" ? t("invalid") : error === "tooLong" ? tErrors("tooLong", { max: String(EMAIL_MAX) }) : error && tErrors("required");

  return (
    <>
      {signedIn !== undefined && (
        <p className="flex items-start gap-2 rounded-[10px] bg-muted px-3 py-2.5 text-sm">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {t("already", { email: signedIn })}{" "}
            <Link href="/mes-evenements" className="underline underline-offset-4">
              {t("myEvents")}
            </Link>
          </span>
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p id="login-intro" className="text-muted-foreground">
          {t("intro")}
        </p>
      </div>
      <noscript>
        <style>{WITHOUT_SCRIPT}</style>
        <p className="text-sm text-destructive">{t("needsJavaScript")}</p>
      </noscript>
      <form id="login-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${ids}-email`} className={cn(error && "text-destructive")}>
            {t("email")}
          </Label>
          <Input
            ref={fieldRef}
            id={`${ids}-email`}
            type="email"
            autoComplete="email"
            className="h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {errorMessage && (
            <p id={errorId} className="text-[13px] leading-[18px] text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
        {alert && (
          <p key={alert.n} role="alert" className="text-sm text-destructive">
            {t(alert.alert)}
          </p>
        )}
        <Button type="submit" className="h-11 aria-disabled:opacity-50" disabled={!hydrated} aria-disabled={sending || undefined}>
          {sending ? t("sending") : t("send")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/nouveau" className="underline underline-offset-4">
            {tHome("create")}
          </Link>
        </p>
      </form>
    </>
  );
}
