import { CircleCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { coverageBanner, type Coverage } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import { cn } from "@/lib/utils";

/**
 * How many persons are still without a car on the leg, against its free seats (C9.1).
 * The form is the domain's; the words and the plurals are the locale's. It is a live region
 * unless `live` is false: the organiser area shows it again, and the board announces it already.
 * On the board, given its `leg`, it is focusable by script alone (`focusBanner`): where the focus
 * goes when a refusal removed its target.
 */
export function CoverageBanner({ coverage, live = true, leg }: { coverage: Coverage; live?: boolean; leg?: Leg }) {
  const t = useTranslations("Board.banner");
  const banner = coverageBanner(coverage);
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
      role={live ? "status" : undefined}
      tabIndex={leg && -1}
      data-leg-banner={leg}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        banner.kind === "missingSeats" ? "bg-amber-100 text-amber-950" : "bg-muted",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 wrap-anywhere">{text}</span>
    </p>
  );
}
