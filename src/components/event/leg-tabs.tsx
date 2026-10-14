import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WallClock } from "@/domain/wall-clock";
import { LegPanel } from "./leg-panel";

/**
 * Aller and Retour side by side, Aller first (#3, C5.2). Switching is local to the page:
 * no reload, no URL change. Each tab is at least 44 px high (C5.5).
 */
export function LegTabs({ allerAt, retourAt }: { allerAt: WallClock; retourAt: WallClock }) {
  const t = useTranslations("Event.legs");

  return (
    <Tabs defaultValue="aller" className="gap-4">
      <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto">
        <TabsTrigger value="aller" className="h-11">
          {t("aller")}
        </TabsTrigger>
        <TabsTrigger value="retour" className="h-11">
          {t("retour")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="aller">
        <LegPanel leg="aller" at={allerAt} />
      </TabsContent>
      <TabsContent value="retour">
        <LegPanel leg="retour" at={retourAt} />
      </TabsContent>
    </Tabs>
  );
}
