"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createEvent } from "@/app/actions";
import { signedInAs } from "@/app/connexion/actions";
import { goToOrganiserArea, keepAdminToken } from "@/app/e/[id]/admin/admin-token-store";
import { sendAction } from "@/app/e/[id]/run-action";
import { signOut } from "@/app/mes-evenements/actions";
import { signOutBrowser } from "@/app/mes-evenements/sign-out-browser";
import { forgetSessionToken, readSessionToken } from "@/app/session-token";
import { Button } from "@/components/ui/button";
import { emailAddress } from "@/domain/email-address";
import { deviceBounds, firstInvalidField, validateEvent, type EventErrors, type EventFields } from "@/domain/event";
import { BLANK_EVENT_FIELDS, Box, EventFormFields } from "./event-fields";
import { EmailField, SessionLine, type EmailProblem } from "./create-event-session";

// Decision: the box stays importable from here, as `seat-sheet.tsx` and `person-form.tsx` do.
// Reason: the move to `event-fields.tsx` (#264) touches no other file.
export { Box };

type Options = Pick<Required<EventFields>, "boosters" | "participation" | "stops">;
const OPTIONS = ["boosters", "participation", "stops"] as const;

const noSubscription = () => () => {};

/**
 * The creation form of the home page (#3, R1 to R3), its place with suggestions (#428). The
 * browser checks the fields against the device's date, the server checks them again, and
 * either way the errors show by their field. On success, the action's token goes to
 * `keepAdminToken`, and nowhere else.
 *
 * With a session open in the browser (#613, OA1.3), the token of session-token.ts goes to
 * `createEvent` in the body, and a line says whose the event will be, asked after the load:
 * the HTML depends on no session. Without a session the address field is there, required
 * (OA1.1, OA1.4): it is hidden only for an open session, or while the server has not yet said
 * whether the one kept is open. It comes back once a session has ended (OA1.5) or been closed
 * here (OA1.8); the values typed are kept in both cases.
 */
export function CreateEventForm() {
  const t = useTranslations("CreateEvent");
  const router = useRouter();
  const ids = useId();
  const idOf = (name: string) => `${ids}-${name}`;
  // Inactive until hydrated: without JavaScript, nothing can be created (C1.5).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const [eventFields, setEventFields] = useState(BLANK_EVENT_FIELDS);
  const [options, setOptions] = useState<Options>({ boosters: false, participation: false, stops: false });
  const [errors, setErrors] = useState<EventErrors>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  // The open session's address, once the server has said; and what put the line of the session in its place (OA1.5, OA1.8).
  const [account, setAccount] = useState<string>();
  // A session token is kept in this browser, and whether the server has answered about it.
  const keepsSession = useSyncExternalStore(noSubscription, () => readSessionToken() !== undefined, () => false);
  const [answered, setAnswered] = useState(false);
  const [emailAsked, setEmailAsked] = useState<"sessionEnded" | "signedOut">();
  const [email, setEmail] = useState("");
  const [emailProblem, setEmailProblem] = useState<EmailProblem>();
  const [signOutFailures, setSignOutFailures] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const signOutInFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const focusEmail = useRef(false);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing (C1.11).
  const inFlight = useRef(false);

  useEffect(() => {
    const token = readSessionToken();
    if (token === undefined) return;
    let current = true;
    void sendAction(() => signedInAs(token)).then((sent) => {
      if (!current) return;
      setAnswered(true);
      if (!sent.ok) return;
      const answer = sent.value as { email?: unknown } | null;
      if (typeof answer?.email === "string") setAccount(answer.email);
      // A session the server says ended never comes back: the form is the one of no session.
      else if (answer?.email === null) forgetSessionToken(token);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusEmail.current) return;
    focusEmail.current = false;
    emailRef.current?.focus();
  });

  // Required without a session (OA1.1); hidden for an open one, and until the server has said if the one kept is.
  const showEmail = account === undefined && !(keepsSession && !answered);

  // The place and its position go together, both among the values, `null` without one (« Un lieu, une valeur »).
  const fields: EventFields = { ...eventFields.values, ...options };

  function showErrors(found: EventErrors, email?: EmailProblem) {
    setErrors(found);
    setEmailProblem(email);
    const first = firstInvalidField(found);
    if (first) document.getElementById(idOf(first))?.focus();
    else if (email) focusEmail.current = true;
  }

  /** « Se déconnecter » (OA1.8): the page stays, what was typed is kept, the address field takes the line's place. */
  async function signOutHere() {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    const run = await signOutBrowser((session, adminTokens) => sendAction(() => signOut(session, adminTokens)));
    signOutInFlight.current = false;
    setSigningOut(false);
    if (run === "failed") return setSignOutFailures((count) => count + 1);
    setSignOutFailures(0);
    setAccount(undefined);
    setEmailAsked("signedOut");
    focusEmail.current = true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setFailed(false);
    const checked = validateEvent(fields, deviceBounds(new Date()));
    const address = showEmail ? emailAddress(email) : undefined;
    const addressError = address && "error" in address ? address.error : undefined;
    if (!checked.ok || addressError) return showErrors(checked.ok ? {} : checked.errors, addressError);
    // The fields are right now: an earlier error, from either side, no longer holds.
    showErrors({});

    inFlight.current = true;
    setSending(true);
    try {
      // Read now, not at the load: a session closed or ended meanwhile is no longer kept (OA1.5).
      const session = readSessionToken();
      const result = await createEvent({ ...fields, ...(session !== undefined && { session }), ...(showEmail && { email }) });
      if (result.ok) {
        // This browser created it: it keeps the token, then goes to the area, no fragment (OA1.6).
        keepAdminToken(result.id, result.token);
        return goToOrganiserArea(router, result.id);
      }
      const { email: emailError, ...found } = result.errors;
      if (emailError === "sessionEnded") {
        // Closed in another tab or expired (OA1.5): nothing was created; the field asks for the address.
        if (session !== undefined) forgetSessionToken(session);
        setAccount(undefined);
        setEmailAsked("sessionEnded");
      }
      showErrors(found, emailError);
    } catch {
      // Offline, or the server failed: one message, no detail (#3, decision 7).
      setFailed(true);
    }
    inFlight.current = false;
    setSending(false);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <SessionLine
        account={account}
        signedOut={emailAsked === "signedOut"}
        signingOut={signingOut}
        failures={signOutFailures}
        onSignOut={() => void signOutHere()}
      />
      <EventFormFields idOf={idOf} state={eventFields} errors={errors} onChange={setEventFields} suggestions sending={sending} />
      <div role="group" aria-labelledby={idOf("options")} className="flex flex-col gap-1 rounded-xl border px-3.5 py-2">
        <span id={idOf("options")} className="pt-1.5 text-sm font-semibold">
          {t("options")}
        </span>
        {OPTIONS.map((name) => (
          <Box
            key={name}
            id={idOf(name)}
            label={t(`${name}.label`)}
            hint={t(`${name}.hint`)}
            checked={options[name]}
            onChange={(checked) => setOptions((current) => ({ ...current, [name]: checked }))}
          />
        ))}
      </div>
      {showEmail && (
        <EmailField id={idOf("email")} value={email} problem={emailProblem} inputRef={emailRef} onChange={setEmail} hint />
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
      <noscript>
        <p className="text-sm text-muted-foreground">{t("needsJavaScript")}</p>
      </noscript>
      <Button type="submit" className="h-11" disabled={!hydrated || sending}>
        {t("create")}
      </Button>
    </form>
  );
}
