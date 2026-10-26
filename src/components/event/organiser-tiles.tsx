import { useTranslations } from "next-intl";
import { coverageBanner } from "@/domain/coverage";
import { legIsEmpty, type OrganiserLeg } from "@/domain/organiser-panel";
import { NoCarPill } from "./no-car-pill";

/**
 * What a leg comes to, at a glance (README, « Replié »): its name, unless `named` is false; the
 * tabs' amber pill when N > 0; then its seats, « Tout le monde a une place », « 3 places
 * libres » or, in bold, « Il manque 2 places ». An empty leg says « Personne ne s'est encore
 * inscrit. », muted. No container and nothing between them: the folded organiser area's
 * summary (#204) wraps it in a list item, and a folded leg's section its summary, without the
 * name, after its button, so that both read the same `textContent` (O8.3, O9.3). The tiles of
 * #180 are gone (organizer-view v3.5, Q1 = a); the keys under `Admin.tile` keep their names.
 */
export function LegGlance({ leg, named = true }: { leg: OrganiserLeg; named?: boolean }) {
  const t = useTranslations();
  const banner = coverageBanner(leg.coverage);
  return (
    <>
      {named && <span className="text-sm font-semibold text-foreground">{t(`Event.legs.${leg.leg}`)}</span>}
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
