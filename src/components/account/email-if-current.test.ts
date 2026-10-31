import { describe, expect, it } from "vitest";
import type { Sent } from "@/app/e/[id]/run-action";
import { emailIfCurrent } from "./email-if-current";

const answer = (value: unknown): Sent<unknown> => ({ ok: true, value });

describe("emailIfCurrent (OA5.2, OA5.9)", () => {
  it("gives the address of the session the bar speaks of", async () => {
    expect(await emailIfCurrent(async () => answer({ email: "a@example.org" }), () => true)).toBe("a@example.org");
  });

  it("drops an answer that arrives after the session changed (« Se déconnecter », another link)", async () => {
    let token = "first";
    let release: (sent: Sent<unknown>) => void = () => {};
    const late = emailIfCurrent(
      () => new Promise((resolve) => (release = resolve)),
      () => token === "first",
    );
    token = "closed";
    release(answer({ email: "a@example.org" }));
    expect(await late).toBeUndefined();
  });

  it("says nothing of a failure, an unknown session or an answer that is no address", async () => {
    expect(await emailIfCurrent(async () => ({ ok: false, problem: "offline" }), () => true)).toBeUndefined();
    expect(await emailIfCurrent(async () => answer({ email: null }), () => true)).toBeUndefined();
    expect(await emailIfCurrent(async () => answer(null), () => true)).toBeUndefined();
  });
});
