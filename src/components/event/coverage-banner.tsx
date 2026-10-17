import { CircleCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LegBoard } from "@/domain/board";
import { coverage, coverageBanner } from "@/domain/coverage";
import { cn } from "@/lib/utils";

/**
 * How many persons are still without a car on the leg, against its free seats (C9.1).
 * The form is the domain's; the words and the plurals are the locale's.
 */
export function CoverageBanner({ board }: { board: LegBoard }) {
  const t = useTranslations("Board.banner");
  const banner = coverageBanner(coverage(board));
  const text =
    banner.kind === "everyoneSeated"
      ? banner.freeSeats > 0
        ? t("everyoneSeatedFree", { free: banner.freeSeats })
        : t("everyoneSeated")
      : banner.kind === "enoughSeats"
        ? t("enoughSeats", { withoutCar: banner.withoutCar, free: banner.freeSeats })
        : t("missingSeats", { withoutCar: banner.withoutCar, missing: banner.missing });
  const Icon = banner.kind === "everyoneSeated" ? CircleCheck : Users;

  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
        banner.kind === "missingSeats" ? "bg-amber-100 text-amber-950" : "bg-muted",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 wrap-anywhere">{text}</span>
    </p>
  );
}
