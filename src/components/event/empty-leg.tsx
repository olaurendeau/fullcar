import { Car } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Leg } from "@/domain/leg";

/**
 * A leg with neither a car nor a person (#66 C9.6): its icon, « Aucune voiture proposée… »
 * and « Personne ne s'est encore inscrit. ». Shown alone: the board's actions stay in
 * `leg-panel.tsx`, and the organiser area shows it with none (O1.5).
 */
export function EmptyLeg({ leg }: { leg: Leg }) {
  const t = useTranslations("Event");
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center">
      <div className="mb-1.5 grid size-11 place-items-center rounded-xl bg-brand-soft text-primary">
        <Car className="size-5" />
      </div>
      <p className="font-semibold">{t(`noCar.${leg}`)}</p>
      <p className="text-sm text-muted-foreground">{t("nobody")}</p>
    </div>
  );
}
