import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRANSFER_LINK_LIFETIME_MS } from "./account-rules";
import { emailAddress } from "./email-address";
import { SENDING_STALE_MS } from "./pending-send";
import { browserUnsafeReached } from "./test-browser-safe";
import { isAccountAddress, transferNotice, transferNoticeOf, type TransferRow } from "./transfer";

const NOW = new Date("2026-11-01T09:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const EMAIL = "claire.martin@exemple.fr";

const row = (fields: Partial<TransferRow>): TransferRow => ({
  email: EMAIL,
  status: "sent",
  at: ago(60_000),
  lastLinkAt: ago(60_000),
  ...fields,
});

describe("transferNotice", () => {
  // OT2.2: the notice is read from the row of the event, at every load.
  it("says what the row keeps of the email: sending, sent, failed, stopped by the address limit", () => {
    expect(transferNotice(row({ status: "sending", at: ago(1_000) }), NOW)).toEqual({ email: EMAIL, send: "sending" });
    expect(transferNotice(row({ status: "sent" }), NOW)).toEqual({ email: EMAIL, send: "sent" });
    expect(transferNotice(row({ status: "failed" }), NOW)).toEqual({ email: EMAIL, send: "failed" });
    expect(transferNotice(row({ status: "address_limit", lastLinkAt: null }), NOW)).toEqual({
      email: EMAIL,
      send: "addressLimit",
    });
  });

  it("reads a send still « sending » after 30 s as a failure, never « Envoi du lien… » that does not end", () => {
    expect(transferNotice(row({ status: "sending", at: ago(SENDING_STALE_MS) }), NOW)?.send).toBe("sending");
    expect(transferNotice(row({ status: "sending", at: ago(SENDING_STALE_MS + 1) }), NOW)?.send).toBe("failed");
    expect(transferNotice(row({ status: "sending", at: ago(DAY) }), NOW)?.send).toBe("failed");
  });

  it("reads a send without a result or without a time as a failure, never « envoyé »", () => {
    expect(transferNotice(row({ status: null, at: null }), NOW)?.send).toBe("failed");
    expect(transferNotice(row({ status: "sending", at: null }), NOW)?.send).toBe("failed");
  });

  it("gives no notice when no handover waits", () => {
    expect(transferNotice({ email: null, status: null, at: null, lastLinkAt: null }, NOW)).toBeUndefined();
    expect(transferNotice({ email: null, status: "sent", at: ago(1_000), lastLinkAt: ago(1_000) }, NOW)).toBeUndefined();
  });

  // OT2.6: expired when the most recent link is 7 days old.
  it("is expired from the 7th day of the most recent link, not before", () => {
    const sent = (age: number) => transferNotice(row({ lastLinkAt: ago(age) }), NOW)?.send;
    expect(TRANSFER_LINK_LIFETIME_MS).toBe(7 * DAY);
    expect(sent(6 * DAY + 23 * HOUR)).toBe("sent");
    expect(sent(7 * DAY - 1)).toBe("sent");
    expect(sent(7 * DAY)).toBe("expired");
    expect(sent(7 * DAY + HOUR)).toBe("expired");
  });

  it("is expired whatever the status the old send kept: the way out is the same, a new link", () => {
    for (const status of ["sent", "failed", "sending"] as const) {
      expect(transferNotice(row({ status, at: ago(8 * DAY), lastLinkAt: ago(8 * DAY) }), NOW)?.send).toBe("expired");
    }
  });

  it("reads the most recent link given: a resend renews what an older link expired", () => {
    expect(transferNotice(row({ at: ago(8 * DAY), lastLinkAt: ago(DAY) }), NOW)?.send).toBe("sent");
  });

  it("does not expire a handover that no link was made for: the address limit says so until the resend", () => {
    expect(transferNotice(row({ status: "address_limit", at: ago(30 * DAY), lastLinkAt: null }), NOW)?.send).toBe("addressLimit");
  });

  it("keeps the address in full", () => {
    expect(transferNotice(row({ email: "a@b.fr" }), NOW)?.email).toBe("a@b.fr");
  });
});

describe("transferNoticeOf", () => {
  it("takes a notice as the server answers it, and copies its two fields alone", () => {
    for (const send of ["sending", "sent", "failed", "addressLimit", "expired"] as const) {
      expect(transferNoticeOf({ email: EMAIL, send, other: 1 })).toStrictEqual({ email: EMAIL, send });
    }
  });

  it("takes anything else for none", () => {
    const others = [undefined, null, "sent", 3, [], {}, { email: EMAIL }, { send: "sent" }, { email: 1, send: "sent" }];
    for (const value of [...others, { email: EMAIL, send: "pending" }]) {
      expect(transferNoticeOf(value)).toBeUndefined();
    }
  });
});

describe("isAccountAddress", () => {
  // OT1.4: compared after normalisation, as email-address.ts writes an address.
  it("is true for the address of the account however it is typed", () => {
    expect(isAccountAddress("camille@exemple.fr", "camille@exemple.fr")).toBe(true);
    expect(isAccountAddress("  Camille@Exemple.FR ", "camille@exemple.fr")).toBe(true);
    // The account keeps the domain in punycode; the typed address may not.
    const stored = emailAddress("elodie@école.fr");
    if (!("value" in stored)) throw new Error("not an address");
    expect(stored.value).toMatch(/@xn--/);
    expect(isAccountAddress("Elodie@ÉCOLE.fr", stored.value)).toBe(true);
  });

  it("is false for another address, and for what is not an address", () => {
    expect(isAccountAddress("claire@exemple.fr", "camille@exemple.fr")).toBe(false);
    for (const typed of ["", "   ", "camille", null, undefined, 3, ["camille@exemple.fr"]]) {
      expect(isAccountAddress(typed, "camille@exemple.fr")).toBe(false);
    }
  });
});

it("uses nothing from Node, so the browser can load it", () => {
  const file = new URL("./transfer.ts", import.meta.url);
  expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
});
