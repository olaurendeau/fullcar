import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coverage } from "@/domain/coverage";
import type { Leg } from "@/domain/leg";
import type { VisibleLegBoard } from "@/domain/phone-visibility";
import type { WallClock } from "@/domain/wall-clock";
import { LegPanel } from "./leg-panel";

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
 * one under the other, each under its name (C3.4).
 */
export function LegTabs(props: { allerAt: WallClock; retourAt: WallClock; aller: VisibleLegBoard; retour: VisibleLegBoard }) {
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
        <TabsContent
          key={leg}
          value={leg}
          forceMount
          className="flex flex-col gap-4 data-[state=inactive]:hidden noscript:data-[state=inactive]:flex"
        >
          <h2 className="hidden text-lg font-semibold noscript:block">{t(leg)}</h2>
          <LegPanel at={at} board={board} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
