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
  const legs = [
    { leg: "aller", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 0, withoutCar: [], carsWithoutPhone: [] },
  ];

  // C4.9 as amended by #154: the panel only on the server's panel, with its legs.
  it("shows the panel, with its legs, when the server answers the panel", () => {
    expect(checkFromAnswer({ state: "panel", legs }, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toStrictEqual({
      state: "valid",
      ...organiserLinks("https://fullcar.example", "Ab3dEf7h", TOKEN),
      legs,
    });
    expect(checkFromAnswer({ state: "panel", legs: [] }, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toMatchObject({
      state: "valid",
      legs: [],
    });
  });

  // C6.5: "not valid" only on the server's invalid.
  it("calls the link invalid when the server answers invalid", () => {
    expect(checkFromAnswer({ state: "invalid" }, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toStrictEqual({
      state: "invalid",
    });
  });

  it("says the check failed on the panel without a token to make the links of", () => {
    expect(checkFromAnswer({ state: "panel", legs }, "https://fullcar.example", "Ab3dEf7h", "")).toEqual({
      state: "failed",
    });
  });

  // A good link must never read "not valid": Next resolves an action with undefined on
  // an `x-action-redirect` response, for one.
  it.each([
    ["true", true],
    ["false", false],
    ["undefined", undefined],
    ["null", null],
    ["the string invalid", "invalid"],
    ["0", 0],
    ["an object", { ok: true }],
    ["the panel without legs", { state: "panel" }],
    ["the panel with legs that are not a list", { state: "panel", legs: {} }],
    ["another state", { state: "other" }],
  ])("says the check failed when the server answers %s", (_, answer) => {
    expect(checkFromAnswer(answer, "https://fullcar.example", "Ab3dEf7h", TOKEN)).toStrictEqual({ state: "failed" });
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
