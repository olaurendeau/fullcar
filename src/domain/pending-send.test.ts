import { describe, expect, it } from "vitest";
import { pendingNotice, pendingNoticeOf, SENDING_STALE_MS } from "./pending-send";

const NOW = new Date("2026-10-27T09:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const EMAIL = "claire.martin@exemple.fr";

describe("pendingNotice", () => {
  it("OA1.7: the result kept with the pending event, its address with it", () => {
    expect(pendingNotice({ email: EMAIL, status: "sent", at: ago(60_000) }, NOW)).toEqual({ email: EMAIL, send: "sent" });
    expect(pendingNotice({ email: EMAIL, status: "failed", at: ago(60_000) }, NOW)).toEqual({ email: EMAIL, send: "failed" });
    expect(pendingNotice({ email: EMAIL, status: "address_limit", at: ago(60_000) }, NOW)).toEqual({
      email: EMAIL,
      send: "addressLimit",
    });
    expect(pendingNotice({ email: EMAIL, status: "sending", at: ago(1_000) }, NOW)).toEqual({ email: EMAIL, send: "sending" });
  });

  it("OA1.7, OA1.10: a send still « sending » after 30 s reads as a failure, never « Envoi du lien… » that does not end", () => {
    expect(pendingNotice({ email: EMAIL, status: "sending", at: ago(SENDING_STALE_MS) }, NOW)?.send).toBe("sending");
    expect(pendingNotice({ email: EMAIL, status: "sending", at: ago(SENDING_STALE_MS + 1) }, NOW)?.send).toBe("failed");
    expect(pendingNotice({ email: EMAIL, status: "sending", at: ago(60 * 60_000) }, NOW)?.send).toBe("failed");
    expect(pendingNotice({ email: EMAIL, status: "sending", at: ago(24 * 60 * 60_000) }, NOW)?.send).toBe("failed");
  });

  it("OA1.10: a send without a result kept reads as a failure, never « Nous avons envoyé »", () => {
    expect(pendingNotice({ email: EMAIL, status: null, at: null }, NOW)).toEqual({ email: EMAIL, send: "failed" });
    expect(pendingNotice({ email: EMAIL, status: "sending", at: null }, NOW)).toEqual({ email: EMAIL, send: "failed" });
  });

  it("OA2.6: no address awaiting confirmation, no notice", () => {
    expect(pendingNotice({ email: null, status: "sent", at: ago(1_000) }, NOW)).toBeUndefined();
    expect(pendingNotice({ email: null, status: null, at: null }, NOW)).toBeUndefined();
  });
});

describe("pendingNoticeOf", () => {
  it("takes a notice as the server answers it, and copies its two fields alone", () => {
    for (const send of ["sending", "sent", "failed", "addressLimit"] as const) {
      expect(pendingNoticeOf({ email: EMAIL, send, other: 1 })).toStrictEqual({ email: EMAIL, send });
    }
  });

  it("anything else is no notice", () => {
    for (const value of [undefined, null, "sent", 3, [], {}, { email: EMAIL }, { send: "sent" }, { email: 1, send: "sent" }, { email: EMAIL, send: "address_limit" }]) {
      expect(pendingNoticeOf(value), JSON.stringify(value)).toBeUndefined();
    }
  });
});
