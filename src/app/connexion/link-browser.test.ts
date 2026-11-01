import { describe, expect, it, vi } from "vitest";
import type { Sent } from "@/app/e/[id]/run-action";
import { openLinkInBrowser, resendLinkInBrowser } from "./link-browser";

const TOKEN = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";
const SESSION = "Zq9Lt2Wn8Rc4gkP3x-Vb7A";
const HASH = `#${TOKEN}`;

const answered = (value: unknown): Sent<unknown> => ({ ok: true, value });

describe("openLinkInBrowser", () => {
  // OA5.2, OA4.4: the new session is kept, then the browser goes where the link says.
  it("keeps the session the server opened and lands on Mes événements without an event", async () => {
    const send = vi.fn(async () => answered({ state: "opened", session: SESSION, eventId: null }));
    const keep = vi.fn(() => true);
    expect(await openLinkInBrowser(HASH, send, keep)).toEqual({ kind: "opened", to: "/mes-evenements" });
    expect(send.mock.calls).toEqual([[TOKEN]]);
    expect(keep.mock.calls).toEqual([[SESSION]]);
  });

  it("lands on the admin of the event the link brings", async () => {
    const send = async () => answered({ state: "opened", session: SESSION, eventId: "Ab3dEf7h" });
    expect(await openLinkInBrowser(HASH, send, () => true)).toEqual({ kind: "opened", to: "/e/Ab3dEf7h/admin" });
  });

  // The link is used and the session lost: nothing must say it opened, nor go anywhere.
  it("says it failed when the browser cannot keep the session", async () => {
    const send = async () => answered({ state: "opened", session: SESSION, eventId: null });
    expect(await openLinkInBrowser(HASH, send, () => false)).toEqual({ kind: "alert", alert: "failed" });
  });

  // OA5.7: nothing to send, so nothing is sent.
  it.each(["", "#", `#${TOKEN.slice(1)}`])("asks nothing of a fragment that is no token (%j)", async (hash) => {
    const send = vi.fn();
    const keep = vi.fn();
    expect(await openLinkInBrowser(hash, send, keep)).toEqual({ kind: "screen", screen: "invalid" });
    expect(send).not.toHaveBeenCalled();
    expect(keep).not.toHaveBeenCalled();
  });

  // OA5.4 to OA5.7: why the link opens nothing, and nothing is kept.
  it.each(["expired", "used", "invalid"] as const)("shows %s and keeps nothing", async (state) => {
    const keep = vi.fn();
    expect(await openLinkInBrowser(HASH, async () => answered({ state }), keep)).toEqual({ kind: "screen", screen: state });
    expect(keep).not.toHaveBeenCalled();
  });

  // OA5.8
  it.each(["offline", "failed"] as const)("shows the alert when the request is %s", async (problem) => {
    const keep = vi.fn();
    expect(await openLinkInBrowser(HASH, async () => ({ ok: false, problem }), keep)).toEqual({ kind: "alert", alert: problem });
    expect(keep).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined, as Next resolves a redirect", undefined],
    ["another shape", { state: "open" }],
    ["a session that is not a string", { state: "opened", session: 1, eventId: null }],
    ["an event that is neither an id nor none", { state: "opened", session: SESSION, eventId: 1 }],
  ])("shows the failure for an answer of %s, and keeps nothing", async (_, value) => {
    const keep = vi.fn();
    expect(await openLinkInBrowser(HASH, async () => answered(value), keep)).toEqual({ kind: "alert", alert: "failed" });
    expect(keep).not.toHaveBeenCalled();
  });

  // The event's id travels in a path: whatever it holds stays one segment.
  it("keeps an event's id to one path segment", async () => {
    const send = async () => answered({ state: "opened", session: SESSION, eventId: "../x?y#z" });
    expect(await openLinkInBrowser(HASH, send, () => true)).toEqual({ kind: "opened", to: "/e/..%2Fx%3Fy%23z/admin" });
  });
});

describe("resendLinkInBrowser", () => {
  // OA5.6
  it("sends the token, and says the new link went out", async () => {
    const send = vi.fn(async () => answered({ state: "sent" }));
    expect(await resendLinkInBrowser(HASH, send)).toEqual({ kind: "sent" });
    expect(send.mock.calls).toEqual([[TOKEN]]);
  });

  it.each(["used", "invalid"] as const)("shows %s", async (state) => {
    expect(await resendLinkInBrowser(HASH, async () => answered({ state }))).toEqual({ kind: "screen", screen: state });
  });

  it("asks nothing of a fragment that is no token", async () => {
    const send = vi.fn();
    expect(await resendLinkInBrowser("", send)).toEqual({ kind: "screen", screen: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["tooMany", "failed"] as const)("shows the alert %s of the answer", async (state) => {
    expect(await resendLinkInBrowser(HASH, async () => answered({ state }))).toEqual({ kind: "alert", alert: state });
  });

  it.each(["offline", "failed"] as const)("shows the alert when the request is %s", async (problem) => {
    expect(await resendLinkInBrowser(HASH, async () => ({ ok: false, problem }))).toEqual({ kind: "alert", alert: problem });
  });

  it("shows the failure for an answer of another shape", async () => {
    expect(await resendLinkInBrowser(HASH, async () => answered({ state: "expired" }))).toEqual({ kind: "alert", alert: "failed" });
  });
});
