"use client";

import { Eraser, Mail, MapPin, UserX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";
import { LoginForm } from "@/app/connexion/login-form";
import type { Refusal } from "@/app/e/[id]/admin/admin-token-store";
import { MyEventsLink } from "@/components/account/my-events-link";
import { Button } from "@/components/ui/button";
import { toWallClock, wallClockAsUtc } from "@/domain/wall-clock";
import { useFormatDate } from "@/i18n/format-date";
import { EventDates } from "./event-dates";

const TITLE = "min-w-0 rounded-sm text-2xl font-bold wrap-anywhere focus-visible:focus-ring";

/**
 * The organiser area refused, each reason with its own screen (organizer-account v4, #598), in
 * place of the panel and of the board: nothing of either is shown. Its title, `headingRef`, is
 * the focus's place after « Réessayer » (O5.8).
 *
 * - `signIn`: « Espace organisateur », `AdminLogin.body` and the sign-in form, whose link brings
 *   back here (OA7.1, OA4.4).
 * - `pending`: « Adresse pas encore confirmée », with or without a session (OA7.7): neither the
 *   address, nor a form.
 * - `notYours`: the address of the visitor's own session, « Voir l’événement » and « Se
 *   connecter avec une autre adresse » (OA7.2).
 * - `orphan`: « Cet événement n’a plus d’organisateur », for every visitor (OA7.9).
 * - `ended`: the organiser of an anonymised event: its title, place and dates, and when its
 *   sign-ups were erased, under « Mes événements » (OA8.4).
 * - `invalid`: an event gone since the page was read: the area's title alone.
 *
 * Its links are not prefetched: a refused visitor asks for no page they did not open.
 */
export function OrganiserRefused({ id, refusal, headingRef }: { id: string; refusal: Refusal; headingRef?: Ref<HTMLHeadingElement> }) {
  const t = useTranslations();
  const see = t("AdminNotYours.see");
  const heading = (text: string) => (
    <h1 ref={headingRef} tabIndex={-1} className={TITLE}>
      {text}
    </h1>
  );

  switch (refusal.kind) {
    case "invalid":
    case "signIn":
      return (
        <section className="mx-auto flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col gap-2">
            {heading(t("Admin.title"))}
            {refusal.kind === "signIn" && <p className="text-muted-foreground">{t("AdminLogin.body")}</p>}
          </div>
          {refusal.kind === "signIn" && <LoginForm returnEventId={id} />}
        </section>
      );
    case "pending":
      return (
        <Centred icon={<Mail className="size-6" />} heading={heading(t("AdminPending.title"))} body={t("AdminPending.body")}>
          <Button asChild variant="outline" className="h-11">
            <Link href={`/e/${id}`} prefetch={false}>{see}</Link>
          </Button>
          <p className="text-sm text-muted-foreground">{t("AdminPending.expired")}</p>
        </Centred>
      );
    case "notYours":
      return (
        <Centred
          icon={<UserX className="size-6" />}
          heading={heading(t("AdminNotYours.title"))}
          body={t("AdminNotYours.body", { email: refusal.email })}
        >
          <Button asChild className="h-11">
            <Link href={`/e/${id}`} prefetch={false}>{see}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/connexion" prefetch={false}>{t("AdminNotYours.switch")}</Link>
          </Button>
        </Centred>
      );
    case "orphan":
      return (
        <Centred icon={<UserX className="size-6" />} heading={heading(t("AdminOrphan.title"))} body={t("AdminOrphan.body")}>
          <Button asChild className="h-11">
            <Link href={`/e/${id}`} prefetch={false}>{see}</Link>
          </Button>
        </Centred>
      );
    case "ended":
      return <Anonymized heading={heading(refusal.event.title)} refusal={refusal} />;
  }
}

/** A screen of its own, centred as « Événement introuvable » is: its tile, title, body, then its actions. */
function Centred({ icon, heading, body, children }: { icon: ReactNode; heading: ReactNode; body: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-2">
      <div aria-hidden className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-3">
        {heading}
        <p className="text-muted-foreground wrap-anywhere">{body}</p>
      </div>
      <div className="mt-6 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** What the organiser of an anonymised event finds (OA8.4): what is left, and « Inscriptions effacées ». */
function Anonymized({ heading, refusal }: { heading: ReactNode; refusal: Extract<Refusal, { kind: "ended" }> }) {
  const t = useTranslations("Anonymized");
  const formatDate = useFormatDate();
  const { event, erasedOn } = refusal;
  const date = formatDate(wallClockAsUtc(toWallClock(erasedOn, "00:00")), { dateStyle: "long" });

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4">
      <MyEventsLink />
      <div className="flex flex-col gap-2">
        {heading}
        <p className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 wrap-anywhere">{event.location}</span>
        </p>
      </div>
      <EventDates start={event.allerAt} end={event.retourAt} />
      <div role="note" className="grid grid-cols-[1rem_1fr] gap-x-2.5 rounded-lg border p-3 text-sm">
        <Eraser aria-hidden className="mt-0.5 size-4" />
        <p className="font-semibold">{t("title")}</p>
        <p className="col-start-2 text-muted-foreground">{t("body", { date })}</p>
      </div>
    </section>
  );
}
