"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { AdminLinkProblem, AdminPanel } from "@/components/event/admin-panel";
import type { WallClock } from "@/domain/wall-clock";
import { useAdminLinkCheck } from "./admin-link";

/**
 * Above the event: the organiser's panel once the server has accepted the link's token
 * (C4.9), the "not valid" message otherwise (C6.5). While the first check runs, a status
 * line instead (O5.1): no link, no number. Hidden without JavaScript, where the page says
 * why instead (O5.5). After « Réessayer », the focus goes to the panel's title, or to the
 * "not valid" message, and stays on the button on a new failure (O5.8). The legs' dates are
 * the page's: the panel's answer does not carry them.
 */
export function AdminArrival({ id, allerAt, retourAt }: { id: string; allerAt: WallClock; retourAt: WallClock | null }) {
  const t = useTranslations("Admin");
  const { check, retry } = useAdminLinkCheck(id);
  const retried = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const invalid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!retried.current || check.state === "failed") return;
    retried.current = false;
    (check.state === "valid" ? title : invalid).current?.focus();
  }, [check.state]);

  if (check.state === "valid") {
    return (
      <AdminPanel
        publicUrl={check.publicUrl}
        adminUrl={check.adminUrl}
        titleRef={title}
        legs={check.legs}
        allerAt={allerAt}
        retourAt={retourAt}
      />
    );
  }
  if (check.state === "checking") {
    return (
      <p
        role="status"
        className="mx-auto flex w-full max-w-board items-center gap-2 text-sm text-muted-foreground noscript:hidden"
      >
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("loading")}
      </p>
    );
  }
  return (
    <AdminLinkProblem
      ref={invalid}
      problem={check.state}
      retrying={check.state === "failed" && check.retrying}
      onRetry={() => {
        retried.current = true;
        retry();
      }}
    />
  );
}
