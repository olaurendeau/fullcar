/**
 * The number « Ajouter une personne » opens with (epic #766, event-board v4.8 rule 4): the
 * one of the last person of the device who has one, in the order of « Vos inscriptions »
 * (v4.8-9), which is the order of each leg's device section. The device already sees it
 * among its own persons (C10.1): nothing new is read, sent or stored.
 */

export interface PhonePrefill {
  /** Who the number is taken from: « Même numéro que {firstName}. » */
  firstName: string;
  phone: string;
}

/** `null` when no person of the device has a number. */
export function phonePrefill(device: readonly { firstName: string; phone: string | null }[]): PhonePrefill | null {
  const last = device.filter((person) => Boolean(person.phone)).pop();
  return last?.phone ? { firstName: last.firstName, phone: last.phone } : null;
}
