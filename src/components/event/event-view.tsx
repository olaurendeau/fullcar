import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import type { EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import type { VisibleBoard, VisibleLegBoard } from "@/domain/phone-visibility";
import { DevicePersons } from "./device-persons";
import { EventDates } from "./event-dates";
import type { LegMap, MapHint } from "./event-map";
import { LegPanel, type BoardDevice } from "./leg-panel";
import { LegTabs } from "./leg-tabs";

/** The header: from the state the page shows last, which carries it (epic #250). */
export interface EventViewProps extends EventHeader {
  /** Each leg's cars, persons without a car and coverage (#86), in the event's order. */
  board: VisibleBoard;
  /** What the page knows of the device's persons (#87). */
  device: BoardDevice;
  /** The page's bar of messages: in the DOM after the header, before the legs. */
  messageBar: ReactNode;
  /** The active tab, the page's: « Voir la voiture » makes its leg's active (#89). */
  tab: Leg;
  onTab: (leg: Leg) => void;
  /** On `/e/{id}/admin` once the link is checked: the organiser's sentence, while the place has no position (#485). */
  hint?: MapHint;
}

/** A leg's state; one the board does not have is empty. */
function legOf(board: VisibleBoard, leg: Leg): VisibleLegBoard {
  return board.find((candidate) => candidate.leg === leg) ?? { leg, cars: [], withoutCar: [], device: [] };
}

/**
 * The event as its participants see it (#3, R5): title, place, its start and end (v4.3),
 * the bar of messages and « Vos inscriptions » (#162), then one tab per leg, or the aller
 * alone, without tabs, when there is no retour (C5.4). Each leg shows its coverage, its cars
 * and its persons without a car (#86).
 * A long title or place wraps anywhere rather than scrolling sideways (C1.10).
 * When the place has a position, each leg has its map, folded on each load: one open or folded
 * state for the page, in memory only, which outlives the remount of a leg's panel (#478). Without
 * a position, each leg has the organiser's sentence instead, when `hint` is given (#485).
 */
export function EventView({ title, location, locationPosition, allerAt, retourAt, board, device, messageBar, tab, onTab, hint }: EventViewProps) {
  const t = useTranslations("Event.legs");
  const legs = retourAt ? (["aller", "retour"] as const) : (["aller"] as const);
  const [mapOpen, setMapOpen] = useState(false);
  const map: LegMap | undefined = locationPosition
    ? { location, position: locationPosition, open: mapOpen, onToggle: () => setMapOpen((open) => !open) }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 id="event-title" tabIndex={-1} className="rounded-sm text-2xl font-bold wrap-anywhere focus-visible:focus-ring">{title}</h1>
          <p className="flex items-start gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 wrap-anywhere">{location}</span>
          </p>
        </div>
        <EventDates start={allerAt} end={retourAt} />
      </header>
      {messageBar}
      <DevicePersons board={legs.map((leg) => legOf(board, leg))} device={device} showLeg={onTab} />
      {retourAt ? (
        <LegTabs
          allerAt={allerAt}
          retourAt={retourAt}
          aller={legOf(board, "aller")}
          retour={legOf(board, "retour")}
          device={device}
          near={locationPosition}
          tab={tab}
          onTab={onTab}
          map={map}
          hint={hint}
        />
      ) : (
        <section aria-labelledby="leg-aller" className="flex flex-col gap-4">
          {/* A heading for the outline alone, above the h3s: no tab names the only leg (v4.3, D1.4). */}
          <h2 id="leg-aller" className="sr-only">
            {t("aller")}
          </h2>
          <LegPanel at={allerAt} board={legOf(board, "aller")} device={device} hasRetour={false} near={locationPosition} map={map} hint={hint} />
        </section>
      )}
    </div>
  );
}
