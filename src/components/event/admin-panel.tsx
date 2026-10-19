"use client";

import { Lock, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useState, type ReactNode, type Ref } from "react";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import type { WallClock } from "@/domain/wall-clock";
import { CopyableLink, ShareButton } from "./copyable-link";
import { OrganiserLegs } from "./organiser-leg";
import { ReadButton } from "./read-button";

/**
 * The organiser's panel (#3, R4), the same at every visit (C4.7), in the order of C4.1:
 * the link to share, the organiser's own link as personal, then why to keep it; under it, a
 * section per leg (#179). It receives the organiser's link ready-made: reading the token is
 * admin-link.ts's alone. Its title takes the focus after « Réessayer » (O5.8), through
 * `titleRef`. Which lists are unfolded is kept here, by leg and list (O5.6).
 */
export function AdminPanel({
  publicUrl,
  adminUrl,
  titleRef,
  legs,
  allerAt,
  retourAt,
}: {
  publicUrl: string;
  adminUrl: string;
  titleRef?: Ref<HTMLHeadingElement>;
  legs: OrganiserLeg[];
  allerAt: WallClock;
  retourAt: WallClock | null;
}) {
  const t = useTranslations("Admin");
  const titleId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (key: string) =>
      setExpanded((was) => {
        const next = new Set(was);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 id={titleId} ref={titleRef} tabIndex={-1} className="font-semibold outline-none">
        {t("title")}
      </h2>
      <LinkGroup label={t("shareLink.label")} hint={t("shareLink.hint")}>
        <CopyableLink url={publicUrl}>
          <ShareButton url={publicUrl} />
        </CopyableLink>
      </LinkGroup>
      <hr />
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
      <OrganiserLegs legs={legs} allerAt={allerAt} retourAt={retourAt} expanded={expanded} onToggle={toggle} />
    </section>
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

// Untinted (O7.7): the frame in the destructive colour on the background, as #66's alerts.
const PROBLEM_FRAME =
  "mx-auto grid w-full max-w-md grid-cols-[1rem_1fr] gap-x-2.5 rounded-lg border border-destructive bg-background p-3 text-sm outline-none";

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
