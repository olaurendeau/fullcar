import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { DeviceState } from "@/domain/board";
import type { Leg } from "@/domain/leg";
import type { VisibleDevicePerson } from "@/domain/phone-visibility";
import type { DeviceStatus } from "@/domain/tap";
import { cn } from "@/lib/utils";
import { PhoneLink } from "./phone-link";

/** The dot of a state: full in a car, amber without a car, empty not concerned. The text says it alone. */
const DOT: Record<DeviceState["kind"], string> = {
  driver: "bg-foreground",
  passenger: "bg-foreground",
  withoutCar: "bg-amber-600",
  notConcerned: "border border-muted-foreground",
};

function StateText({ state }: { state: DeviceState }) {
  const t = useTranslations("DevicePersons.state");
  return state.kind === "passenger" ? t("passenger", { driver: state.driver.firstName }) : t(state.kind);
}

/**
 * The device's persons on one leg (C2.2): each one's state on this leg, and their own
 * number. Absent without a person. While they are read, a line in its place (C5.9); if the
 * read fails, an alert with « Réessayer ». No action in this task (#89 adds them).
 */
export function DevicePersons({
  leg,
  persons,
  status,
  onRetry,
}: {
  leg: Leg;
  persons: readonly VisibleDevicePerson[];
  status: DeviceStatus;
  onRetry: () => void;
}) {
  const t = useTranslations("DevicePersons");
  const headingId = `device-${leg}`;

  if (status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("loading")}
      </p>
    );
  }
  if (status === "failed") {
    // No red on a red tint: the title in red on the background, the body muted (C5.9, contrast).
    return (
      <div
        role="alert"
        className="grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border border-destructive bg-background p-3 text-sm"
      >
        <TriangleAlert aria-hidden className="row-span-2 mt-0.5 size-4 text-destructive" />
        <p className="font-semibold text-destructive">{t("failed")}</p>
        <p className="text-muted-foreground">{t("failedBody")}</p>
        <Button variant="outline" className="col-start-2 mt-2 h-11 justify-self-start" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (status !== "ready" || persons.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="font-semibold">
          {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <ul className="flex flex-col">
        {persons.map((person) => {
          const nameId = `${headingId}-${person.id}`;
          return (
            <li key={person.id} className="border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div role="group" aria-labelledby={nameId} className="flex min-w-0 flex-col gap-1">
                <strong
                  id={nameId}
                  data-slot="name"
                  aria-describedby={`${nameId}-state`}
                  className="self-start wrap-anywhere"
                >
                  {person.firstName}
                </strong>
                <span className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[person.state.kind])} />
                  <span id={`${nameId}-state`} data-slot="state" className="min-w-0 wrap-anywhere">
                    <StateText state={person.state} />
                  </span>
                </span>
                {person.phone && <PhoneLink firstName={person.firstName} phone={person.phone} icon />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
