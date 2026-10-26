/**
 * How many emails may go out (epic #581, decision 9 of docs/design/organizer-account,
 * and coordinator decision 2 on #581). Every limit counts over the last hour, sliding.
 * What counts is an email we tried to send, failed or abandoned at 10 s included, since
 * Brevo may still have accepted it; an email a limit stopped does not count.
 */

/** The window of every limit: one hour, sliding. */
export const SEND_WINDOW_MS = 60 * 60_000;

/** Confirmation emails per event and per hour: creation, resends and corrections included (OA2.4). */
export const CONFIRMATIONS_PER_EVENT = 3;

/**
 * Confirmation emails per address and per hour, all events together (OA1.9, OA2.4), so
 * that nobody can flood an address by creating events. At creation it does not stop the
 * event: the event exists, the email does not go out.
 */
export const CONFIRMATIONS_PER_ADDRESS = 5;

/**
 * What Brevo's plan allows per day: 300 emails on the free plan. To be changed with the plan.
 */
export const BREVO_DAILY_QUOTA = 300;

/**
 * Sign-in requests per address and per hour (OA4.5, decision 9), an address without an
 * account included (OA3.5): the answer goes out whether or not the address has an account.
 */
export const LOGINS_PER_ADDRESS = 5;

/**
 * Every confirmation email and every answer to a sign-in request, per hour, whatever its
 * address (coordinator decision 2 on #581). The inactivity warnings are not counted
 * (decision on #616): the daily task sends 20 at most per run, and a batch of them must
 * not stop the sign-ins and confirmations of the hour. The per-event and per-address
 * limits do not stop someone who sprays many addresses; this cap does, without keeping
 * any IP address. At 50, one hour of abuse
 * spends a sixth of BREVO_DAILY_QUOTA, and the rest of the day still has emails to send.
 * Fullcar's ordinary traffic is far below it: an organiser sends a handful a month.
 */
export const GLOBAL_SENDS_PER_HOUR = 50;

/** The limit that stops an email: the most specific one first, since it tells the user more. */
export type SendLimit = "event" | "address" | "global";

/**
 * Emails sent in the window. `event` and `address` count confirmation emails, `login` the
 * answers to sign-in requests to the address, `global` both kinds together.
 */
export interface RecentSends {
  event?: number;
  address?: number;
  login?: number;
  global: number;
}

/** Whether a send made at `sentAt` still counts at `now`: an hour later, it no longer does. */
export function inSendWindow(sentAt: Date, now: Date): boolean {
  return now.getTime() - sentAt.getTime() < SEND_WINDOW_MS;
}

/** The limit one more email would cross, or `null` when it may go. */
export function sendLimitReached(recent: RecentSends): SendLimit | null {
  if ((recent.event ?? 0) >= CONFIRMATIONS_PER_EVENT) return "event";
  if ((recent.address ?? 0) >= CONFIRMATIONS_PER_ADDRESS) return "address";
  if ((recent.login ?? 0) >= LOGINS_PER_ADDRESS) return "address";
  if (recent.global >= GLOBAL_SENDS_PER_HOUR) return "global";
  return null;
}
