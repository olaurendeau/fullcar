import { describe, expect, it } from "vitest";
import { loginOutcome } from "./login-outcome";

describe("loginOutcome", () => {
  // OA4.2: « Regardez vos e-mails », with or without an account, the answer being the same.
  it("is sent when the server answers sent", () => {
    expect(loginOutcome({ ok: true, value: { state: "sent" } })).toEqual({ kind: "sent" });
  });

  // OA4.5: the alert above the button.
  it("is Login.offline offline, Login.failed for a server that failed or a send that failed, Login.tooMany at the limit", () => {
    expect(loginOutcome({ ok: false, problem: "offline" })).toEqual({ kind: "alert", alert: "offline" });
    expect(loginOutcome({ ok: false, problem: "failed" })).toEqual({ kind: "alert", alert: "failed" });
    expect(loginOutcome({ ok: true, value: { state: "failed" } })).toEqual({ kind: "alert", alert: "failed" });
    expect(loginOutcome({ ok: true, value: { state: "tooMany" } })).toEqual({ kind: "alert", alert: "tooMany" });
  });

  it("is the field's error when the server refuses the address", () => {
    for (const error of ["required", "invalid", "tooLong"] as const) {
      expect(loginOutcome({ ok: true, value: { state: "invalid", error } })).toEqual({ kind: "invalid", error });
    }
  });

  it("is Login.failed for an answer of another shape, never « Regardez vos e-mails »", () => {
    for (const value of [undefined, null, "sent", {}, { state: "other" }, { state: "invalid", error: "other" }, { state: "invalid" }]) {
      expect(loginOutcome({ ok: true, value })).toEqual({ kind: "alert", alert: "failed" });
    }
  });
});
