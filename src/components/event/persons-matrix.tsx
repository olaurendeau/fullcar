import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DeviceState } from "@/domain/board";
import type { MatrixCell, MatrixRow } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import { cn } from "@/lib/utils";

/** The text suffices without the colour: amber without a car, grey in a car, an outline otherwise. */
const CELL: Record<DeviceState["kind"], string> = {
  withoutCar: "border-amber-200 bg-amber-100 text-amber-950",
  passenger: "border-transparent bg-muted",
  driver: "border-transparent bg-muted",
  notConcerned: "bg-background font-normal text-muted-foreground",
};

function CellText({ cell }: { cell: MatrixCell }) {
  const t = useTranslations("DevicePersons");
  const { state, leg } = cell;
  if (state.kind === "passenger") return t("cell.passenger", { driver: state.driver.firstName });
  if (state.kind === "notConcerned") return t(`state.notConcerned.${leg}`);
  return t(`state.${state.kind}`);
}

/**
 * The matrix of « Vos inscriptions » (v4-2): a table, a column per leg and a row per person,
 * their first name as the row's header. The first name is a button that calls `onName`. It
 * receives rows and callbacks alone, and knows nothing of the device (v4-16). The cells are
 * text; they become buttons with #89.
 */
export function PersonsMatrix({
  legs,
  rows,
  onName,
}: {
  legs: readonly Leg[];
  rows: readonly MatrixRow[];
  onName: (id: string) => void;
}) {
  const t = useTranslations("DevicePersons");
  const tLegs = useTranslations("Event.legs");

  return (
    <table className="-mt-1 w-full table-fixed border-separate border-spacing-y-1 text-sm text-foreground">
      <colgroup>
        <col className="w-[26%]" />
        {legs.map((leg) => (
          <col key={leg} />
        ))}
      </colgroup>
      <thead>
        <tr className="text-left text-xs font-medium text-muted-foreground">
          <th scope="col" className="h-[18px] pl-0.5 font-medium">
            {t("colName")}
          </th>
          {legs.map((leg) => (
            <th key={leg} scope="col" className="pl-1.5 font-medium">
              {tLegs(leg)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" className="p-0 text-left align-middle font-semibold">
              <button
                type="button"
                data-person-name={row.id}
                aria-haspopup="dialog"
                onClick={() => onName(row.id)}
                className="flex min-h-11 max-w-full items-center gap-1 rounded-lg px-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 wrap-break-word">{row.firstName}</span>
                <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </th>
            {row.cells.map((cell) => (
              <td key={cell.leg} className="pl-1 align-middle">
                <div
                  className={cn(
                    "flex min-h-11 items-center rounded-lg border px-2 py-1 text-[13px] leading-4 font-medium wrap-break-word",
                    CELL[cell.state.kind],
                  )}
                >
                  <span className="min-w-0">
                    <CellText cell={cell} />
                  </span>
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
