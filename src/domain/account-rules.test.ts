import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_LINK_LIFETIME_MS,
  LINK_KEPT_AFTER_EXPIRY_MS,
  LOGIN_LINK_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  TRANSFER_LINK_LIFETIME_MS,
  accountDeletionDueAt,
  accountIsInactive,
  inactivityWarningDueAt,
  linkDeletedAt,
  linkExpiresAt,
  linkOutcome,
  sessionExpiresAt,
  sessionIsAlive,
  type LinkKind,
  type StoredLink,
} from "./account-rules";
import { browserUnsafeReached } from "./test-browser-safe";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = new Date("2026-10-25T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

function link(kind: LinkKind, age: number, usedAt: Date | null = null): StoredLink {
  return { kind, createdAt: ago(age), usedAt };
}

describe("lifetimes", () => {
  it("are 1 hour for a sign-in link, 7 days for a confirmation link, 90 days for a session", () => {
    expect(LOGIN_LINK_LIFETIME_MS).toBe(HOUR);
    expect(CONFIRMATION_LINK_LIFETIME_MS).toBe(7 * DAY);
    expect(SESSION_LIFETIME_MS).toBe(90 * DAY);
  });

  // OT2.6
  it("are 7 days for a transfer link", () => {
    expect(TRANSFER_LINK_LIFETIME_MS).toBe(7 * DAY);
  });

  it("put the end of a link at its creation plus its lifetime", () => {
    const createdAt = new Date("2026-10-25T10:00:00.000Z");
    expect(linkExpiresAt("login", createdAt)).toEqual(new Date("2026-10-25T11:00:00.000Z"));
    expect(linkExpiresAt("confirmation", createdAt)).toEqual(new Date("2026-11-01T10:00:00.000Z"));
    expect(linkExpiresAt("transfer", createdAt)).toEqual(new Date("2026-11-01T10:00:00.000Z"));
  });
});

describe("linkOutcome", () => {
  it("is valid for an unused link, within its lifetime, on the page of its kind", () => {
    expect(linkOutcome(link("login", 59 * MINUTE), "login", now)).toBe("valid");
    expect(linkOutcome(link("confirmation", 7 * DAY - MINUTE), "confirmation", now)).toBe("valid");
  });

  // OA5.5
  it("is expired for a sign-in link created 61 minutes ago", () => {
    expect(linkOutcome(link("login", 61 * MINUTE), "login", now)).toBe("expired");
  });

  // OA5.6
  it("is expired for a confirmation link created 7 days and 1 minute ago", () => {
    expect(linkOutcome(link("confirmation", 7 * DAY + MINUTE), "confirmation", now)).toBe("expired");
  });

  it("is expired at the exact end of the lifetime, not a millisecond later", () => {
    expect(linkOutcome(link("login", HOUR - 1), "login", now)).toBe("valid");
    expect(linkOutcome(link("login", HOUR), "login", now)).toBe("expired");
  });

  // OA5.4
  it("is used for a link that has already served, whatever its age", () => {
    expect(linkOutcome(link("login", MINUTE, ago(30_000)), "login", now)).toBe("used");
    expect(linkOutcome(link("confirmation", 30 * DAY, ago(20 * DAY)), "confirmation", now)).toBe("used");
  });

  // OT2.6: 6 days 23 hours it serves, 7 days 1 hour it does not.
  it("is valid for a transfer link at 6 days 23 hours, expired at 7 days 1 hour, and used whatever its age", () => {
    expect(linkOutcome(link("transfer", 6 * DAY + 23 * HOUR), "transfer", now)).toBe("valid");
    expect(linkOutcome(link("transfer", 7 * DAY - 1), "transfer", now)).toBe("valid");
    expect(linkOutcome(link("transfer", 7 * DAY), "transfer", now)).toBe("expired");
    expect(linkOutcome(link("transfer", 7 * DAY + HOUR), "transfer", now)).toBe("expired");
    expect(linkOutcome(link("transfer", 20 * DAY, ago(10 * DAY)), "transfer", now)).toBe("used");
    expect(linkOutcome(null, "transfer", now)).toBe("invalid");
  });

  it("is invalid for a transfer link on another page, and the reverse: a handover link neither confirms nor signs in", () => {
    for (const other of ["login", "confirmation"] as const) {
      expect(linkOutcome(link("transfer", MINUTE), other, now)).toBe("invalid");
      expect(linkOutcome(link(other, MINUTE), "transfer", now)).toBe("invalid");
    }
  });

  // OA5.7, and OA2.5: a link replaced by a correction is no longer found.
  it("is invalid for a link that is not found", () => {
    expect(linkOutcome(null, "login", now)).toBe("invalid");
    expect(linkOutcome(null, "confirmation", now)).toBe("invalid");
  });

  it("is invalid for a link of the other kind: a sign-in link does not confirm, nor the reverse", () => {
    expect(linkOutcome(link("login", MINUTE), "confirmation", now)).toBe("invalid");
    expect(linkOutcome(link("confirmation", MINUTE), "login", now)).toBe("invalid");
    expect(linkOutcome(link("confirmation", MINUTE, ago(1)), "login", now)).toBe("invalid");
  });
});

describe("an expired or used link", () => {
  // #589: the link page still says « Ce lien a expiré » or « Ce lien a déjà servi » for 30 days.
  it("is kept 30 days after its expiry, used or not, then the daily task deletes it", () => {
    expect(LINK_KEPT_AFTER_EXPIRY_MS).toBe(30 * DAY);
    const createdAt = new Date("2026-10-25T10:00:00.000Z");
    expect(linkDeletedAt("login", createdAt)).toEqual(new Date("2026-11-24T11:00:00.000Z"));
    expect(linkDeletedAt("confirmation", createdAt)).toEqual(new Date("2026-12-01T10:00:00.000Z"));
    expect(linkDeletedAt("transfer", createdAt)).toEqual(new Date("2026-12-01T10:00:00.000Z"));
  });

  it("still says expired the millisecond before it may be deleted", () => {
    const createdAt = new Date("2026-10-25T10:00:00.000Z");
    const lastKept = new Date(linkDeletedAt("login", createdAt).getTime() - 1);
    expect(linkOutcome({ kind: "login", createdAt, usedAt: null }, "login", lastKept)).toBe("expired");
  });
});

describe("session", () => {
  // OA9.6: 90 days after the last visit, not after the sign-in.
  it("ends 90 days after the last visit", () => {
    expect(sessionExpiresAt(ago(DAY))).toEqual(new Date(now.getTime() + 89 * DAY));
    expect(sessionIsAlive(ago(89 * DAY), now)).toBe(true);
    expect(sessionIsAlive(ago(90 * DAY - 1), now)).toBe(true);
    expect(sessionIsAlive(ago(90 * DAY), now)).toBe(false);
    expect(sessionIsAlive(ago(91 * DAY), now)).toBe(false);
  });

  it("slides: a visit yesterday keeps a session opened long ago", () => {
    expect(sessionIsAlive(ago(DAY), now)).toBe(true);
  });
});

describe("account", () => {
  const lastVisitAt = new Date("2026-10-25T10:00:00.000Z");

  // OA9.7: measured at the last visit, in calendar years.
  it("is deleted 3 years after its last visit", () => {
    expect(accountDeletionDueAt(lastVisitAt)).toEqual(new Date("2029-10-25T10:00:00.000Z"));
    expect(accountIsInactive(lastVisitAt, new Date("2029-10-25T09:59:59.999Z"))).toBe(false);
    expect(accountIsInactive(lastVisitAt, new Date("2029-10-25T10:00:00.000Z"))).toBe(true);
  });

  it("is warned 30 days before its deletion", () => {
    expect(inactivityWarningDueAt(lastVisitAt)).toEqual(new Date("2029-09-25T10:00:00.000Z"));
  });

  it("counts 3 calendar years from a 29 February to the 1 March", () => {
    expect(accountDeletionDueAt(new Date("2028-02-29T08:00:00.000Z"))).toEqual(new Date("2031-03-01T08:00:00.000Z"));
  });

  it("is not inactive when its last visit was yesterday", () => {
    expect(accountIsInactive(ago(DAY), now)).toBe(false);
  });
});

it("uses nothing from Node, so the browser can load it", () => {
  const file = new URL("./account-rules.ts", import.meta.url);
  expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
});
