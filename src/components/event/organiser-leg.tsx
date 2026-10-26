import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { listKey, type OrganiserList } from "@/app/e/[id]/admin/screen-state";
import type { Leg } from "@/domain/leg";
import { legIsEmpty, type OrganiserLeg } from "@/domain/organiser-panel";
import { wallClockParts, type WallClock } from "@/domain/wall-clock";
import { CoverageBanner } from "./coverage-banner";
import { EmptyLeg } from "./empty-leg";
import { FoldHeading } from "./fold-heading";
import { LegTime } from "./leg-panel";
import { OrganiserCarsWithoutPhone, OrganiserWithoutCar } from "./organiser-lists";
import { LegGlance } from "./organiser-tiles";

/** The id of a leg's title (h3), which names its section and holds its button (O9.1). */
export const legHeadingId = (leg: Leg) => `organiser-leg-${leg}`;

/**
 * The organiser area's sections, one per leg, under « Modifier l’événement » (O9.7); from
 * 1024 px, side by side, Aller on the left, and alone in the left column without a retour
 * (O1.2, O1.7). One block, so that it can be hidden while it stays mounted. The legs' dates
 * come from the page, not from the panel's answer. `unfolded`: the legs whose section is
 * unfolded, which the screen keeps (O9.5).
 */
export function OrganiserLegs({
  legs,
  allerAt,
  retourAt,
  expanded,
  onToggle,
  unfolded,
  onToggleLeg,
}: {
  legs: OrganiserLeg[];
  allerAt: WallClock;
  retourAt: WallClock | null;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  unfolded: ReadonlySet<Leg>;
  onToggleLeg: (leg: Leg) => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {legs.map((board) => {
        const at = board.leg === "aller" ? allerAt : retourAt;
        return (
          at && (
            <OrganiserLegSection
              key={board.leg}
              board={board}
              at={at}
              expanded={expanded}
              onToggle={onToggle}
              open={unfolded.has(board.leg)}
              onToggleLeg={() => onToggleLeg(board.leg)}
            />
          )
        );
      })}
    </div>
  );
}

/**
 * A leg: its title, the button that folds it (O9.1). Folded, its summary, which describes the
 * button: the pill and the seats, the glance without the leg's name (O9.3). Unfolded, its
 * date, then the board's empty state for an empty leg (O1.5); otherwise the board's banner,
 * not live (O1.1), then « Sans voiture », then « Voitures sans numéro », or « Aucune
 * voiture… » in its place when the leg has no car (O1.6). Folded, all that is `hidden`, still
 * mounted: a list unfolded is still so when the section unfolds again (O9.4).
 */
function OrganiserLegSection({
  board,
  at,
  expanded,
  onToggle,
  open,
  onToggleLeg,
}: {
  board: OrganiserLeg;
  at: WallClock;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  open: boolean;
  onToggleLeg: () => void;
}) {
  const t = useTranslations("Event");
  const { leg } = board;
  const headingId = legHeadingId(leg);
  const contentId = `${headingId}-content`;
  const summaryId = `${headingId}-summary`;
  const fold = (list: OrganiserList) => ({
    expanded: expanded.has(listKey(leg, list)),
    onToggle: () => onToggle(listKey(leg, list)),
  });

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-1 border-t pt-4 lg:border-t-0 lg:pt-0">
      <FoldHeading
        id={headingId}
        expanded={open}
        controls={contentId}
        describedBy={open ? undefined : summaryId}
        onToggle={onToggleLeg}
      >
        {t(`legs.${leg}`)}
      </FoldHeading>
      {!open && (
        <p id={summaryId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[18px]">
          <LegGlance leg={board} named={false} />
        </p>
      )}
      <div id={contentId} hidden={!open} className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <Clock aria-hidden className="size-4 shrink-0" />
          <LegTime at={at} />
        </p>
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
      </div>
    </section>
  );
}
