import { describe, expect, it, vi } from "vitest";
import type { Sent } from "@/app/e/[id]/run-action";
import { deleteAccountBrowser } from "./delete-account-browser";
import type { BrowserTokens } from "./sign-out-browser";

function tokens(session: string | undefined, admin: string[]): BrowserTokens {
  return {
    readSessionToken: vi.fn(() => session),
    keptAdminTokens: vi.fn(() => admin),
    forgetSessionToken: vi.fn(),
    forgetAdminTokens: vi.fn(),
  };
}

describe("deleteAccountBrowser", () => {
  it("sends the session's token and every admin token kept, then forgets them once the server says deleted", async () => {
    const kept = tokens("session-token", ["admin-1", "admin-2"]);
    const send = vi.fn(async (): Promise<Sent<unknown>> => ({ ok: true, value: { deleted: true } }));
    expect(await deleteAccountBrowser(send, kept)).toBe("deleted");
    expect(send).toHaveBeenCalledWith("session-token", ["admin-1", "admin-2"]);
    expect(kept.forgetSessionToken).toHaveBeenCalledWith("session-token");
    expect(kept.forgetAdminTokens).toHaveBeenCalledWith(["admin-1", "admin-2"]);
  });

  // The session is closed, ended, or its account gone: a retry could never succeed.
  it("forgets the dead session's token, keeps the admin tokens, and says it is gone when nothing was deleted", async () => {
    const kept = tokens("session-token", ["admin-1"]);
    const send = async (): Promise<Sent<unknown>> => ({ ok: true, value: { deleted: false } });
    expect(await deleteAccountBrowser(send, kept)).toBe("gone");
    expect(kept.forgetSessionToken).toHaveBeenCalledWith("session-token");
    expect(kept.forgetAdminTokens).not.toHaveBeenCalled();
  });

  it("says it is gone without a session token, and forgets nothing", async () => {
    const kept = tokens(undefined, ["admin-1"]);
    expect(await deleteAccountBrowser(async () => ({ ok: true, value: { deleted: false } }), kept)).toBe("gone");
    expect(kept.forgetSessionToken).not.toHaveBeenCalled();
    expect(kept.forgetAdminTokens).not.toHaveBeenCalled();
  });

  // OA9.4: offline, or any answer but « deleted »: nothing is erased, so nothing is forgotten.
  it.each([
    ["offline", { ok: false, problem: "offline" }],
    ["a failure", { ok: false, problem: "failed" }],
    ["another shape", { ok: true, value: { deleted: "yes" } }],
    ["no answer", { ok: true, value: null }],
  ] as [string, Sent<unknown>][])("keeps every token on %s, and says it failed", async (_, sent) => {
    const kept = tokens("session-token", ["admin-1"]);
    expect(await deleteAccountBrowser(async () => sent, kept)).toBe("failed");
    expect(kept.forgetSessionToken).not.toHaveBeenCalled();
    expect(kept.forgetAdminTokens).not.toHaveBeenCalled();
  });
});
