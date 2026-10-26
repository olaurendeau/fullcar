import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A section's title that folds it (organizer-view v3.5, « Le bouton du leg »), the pattern of
 * the organiser area's title (v3.2): an h3 holding a button of the section's whole width and
 * 44 px high, its words, then the chevron right after them, `ChevronDown` folded and
 * `ChevronUp` unfolded, swapped, never turned. Its name is its words alone, whatever the
 * state: `aria-expanded` says it. `controls` is the id of what folds, there in both states;
 * `describedBy`, what describes the button, if anything. A click that does not focus the
 * button (Safari) would leave the focus in what folds: folding then puts it on the button.
 * The h3 has no `tabIndex`: the button takes the focus. Generic: the legs' sections and
 * « Personnes inscrites » (#645) share it.
 */
export function FoldHeading({
  id,
  expanded,
  controls,
  describedBy,
  onToggle,
  children,
}: {
  /** The h3's id, which names the section. */
  id: string;
  expanded: boolean;
  controls: string;
  describedBy?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <h3 id={id} className="-ml-2 min-w-0 font-semibold">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={controls}
        aria-describedby={describedBy}
        onClick={(event) => {
          const button = event.currentTarget;
          if (expanded && document.getElementById(controls)?.contains(document.activeElement)) button.focus();
          onToggle();
        }}
        className="-my-1.5 flex h-11 w-full items-center gap-1 rounded-lg pl-2 text-left focus-visible:focus-ring focus-visible:-outline-offset-2"
      >
        {children}
        <Chevron aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </h3>
  );
}
