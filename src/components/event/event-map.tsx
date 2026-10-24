"use client";

import { ChevronDown, ChevronUp, LoaderCircle, Map as MapIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BoardCar } from "@/domain/board";
import { mapOf } from "@/domain/event-map";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { PLAN_IGN_UPDATED } from "@/domain/tile";
import { showCar } from "./focus";
import type { CarPoint, EventMapHandle } from "./leaflet-map";

type LeafletMap = typeof import("./leaflet-map");

/** What a leg's map needs from the page: the event's place, and the page's open or folded state. */
export interface LegMap {
  location: string;
  position: Position;
  /** One state for the whole page, both legs, in memory only (`EventView`). */
  open: boolean;
  onToggle: () => void;
}

/** What the map reads of a car, and nothing more: the driver's first name, never their number. */
type MapCar = Pick<BoardCar, "id" | "location" | "position" | "freeSeats" | "full"> & { driver: Pick<BoardCar["driver"], "firstName"> };

/** A touch screen, where one finger scrolls the page and two move the map (CA1.11). */
const TOUCH = "(pointer: coarse)";

/** Calls `changed` whenever the primary pointer changes; one function, so React subscribes once. */
function watchTouch(changed: () => void): () => void {
  const touch = window.matchMedia(TOUCH);
  touch.addEventListener("change", changed);
  return () => touch.removeEventListener("change", changed);
}

/** Whether the primary pointer is a finger, now: never on the server, nor before hydration. */
function useTouch(): boolean {
  return useSyncExternalStore(
    watchTouch,
    () => window.matchMedia(TOUCH).matches,
    () => false,
  );
}

/** The first day of the month of `PLAN_IGN_UPDATED` (`YYYY-MM`), in UTC, as the formatter reads it. */
function layerUpdated(): Date {
  const [year, month] = PLAN_IGN_UPDATED.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * A leg's map (epic #238, event-map v15): the « Carte » button, a fixed label whose chevron says
 * the state, hidden without JavaScript; then the container it folds, `hidden` while folded, with
 * the map's box, 240 px high, 280 px from a 448 px window. Leaflet is imported at the first
 * opening, and starts only once the map is open and its panel shown, a hidden tab having no
 * size (CA1.13). Until it has started, « Chargement de la carte… » in the box, `aria-busy`, and no
 * `status` region of its own: the leg's panel keeps its only one, the banner's.
 * The map has the flag and a point per car of the leg with a position, `cars` in the order of
 * the cards; its name counts them, and `notOnMap` the others. An activated point leads to its
 * card (`showCar`). Under the map, in this order (CA1.17): the tiles' notice (#483), `notOnMap`,
 * then, at touch only, the two-finger sentence.
 */
export function EventMap({ leg, map, cars }: { leg: Leg; map: LegMap; cars: readonly MapCar[] }) {
  const t = useTranslations("EventMap");
  const tCar = useTranslations("Board.car");
  const format = useFormatter();
  const box = useRef<HTMLDivElement>(null);
  const leaflet = useRef<HTMLDivElement>(null);
  const handle = useRef<EventMapHandle | null>(null);
  const [library, setLibrary] = useState<LeafletMap | null>(null);
  // Once started, a map stays: shown again, it only takes its new size.
  const [started, setStarted] = useState(false);
  const touch = useTouch();
  const containerId = `event-map-${leg}`;
  const Chevron = map.open ? ChevronUp : ChevronDown;

  useEffect(() => {
    // Until #483, a failed import leaves the box loading.
    if (map.open && library === null) void import("./leaflet-map").then(setLibrary);
  }, [map.open, library]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === 0) return;
      setStarted(true);
      handle.current?.resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const flagLabel = t("event", { location: map.location });
  const zoomIn = t("zoomIn");
  const zoomOut = t("zoomOut");
  const attribution = t("attribution", {
    date: format.dateTime(layerUpdated(), { month: "long", year: "numeric", timeZone: "UTC" }),
  });
  const { lat, lng } = map.position;
  const { onMap, notOnMap } = mapOf(map.position, cars);
  // Each car its own point for now, even less than 25 m from another: the groups are #481's.
  const points: CarPoint[] = cars.flatMap((car) =>
    mapOf(map.position, [car]).points.map(({ position, atFlag }) => ({
      id: car.id,
      position,
      atFlag,
      label: car.driver.firstName,
      name: t(`car.${leg}`, {
        car: tCar("title", { driver: car.driver.firstName }),
        location: car.location,
        seats: car.full ? tCar("full") : t("freeSeats", { free: car.freeSeats }),
      }),
    })),
  );
  // Created again only when what it shows changes, not at each new state of the page (#482 updates it).
  const pointsJson = JSON.stringify(points);

  useEffect(() => {
    if (library === null || !started || !leaflet.current) return;
    const created = library.createEventMap(leaflet.current, {
      flag: { lat, lng },
      flagLabel,
      zoomIn,
      zoomOut,
      attribution,
      touchQuery: TOUCH,
      cars: JSON.parse(pointsJson) as CarPoint[],
      onCar: (id) => showCar(leg, id),
    });
    handle.current = created;
    return () => {
      handle.current = null;
      created.destroy();
    };
  }, [library, started, lat, lng, flagLabel, zoomIn, zoomOut, attribution, pointsJson, leg]);

  const loading = library === null || !started;

  return (
    <>
      <button
        type="button"
        aria-expanded={map.open}
        aria-controls={containerId}
        onClick={map.onToggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm font-medium hover:bg-muted focus-visible:focus-ring noscript:hidden"
      >
        <MapIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">{t("title")}</span>
        <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {/* Folded, `hidden` still wins over `flex`: Tailwind's preflight makes it `!important`. */}
      <div id={containerId} hidden={!map.open} className="flex flex-col gap-2.5">
        <div
          ref={box}
          aria-busy={loading || undefined}
          className="relative h-60 overflow-hidden rounded-xl border border-border min-[448px]:h-70"
        >
          {/* Leaflet's own: React gives it its name and nothing inside. */}
          <div ref={leaflet} role="region" aria-label={t(`label.${leg}`, { count: onMap })} className="size-full" />
          {loading && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-[13px] text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
              {t("loading")}
            </p>
          )}
        </div>
        {notOnMap > 0 && (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t("notOnMap", { count: notOnMap })}</p>
        )}
        {touch && <p className="text-[13px] leading-[18px] text-muted-foreground">{t("touchHint")}</p>}
      </div>
    </>
  );
}
