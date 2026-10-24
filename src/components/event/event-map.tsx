"use client";

import { ChevronDown, ChevronUp, LoaderCircle, Map as MapIcon, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { Button } from "@/components/ui/button";
import type { BoardCar } from "@/domain/board";
import { mapOf } from "@/domain/event-map";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { PLAN_IGN_UPDATED } from "@/domain/tile";
import { leafletStep, TILES_QUIET, tilesStep, type LeafletEvent, type LeafletFocus, type LeafletPhase, type TilesEvent } from "./event-map-state";
import { focusLandmark, showCar } from "./focus";
import type { CarPoint, EventMapHandle, MapState } from "./leaflet-map";

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
 * A failure of the map (« Leaflet ne se charge pas », « Des tuiles en échec »): its title, what
 * to do, and « Réessayer ». Not announced, in no live region: the leg's panel keeps its only
 * `status` region, the banner's.
 */
function MapNotice({ id, title, retryRef, onRetry }: { id: string; title: string; retryRef: Ref<HTMLButtonElement>; onRetry: () => void }) {
  const t = useTranslations("EventMap");
  return (
    <div className="grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border border-destructive bg-background p-3 text-sm">
      <TriangleAlert aria-hidden className="row-span-2 mt-0.5 size-4 text-destructive" />
      <p id={`${id}-title`} className="font-semibold">
        {title}
      </p>
      <p id={`${id}-body`} className="text-[13px] leading-[18px] text-muted-foreground">
        {t("failed.body")}
      </p>
      <Button ref={retryRef} variant="outline" className="col-start-2 mt-2 h-11 justify-self-start" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

/**
 * A leg's map (epic #238, event-map v18): the « Carte » button, a fixed label whose chevron says
 * the state, hidden without JavaScript; then the container it folds, `hidden` while folded, with
 * the map's box, 240 px high, 280 px from a 448 px window. Leaflet is imported at the first
 * opening, and starts only once the map is open and its panel shown, a hidden tab having no
 * size (CA1.13). Until it has started, « Chargement de la carte… » in the box, `aria-busy`, and no
 * `status` region of its own: the leg's panel keeps its only one, the banner's.
 * A failed import (offline, or an old build's chunk after a deploy) puts « La carte n’a pas pu se
 * charger. » in place of the box, whose « Réessayer » imports again (CA2.8, `leafletStep`).
 * The map has the flag and a point per car of the leg with a position, `cars` in the order of
 * the cards, cars less than 25 m apart in one point, and those less than 25 m from the flag in
 * its one point (`mapOf`, v18); its name counts them, and `notOnMap` the others. An activated
 * point leads to its card (`showCar`), a grouped one opens its bubble, whose buttons do. Under
 * the map, in this order (CA1.17): the tiles' notice (CA2.4, `tilesStep`), part of the map's
 * description, `notOnMap`, then, at touch only, the two-finger sentence.
 * A new state of the page updates the map started (`update`, « Mises à jour et focus »), folded
 * or in a hidden tab too, where its framing waits for a size.
 */
export function EventMap({ leg, map, cars }: { leg: Leg; map: LegMap; cars: readonly MapCar[] }) {
  const t = useTranslations("EventMap");
  const tCar = useTranslations("Board.car");
  const tActions = useTranslations("Actions");
  const format = useFormatter();
  const toggle = useRef<HTMLButtonElement>(null);
  const folded = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const leaflet = useRef<HTMLDivElement>(null);
  const retryImport = useRef<HTMLButtonElement>(null);
  const retryTiles = useRef<HTMLButtonElement>(null);
  const handle = useRef<EventMapHandle | null>(null);
  const [library, setLibrary] = useState<LeafletMap | null>(null);
  const [phase, setPhase] = useState<LeafletPhase>("loading");
  // Where the focus goes once the new phase is drawn: the box, say, is hidden while it fails.
  const focusNext = useRef<LeafletFocus>(null);
  const tiles = useRef(TILES_QUIET);
  const [tilesNotice, setTilesNotice] = useState(false);
  // Once started, a map stays: shown again, it only takes its new size.
  const [started, setStarted] = useState(false);
  const touch = useTouch();
  const containerId = `event-map-${leg}`;
  const tilesNoticeId = `${containerId}-tiles`;
  const Chevron = map.open ? ChevronUp : ChevronDown;

  const leafletChanged = (from: LeafletPhase, event: LeafletEvent) => {
    const step = leafletStep(from, event, !!box.current?.contains(document.activeElement));
    focusNext.current = step.focus;
    setPhase(step.phase);
  };
  const onImported = useEffectEvent(leafletChanged);

  useEffect(() => {
    if (!map.open || phase !== "loading" || library !== null) return;
    // Folded before the import ends: it is imported again at the next opening, from the cache once loaded.
    let waiting = true;
    import("./leaflet-map").then(
      (loaded) => {
        if (!waiting) return;
        setLibrary(loaded);
        onImported("loading", "loaded");
      },
      () => {
        if (waiting) onImported("loading", "failed");
      },
    );
    return () => {
      waiting = false;
    };
  }, [map.open, phase, library]);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    ({ box, toggle, retry: retryImport })[target].current?.focus();
  });

  const onTiles = useEffectEvent((event: TilesEvent) => {
    const step = tilesStep(tiles.current, event, !!retryTiles.current && document.activeElement === retryTiles.current);
    tiles.current = step.view;
    setTilesNotice(step.view.notice);
    if (step.focus === "container") leaflet.current?.focus();
  });

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
  const close = tActions("close");
  const attribution = t("attribution", {
    date: format.dateTime(layerUpdated(), { month: "long", year: "numeric", timeZone: "UTC" }),
  });
  const { points: grouped, onMap, notOnMap } = mapOf(map.position, cars);
  const points: CarPoint[] = grouped.map(({ position, atFlag, cars: here }) => {
    const pointCars = here.map((car) => ({
      id: car.id,
      position: car.position,
      title: tCar("title", { driver: car.driver.firstName }),
      name: t(`car.${leg}`, {
        car: tCar("title", { driver: car.driver.firstName }),
        location: car.location,
        seats: car.full ? tCar("full") : t("freeSeats", { free: car.freeSeats }),
      }),
    }));
    if (here.length === 1) return { position, atFlag, label: here[0].driver.firstName, name: pointCars[0].name, cars: pointCars };
    return {
      position,
      atFlag,
      label: format.number(here.length),
      // « Nina, Paul », as the design writes it: the narrow conjunction, without « et » or « and ».
      name: t("group", {
        count: here.length,
        drivers: format.list(
          here.map((car) => car.driver.firstName),
          { type: "conjunction", style: "narrow" },
        ),
      }),
      cars: pointCars,
    };
  });
  // What the map shows, compared as text: a new state of the page that changes none of it changes nothing.
  const stateJson = JSON.stringify({ flag: map.position, flagLabel, points } satisfies MapState);
  const shown = useEffectEvent(() => JSON.parse(stateJson) as MapState);

  useEffect(() => {
    if (library === null || !started || !leaflet.current) return;
    const created = library.createEventMap(leaflet.current, {
      state: shown(),
      zoomIn,
      zoomOut,
      close,
      attribution,
      touchQuery: TOUCH,
      onCar: (id) => showCar(leg, id),
      onTiles: (event) => onTiles(event),
    });
    handle.current = created;
    return () => {
      handle.current = null;
      created.destroy();
    };
  }, [library, started, zoomIn, zoomOut, close, attribution, leg]);

  // Each new state, on the same map (CA1.7): never created again for it.
  useEffect(() => {
    handle.current?.update(JSON.parse(stateJson) as MapState);
  }, [stateJson]);

  // Gone with the event's position, or with its leg: the focus it had goes to a landmark, never
  // <body>. Seen before React removes the map, given once it has, unless something took it.
  const heldFocus = useRef(false);
  useLayoutEffect(() => {
    const mine = [toggle.current, folded.current];
    const held = heldFocus;
    return () => {
      held.current = mine.some((element) => element?.contains(document.activeElement));
    };
  }, []);
  useEffect(() => {
    const held = heldFocus;
    return () => {
      if (held.current && (document.activeElement === null || document.activeElement === document.body)) focusLandmark();
    };
  }, []);

  const failed = phase === "failed";
  const loading = !failed && (library === null || !started);

  return (
    <>
      <button
        ref={toggle}
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
      <div ref={folded} id={containerId} hidden={!map.open} className="flex flex-col gap-2.5">
        {failed && (
          <MapNotice
            id={`${containerId}-failed`}
            title={t("failed.title")}
            retryRef={retryImport}
            onRetry={() => leafletChanged(phase, "retry")}
          />
        )}
        {/* Failed, no empty box: the notice alone, in its place. */}
        <div
          ref={box}
          hidden={failed}
          tabIndex={loading ? -1 : undefined}
          aria-busy={loading || undefined}
          className="relative h-60 overflow-hidden rounded-xl border border-border focus-visible:focus-ring min-[448px]:h-70"
        >
          {/* Leaflet's own: React gives it its name, its description, and nothing inside. */}
          <div
            ref={leaflet}
            role="region"
            aria-label={t(`label.${leg}`, { count: onMap })}
            aria-describedby={tilesNotice ? `${tilesNoticeId}-title ${tilesNoticeId}-body` : undefined}
            className="size-full"
          />
          {loading && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-[13px] text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
              {t("loading")}
            </p>
          )}
        </div>
        {tilesNotice && (
          <MapNotice
            id={tilesNoticeId}
            title={t("tilesFailed.title")}
            retryRef={retryTiles}
            onRetry={() => {
              tiles.current = tilesStep(tiles.current, "retry", false).view;
              handle.current?.retryTiles();
            }}
          />
        )}
        {notOnMap > 0 && (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t("notOnMap", { count: notOnMap })}</p>
        )}
        {touch && <p className="text-[13px] leading-[18px] text-muted-foreground">{t("touchHint")}</p>}
      </div>
    </>
  );
}
