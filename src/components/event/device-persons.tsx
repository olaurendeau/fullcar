import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { DeviceState } from "@/domain/board";
import type { Leg } from "@/domain/leg";
import type { VisibleDevicePerson } from "@/domain/phone-visibility";
import { cn } from "@/lib/utils";
import type { BoardDevice } from "./leg-panel";
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
 *
 * « Réessayer » goes away as it is pressed: the focus follows what takes its place (the
 * line while reading, then the section's title, or « Réessayer » again after a failure),
 * and goes to `device.refocus()` when the leg has no section to show (decision 18).
 */
export function DevicePersons(props: { leg: Leg; persons: readonly VisibleDevicePerson[]; device: BoardDevice }) {
  const { leg, persons, device: { status, retry, refocus } } = props;
  const t = useTranslations("DevicePersons");
  const headingId = `device-${leg}`;
  const retried = useRef(false);
  const focusTarget = useRef<HTMLElement>(null);
  // On whichever of the loading line, « Réessayer » or the section's title is shown.
  const target = (element: HTMLElement | null) => {
    focusTarget.current = element;
  };

  useEffect(() => {
    if (!retried.current) return;
    if (focusTarget.current) focusTarget.current.focus();
    else refocus();
    if (status !== "loading") retried.current = false;
  }, [status, refocus]);

  if (status === "loading") {
    return (
      <p
        ref={target}
        role="status"
        tabIndex={-1}
        className="flex items-center gap-2 text-sm text-muted-foreground outline-none"
      >
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
        <Button
          ref={target}
          variant="outline"
          className="col-start-2 mt-2 h-11 justify-self-start"
          onClick={() => {
            retried.current = true;
            retry();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (status !== "ready" || persons.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-0.5">
        <h3
          ref={target}
          id={headingId}
          tabIndex={-1}
          className="font-semibold outline-none"
        >
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
