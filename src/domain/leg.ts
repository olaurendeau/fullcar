/**
 * The two directions of an event (glossary: Leg). Everything tied to a trip carries its
 * leg, and the aller always comes first.
 */
import type { WallClock } from "./wall-clock";

export const LEGS = ["aller", "retour"] as const;
export type Leg = (typeof LEGS)[number];

export function otherLeg(leg: Leg): Leg {
  return leg === "aller" ? "retour" : "aller";
}

/** The legs an event has: the aller, and the retour if it has one. */
export function eventLegs(retourAt: WallClock | null): Leg[] {
  return retourAt === null ? ["aller"] : [...LEGS];
}

export interface NewPersonLegs {
  /** The « Aller et retour » box; absent from the form, and ignored, without a retour. */
  bothLegs: boolean;
  /** The leg of the tab the person is added from. */
  leg: Leg;
  hasRetour: boolean;
  /** Created as the driver of a car on `leg` (R4). */
  drives?: boolean;
}

/**
 * The legs where a new person is without a car; on any other leg they are not concerned.
 * - Box checked, with a retour: both legs (C1.3).
 * - Box unchecked: the tab's leg only (C1.3).
 * - Without a retour: the aller (C1.4).
 * - A new driver is in their own car on `leg`, and not concerned by the other (C4.4).
 */
export function initialLegs({ bothLegs, leg, hasRetour, drives = false }: NewPersonLegs): Leg[] {
  if (drives) return [];
  if (!hasRetour) return ["aller"];
  return bothLegs ? [...LEGS] : [leg];
}
