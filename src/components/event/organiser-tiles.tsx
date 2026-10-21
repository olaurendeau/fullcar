import { useTranslations } from "next-intl";
import { coverageBanner } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import { legIsEmpty, type OrganiserLeg } from "@/domain/organiser-panel";
import { cn } from "@/lib/utils";
import { NoCarPill } from "./no-car-pill";
import { legHeadingId } from "./organiser-leg";

/**
 * What a leg comes to, at a glance (README, « Les vignettes »): its name; the tabs' amber pill
 * when N > 0; then its seats, « Tout le monde a une place », « 3 places libres » or, in bold,
 * « Il manque 2 places ». An empty leg says « Personne ne s'est encore inscrit. », muted.
 * No container and nothing between the three: a tile wraps it in its button, and the folded
 * summary of #204 in a list item, so that both read the same `textContent` (O8.3).
 */
export function LegGlance({ leg }: { leg: OrganiserLeg }) {
  const t = useTranslations();
  const banner = coverageBanner(leg.coverage);
  return (
    <>
      <span className="text-sm font-semibold text-foreground">{t(`Event.legs.${leg.leg}`)}</span>
      {banner.kind !== "everyoneSeated" && (
        <NoCarPill count={banner.withoutCar} className="font-medium whitespace-nowrap" />
      )}
      {legIsEmpty(leg) ? (
        <span className="text-muted-foreground">{t("Event.nobody")}</span>
      ) : banner.kind === "everyoneSeated" ? (
        <span>{t("Board.banner.everyoneSeated")}</span>
      ) : banner.kind === "enoughSeats" ? (
        <span>{t("Admin.tile.free", { free: banner.freeSeats })}</span>
      ) : (
        <span className="font-semibold">{t("Admin.tile.missing", { missing: banner.missing })}</span>
      )}
    </>
  );
}

/** Scrolls the page to the leg's section, then focuses its title: never a `#` link, which would replace the token in the fragment (O6.3). */
function goToLeg(leg: Leg) {
  const title = document.getElementById(legHeadingId(leg));
  if (!title) return;
  title.closest("section")?.scrollIntoView();
  title.focus({ preventScroll: true });
}

/**
 * A tile per leg, at the top of the organiser area under 1024 px (O1.3): two columns even at
 * 360 px, the whole width without a retour (O1.7). White, bordered, with no icon and no amber
 * background. None while no leg has a car or a person: there is nothing to compare.
 */
export function OrganiserTiles({ legs }: { legs: OrganiserLeg[] }) {
  if (legs.every(legIsEmpty)) return null;
  return (
    <div className={cn("grid gap-2 lg:hidden", legs.length > 1 && "grid-cols-2")}>
      {legs.map((leg) => (
        <button
          key={leg.leg}
          type="button"
          onClick={() => goToLeg(leg.leg)}
          className="flex min-h-11 min-w-0 flex-col items-start gap-1 rounded-lg border bg-background px-3 py-2 text-left text-[13px] leading-[18px] wrap-anywhere focus-visible:border-ring focus-visible:focus-ring"
        >
          <LegGlance leg={leg} />
        </button>
      ))}
    </div>
  );
}
