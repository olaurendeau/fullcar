"use client";

import { ChevronDown, ChevronUp, Pencil, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import type { Said } from "@/app/e/[id]/admin/screen-state";
import type { Leg } from "@/domain/leg";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { PendingNotice as Notice } from "@/domain/pending-send";
import type { WallClock } from "@/domain/wall-clock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyableLink, ShareButton } from "./copyable-link";
import { OrganiserLegs } from "./organiser-leg";
import { OrganiserSummary } from "./organiser-summary";
import { PendingNotice } from "./pending-notice";
import { ReadButton } from "./read-button";

/**
 * The organiser's panel (#3, R4), the same at every visit (C4.7): the link to share, and no
 * organiser's link nor « Gardez ce lien » any more (OA7.3); after it, the notice « Confirmez
 * votre adresse » of a pending event, folded with the rest (OA2.1, OA2.8); under them, a
 * section per leg (#179), folded at every appearance, its title the button that unfolds it
 * (organizer-view v3.5, O9), and no tiles any more (O9.7). From 1024 px, the panel widens,
 * the link to share takes the first of two columns, the notice the second, and the sections two more (O4.1, OA7.8).
 * Reading the token is admin-token-store.ts's alone. Its title is the button that
 * folds it (#204, O8.1), `titleRef`, the focus's place after « Réessayer » (O5.8). Folded,
 * all but the title line and its alert is `hidden`, still mounted, and a line per leg sums it
 * up, or the withdrawal's sentence does (O8.2). Which lists are unfolded, `expanded`, the
 * screen keeps, by leg and list (O5.6, O5.7), and which legs, `unfolded` (O9.5).
 * « Actualiser », right of the title, reads the screen again (O1.8); `said` is what the title
 * line's live regions say of it (O1.9, O5.4), and `shown` what the alert's frame shows
 * meanwhile. Withdrawn (`legs` null), the sections go, the link stays, and a sentence says
 * why, not live, unless the alert shows in its place (O1.10, O5.4). « Modifier l’événement »
 * follows the link to share: it stays when the panel is withdrawn, and folds
 * with it (v3.3).
 */
export function AdminPanel({
  publicUrl,
  pending,
  titleRef,
  legs,
  allerAt,
  retourAt,
  refreshing,
  said,
  shown,
  onRefresh,
  expanded,
  onToggle,
  unfolded,
  onToggleLeg,
  folded,
  onToggleFolded,
  editRef,
  editSending = false,
  onEdit,
  onResend,
  onFix,
  persons,
}: {
  publicUrl: string;
  /** The notice « Confirmez votre adresse » of an event awaiting confirmation, after the link to share (OA2.1). */
  pending?: Notice;
  /** « Renvoyer l’e-mail » of that notice (OA2.4); without it, the button is inactive. */
  onResend?: () => void;
  /** « Corriger l’adresse » of that notice (OA2.5), which opens its sheet; without it, the button is inactive. */
  onFix?: () => void;
  titleRef: RefObject<HTMLButtonElement | null>;
  legs: OrganiserLeg[] | null;
  allerAt: WallClock;
  retourAt: WallClock | null;
  refreshing: boolean;
  said: Said;
  shown: "" | "body" | "bodyWithdrawn";
  onRefresh: () => void;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  unfolded: ReadonlySet<Leg>;
  onToggleLeg: (leg: Leg) => void;
  folded: boolean;
  onToggleFolded: () => void;
  /** « Modifier l’événement », which opens the sheet (epic #250): the focus's place once it closes. */
  editRef: RefObject<HTMLButtonElement | null>;
  /** A change is on its way: the button is `aria-disabled`, its words the same (M2.11). */
  editSending?: boolean;
  onEdit: () => void;
  /** « Personnes inscrites » (#672, RP4.1), after the legs' sections; withdrawn with them. */
  persons?: ReactNode;
}) {
  const t = useTranslations("Admin");
  const titleId = useId();
  const contentId = useId();
  const content = useRef<HTMLDivElement>(null);
  const Chevron = folded ? ChevronDown : ChevronUp;
  // In the region once said; out of it, the same words while the next read runs (O5.4).
  const live = said === "failed" ? "body" : said === "failedWithdrawn" ? "bodyWithdrawn" : "";
  const framed = live !== "" || shown !== "";
  const alertText = (body: "body" | "bodyWithdrawn") => (
    <>
      <p className="font-semibold text-destructive">{t("refreshFailed.title")}</p>
      <p className="text-muted-foreground">{t(`refreshFailed.${body}`)}</p>
    </>
  );

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-board flex-col gap-4 rounded-xl border p-4 lg:max-w-5xl"
    >
      {/* The title line, then its alert: what stays when the panel folds (#204). */}
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-x-0 gap-y-3">
          {/* flex-auto, not flex-1: from no width, the title would break inside its button (O8.1). */}
          <h2 id={titleId} className="-ml-2 min-w-0 flex-auto font-semibold">
            <button
              ref={titleRef}
              type="button"
              aria-expanded={!folded}
              aria-controls={contentId}
              onClick={() => {
                // A click that does not focus the button (Safari) leaves no focus in what folds.
                if (content.current?.contains(document.activeElement)) titleRef.current?.focus();
                onToggleFolded();
              }}
              className="-my-1.5 flex h-11 w-full items-center gap-1 rounded-lg pl-2 text-left focus-visible:focus-ring focus-visible:-outline-offset-2"
            >
              {t("title")}
              <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </h2>
          <ReadButton reading={refreshing} onRead={onRefresh} className="-my-1.5 ml-auto">
            {t("refresh")}
          </ReadButton>
          <p role="status" className="sr-only">
            {said === "refreshing" || said === "refreshed" ? t(said) : ""}
          </p>
        </div>
        {/* The panel's width, framed on a failure only. Its alert region holds text alone, is always
            there, and is emptied while a read runs: two failures in a row are announced twice (O5.4).
            Its words stay on screen meanwhile, out of it: nothing under the frame moves. */}
        <div className={cn(framed && cn(ALERT_FRAME, "mt-4"))}>
          {framed && <TriangleAlert aria-hidden className="mt-0.5 size-4 text-destructive" />}
          <div role="alert" className={ALERT_TEXT}>
            {live && alertText(live)}
          </div>
          {!live && shown && <div className={ALERT_TEXT}>{alertText(shown)}</div>}
        </div>
      </div>
      {folded && (legs ? <OrganiserSummary legs={legs} /> : !framed && <Stale />)}
      <div ref={content} id={contentId} hidden={folded} className="flex flex-col gap-4">
        {/* From 1024 px, the link to share keeps its column; the right one is the notice's, or stays empty (OA7.8). */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <LinkGroup label={t("shareLink.label")} hint={t("shareLink.hint")}>
            <CopyableLink url={publicUrl}>
              <ShareButton url={publicUrl} />
            </CopyableLink>
          </LinkGroup>
          {pending && <PendingNotice pending={pending} onResend={onResend} onFix={onFix} />}
        </div>
        {/* After the link to share, before the sections; from 1024 px, under both columns, at its width (v3.3). */}
        <Button
          ref={editRef}
          type="button"
          variant="outline"
          className="h-11 w-full aria-disabled:text-muted-foreground lg:w-fit lg:self-start"
          aria-disabled={editSending || undefined}
          onClick={onEdit}
        >
          <Pencil aria-hidden />
          {t("edit")}
        </Button>
        {(legs || !framed) && <hr className="hidden lg:block" />}
        {legs ? (
          <>
            <OrganiserLegs
              legs={legs}
              allerAt={allerAt}
              retourAt={retourAt}
              expanded={expanded}
              onToggle={onToggle}
              unfolded={unfolded}
              onToggleLeg={onToggleLeg}
            />
            {persons}
          </>
        ) : (
          !framed && !folded && <Stale />
        )}
      </div>
    </section>
  );
}

/** The withdrawal's sentence (O1.10), not live: under the link unfolded, in the summary's place folded. */
function Stale() {
  const t = useTranslations("Admin");
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm">
      <span className="block max-w-prose">{t("stale")}</span>
    </p>
  );
}

function LinkGroup({ label, hint, children }: { label: ReactNode; hint: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span id={labelId} className="flex items-center gap-2 text-sm font-medium">
          {label}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  );
}

const ALERT_TEXT = "col-start-2 row-start-1 flex max-w-prose flex-col gap-0.5";
// Untinted (O7.7): the frame in the destructive colour on the background, as #66's alerts.
const ALERT_FRAME =
  "grid grid-cols-[1rem_1fr] gap-x-2.5 rounded-lg border border-destructive bg-background p-3 text-sm";
// The board's width, centred, where the panel would be (O7.5).
const PROBLEM_FRAME = cn(ALERT_FRAME, "mx-auto w-full max-w-board focus-visible:focus-ring");

/**
 * Instead of the panel, when the check could not be made (OA7.3): nothing says the area is
 * refused, and « Réessayer » reads again (O5.3); a refusal has its own screens
 * (admin-states.tsx, #598). Its alert region holds the text alone, and is emptied while
 * « Réessayer » reads, then filled again on a failure, so that it is announced again; the
 * text stays on screen meanwhile, out of the region. The button is next to the region, never
 * in it: it stays, and keeps the focus.
 */
export function AdminLinkProblem({
  retrying = false,
  onRetry,
}: {
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("Admin");
  const text = (
    <div className="flex flex-col gap-0.5">
      <p className="font-semibold text-destructive">{t("failed.title")}</p>
      <p className="text-muted-foreground">{t("failed.body")}</p>
    </div>
  );
  const icon = <TriangleAlert aria-hidden className="mt-0.5 size-4 text-destructive" />;

  return (
    <div className={PROBLEM_FRAME}>
      {icon}
      <div role="alert" className="col-start-2 row-start-1">
        {!retrying && text}
      </div>
      {retrying && <div className="col-start-2 row-start-1">{text}</div>}
      <p role="status" className="sr-only">
        {retrying ? t("loading") : ""}
      </p>
      <ReadButton
        reading={retrying}
        onRead={() => onRetry?.()}
        className="col-start-2 row-start-2 mt-2 justify-self-start"
      >
        {t("retry")}
      </ReadButton>
    </div>
  );
}
