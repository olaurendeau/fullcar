import { describe, expect, it, vi } from "vitest";
import { checkFromAnswer, goToAdminLink, organiserLinks, tokenInFragment } from "./admin-link";

const TOKEN = "q3Vx9kLmN2pR7sT1uW4yZa";

describe("goToAdminLink", () => {
  // C1.5, C4.8: the token travels in the fragment only, never in the path or the query.
  it("navigates to /e/{id}/admin with the token in the fragment", () => {
    const router = { push: vi.fn() };
    goToAdminLink(router, { id: "Ab3dEf7h", token: TOKEN });
    expect(router.push).toHaveBeenCalledExactlyOnceWith(`/e/Ab3dEf7h/admin#${TOKEN}`);
  });
});

describe("tokenInFragment", () => {
  it("reads what follows the #", () => {
    expect(tokenInFragment(`#${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    ["no fragment", ""],
    ["an empty fragment", "#"],
  ])("gives nothing for %s", (_, hash) => {
    expect(tokenInFragment(hash)).toBeUndefined();
  });
});

describe("checkFromAnswer", () => {
  // C4.9: the panel only on the server's `true`.
  it("shows the panel when the server answers true", () => {
    expect(checkFromAnswer(true, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toEqual({
      state: "valid",
      ...organiserLinks("https://fullcar.example", "Ab3dEf7h", TOKEN),
    });
  });

  // C6.5: "not valid" only on the server's `false`.
  it("calls the link invalid when the server answers false", () => {
    expect(checkFromAnswer(false, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toEqual({ state: "invalid" });
  });

  // A good link must never read "not valid": Next resolves an action with undefined on
  // an `x-action-redirect` response, for one.
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["the string true", "true"],
    ["the string false", "false"],
    ["0", 0],
    ["an object", { ok: true }],
  ])("says the check failed when the server answers %s", (_, answer) => {
    expect(checkFromAnswer(answer, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toEqual({ state: "failed" });
  });
});

describe("organiserLinks", () => {
  // C4.1, C4.3: both links in full, the public one without the token.
  it("gives the public link and the organiser's link of the event", () => {
    expect(organiserLinks("https://fullcar.example", "Ab3dEf7h", TOKEN)).toEqual({
      publicUrl: "https://fullcar.example/e/Ab3dEf7h",
      adminUrl: `https://fullcar.example/e/Ab3dEf7h/admin#${TOKEN}`,
    });
  });
});
