import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { wallClockAsUtc, type WallDate, type WallTime } from "@/domain/wall-clock";

/** The value of the departure's choice: a Stop's id is a UUID, so none can be it. */
const START = "start";

/** A Stop to choose, as the car's card has it. */
export interface StopOption {
  id: string;
  location: string;
  time: WallTime;
}

/**
 * « Point de montée » (RV3.2, RV7.2): the car's departure, then each of its Stops by time, as a
 * radio group (arrows to move, Space to choose). `value` is the Stop chosen, `null` for the
 * departure; none of the Stops listed, a Stop that went meanwhile, checks nothing. Shared by the
 * sheet that takes a seat and the one that changes the point (#892). Rows are 48 px high, the
 * focus ring is the row's, and the text keeps the foreground colour on the chosen row's tint (RV7.3).
 */
export function StopChoice({
  legend,
  hideLegend,
  date,
  start,
  stops,
  value,
  onChange,
  autoFocus,
}: {
  /** The group's name. */
  legend: string;
  /** The sheet's title says it already (« Où monte {prénom} ? »): the name stays, for the screen reader alone. */
  hideLegend?: boolean;
  /** The aller's date, with which a time is shown as the leg's. */
  date: WallDate;
  start: { location: string; time: WallTime };
  stops: readonly StopOption[];
  value: string | null;
  onChange: (stopId: string | null) => void;
  /**
   * The focus enters on the choice ticked as the group mounts (RV7.2). The group is inside the
   * sheet: its effect runs before the sheet's own, which then leaves the focus where it is.
   */
  autoFocus?: boolean;
}) {
  const t = useTranslations("Sheet.stop");
  const format = useFormatter();
  const ids = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) root.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    // As the group mounts only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const timeOf = (time: WallTime) => format.dateTime(wallClockAsUtc(`${date} ${time}`), { timeStyle: "short" });
  const rows = [
    { value: START, text: t("start", { place: start.location, time: timeOf(start.time) }) },
    ...stops.map((stop) => ({ value: stop.id, text: t("option", { place: stop.location, time: timeOf(stop.time) }) })),
  ];

  return (
    <div ref={root} className="flex min-w-0 flex-col gap-2">
      <span id={`${ids}-legend`} className={hideLegend ? "sr-only" : "text-sm font-semibold"}>
        {legend}
      </span>
      <RadioGroup
        aria-labelledby={`${ids}-legend`}
        value={value ?? START}
        onValueChange={(next) => onChange(next === START ? null : next)}
        className="gap-1.5"
      >
        {rows.map((row) => (
          <label
            key={row.value}
            htmlFor={`${ids}-${row.value}`}
            className="flex min-h-12 min-w-0 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-1.5 has-focus-visible:focus-ring has-aria-checked:border-primary has-aria-checked:bg-[#e6f2f2]"
          >
            <RadioGroupItem id={`${ids}-${row.value}`} value={row.value} aria-labelledby={`${ids}-${row.value}-label`} className="focus-visible:outline-hidden" />
            <span id={`${ids}-${row.value}-label`} className="min-w-0 text-sm wrap-anywhere">
              {row.text}
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
