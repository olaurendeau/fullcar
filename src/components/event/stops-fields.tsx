import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { newCreationId } from "@/app/e/[id]/device-token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Position } from "@/domain/place";
import { RIDE_LOCATION_MAX } from "@/domain/ride";
import type { StopLineErrors } from "@/domain/stop";
import { cn } from "@/lib/utils";
import { PlaceField } from "./place-field";
import { addStop, atMaximum, removeStop, sortByTime, type StopLine } from "./stops-state";

/** The ids of a line's controls in the DOM, under the form's: where the focus goes (RV1.2, RV1.4, RV1.6). */
export const stopControlName = (id: string, part: "place" | "time" | "remove") => `stop-${id}-${part}`;
const stopControlId = (prefix: string, id: string, part: "place" | "time" | "remove") => `${prefix}-${stopControlName(id, part)}`;
const addId = (prefix: string) => `${prefix}-stops-add`;

/**
 * The section « Points de RDV » of the car's form, on the aller when the option is on (epic
 * #881, RV1): the lines, each a place (`PlaceField`, as the departure's) and a time, « Retirer »,
 * and « Ajouter un point de RDV », six lines at most. The lines are the form's (`onChange`); a
 * line is reclassed by time as its time field is left, and the `status` says so only when the
 * order changed (RV1.5). The errors are by line id, said by the form at its send (RV1.4).
 */
export function StopsFields({
  prefix,
  lines,
  onChange,
  departure,
  errors,
  near,
  locked,
}: {
  prefix: string;
  lines: StopLine[];
  onChange: (lines: StopLine[]) => void;
  /** The departure's time as typed, which the lines must follow. */
  departure: string;
  errors: Record<string, StopLineErrors | undefined>;
  near?: Position | null;
  /** The form is sending: nothing is asked of the suggestions. */
  locked: boolean;
}) {
  const t = useTranslations("RideForm.stops");
  const tErrors = useTranslations("FormErrors");
  const [sorted, setSorted] = useState(false);
  // The label of the suggestion chosen for a line, which its position line says; none for a saved position.
  const [labels, setLabels] = useState<Record<string, string | null>>({});
  const focusing = useRef<string | null>(null);

  useEffect(() => {
    const target = focusing.current && document.getElementById(focusing.current);
    if (!target) return;
    focusing.current = null;
    target.focus();
  });

  const update = (id: string, patch: Partial<StopLine>) => onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  function add() {
    const id = newCreationId();
    setSorted(false);
    focusing.current = stopControlId(prefix, id, "place");
    onChange(addStop(lines, id));
  }

  function remove(id: string) {
    const removal = removeStop(lines, id);
    setSorted(false);
    focusing.current = removal.focus ? stopControlId(prefix, removal.focus, "remove") : addId(prefix);
    onChange(removal.lines);
  }

  // RV1.5: as the time field is left, never while it is typed.
  function sort() {
    const next = sortByTime(lines);
    setSorted(next.changed);
    if (next.changed) onChange(next.lines);
  }

  return (
    <section aria-labelledby={`${prefix}-stops`} className="flex flex-col">
      <h3 id={`${prefix}-stops`} className="text-sm font-semibold">
        {t("title")}
      </h3>
      <p className="mt-1 mb-2 text-[13px] leading-[18px] text-muted-foreground">{t("hint")}</p>
      <div role="status">{sorted && <p className="mb-2 text-[13px] leading-[18px] text-muted-foreground">{t("sorted")}</p>}</div>
      <div className="flex flex-col gap-3">
        {lines.map((line, at) => {
          const n = at + 1;
          const found = errors[line.id];
          const placeError =
            found?.location && (found.location === "tooLong" ? tErrors("tooLong", { max: RIDE_LOCATION_MAX }) : tErrors("required"));
          const timeError = found?.time && (found.time === "badTime" ? tErrors("invalidTime") : t("timeAfter", { time: departure }));
          const timeId = stopControlId(prefix, line.id, "time");
          return (
            <div key={line.id} role="group" aria-labelledby={`${timeId}-title`} className="flex min-w-0 flex-col gap-3.5 rounded-xl border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span id={`${timeId}-title`} className="text-sm font-semibold">
                  {t("pointTitle", { n })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  id={stopControlId(prefix, line.id, "remove")}
                  aria-label={t("removeLabel", { n })}
                  className="h-11 px-4"
                  onClick={() => remove(line.id)}
                >
                  {t("remove")}
                </Button>
              </div>
              <PlaceField
                id={stopControlId(prefix, line.id, "place")}
                label={t("place", { n })}
                value={{ text: line.location, position: line.position, label: labels[line.id] ?? null }}
                onChange={({ text, position, label }) => {
                  update(line.id, { location: text, position });
                  setLabels((current) => ({ ...current, [line.id]: label }));
                }}
                rule="car"
                near={near}
                locked={locked}
                removeLabel={t("positionRemove", { n })}
                error={placeError ? { id: `${timeId}-place-error`, message: placeError } : undefined}
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={timeId} className={cn(timeError && "text-destructive")}>
                  {t("time", { n })}
                </Label>
                {/* Safari on iOS gives a time field of native appearance its value's width (#114). */}
                <Input
                  id={timeId}
                  type="time"
                  value={line.time}
                  className="h-10 appearance-none"
                  aria-invalid={timeError ? true : undefined}
                  aria-describedby={timeError ? `${timeId}-error` : undefined}
                  onChange={(event) => update(line.id, { time: event.target.value })}
                  onBlur={sort}
                />
                {timeError && (
                  <p id={`${timeId}-error`} className="text-[13px] leading-[18px] text-destructive">
                    {timeError}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {atMaximum(lines) ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t("max")}</p>
        ) : (
          <Button type="button" variant="outline" id={addId(prefix)} className="h-11 w-full" onClick={add}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
        )}
      </div>
    </section>
  );
}
