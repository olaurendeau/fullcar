import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Leg } from "@/domain/leg";
import type { VisibleBoard, VisibleLegBoard } from "@/domain/phone-visibility";
import type { WallClock } from "@/domain/wall-clock";
import { LegPanel, LegTime, type BoardDevice } from "./leg-panel";
import { LegTabs } from "./leg-tabs";

export interface EventViewProps {
  title: string;
  location: string;
  allerAt: WallClock;
  retourAt: WallClock | null;
  /** Each leg's cars, persons without a car and coverage (#86), in the event's order. */
  board: VisibleBoard;
  /** What the page knows of the device's persons (#87). */
  device: BoardDevice;
  /** The page's bar of messages: in the DOM after the header, before the legs. */
  messageBar: ReactNode;
}

/** A leg's state; one the board does not have is empty. */
function legOf(board: VisibleBoard, leg: Leg): VisibleLegBoard {
  return board.find((candidate) => candidate.leg === leg) ?? { leg, cars: [], withoutCar: [], device: [] };
}

/**
 * The event as its participants see it (#3, R5): title, place, both legs' date and time,
 * then one tab per leg, or the aller alone, without tabs, when there is no retour (C5.4).
 * Each leg shows its coverage, its cars and its persons without a car (#86).
 * A long title or place wraps anywhere rather than scrolling sideways (C1.10).
 */
export function EventView({ title, location, allerAt, retourAt, board, device, messageBar }: EventViewProps) {
  const t = useTranslations("Event.legs");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 id="event-title" tabIndex={-1} className="text-2xl font-bold wrap-anywhere outline-none">{title}</h1>
          <p className="flex items-start gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 wrap-anywhere">{location}</span>
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
          <dt className="text-sm text-muted-foreground">{t("aller")}</dt>
          <dd>
            <LegTime at={allerAt} />
          </dd>
          {retourAt && (
            <>
              <dt className="text-sm text-muted-foreground">{t("retour")}</dt>
              <dd>
                <LegTime at={retourAt} />
              </dd>
            </>
          )}
        </dl>
      </header>
      {messageBar}
      {retourAt ? (
        <LegTabs
          allerAt={allerAt}
          retourAt={retourAt}
          aller={legOf(board, "aller")}
          retour={legOf(board, "retour")}
          device={device}
        />
      ) : (
        <section aria-labelledby="leg-aller" className="flex flex-col gap-4">
          {/* Shown by the dates above already: a heading for the outline alone, above the h3s. */}
          <h2 id="leg-aller" className="sr-only">
            {t("aller")}
          </h2>
          <LegPanel at={allerAt} board={legOf(board, "aller")} device={device} />
        </section>
      )}
    </div>
  );
}
