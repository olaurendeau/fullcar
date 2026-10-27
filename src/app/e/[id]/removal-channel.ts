/*
 * Which of the device's persons gone from the page were removed elsewhere (remove-person v2,
 * « Focus, barre, envoi », RP5.3): the bar says `PersonRemoval.removedElsewhere` once per
 * person, never for a removal this page sent, nor one another tab of the same device sent.
 * The tabs tell each other by a `BroadcastChannel` of the event's own: nothing is stored, and
 * what is known is a person's id, in memory, until the page goes.
 */

/** What a tab posts: it sends the removal of `personId`, or the server refused it. */
type Posted = { personId: string; sending: boolean };

const isPosted = (data: unknown): data is Posted =>
  typeof data === "object" &&
  data !== null &&
  "personId" in data &&
  typeof data.personId === "string" &&
  "sending" in data &&
  typeof data.sending === "boolean";

/** What a channel is used for: the browser's `BroadcastChannel`, or none where it has none. */
type Channel = Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((event: MessageEvent) => void) | null };

const openChannel = (name: string): Channel | undefined =>
  typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(name);

export interface DeviceRemovals {
  /** This page sends the removal of `personId`, as the request leaves: her absence is no news here, nor in the device's other tabs. */
  sending(personId: string): void;
  /** The server refused that removal: she is still part of the event, and her removal by someone else would be news. */
  refused(personId: string): void;
  /** A refusal `personGone` names them (`goneNamed`): its failure says it, so their absence is no news. */
  named(personIds: readonly string[]): void;
  /** Of `gone`, the device's persons gone from the page, those removed elsewhere, each once: who is returned is never again. */
  news(gone: readonly string[]): string[];
  close(): void;
}

/** The removals of event `eventId` this page knows of, its own and those of the device's other tabs. */
export function deviceRemovals(eventId: string, open: (name: string) => Channel | undefined = openChannel): DeviceRemovals {
  const sentHere = new Set<string>();
  const quiet = new Set<string>();
  const channel = open(`fullcar:removals:${eventId}`);
  const note = ({ personId, sending }: Posted) => void (sending ? sentHere.add(personId) : sentHere.delete(personId));
  if (channel) channel.onmessage = ({ data }) => isPosted(data) && note(data);
  const post = (posted: Posted) => {
    note(posted);
    channel?.postMessage(posted);
  };

  return {
    sending: (personId) => post({ personId, sending: true }),
    refused: (personId) => post({ personId, sending: false }),
    named: (personIds) => personIds.forEach((id) => quiet.add(id)),
    news: (gone) =>
      gone.filter((id) => {
        if (sentHere.has(id) || quiet.has(id)) return false;
        quiet.add(id);
        return true;
      }),
    close: () => channel?.close(),
  };
}
