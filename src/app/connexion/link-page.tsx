"use client";

import { Check, Clock, LoaderCircle, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { sendAction } from "@/app/e/[id]/run-action";
import { keepSessionToken } from "@/app/session-token";
import { Button } from "@/components/ui/button";
import { openConfirmationLink, openLoginLink, resendConfirmationLink } from "./actions";
import { noteArrival } from "./arrival";
import { CheckEmail } from "./check-email";
import { linkTokenOf } from "./link-fragment";
import { openLinkInBrowser, resendLinkInBrowser, type LinkScreen, type OpenAlert, type ResendAlert, type ResendOutcome } from "./link-browser";
import type { LoginOutcome } from "./login-outcome";

/** Without JavaScript, nothing can send the token: the sentence of OA4.7 alone, from a `<noscript>`. */
const WITHOUT_SCRIPT = "#link-body,#link-actions{display:none}";

const TITLE = "self-start rounded-sm text-2xl font-bold focus-visible:focus-ring";
const BUTTON = "h-11 w-full aria-disabled:opacity-50";

/** The fragment, read from the address bar: `null` on the server and before hydration, where it is unknown. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** What the page shows: the button, a page that explains why there is none, or « Regardez vos e-mails ». */
type Shown = "ready" | LinkScreen | "sent";

/**
 * The page of a link in an email (OA5.1 to OA5.8): `/connexion/lien` signs in, `/connexion/confirmer`
 * confirms the address of an event and signs in. Opening it asks the server nothing, so that a
 * scanner of emails that follows the link uses nothing up (OA5.1): the token is read from the
 * fragment, `location.hash`, on the press of the button, and goes in the body of the action, in no URL.
 * Once a session is open the browser keeps it (OA5.9) and leaves for the page the link leads to
 * (OA4.4) with `router.replace`, which takes the fragment out of the address bar and of the
 * history (OA5.2); the bar of the root layout says whose session it is (arrival-bar.tsx).
 *
 * The same HTML for every visitor, with the button inactive until hydrated (C1.5). A fragment that
 * is no token is « Ce lien n’est pas valide » at once (OA5.7); one that is well formed but unknown is
 * so after the press. The pressed button is `aria-disabled` while the request goes (OA5.8).
 */
export function LinkPage({ kind }: { kind: "login" | "confirm" }) {
  const t = useTranslations("LinkPage");
  const tLogin = useTranslations("Login");
  const tCheck = useTranslations("Check");
  const tAdmin = useTranslations("Admin.pending");
  const tMyEvents = useTranslations("MyEvents");
  const router = useRouter();
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => null,
  );

  const [after, setAfter] = useState<Shown>();
  const [working, setWorking] = useState(false);
  const [alert, setAlert] = useState<{ n: number; alert: OpenAlert | ResendAlert }>();
  // Set at once, unlike `working`: a second tap before the next render sends nothing (OA5.8).
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Where the focus goes once the page has changed (« Le focus »): the title of the new page, or the button after a failure.
  const focusNext = useRef<"title" | "button">(undefined);

  const shown: Shown = after ?? (hash !== null && linkTokenOf(hash) === undefined ? "invalid" : "ready");

  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = undefined;
    if (next === "title") title.current?.focus();
    if (next === "button") button.current?.focus();
  }, [after, alert]);

  function alerted(found: OpenAlert | ResendAlert) {
    focusNext.current = "button";
    setAlert((last) => ({ n: (last?.n ?? 0) + 1, alert: found }));
  }

  function goTo(screen: Shown) {
    focusNext.current = "title";
    setAlert(undefined);
    setAfter(screen);
  }

  /** « Se connecter » or « Confirmer et se connecter »: the fragment is read now, and only now. */
  async function open() {
    if (inFlight.current || hash === null) return;
    inFlight.current = true;
    setWorking(true);
    setAlert(undefined);
    const use = kind === "login" ? openLoginLink : openConfirmationLink;
    const outcome = await openLinkInBrowser(window.location.hash, (token) => sendAction(() => use(token)), keepSessionToken);
    if (outcome.kind === "opened") {
      // Left as it is until the page goes: no second press, no button back for a link that has been used.
      noteArrival();
      router.replace(outcome.to);
      return;
    }
    inFlight.current = false;
    setWorking(false);
    if (outcome.kind === "alert") alerted(outcome.alert);
    else goTo(outcome.screen);
  }

  const resend = (): Promise<ResendOutcome> =>
    resendLinkInBrowser(window.location.hash, (token) => sendAction(() => resendConfirmationLink(token)));

  /** « Recevoir un nouveau lien » on an expired confirmation link (OA5.6): nothing is typed. */
  async function askForNewLink() {
    if (inFlight.current || hash === null) return;
    inFlight.current = true;
    setWorking(true);
    setAlert(undefined);
    const outcome = await resend();
    inFlight.current = false;
    setWorking(false);
    if (outcome.kind === "alert") alerted(outcome.alert);
    else goTo(outcome.kind === "sent" ? "sent" : outcome.screen);
  }

  // The press of « Se connecter » opens a session (`LinkPage.offline`, `failed`); that of « Recevoir un
  // nouveau lien » sends an email (`Admin.pending.offline`, `tooMany`, OA5.6).
  const alertLine = alert && (
    <p key={alert.n} role="alert" className="text-sm text-destructive">
      {shown === "expired" ? (alert.alert === "tooMany" ? tAdmin("tooMany") : tAdmin("offline")) : t(alert.alert === "tooMany" ? "failed" : alert.alert)}
    </p>
  );

  if (shown === "sent") {
    return (
      <CheckEmail
        body={tCheck("confirmBody")}
        headingRef={title}
        resend={async (): Promise<LoginOutcome> => {
          const outcome = await resend();
          if (outcome.kind === "sent") return { kind: "sent" };
          return { kind: "alert", alert: outcome.kind === "alert" ? outcome.alert : "failed" };
        }}
        alertText={(found) => (found === "tooMany" ? tAdmin("tooMany") : tAdmin("offline"))}
      />
    );
  }

  const back = (
    <Button asChild variant="outline" className={BUTTON}>
      <Link href="/connexion">{t("newLink")}</Link>
    </Button>
  );
  const myEvents = (
    <Button asChild className={BUTTON}>
      <Link href="/mes-evenements">{tMyEvents("title")}</Link>
    </Button>
  );

  let icon: ReactNode;
  let heading: string;
  let body: string;
  let actions: ReactNode;
  if (shown === "ready") {
    icon = kind === "login" ? <Users aria-hidden className="size-6" /> : <Check aria-hidden className="size-6" />;
    heading = t(`${kind}.title`);
    body = t(`${kind}.body`);
    actions = (
      <>
        {alertLine}
        <Button
          ref={button}
          type="button"
          className={BUTTON}
          disabled={hash === null}
          aria-disabled={working || undefined}
          onClick={() => void open()}
        >
          {working && <LoaderCircle aria-hidden className="animate-spin" />}
          {working ? t("working") : t(`${kind}.button`)}
        </Button>
      </>
    );
  } else if (shown === "expired") {
    icon = <Clock aria-hidden className="size-6" />;
    heading = t("expired.title");
    body = t(`expired.${kind}`);
    actions =
      kind === "login" ? (
        <Button asChild className={BUTTON}>
          <Link href="/connexion">{t("newLink")}</Link>
        </Button>
      ) : (
        <>
          {alertLine}
          <Button ref={button} type="button" className={BUTTON} aria-disabled={working || undefined} onClick={() => void askForNewLink()}>
            {t("newLink")}
          </Button>
        </>
      );
  } else if (shown === "used") {
    icon = <Check aria-hidden className="size-6" />;
    heading = t("used.title");
    body = t(`used.${kind}`);
    actions = (
      <>
        {myEvents}
        {kind === "login" && back}
      </>
    );
  } else {
    icon = <X aria-hidden className="size-6" />;
    heading = t("invalid.title");
    body = t("invalid.body");
    actions = (
      <Button asChild className={BUTTON}>
        <Link href="/connexion">{t("newLink")}</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-primary">{icon}</div>
      <h1 ref={title} tabIndex={-1} className={TITLE}>
        {heading}
      </h1>
      <p id="link-body" className="mt-2 mb-6 text-muted-foreground">
        {body}
      </p>
      <div id="link-actions" className="flex flex-col gap-2">
        {actions}
      </div>
      {shown === "ready" && (
        <noscript>
          <style>{WITHOUT_SCRIPT}</style>
          <p className="text-sm text-destructive">{tLogin("needsJavaScript")}</p>
        </noscript>
      )}
    </div>
  );
}
