import { ChevronDown, ChevronUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deviceMatrix, matrixSummary, startsExpanded } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import { removalConfirmation } from "@/domain/person-removal";
import type { VisibleDevicePerson, VisibleLegBoard } from "@/domain/phone-visibility";
import { findSeat } from "@/domain/tap";
import { cn } from "@/lib/utils";
import { CellSheet } from "./cell-sheet";
import { focusAfterRemoval, focusName } from "./focus";
import type { BoardDevice } from "./leg-panel";
import { PersonSheet } from "./person-sheet";
import { PersonsMatrix } from "./persons-matrix";

const TITLE_ID = "device-persons-title";
const MATRIX_ID = "device-persons-matrix";

/**
 * A person's own number: the one `withVisiblePhones` set in the device's section, and nowhere else.
 * `drives`, whether she drives on a leg: her number is then not removed (v4.8 rule 8).
 */
export function personOf(board: readonly { device: readonly VisibleDevicePerson[] }[], id: string) {
  const rows = board.flatMap((leg) => leg.device).filter((candidate) => candidate.id === id);
  const [person] = rows;
  const drives = rows.some((row) => row.state.kind === "driver");
  return person && { id: person.id, firstName: person.firstName, phone: person.phone, drives };
}

/**
 * « Vos inscriptions » (C2.2, C3.6), above the tabs: the device's persons, one row each and
 * one cell per leg of `board`, the event's legs in their order. Absent without a person, and
 * without JavaScript. Its title is the button that folds it, with its summary. Unfolded when
 * it first has rows if a cell is « Sans voiture », folded otherwise; then only that button
 * changes it, and nothing keeps it (v4-3): an action of a cell's sheet that empties the last
 * cell « Sans voiture » does not fold it. A first name opens the person's sheet, from which she
 * may be removed from the event (RP1); a cell, the sheet of that person on that leg (#89), whose
 * « Trouver une place » goes to the first car of
 * that leg with a free seat (#172). While the persons are read, a line in its place
 * (C5.9); if the read fails, an alert with « Réessayer ».
 *
 * « Réessayer » goes away as it is pressed: the focus follows what takes its place (the
 * line while reading, then the section's button, or « Réessayer » again after a failure),
 * and goes to `device.refocus()` when there is no section to show (decision 18). It moves
 * only while nobody has put it elsewhere: on what it was given, or on nothing.
 */
export function DevicePersons({
  board,
  device: { status, retry, refocus, setPersonLeg, updatePerson, removePerson, inform },
  showLeg,
}: {
  board: readonly VisibleLegBoard[];
  device: BoardDevice;
  /** Makes a leg's tab the active one (« Voir la voiture »). */
  showLeg: (leg: Leg) => void;
}) {
  const t = useTranslations("DevicePersons");
  const rows = deviceMatrix(board);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  // `opened` counts the openings: each one is a new sheet, without the last one's message or form.
  const [sheet, setSheet] = useState<{ id: string; open: boolean; opened: number } | null>(null);
  const [cellSheet, setCellSheet] = useState<{ id: string; leg: Leg; open: boolean; opened: number } | null>(null);
  const retried = useRef(false);
  const focusTarget = useRef<HTMLElement>(null);
  const focused = useRef<HTMLElement>(null);
  // The rows as they were when a removal was confirmed: the focus goes to the next one (RP1.5).
  const removedFrom = useRef<string[]>([]);
  // On whichever of the loading line, « Réessayer » or the section's button is shown.
  const target = (element: HTMLElement | null) => {
    focusTarget.current = element;
  };

  const ready = status === "ready" && rows.length > 0;
  // Decided once, the first time there are rows: at the first read, or the first registration.
  if (ready && expanded === null) setExpanded(startsExpanded(rows));

  useEffect(() => {
    if (!retried.current) return;
    const active = document.activeElement;
    if (active === null || active === document.body || active === focused.current) {
      if (focusTarget.current) focusTarget.current.focus();
      else refocus();
      focused.current = focusTarget.current;
    }
    if (status !== "loading") {
      retried.current = false;
      focused.current = null;
    }
  }, [status, refocus]);

  if (status === "loading") {
    return (
      <p
        ref={target}
        role="status"
        tabIndex={-1}
        className="flex items-center gap-2 rounded-sm text-sm text-muted-foreground focus-visible:focus-ring"
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
          // The landmark of its failure in the bar (`focusRetry`).
          data-device-retry
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
  if (!ready) return null;

  const open = expanded ?? startsExpanded(rows);
  const Chevron = open ? ChevronUp : ChevronDown;
  const person = sheet && personOf(board, sheet.id);
  const cellRow = cellSheet && rows.find((row) => row.id === cellSheet.id);
  const cell = cellRow && cellRow.cells.find((candidate) => candidate.leg === cellSheet.leg);

  return (
    <section
      aria-labelledby={TITLE_ID}
      className={cn("flex flex-col gap-1 rounded-[14px] border px-3 pt-1", open ? "pb-3" : "pb-1")}
    >
      <h2>
        <button
          ref={target}
          type="button"
          aria-expanded={open}
          aria-controls={MATRIX_ID}
          onClick={() => setExpanded(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:focus-ring"
        >
          <span className="flex min-w-0 flex-col">
            <strong id={TITLE_ID} className="font-semibold">
              {t("title")}
            </strong>
            <span className="text-[13px] leading-[18px] text-muted-foreground">{t("summary", matrixSummary(rows))}</span>
          </span>
          <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </h2>
      <div id={MATRIX_ID} hidden={!open}>
        <PersonsMatrix
          legs={board.map((leg) => leg.leg)}
          rows={rows}
          onName={(id) => setSheet({ id, open: true, opened: (sheet?.opened ?? 0) + 1 })}
          onCell={(id, leg) => setCellSheet({ id, leg, open: true, opened: (cellSheet?.opened ?? 0) + 1 })}
        />
      </div>
      {person && (
        <PersonSheet
          key={sheet.opened}
          person={person}
          open={sheet.open}
          // A success comes after the sheet that sent it: it closes that one, not one opened since.
          onOpenChange={(isOpen) =>
            setSheet((current) => (current?.opened === sheet.opened ? { ...current, open: isOpen } : current))
          }
          updatePerson={updatePerson}
          removal={removalConfirmation(board, person.id)}
          removePerson={(removal, confirmation) => {
            removedFrom.current = rows.map((row) => row.id);
            return removePerson(removal, confirmation);
          }}
          refocus={() => focusName(person.id) || focusAfterRemoval(removedFrom.current, person.id)}
        />
      )}
      {cellSheet && cellRow && cell && (
        <CellSheet
          key={cellSheet.opened}
          person={cellRow}
          leg={cell.leg}
          state={cell.state}
          open={cellSheet.open}
          // A success comes after the sheet that sent it: it closes that one, not one opened since.
          onOpenChange={(isOpen) =>
            setCellSheet((current) => (current?.opened === cellSheet.opened ? { ...current, open: isOpen } : current))
          }
          setPersonLeg={setPersonLeg}
          showLeg={showLeg}
          freeCar={findSeat(board.find((leg) => leg.leg === cell.leg) ?? { cars: [] })?.id}
          inform={inform}
        />
      )}
    </section>
  );
}
