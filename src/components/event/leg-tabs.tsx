import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coverage } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import type { WallClock } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { LegPanel, type BoardDevice } from "./leg-panel";
import { LegTabPanel } from "./leg-tab-panel";

/**
 * A tab's label, then, under it, an amber pill with its persons without a car when there are
 * any (C9.3): shown as it is read, part of the tab's name, nothing hidden. 48 px high when
 * either tab has a pill, both the same; 44 px otherwise.
 */
function LegTrigger({ leg, withoutCar, tall }: { leg: Leg; withoutCar: number; tall: boolean }) {
  const t = useTranslations();

  return (
    // 48 px: a 1 px border, 3 px of padding, the name's 20 px, 2 px, then the pill's 18 px.
    <TabsTrigger value={leg} className={cn("flex-col gap-0.5 py-[3px]", tall ? "h-12" : "h-11")}>
      <span>{t(`Event.legs.${leg}`)}</span>
      {withoutCar > 0 && (
        <>
          {" "}
          <span className="rounded-full bg-amber-100 px-2 text-xs leading-[18px] text-amber-950">
            {t("Board.tabCount", { count: withoutCar })}
          </span>
        </>
      )}
    </TabsTrigger>
  );
}

/**
 * Aller and Retour side by side, Aller first (#3, C5.2). Switching is local to the page:
 * no reload, no URL change. Each tab is at least 44 px high (C5.5). The active tab is the
 * page's (`tab`), so that an action elsewhere can make another one active (#89).
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
  tab: Leg;
  onTab: (leg: Leg) => void;
}) {
  const t = useTranslations("Event.legs");
  const legs = [
    { leg: "aller", at: props.allerAt, board: props.aller },
    { leg: "retour", at: props.retourAt, board: props.retour },
  ] as const;
  const counts = legs.map(({ board }) => coverage(board).withoutCar);
  const tall = counts.some((count) => count > 0);

  return (
    <Tabs
      value={props.tab}
      onValueChange={(value) => props.onTab(value === "retour" ? "retour" : "aller")}
      className="gap-4"
    >
      <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto noscript:hidden">
        {legs.map(({ leg }, index) => (
          <LegTrigger key={leg} leg={leg} withoutCar={counts[index]} tall={tall} />
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
          <LegPanel at={at} board={board} device={props.device} hasRetour />
        </LegTabPanel>
      ))}
    </Tabs>
  );
}
