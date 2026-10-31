"use client";

import { ChevronDown, ChevronUp, LoaderCircle, Map as MapIcon, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { BoardCar } from "@/domain/board";
import { freeSeatsOf, mapOf, routeOf, stopPointsOf, stopsOf } from "@/domain/event-map";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";
import { wallClockAsUtc } from "@/domain/wall-clock";
import { cn } from "@/lib/utils";
import { leafletFocus, TILES_QUIET, tilesStep, type LeafletFocus, type TilesEvent } from "./event-map-state";
import { focusLandmark, showCar } from "./focus";
import { leafletImport } from "./leaflet-import";
import type { CarPoint, CarRoute, EventMapHandle, MapState, StopPoint } from "./leaflet-map";

/** What a leg's map needs from the page: the event's place, the page's open or folded state, and whether it is settled. */
export interface LegMap {
  location: string;
  position: Position;
  /** One state for the whole page, both legs, in memory only (`EventView`): open at the arrival. */
  open: boolean;
  /** The page settled (`pageSettled`), for good: until then, no map starts. */
  settled: boolean;
  onToggle: () => void;
}

/**
 * What the organiser's sentence needs, on `/e/{id}/admin` once the link is checked (CA2.1): how to
 * open « Modifier l’événement » from a leg, and whether a change is on its way, while the button
 * opens nothing, as the organiser area's (M2.11).
 */
export interface MapHint {
  onEdit: (leg: Leg) => void;
  sending: boolean;
}

/** What the map reads of a car, and nothing more: the driver's first name, never their number. */
type MapCar = Pick<BoardCar, "id" | "location" | "position" | "freeSeats"> & {
  driver: Pick<BoardCar["driver"], "firstName">;
  /** The aller's Stops by time (empty on the retour, and without the event's option): never their passengers. */
  stops: readonly Pick<BoardCar["stops"][number], "id" | "location" | "time" | "position">[];
};

/**
 * A touch screen, where one finger scrolls the page and two move the map (CA1.11): Leaflet's
 * dragging follows it. The two-finger sentence follows its CSS twin, `pointer-coarse:`.
 */
const TOUCH = "(pointer: coarse)";

/**
 * A failure of the map (« Leaflet ne se charge pas », « Des tuiles en échec », « Leaflet échoue
 * encore »): its title, what to do, then « Recharger la page » when `reloadRef` is given, and
 * « Réessayer ». Not announced, in no live region: the leg's panel keeps its only `status`
 * region, the banner's.
 */
function MapNotice({
  id,
  title,
  body,
  retryRef,
  onRetry,
  reloadRef,
  className,
}: {
  className?: string;
  id: string;
  title: string;
  body: string;
  retryRef: Ref<HTMLButtonElement>;
  onRetry: () => void;
  reloadRef?: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("EventMap");
  const retry = (className: string) => (
    <Button ref={retryRef} variant="outline" className={`h-11 ${className}`} onClick={onRetry}>
      {t("retry")}
    </Button>
  );
  return (
    <div className={cn("grid grid-cols-[1rem_1fr] gap-x-2.5 gap-y-0.5 rounded-lg border border-destructive bg-background p-3 text-sm", className)}>
      <TriangleAlert aria-hidden className="row-span-2 mt-0.5 size-4 text-destructive" />
      <p id={`${id}-title`} className="font-semibold">
        {title}
      </p>
      <p id={`${id}-body`} className="text-[13px] leading-[18px] text-muted-foreground">
        {body}
      </p>
      {reloadRef ? (
        <div className="col-start-2 mt-2 flex flex-col items-start gap-2">
          {/* `reload()`: the same address, its fragment kept, where the organiser has their link. */}
          <Button ref={reloadRef} className="h-11" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
          {retry("")}
        </div>
      ) : (
        retry("col-start-2 mt-2 justify-self-start")
      )}
    </div>
  );
}

/** OpenStreetMap's licence page, where « © OpenStreetMap » leads (v21). */
const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";

/**
 * The credits (v21, the owner's decision of 24/10): one short line on the map, at its bottom
 * right, « Geoapify · © OpenMapTiles.org · » then the link « © OpenStreetMap », 24 × 24 px at
 * least, to a new tab, which `Contact.newTab` says. Two lines, aligned right, never cut, when
 * the box is narrower (320 px) or the text larger. Ours, not a control of Leaflet's: there from
 * the loading on, above the opaque loading text and Leaflet's panes, the points and the bubble
 * with them (z-index 1000; the bubble's 1001 counts in its pane only, #578), under the ring element. Its focus ring is its own, inside it, on opaque white: one outside
 * would be cut by the map's edge, and unreadable on some tiles.
 * Inside Leaflet's container, `.leaflet-container a` would colour the link: hence `!`.
 */
function Credits({ ref }: { ref: Ref<HTMLParagraphElement> }) {
  const t = useTranslations("EventMap");
  const tContact = useTranslations("Contact");
  return (
    <p
      ref={ref}
      data-map-credits=""
      className="absolute right-0 bottom-0 z-1000 max-w-full rounded-tl-[4px] bg-[rgba(255,255,255,.8)] px-1.5 text-right font-sans text-xs leading-6 text-[#333]"
    >
      {t("attribution")}{" "}
      <a
        href={OSM_COPYRIGHT}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-6 min-w-6 items-center rounded-[3px] px-[3px] align-top text-[#0a0a0a]! underline underline-offset-2 focus-visible:bg-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0a0a0a]"
      >
        {t("osmLink")}
        <span className="sr-only"> {tContact("newTab")}</span>
      </a>
    </p>
  );
}

/**
 * A leg's map (epic #238, event-map v18), in le conteneur (#562, v27), a bordered block hidden
 * whole without JavaScript: the « Carte » button as its header, a fixed label whose chevron says
 * the state; then the part it folds, `hidden` while folded, with the map's box, edge to edge,
 * 240 px high, 280 px from a 448 px window. The map starts (#653, v29), and for good, once it is
 * open, the page settled, and its box in the screen or touching its edge, as the observer counts
 * it (#788), with a width, a hidden tab having none (CA1.13); folded by the person before, it asks for nothing. Starting imports
 * Leaflet, once for the page and both legs (CA2.10, `leaflet-import`). Before, the box waits,
 * without text, `aria-busy` or `tabindex` (CA1.14); started, until Leaflet is there,
 * « Chargement de la carte… » in the box, `aria-busy`, and no `status` region of its own: the
 * leg's panel keeps its only one, the banner's. Nothing of it takes the focus or scrolls (CA2.11).
 * A failed import (offline, or an old build's chunk after a deploy) puts « La carte n’a pas pu se
 * charger. » in place of the box, whose « Réessayer » imports again; from the second failure in
 * a row, online, « … toujours … » with « Recharger la page » first (CA2.8, `leafletStep`).
 * The map has the flag and a point per car of the leg with a position, `cars` in the order of
 * the cards, cars less than 25 m apart in one point, and those less than 25 m from the flag in
 * its one point (`mapOf`, v18); its name counts them, and `notOnMap` the others. An activated
 * point leads to its card (`showCar`), a grouped one opens its bubble, whose buttons do.
 * On the aller, with the event's option, a Stop with a position is a round and a label of its own
 * (`stopsOf`, epic #881, RV5.1), grouped only with the Stops of other cars less than 25 m away
 * (`stopPointsOf`, RV5.6), never with a car nor the flag; a car with such a Stop draws one line
 * through them to the flag (`routeOf`, RV5.2) in place of its straight one; `stopsNotOnMap` counts
 * the others, under `notOnMap` (RV5.3). Pressing a Stop opens its bubble (RV5.4), whose buttons lead to the cards.
 * The credits are in the map, at its bottom right, loading too, and hidden with the box under
 * Leaflet's notice (CA1.14, CA2.8, CA3.7). Under the map, in this order (CA1.17): the tiles' notice (CA2.4, `tilesStep`), part of the map's
 * description, `notOnMap`, `stopsNotOnMap`, then the two-finger sentence, shown at touch only (`pointer-coarse:`).
 * A new state of the page updates the map started (`update`, « Mises à jour et focus »), folded
 * or in a hidden tab too, where its framing waits for a size.
 */
export function EventMap({ leg, map, cars, date }: { leg: Leg; map: LegMap; cars: readonly MapCar[]; date: string }) {
  const t = useTranslations("EventMap");
  const tCar = useTranslations("Board.car");
  const tActions = useTranslations("Actions");
  const format = useFormatter();
  const toggle = useRef<HTMLButtonElement>(null);
  const folded = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const leaflet = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLParagraphElement>(null);
  const retryImport = useRef<HTMLButtonElement>(null);
  const reload = useRef<HTMLButtonElement>(null);
  const retryTiles = useRef<HTMLButtonElement>(null);
  const handle = useRef<EventMapHandle | null>(null);
  // One import for the page: both legs read it (CA2.10).
  const { state: imported, library } = useSyncExternalStore(leafletImport.subscribe, leafletImport.snapshot, leafletImport.serverSnapshot);
  // Where the focus goes once the new phase is drawn: the box, say, is hidden while it fails.
  const focusNext = useRef<LeafletFocus>(null);
  const tiles = useRef(TILES_QUIET);
  const [tilesNotice, setTilesNotice] = useState(false);
  // Once started, a map stays: shown again, it only takes its new size; scrolled away, it stays.
  const [started, setStarted] = useState(false);
  const containerId = `event-map-${leg}`;
  const tilesNoticeId = `${containerId}-tiles`;
  const Chevron = map.open ? ChevronUp : ChevronDown;

  // Measured now, never from an observer's entry of before: the page settling may have pushed the
  // box under the fold. The first start imports, once for the page; folded before it ends, the
  // import ends all the same.
  const start = useEffectEvent(() => {
    const element = box.current;
    if (started || !map.open || !map.settled || !element || element.offsetWidth === 0) return;
    const { top, bottom } = element.getBoundingClientRect();
    // A box touching the screen's edge is in it, as for the observer (threshold 0): refused, a
    // scroll of 1 px into the screen would change nothing it tells, and the map wait for good (#788).
    if (bottom < 0 || top > window.innerHeight) return;
    setStarted(true);
    leafletImport.open();
  });
  useEffect(() => start(), [map.open, map.settled]);

  // The import ended: read before React draws it, while the box still has the focus it had.
  // « Réessayer » gives it from its own leg only, at its click.
  useEffect(
    () =>
      leafletImport.subscribe(({ before, event, after }) => {
        if (event === "retry") return;
        focusNext.current = leafletFocus(before, event, after, !!box.current?.contains(document.activeElement));
      }),
    [],
  );

  const onRetryImport = () => {
    // A leg shown after the failure, which had not started: « Réessayer » starts it, its box taking the focus.
    setStarted(true);
    const before = leafletImport.snapshot().state;
    leafletImport.retry();
    focusNext.current = leafletFocus(before, "retry", leafletImport.snapshot().state, false);
  };

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    ({ box, toggle, retry: retryImport, reload })[target].current?.focus();
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
      start();
      handle.current?.resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Into the screen, or out of it, until it starts. Observed anew once open and settled: the
  // observer tells only a change from what it saw last, and the box may have left the screen and
  // come back between two of its looks, while the start measured it out (#769).
  useEffect(() => {
    const element = box.current;
    if (started || !element) return;
    const observer = new IntersectionObserver(() => start());
    observer.observe(element);
    return () => observer.disconnect();
  }, [started, map.open, map.settled]);

  const flagLabel = t("event", { location: map.location });
  const zoomIn = t("zoomIn");
  const zoomOut = t("zoomOut");
  const close = tActions("close");
  const { points: grouped, onMap, notOnMap } = mapOf(map.position, cars);
  // The Stops are the aller's alone (RV5.1): a car of the retour has none, and the map would not draw them.
  const { stops: placedStops, stopsNotOnMap } = stopsOf(leg === "aller" ? cars : []);
  // A car with a positioned Stop draws its own line through them, in place of its straight one (Q4).
  const routes: CarRoute[] =
    leg === "aller"
      ? cars
          .filter((car) => car.position !== null && car.stops.some(({ position }) => position !== null))
          .map((car) => ({ car: car.id, positions: routeOf(car, map.position) }))
      : [];
  const routed = new Set(routes.map(({ car }) => car));
  // Every count of seats in a name, 0 included: « 0 place libre », never « Complet » (v29, CA1.22).
  const carOf = (car: (typeof cars)[number]) => ({
    id: car.id,
    position: car.position,
    title: tCar("title", { driver: car.driver.firstName }),
    name: t(`car.${leg}`, {
      car: tCar("title", { driver: car.driver.firstName }),
      location: car.location,
      seats: t("freeSeats", { free: car.freeSeats }),
    }),
    seats: format.number(car.freeSeats),
  });
  // Rounds of Stops (RV5.4, RV5.6): the map puts each after the point of its first car in the Tab order (CA1.23).
  const stops: StopPoint[] = stopPointsOf(placedStops).map(({ position, stops: here }) => {
    const [first] = here;
    const time = format.dateTime(wallClockAsUtc(`${date} ${first.stop.time}`), { timeStyle: "short" });
    const where = t("stopTitle", { place: first.stop.location, time });
    const drivers = here.map(({ car }) => car.driver.firstName);
    // « 08:25 Nina », or « 08:25 · 2 voitures », the design's word for the count; its name starts with it (WCAG 2.5.3).
    const label = here.length === 1 ? `${time} ${drivers[0]}` : `${time} · ${t("stopCars", { count: here.length })}`;
    const name = t("stop", { driver: format.list(drivers, { type: "conjunction", style: "narrow" }), place: first.stop.location, time });
    return {
      key: here
        .map(({ stop }) => stop.id)
        .sort()
        .join(" "),
      follows: first.car.id,
      position,
      label,
      name: `${label}, ${name}`,
      title: here.length === 1 ? where : t("stopCars", { count: here.length }),
      detail: here.length === 1 ? "" : where,
      cars: here.map(({ car }) => carOf(car)),
    };
  });
  const points: CarPoint[] = grouped.map((point) => {
    const { position, atFlag, cars: here } = point;
    const direct = !atFlag && here.some((car) => !routed.has(car.id));
    const pointCars = here.map(carOf);
    const free = freeSeatsOf(point);
    if (here.length === 1) {
      const { name } = pointCars[0];
      return { position, atFlag, direct, label: here[0].driver.firstName, name, title: name, seats: format.number(free), cars: pointCars };
    }
    return {
      position,
      atFlag,
      direct,
      label: format.number(here.length),
      // « Nina, Paul », as the design writes it: the narrow conjunction, without « et » or « and ».
      name: t("group", {
        count: here.length,
        drivers: format.list(
          here.map((car) => car.driver.firstName),
          { type: "conjunction", style: "narrow" },
        ),
        seats: t("freeSeats", { free }),
      }),
      // Short, the first names being on its buttons: one line at 360 px for two cars (v29, CA1.6).
      title: t("groupTitle", { count: here.length, seats: t("freeSeats", { free }) }),
      seats: format.number(free),
      cars: pointCars,
    };
  });
  // What the map shows, compared as text: a new state of the page that changes none of it changes nothing.
  const stateJson = JSON.stringify({ flag: map.position, flagLabel, points, stops, routes } satisfies MapState);
  const shown = useEffectEvent(() => JSON.parse(stateJson) as MapState);

  useEffect(() => {
    if (library === null || !started || !leaflet.current || !credits.current) return;
    const created = library.createEventMap(leaflet.current, {
      state: shown(),
      zoomIn,
      zoomOut,
      close,
      credits: credits.current,
      touchQuery: TOUCH,
      onCar: (id) => showCar(leg, id),
      onTiles: (event) => onTiles(event),
    });
    handle.current = created;
    return () => {
      handle.current = null;
      created.destroy();
    };
  }, [library, started, zoomIn, zoomOut, close, leg]);

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

  const failed = imported.phase === "failed";
  // Waiting, before the start: neither text nor `aria-busy` (CA1.14).
  const loading = !failed && started && library === null;

  return (
    // Le conteneur (v24): « Vos inscriptions »'s pattern, its button as header; not a landmark,
    // the region of the map being the only one; hidden whole without JavaScript.
    <div className={cn("flex flex-col rounded-[14px] border px-3 pt-1 noscript:hidden", map.open ? "pb-3" : "pb-1")}>
      <button
        ref={toggle}
        type="button"
        data-map-toggle={leg}
        aria-expanded={map.open}
        aria-controls={containerId}
        onClick={map.onToggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-0.5 text-left text-sm font-medium hover:bg-muted focus-visible:focus-ring"
      >
        <MapIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">{t("title")}</span>
        <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {/* Folded, `hidden` still wins over `flex`: Tailwind's preflight makes it `!important`. */}
      <div ref={folded} id={containerId} hidden={!map.open} className="flex flex-col gap-2.5 pt-1">
        {failed && (
          <MapNotice
            id={`${containerId}-failed`}
            title={t(imported.again ? "failedAgain.title" : "failed.title")}
            body={t(imported.again ? "failedAgain.body" : "failed.body")}
            retryRef={retryImport}
            onRetry={onRetryImport}
            reloadRef={imported.again ? reload : undefined}
            // In the box's place, 10 px further from the button than the box, as the lines under it.
            className="mt-2.5"
          />
        )}
        {/* Failed, no empty box: the notice alone, in its place. Edge to edge, a rule above it.
            Isolated (#579): Leaflet's panes, the credits and the ring compare their z-indexes in
            the box only, and nothing of the map paints above the page, its bar or its sheets. */}
        <div
          ref={box}
          hidden={failed}
          tabIndex={loading ? -1 : undefined}
          aria-busy={loading || undefined}
          className="group/box relative isolate -mx-3 h-60 overflow-hidden border-t focus-visible:outline-hidden min-[448px]:h-70"
        >
          {/* Leaflet's own: React gives it its name, its description, and nothing inside but the credits. */}
          <div
            ref={leaflet}
            role="region"
            aria-label={t(`label.${leg}`, { count: onMap })}
            aria-describedby={tilesNotice ? `${tilesNoticeId}-title ${tilesNoticeId}-body` : undefined}
            className="peer size-full focus-visible:outline-hidden"
          >
            <Credits ref={credits} />
          </div>
          {loading && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-[13px] text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
              {t("loading")}
            </p>
          )}
          {/* The one ring of the box and of the region (v27): drawn on either, it would be under
              Leaflet's panes or under the opaque loading text. Above both, and above the bubble. */}
          <div
            data-map-ring={leg}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-1002 hidden focus-ring -outline-offset-2 peer-focus-visible:block group-focus-visible/box:block"
          />
        </div>
        {tilesNotice && (
          <MapNotice
            id={tilesNoticeId}
            title={t("tilesFailed.title")}
            body={t("tilesFailed.body")}
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
        {stopsNotOnMap > 0 && (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t("stopsNotOnMap", { count: stopsNotOnMap })}</p>
        )}
        {/* In the server's HTML, always, shown by `(pointer: coarse)` alone: nothing jumps at the
            hydration (v29, CA1.19), and it follows the pointer when it changes (CA1.11). */}
        <p className="hidden text-[13px] leading-[18px] text-muted-foreground pointer-coarse:block">{t("touchHint")}</p>
      </div>
    </div>
  );
}

/**
 * In place of « Carte », for an event without a position, on `/e/{id}/admin` (event-map v15,
 * « … côté organisateur », CA2.1): the organiser's sentence, then its own « Modifier l’événement »,
 * which opens the same sheet as the organiser area's, even folded.
 */
export function OrganiserHint({ leg, hint }: { leg: Leg; hint: MapHint }) {
  const t = useTranslations("EventMap");
  const tAdmin = useTranslations("Admin");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-[18px] text-muted-foreground">{t("organiserHint")}</p>
      <Button
        type="button"
        variant="outline"
        data-map-hint={leg}
        className="h-11 w-full aria-disabled:text-muted-foreground"
        aria-disabled={hint.sending || undefined}
        onClick={() => hint.onEdit(leg)}
      >
        {tAdmin("edit")}
      </Button>
    </div>
  );
}
