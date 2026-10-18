import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coverage } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import type { WallClock } from "@/domain/wall-clock";
import { LegPanel, type BoardDevice } from "./leg-panel";
import { LegTabPanel } from "./leg-tab-panel";

/** A tab's label, then its persons without a car when there are any, in its accessible name (C9.3). */
function LegTrigger({ leg, board }: { leg: Leg; board: VisibleLegBoard }) {
  const t = useTranslations();
  const { withoutCar } = coverage(board);

  return (
    <TabsTrigger value={leg} className="h-11 gap-2">
      {t(`Event.legs.${leg}`)}
      {withoutCar > 0 && (
        <>
          <span aria-hidden className="min-w-5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
            {withoutCar}
          </span>
          <span className="sr-only"> {t("Board.tabCount", { count: withoutCar })}</span>
        </>
      )}
    </TabsTrigger>
  );
}

/**
 * Aller and Retour side by side, Aller first (#3, C5.2). Switching is local to the page:
 * no reload, no URL change. Each tab is at least 44 px high (C5.5).
 *
 * Both legs are in the HTML: without JavaScript, where tabs cannot switch, they are shown
 * one under the other, each under its name (C3.4). That name is the leg's h2, always there
 * and visually hidden with JavaScript, so that its cars and persons are h3 in both cases.
 */
export function LegTabs(props: {
  allerAt: WallClock;
  retourAt: WallClock;
  aller: VisibleLegBoard;
  retour: VisibleLegBoard;
  device: BoardDevice;
}) {
  const t = useTranslations("Event.legs");
  const legs = [
    { leg: "aller", at: props.allerAt, board: props.aller },
    { leg: "retour", at: props.retourAt, board: props.retour },
  ] as const;

  return (
    <Tabs defaultValue="aller" className="gap-4">
      <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto noscript:hidden">
        {legs.map(({ leg, board }) => (
          <LegTrigger key={leg} leg={leg} board={board} />
        ))}
      </TabsList>
      {legs.map(({ leg, at, board }) => (
        <LegTabPanel
          key={leg}
          leg={leg}
          headingId={`leg-${leg}`}
          className="flex flex-col gap-4 data-[state=inactive]:hidden noscript:data-[state=inactive]:flex"
        >
          <h2 id={`leg-${leg}`} className="sr-only text-lg font-semibold noscript:not-sr-only">
            {t(leg)}
          </h2>
          <LegPanel at={at} board={board} device={props.device} />
        </LegTabPanel>
      ))}
    </Tabs>
  );
}
