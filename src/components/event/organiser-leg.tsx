import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { listKey, type OrganiserList } from "@/app/e/[id]/admin/screen-state";
import type { Leg } from "@/domain/leg";
import { legIsEmpty, type OrganiserLeg } from "@/domain/organiser-panel";
import { wallClockParts, type WallClock } from "@/domain/wall-clock";
import { CoverageBanner } from "./coverage-banner";
import { EmptyLeg } from "./empty-leg";
import { LegTime } from "./leg-panel";
import { OrganiserCarsWithoutPhone, OrganiserWithoutCar } from "./organiser-lists";

/** The id of a leg's title (h3), where its tile puts the focus (#180). */
export const legHeadingId = (leg: Leg) => `organiser-leg-${leg}`;

/**
 * The organiser area's sections, one per leg, under the warning (README, « Ordre sous
 * 1024 px », point 5); from 1024 px, side by side, Aller on the left, and alone in the left
 * column without a retour (O1.2, O1.7). One block, so that it can be hidden while it stays
 * mounted. The legs' dates come from the page, not from the panel's answer.
 */
export function OrganiserLegs({
  legs,
  allerAt,
  retourAt,
  expanded,
  onToggle,
}: {
  legs: OrganiserLeg[];
  allerAt: WallClock;
  retourAt: WallClock | null;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {legs.map((board) => {
        const at = board.leg === "aller" ? allerAt : retourAt;
        return (
          at && <OrganiserLegSection key={board.leg} board={board} at={at} expanded={expanded} onToggle={onToggle} />
        );
      })}
    </div>
  );
}

/**
 * A leg: its name (h3, where the tiles of #180 put the focus) and its date, then the board's
 * empty state for an empty leg (O1.5); otherwise the board's banner, not live (O1.1), then
 * « Sans voiture », then « Voitures sans numéro », or « Aucune voiture… » in its place when
 * the leg has no car (O1.6).
 */
function OrganiserLegSection({
  board,
  at,
  expanded,
  onToggle,
}: {
  board: OrganiserLeg;
  at: WallClock;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const t = useTranslations("Event");
  const { leg } = board;
  const headingId = legHeadingId(leg);
  const fold = (list: OrganiserList) => ({
    expanded: expanded.has(listKey(leg, list)),
    onToggle: () => onToggle(listKey(leg, list)),
  });

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 border-t pt-4 lg:border-t-0 lg:pt-0">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} tabIndex={-1} className="self-start rounded-sm font-semibold focus-visible:focus-ring">
          {t(`legs.${leg}`)}
        </h3>
        <p className="flex items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <Clock aria-hidden className="size-4 shrink-0" />
          <LegTime at={at} />
        </p>
      </div>
      {legIsEmpty(board) ? (
        <EmptyLeg leg={leg} />
      ) : (
        <>
          <CoverageBanner coverage={board.coverage} live={false} />
          {board.carCount === 0 && <p className="text-sm text-muted-foreground">{t(`noCar.${leg}`)}</p>}
          <OrganiserWithoutCar persons={board.withoutCar} fold={fold("withoutCar")} />
          {board.carCount > 0 && (
            <OrganiserCarsWithoutPhone
              cars={board.carsWithoutPhone}
              date={wallClockParts(at).date}
              fold={fold("carsWithoutPhone")}
            />
          )}
        </>
      )}
    </section>
  );
}
