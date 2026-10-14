"use client";

import { Lock, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyableLink, ShareButton } from "./copyable-link";

/**
 * The organiser's panel (#3, R4), the same at every visit (C4.7), in the order of C4.1:
 * the link to share, the organiser's own link as personal, then why to keep it. It
 * receives the organiser's link ready-made: reading the token is admin-link.ts's alone.
 */
export function AdminPanel({ publicUrl, adminUrl }: { publicUrl: string; adminUrl: string }) {
  const t = useTranslations("Admin");
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 id={titleId} className="font-semibold">
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
      <Notice role="note" title={t("keep.title")} body={t("keep.body")} />
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

/**
 * Instead of the panel, when the link is not the organiser's (C6.5), or when the check
 * could not be made: then nothing says the link is wrong.
 */
export function AdminLinkProblem({ problem }: { problem: "invalid" | "failed" }) {
  const t = useTranslations("Admin");
  return <Notice role="alert" destructive title={t(`${problem}.title`)} body={t(`${problem}.body`)} />;
}

function Notice({
  role,
  title,
  body,
  destructive = false,
}: {
  role: "note" | "alert";
  title: string;
  body: string;
  destructive?: boolean;
}) {
  return (
    <div
      role={role}
      className={cn(
        "grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border p-3 text-sm",
        destructive && "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      <TriangleAlert className="row-span-2 mt-0.5 size-4" />
      <p className="font-semibold">{title}</p>
      <p className={destructive ? "text-destructive/90" : "text-muted-foreground"}>{body}</p>
    </div>
  );
}
