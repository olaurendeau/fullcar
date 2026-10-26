import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BREVO_DAILY_QUOTA,
  CONFIRMATIONS_PER_ADDRESS,
  CONFIRMATIONS_PER_EVENT,
  GLOBAL_SENDS_PER_HOUR,
  SEND_WINDOW_MS,
  inSendWindow,
  sendLimitReached,
} from "./send-limits";
import { browserUnsafeReached } from "./test-browser-safe";

const MINUTE = 60_000;
const now = new Date("2026-10-25T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("the window", () => {
  it("is one hour, sliding", () => {
    expect(SEND_WINDOW_MS).toBe(60 * MINUTE);
  });

  it("counts a send of 59 minutes ago, not one of an hour ago: « Réessayez dans une heure » holds", () => {
    expect(inSendWindow(ago(59 * MINUTE), now)).toBe(true);
    expect(inSendWindow(ago(60 * MINUTE - 1), now)).toBe(true);
    expect(inSendWindow(ago(60 * MINUTE), now)).toBe(false);
    expect(inSendWindow(ago(2 * 60 * MINUTE), now)).toBe(false);
  });
});

describe("sendLimitReached", () => {
  it("lets the first confirmation of an event go", () => {
    expect(sendLimitReached({ event: 0, address: 0, global: 0 })).toBeNull();
  });

  // OA2.4: 3 confirmation emails per hour for an event, creation, resends and corrections included.
  describe("per event", () => {
    it("is 3 per hour", () => {
      expect(CONFIRMATIONS_PER_EVENT).toBe(3);
    });

    it("lets the 3rd go, and stops the 4th", () => {
      expect(sendLimitReached({ event: 2, address: 2, global: 2 })).toBeNull();
      expect(sendLimitReached({ event: 3, address: 3, global: 3 })).toBe("event");
    });
  });

  // OA1.9 and OA2.4: 5 confirmation emails per hour to one address, all events together.
  describe("per address", () => {
    it("is 5 per hour", () => {
      expect(CONFIRMATIONS_PER_ADDRESS).toBe(5);
    });

    it("lets the 5th go, and stops the 6th creation with the same address", () => {
      expect(sendLimitReached({ event: 0, address: 4, global: 4 })).toBeNull();
      expect(sendLimitReached({ event: 0, address: 5, global: 5 })).toBe("address");
    });

    it("names the event limit first when both are reached: the event's is the one a resend hits", () => {
      expect(sendLimitReached({ event: 3, address: 5, global: 5 })).toBe("event");
    });
  });

  // Coordinator decision 2 on #581: a global cap per hour, below the Brevo quota.
  describe("global cap", () => {
    it("is per hour, and well below the Brevo daily quota", () => {
      expect(GLOBAL_SENDS_PER_HOUR).toBe(50);
      expect(GLOBAL_SENDS_PER_HOUR).toBeLessThan(BREVO_DAILY_QUOTA);
    });

    it("is above what one address or one event can send, so that it never stops an ordinary user first", () => {
      expect(GLOBAL_SENDS_PER_HOUR).toBeGreaterThan(CONFIRMATIONS_PER_ADDRESS);
      expect(GLOBAL_SENDS_PER_HOUR).toBeGreaterThan(CONFIRMATIONS_PER_EVENT);
    });

    it("lets the 50th email of the hour go, and stops the 51st, whatever the address", () => {
      expect(sendLimitReached({ event: 0, address: 0, global: 49 })).toBeNull();
      expect(sendLimitReached({ event: 0, address: 0, global: 50 })).toBe("global");
    });

    it("applies to an email without an event or an address limit, such as a sign-in link", () => {
      expect(sendLimitReached({ global: 49 })).toBeNull();
      expect(sendLimitReached({ global: 50 })).toBe("global");
    });

    it("is named after the event and address limits, which tell the user more", () => {
      expect(sendLimitReached({ event: 0, address: 5, global: 50 })).toBe("address");
    });
  });
});

it("uses nothing from Node, so the browser can load it", () => {
  const file = new URL("./send-limits.ts", import.meta.url);
  expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
});
