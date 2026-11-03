"use client";

import { CalendarDays, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { sendAction } from "@/app/e/[id]/run-action";
import { readSessionToken } from "@/app/session-token";
import { ReadButton } from "@/components/event/read-button";
import { Button } from "@/components/ui/button";
import { myEvents } from "./actions";
import { MyAccount } from "./my-account";
import { MyEventRow } from "./my-event-row";
import { myEventsRead, openEventCount, PAST_SHOWN, shownPast, type MyEventsRead, type MyEventsShown } from "./screen-state";

type Screen = MyEventsRead | { state: "loading" };

/**
 * « Mes événements » once loaded (OA6.1 to OA6.8): the title, the session's address, « Créer
 * un événement », then the events read by `myEvents` with the token of session-token.ts, in
 * the body. Without a session, or with one the server says ended, the page leads to
 * /connexion, whose link brings it back here (OA6.8, OA4.4). While it reads, a status line;
 * on a failure, the alert and « Réessayer », after which the first title of the list takes
 * the focus, or the button keeps it on a new failure (« Le focus »). Below the events,
 * « Mon compte » (OA9.1).
 */
export function MyEventsScreen() {
  const t = useTranslations("MyEvents");
  const tHome = useTranslations("Home");
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ state: "loading" });
  const [retrying, setRetrying] = useState(false);
  const retried = useRef(false);
  const firstTitle = useRef<HTMLHeadingElement>(null);

  const read = useCallback(async (): Promise<MyEventsRead> => {
    const token = readSessionToken();
    return myEventsRead(token === undefined ? undefined : await sendAction(() => myEvents(token)));
  }, []);

  useEffect(() => {
    let current = true;
    void read().then((next) => {
      if (current) setScreen(next);
    });
    return () => {
      current = false;
    };
  }, [read]);

  useEffect(() => {
    if (screen.state === "signIn") router.replace("/connexion");
  }, [screen.state, router]);

  useLayoutEffect(() => {
    if (!retried.current || screen.state !== "events") return;
    retried.current = false;
    firstTitle.current?.focus();
  }, [screen]);

  async function retry() {
    setRetrying(true);
    const next = await read();
    retried.current = true;
    setRetrying(false);
    setScreen(next);
  }

  let content: ReactNode;
  if (screen.state === "events") content = <MyEventsLists list={screen.list} titleRef={firstTitle} />;
  else if (screen.state === "failed") content = <ReadFailed retrying={retrying} onRetry={retry} />;
  else {
    // While it reads, and while it leaves for /connexion.
    content = (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("loading")}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {/* The focus lands here once a link has opened the session (OA5.2, arrival-bar.tsx). */}
        <h1 tabIndex={-1} className="self-start rounded-sm text-2xl font-bold focus-visible:focus-ring">
          {t("title")}
        </h1>
        {screen.state === "events" && (
          <p className="text-[13px] leading-[18px] text-muted-foreground [overflow-wrap:anywhere]">
            {t("signedInAs", { email: screen.list.email })}
          </p>
        )}
      </div>
      <Button asChild variant="outline" className="h-11">
        <Link href="/nouveau">{tHome("create")}</Link>
      </Button>
      {content}
      {screen.state === "events" && <MyAccount email={screen.list.email} openEvents={openEventCount(screen.list)} />}
    </>
  );
}

/**
 * The two sections (OA6.1): « À venir (n) », then « Passés (n) », the first 10 of these until
 * « Afficher les autres », whose tap moves the focus to the first row it shows (OA6.6). No
 * event: `MyEvents.empty`, without section titles (OA6.5). A section without a past event is
 * left out: nothing would follow its title.
 */
function MyEventsLists({ list, titleRef }: { list: MyEventsShown; titleRef: Ref<HTMLHeadingElement> }) {
  const t = useTranslations("MyEvents");
  const [expanded, setExpanded] = useState(false);
  const focusNew = useRef(false);
  const firstNew = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!expanded || !focusNew.current) return;
    focusNew.current = false;
    firstNew.current?.focus();
  }, [expanded]);

  const { upcoming, past } = list;
  if (upcoming.length + past.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-[14px] border border-dashed px-4 py-5 text-center">
        <span className="mb-1 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <CalendarDays aria-hidden className="size-5" />
        </span>
        <h2 ref={titleRef} tabIndex={-1} className="rounded-sm font-semibold focus-visible:focus-ring">
          {t("empty.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("empty.body")}</p>
      </div>
    );
  }

  const { shown, more } = shownPast(past, expanded);
  return (
    <>
      <Section title={t("upcoming", { count: upcoming.length })} titleRef={titleRef}>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((event) => (
              <MyEventRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("noUpcoming")}</p>
        )}
      </Section>
      {past.length > 0 && (
        <Section title={t("past", { count: past.length })}>
          <ul className="flex flex-col gap-2">
            {shown.map((event, n) => (
              <MyEventRow key={event.id} event={event} linkRef={n === PAST_SHOWN ? firstNew : undefined} />
            ))}
          </ul>
          {more > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => {
                focusNew.current = true;
                setExpanded(true);
              }}
            >
              {t("more", { count: more })}
            </Button>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ title, titleRef, children }: { title: string; titleRef?: Ref<HTMLHeadingElement>; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="self-start rounded-sm font-semibold focus-visible:focus-ring">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The read failed (OA6.7): the alert of `AdminLinkProblem` (organizer-view, decision 14), with
 * « Réessayer ». Its alert region holds the text alone, emptied while « Réessayer » reads and
 * filled again on a new failure, so that it is announced again; the text stays on screen
 * meanwhile. The button is out of the region, and keeps the focus.
 */
function ReadFailed({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const t = useTranslations("MyEvents");
  const tAdmin = useTranslations("Admin");
  const text = (
    <div className="flex flex-col gap-0.5">
      <p className="font-semibold text-destructive">{t("failed.title")}</p>
      <p className="text-muted-foreground">{t("failed.body")}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-[1rem_1fr] gap-x-2.5 rounded-lg border border-destructive bg-background p-3 text-sm">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 text-destructive" />
      <div role="alert" className="col-start-2 row-start-1">
        {!retrying && text}
      </div>
      {retrying && <div className="col-start-2 row-start-1">{text}</div>}
      <p role="status" className="sr-only">
        {retrying ? t("loading") : ""}
      </p>
      <ReadButton reading={retrying} onRead={onRetry} className="col-start-2 row-start-2 mt-2 justify-self-start">
        {tAdmin("retry")}
      </ReadButton>
    </div>
  );
}
