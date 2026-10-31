import { describe, expect, it, vi } from "vitest";
import type { Sent } from "@/app/e/[id]/run-action";
import { noteSignedOut, peekSignedOut, forgetSignedOut } from "@/app/connexion/signed-out";
import { signOutBrowser, type BrowserTokens } from "./sign-out-browser";

const SESSION = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";
const ADMIN = ["q3Vx9kLmN2pR7sT1uW4yZQ", "Zq9Lt2Wn8Rc4gkP3x-Vb7A"];

/** The browser's tokens, as session-token.ts and admin-token-store.ts keep them, each call a spy. */
function browserTokens(session: string | undefined) {
  return {
    readSessionToken: vi.fn(() => session),
    keptAdminTokens: vi.fn(() => ADMIN),
    forgetSessionToken: vi.fn(),
    forgetAdminTokens: vi.fn(),
  } satisfies BrowserTokens;
}

describe("signOutBrowser", () => {
  // OA9.1: the session's token and every admin token this browser keeps, in the body; then forgotten.
  it("sends the session and the admin tokens kept, then forgets them once signed out", async () => {
    const tokens = browserTokens(SESSION);
    const send = vi.fn(async (): Promise<Sent<unknown>> => ({ ok: true, value: { signedOut: true } }));
    expect(await signOutBrowser(send, tokens)).toBe("signedOut");
    expect(send.mock.calls).toEqual([[SESSION, ADMIN]]);
    expect(tokens.forgetSessionToken.mock.calls).toEqual([[SESSION]]);
    expect(tokens.forgetAdminTokens.mock.calls).toEqual([[ADMIN]]);
  });

  it("sends the admin tokens without a session, and forgets them", async () => {
    const tokens = browserTokens(undefined);
    const send = vi.fn(async (): Promise<Sent<unknown>> => ({ ok: true, value: { signedOut: true } }));
    expect(await signOutBrowser(send, tokens)).toBe("signedOut");
    expect(send.mock.calls).toEqual([[undefined, ADMIN]]);
    expect(tokens.forgetSessionToken).not.toHaveBeenCalled();
    expect(tokens.forgetAdminTokens.mock.calls).toEqual([[ADMIN]]);
  });

  // OA9.2: offline, or no answer that says so: the session stays open, and the tokens kept.
  it.each<[string, Sent<unknown>]>([
    ["offline", { ok: false, problem: "offline" }],
    ["failed", { ok: false, problem: "failed" }],
    ["undefined, as Next resolves a redirect", { ok: true, value: undefined }],
    ["of another shape", { ok: true, value: { signedOut: "yes" } }],
  ])("keeps every token when the answer is %s", async (_, sent) => {
    const tokens = browserTokens(SESSION);
    expect(await signOutBrowser(async () => sent, tokens)).toBe("failed");
    expect(tokens.forgetSessionToken).not.toHaveBeenCalled();
    expect(tokens.forgetAdminTokens).not.toHaveBeenCalled();
  });
});

describe("noteSignedOut, peekSignedOut and forgetSignedOut", () => {
  // OA9.1: « Session fermée. » on /connexion, once, after « Se déconnecter » only.
  it("says signed out after the note until the page that showed it forgets it, and never without the note", () => {
    expect(peekSignedOut()).toBe(false);
    noteSignedOut();
    expect(peekSignedOut()).toBe(true);
    // React may render a page twice (a transition thrown away and rendered again): reading takes nothing.
    expect(peekSignedOut()).toBe(true);
    forgetSignedOut();
    expect(peekSignedOut()).toBe(false);
  });
});
