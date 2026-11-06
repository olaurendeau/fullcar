"use client";

import { LoaderCircle, Mail, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import type { TransferNotice as Notice } from "@/domain/transfer";
import { cn } from "@/lib/utils";

/**
 * The notice « Cession en attente » (epic #935, OT2.2): the address in full, then what became of
 * the email that carries the link: on its way, sent, failed, stopped by the limit of the address,
 * or expired. A failure, the limit and an expired link are in the destructive colour. It is a
 * `role="status"` region of its own, `tabindex="-1"`: it takes the focus once the link is sent
 * (OT1.5), and is not in the tab order. Its three gestures are the next task's (T10).
 */
export function TransferNotice({ transfer, noticeRef }: { transfer: Notice; noticeRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations("Transfer");
  const { email, send } = transfer;
  const failure = send !== "sending" && send !== "sent";
  const Icon = send === "sending" ? LoaderCircle : failure ? TriangleAlert : Mail;
  const [title, body] =
    send === "failed"
      ? [t("sendFailed.title"), t("sendFailed.body", { email })]
      : send === "addressLimit"
        ? [t("addressLimit.title"), t("addressLimit.body", { email })]
        : send === "expired"
          ? [t("expired.title"), t("expired.body", { email })]
          : [t("pending.title"), t(send === "sending" ? "pending.sending" : "pending.body", { email })];
  return (
    <div
      ref={noticeRef}
      role="status"
      tabIndex={-1}
      data-transfer-notice={send}
      className={cn(
        "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 rounded-lg border p-3 text-sm focus-visible:focus-ring",
        failure && "border-destructive bg-background",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4", send === "sending" && "animate-spin", failure && "text-destructive")} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={cn("font-semibold", failure && "text-destructive")}>{title}</p>
        <p className="max-w-prose text-muted-foreground wrap-anywhere">{body}</p>
      </div>
    </div>
  );
}
