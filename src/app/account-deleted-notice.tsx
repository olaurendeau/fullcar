"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { forgetAccountDeleted, peekAccountDeleted } from "./account-deleted";

/** `Home.accountDeleted` above the home page, once, after « Supprimer mon compte » (OA9.5); it takes the focus. */
export function AccountDeletedNotice() {
  const t = useTranslations("Home");
  const [deleted] = useState(peekAccountDeleted);
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // Once committed, not as it renders: a render React throws away must leave the note for the next.
    forgetAccountDeleted();
    if (deleted) line.current?.focus();
  }, [deleted]);

  if (!deleted) return null;
  return (
    <p
      ref={line}
      tabIndex={-1}
      role="status"
      className="flex items-start gap-2 rounded-[10px] bg-muted px-3 py-2.5 text-sm focus-visible:focus-ring"
    >
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{t("accountDeleted")}</span>
    </p>
  );
}
