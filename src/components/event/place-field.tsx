"use client";

import { Crosshair, LoaderCircle, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Position } from "@/domain/place";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import {
  answered,
  chose,
  closed,
  left,
  locked as lockedState,
  moved,
  placeFieldOf,
  queryOf,
  removed,
  requested,
  typed,
  waited,
  type PlaceAnnouncement,
  type PlaceFieldState,
  type PlaceRule,
  type PlaceValue,
} from "./place-field-state";
import { createPlaceSearch } from "./place-search";

/** What the list leaves under it in the window (AL1.11), and at least two options' height. */
const LIST_MARGIN = 8;
const LIST_MIN_HEIGHT = 88;

/** The suggestion's label, the text typed in bold where it is found, as the page shows it (state 2). */
function emphasised(label: string, text: string): ReactNode {
  const typedText = text.trim().toLocaleLowerCase();
  const lower = label.toLocaleLowerCase();
  const at = typedText === "" || lower.length !== label.length ? -1 : lower.indexOf(typedText);
  if (at === -1) return label;
  const end = at + typedText.length;
  return (
    <>
      {label.slice(0, at)}
      <b className="font-semibold">{label.slice(at, end)}</b>
      {label.slice(end)}
    </>
  );
}

/**
 * A place field with suggestions (place-autocomplete, « Anatomie et clavier »): a combobox with a
 * list, ARIA 1.2, built on the form's `Input`, without a dependency. Its value, `{ text, position,
 * label }`, is the form's; its list, its lines and what its `status` region says are its own,
 * decided by `place-field-state.ts`, and its request is `place-search.ts`. The list is rendered
 * in the form, never in a portal. `locked`: the form is sending, nothing is asked nor listed and
 * « Retirer » does nothing (AL5.4); `readOnly`, the text cannot change either.
 */
export function PlaceField({
  id,
  label,
  value,
  onChange,
  rule,
  near = null,
  locked = false,
  readOnly = false,
  error,
  hint,
}: {
  id: string;
  /** The field's label, which names its list and its « Retirer ». */
  label: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  rule: PlaceRule;
  /** The event's position, which brings a car's suggestions closer. */
  near?: Position | null;
  locked?: boolean;
  readOnly?: boolean;
  /** The field's error: its message, and the id that describes the field. */
  error?: { id: string; message: string };
  /** A sentence under the field, after its position: who sees a car's place (AL4.4). */
  hint?: string;
}) {
  const t = useTranslations("PlaceField");
  const locale = useLocale() as Locale;
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState(() => placeFieldOf(value, rule));
  // The value is the form's: what the field keeps of it is only where it came from.
  const state: PlaceFieldState = { ...own, text: value.text, position: value.position, label: value.label };
  const [search] = useState(() =>
    createPlaceSearch(
      { fetch: (resource, init) => fetch(resource, init), onLine: () => navigator.onLine },
      {
        answered: (text, result) => setOwn((current) => answered(current, text, result)),
        searching: (text) => setOwn((current) => waited(current, text)),
      },
    ),
  );

  // The form starts or stops sending: the list closes, an answer awaited is ignored.
  const [lockedSeen, setLockedSeen] = useState(locked);
  if (lockedSeen !== locked) {
    setLockedSeen(locked);
    setOwn((current) => lockedState(current, locked));
  }
  // Before any timer can run: a pause under way when the form is sent asks nothing (AL5.4).
  useLayoutEffect(() => {
    if (locked) search.stop();
  }, [locked, search]);
  useEffect(() => () => search.stop(), [search]);

  function apply(next: PlaceFieldState) {
    setOwn(next);
    if (next.text !== value.text || next.position !== value.position || next.label !== value.label) {
      onChange({ text: next.text, position: next.position, label: next.label });
    }
  }

  function type(text: string) {
    if (readOnly) return;
    const next = typed(state, text);
    if (next === state) return;
    const query = queryOf(next, locale, near);
    search.typed(text, query);
    // `createPlaceSearch` does not say when the request leaves: its answer is awaited from now.
    apply(query === null ? next : requested(next, text));
  }

  function choose(index: number) {
    search.stop();
    apply(chose(state, index));
    input.current?.focus();
  }

  const list = state.list;
  const open = list !== null && list.open && !state.locked;
  const active = open ? list.active : null;
  const listId = `${id}-list`;
  const optionId = (n: number) => `${id}-option-${n}`;
  const positionId = `${id}-position`;
  const hintId = `${id}-hint`;

  // The list open: the height left under it in what the window shows (above a virtual keyboard),
  // 8 px kept, after the field is scrolled to the top if it does not fit there (AL1.11).
  const suggestions = open ? list.suggestions : null;
  useLayoutEffect(() => {
    const box = popup.current;
    if (suggestions === null || !box) return;
    const fit = (scroll: boolean) => {
      const shown = window.visualViewport;
      const bottom = () => (shown ? shown.offsetTop + shown.height : window.innerHeight) - LIST_MARGIN;
      box.style.maxHeight = "";
      if (scroll && box.getBoundingClientRect().bottom > bottom()) field.current?.scrollIntoView({ block: "start" });
      box.style.maxHeight = `${Math.max(bottom() - box.getBoundingClientRect().top, LIST_MIN_HEIGHT)}px`;
    };
    fit(true);
    const refit = () => fit(false);
    window.visualViewport?.addEventListener("resize", refit);
    return () => window.visualViewport?.removeEventListener("resize", refit);
  }, [suggestions]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && list !== null && !state.locked) {
      event.preventDefault();
      setOwn(moved(state, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && open) {
      // The list open, Enter chooses or closes it; closed, it sends the form as it always did.
      event.preventDefault();
      if (active === null) setOwn(closed(state));
      else choose(active);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOwn(closed(state));
    }
  }

  function remove() {
    if (state.locked) return;
    apply(removed(state));
    input.current?.focus();
  }

  const words = (announcement: PlaceAnnouncement) =>
    announcement.kind === "count" ? t("count", { count: announcement.count }) : t(announcement.kind);
  const describedBy = [error?.id, state.position && positionId, hint && hintId].filter(Boolean).join(" ");

  return (
    <div ref={field} className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className={cn(error && "text-destructive")}>
        {label}
      </Label>
      <div className="relative">
        <Input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active === null ? undefined : optionId(active)}
          className="h-10"
          value={value.text}
          readOnly={readOnly || undefined}
          onChange={(event) => type(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOwn((current) => left(current))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {/* Pressed, an option keeps the focus in the field: Radix does not read it as outside. */}
        <div
          ref={popup}
          hidden={!open}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div id={listId} role="listbox" aria-label={t("listLabel", { field: label })}>
            {open &&
              list.suggestions.map((suggestion, n) => (
                <div
                  key={suggestion.label}
                  id={optionId(n)}
                  role="option"
                  aria-selected={n === active}
                  onClick={() => choose(n)}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-[18px] wrap-anywhere aria-selected:bg-accent aria-selected:[box-shadow:inset_3px_0_0_var(--foreground)]"
                >
                  <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">{emphasised(suggestion.label, state.text)}</span>
                </div>
              ))}
          </div>
          <div className="mt-1 flex flex-col gap-0.5 border-t px-2 pt-1.5 pb-0.5 text-[13px] leading-[18px] text-muted-foreground">
            <span>{t("keepText")}</span>
            <span>{t("source")}</span>
          </div>
        </div>
      </div>
      {error && (
        <p id={error.id} className="text-[13px] leading-[18px] text-destructive">
          {error.message}
        </p>
      )}
      {state.position && (
        <div className="flex min-h-11 items-center gap-2 rounded-lg bg-muted pl-2.5">
          <Crosshair aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span id={positionId} className="min-w-0 flex-1 py-1.5 text-[13px] leading-[18px] wrap-anywhere">
            {state.label === null ? t("saved") : t("position", { label: state.label })}
          </span>
          <button
            type="button"
            aria-label={t("removeLabel", { field: label })}
            aria-disabled={state.locked || undefined}
            onClick={remove}
            className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium underline underline-offset-3 focus-visible:focus-ring aria-disabled:opacity-50"
          >
            {t("remove")}
          </button>
        </div>
      )}
      {state.line && (
        <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
          {state.line === "searching" && <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />}
          {t(state.line)}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      )}
      <div role="status" className="sr-only">
        {state.announcement && <span key={state.said}>{words(state.announcement)}</span>}
      </div>
    </div>
  );
}
