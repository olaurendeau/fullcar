import type { OrganiserLeg } from "@/domain/organiser-panel";
import { LegGlance } from "./organiser-tiles";

/**
 * The folded organiser area's summary (#204, O8.3): a line per leg, in the order of `legs`,
 * with the very texts of its tile, which may wrap. From 1024 px, the sections' two columns
 * (O8.7). No button, no link, no live region: the folded card's one gesture is to unfold it.
 */
export function OrganiserSummary({ legs }: { legs: OrganiserLeg[] }) {
  return (
    <ul className="grid gap-1.5 lg:grid-cols-2 lg:items-start lg:gap-x-6">
      {legs.map((leg) => (
        <li key={leg.leg} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[18px]">
          <LegGlance leg={leg} />
        </li>
      ))}
    </ul>
  );
}
