"use client";

import { ChevronDown, ChevronUp, Lock, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type Ref, type RefObject } from "react";
import type { Said } from "@/app/e/[id]/admin/screen-state";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { WallClock } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { CopyableLink, ShareButton } from "./copyable-link";
import { OrganiserLegs } from "./organiser-leg";
import { OrganiserSummary } from "./organiser-summary";
import { OrganiserTiles } from "./organiser-tiles";
import { ReadButton } from "./read-button";

/**
 * The organiser's panel (#3, R4), the same at every visit (C4.7), in the order of C4.1:
 * the link to share, the organiser's own link as personal, then why to keep it; under it, a
 * section per leg (#179). Under 1024 px, a tile per leg comes first (#180); from 1024 px,
 * the panel widens, the links take two columns and the sections two more (O4.1). It
 * receives the organiser's link ready-made: reading the token is admin-link.ts's alone. Its
 * title is the button that folds it (#204, O8.1), `titleRef`, the focus's place after
 * « Réessayer » (O5.8). Folded, all but the title line and its alert is `hidden`, still
 * mounted, and a line per leg sums it up, or the withdrawal's sentence does (O8.2). Which
 * lists are unfolded, `expanded`, the screen keeps, by leg and list (O5.6, O5.7). « Actualiser », right
 * of the title, reads the screen again (O1.8); `said` is what the title line's live regions say
 * of it (O1.9, O5.4), and `shown` what the alert's frame shows meanwhile. Withdrawn (`legs`
 * null), the tiles and the sections go, the links stay, and a sentence says why, not live,
 * unless the alert shows in its place (O1.10, O5.4).
 */
export function AdminPanel({
  publicUrl,
  adminUrl,
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
  folded,
  onToggleFolded,
}: {
  publicUrl: string;
  adminUrl: string;
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
  folded: boolean;
  onToggleFolded: () => void;
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
              className="-my-1.5 flex h-11 w-full items-center gap-1 rounded-lg pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
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
        {legs && <OrganiserTiles legs={legs} />}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <LinkGroup label={t("shareLink.label")} hint={t("shareLink.hint")}>
            <CopyableLink url={publicUrl}>
              <ShareButton url={publicUrl} />
            </CopyableLink>
          </LinkGroup>
          <hr className="lg:hidden" />
          <div className="flex flex-col gap-4 lg:gap-3">
            <LinkGroup
              label={
                <>
                  {t("adminLink.label")}
                  <span className="inline-flex h-5 items-center gap-1 rounded-full border bg-muted px-2 text-xs font-medium text-foreground/80">
                    <Lock className="size-3" />
                    {t("adminLink.badge")}
                  </span>
                </>
              }
              hint={t("adminLink.hint")}
            >
              <CopyableLink url={adminUrl} />
            </LinkGroup>
            <Notice title={t("keep.title")} body={t("keep.body")} />
          </div>
        </div>
        {(legs || !framed) && <hr className="hidden lg:block" />}
        {legs ? (
          <OrganiserLegs legs={legs} allerAt={allerAt} retourAt={retourAt} expanded={expanded} onToggle={onToggle} />
        ) : (
          !framed && !folded && <Stale />
        )}
      </div>
    </section>
  );
}

/** The withdrawal's sentence (O1.10), not live: under the links unfolded, in the summary's place folded. */
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
const PROBLEM_FRAME = cn(ALERT_FRAME, "mx-auto w-full max-w-board outline-none");

/**
 * Instead of the panel, when the link is not the organiser's (C6.5), or when the check
 * could not be made: then nothing says the link is wrong, and « Réessayer » reads again
 * (O5.3). Its alert region holds the text alone, and is emptied while « Réessayer » reads,
 * then filled again on a failure, so that it is announced again; the text stays on screen
 * meanwhile, out of the region. The button is next to the region, never in it: it stays,
 * and keeps the focus. `ref` is the invalid link's alert, the focus's place should the
 * retry find the link invalid.
 */
export function AdminLinkProblem({
  problem,
  retrying = false,
  onRetry,
  ref,
}: {
  problem: "invalid" | "failed";
  retrying?: boolean;
  onRetry?: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const t = useTranslations("Admin");
  const text = (
    <div className="flex flex-col gap-0.5">
      <p className="font-semibold text-destructive">{t(`${problem}.title`)}</p>
      <p className="text-muted-foreground">{t(`${problem}.body`)}</p>
    </div>
  );
  const icon = <TriangleAlert aria-hidden className="mt-0.5 size-4 text-destructive" />;

  if (problem === "invalid") {
    return (
      <div ref={ref} role="alert" tabIndex={-1} className={PROBLEM_FRAME}>
        {icon}
        {text}
      </div>
    );
  }
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

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div role="note" className="grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border p-3 text-sm">
      <TriangleAlert className="row-span-2 mt-0.5 size-4" />
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}
