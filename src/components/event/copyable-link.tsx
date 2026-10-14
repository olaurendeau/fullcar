"use client";

import { Check, Copy, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

/**
 * A link shown in full, always as selectable text (a tap selects it whole), with its
 * "Copy" button (#3, C4.4). When the copy fails, says to select the link by hand.
 * `children` sits next to "Copy", which otherwise takes the whole width.
 */
export function CopyableLink({ url, children }: { url: string; children?: ReactNode }) {
  const t = useTranslations("Admin");
  const [copy, setCopy] = useState<CopyState>("idle");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <>
      <p data-testid="link" className="rounded-lg bg-muted px-3 py-2.5 font-mono text-[13px] leading-5 wrap-anywhere select-all">
        {url}
      </p>
      {copy === "failed" && (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {t("copyFailed")}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={copyLink}>
          {copy === "copied" ? <Check /> : <Copy />}
          {t(copy === "copied" ? "copied" : "copy")}
        </Button>
        {children}
      </div>
    </>
  );
}

const noSubscription = () => () => {};

/**
 * "Share" opens the system's share sheet with `url`, and nothing else (C4.5). Absent,
 * not greyed out, when the browser has no native sharing.
 */
export function ShareButton({ url }: { url: string }) {
  const t = useTranslations("Admin");
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );
  if (!canShare) return null;

  return (
    <Button
      type="button"
      className="h-11 flex-1"
      // Closing the sheet without sharing rejects: there is nothing to say about it.
      onClick={() => navigator.share({ url }).catch(() => {})}
    >
      <Share />
      {t("share")}
    </Button>
  );
}
