import { describe, expect, it, vi } from "vitest";
import { goToAdminLink, organiserLinks, tokenInFragment } from "./admin-link";

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

describe("organiserLinks", () => {
  // C4.1, C4.3: both links in full, the public one without the token.
  it("gives the public link and the organiser's link of the event", () => {
    expect(organiserLinks("https://fullcar.example", "Ab3dEf7h", TOKEN)).toEqual({
      publicUrl: "https://fullcar.example/e/Ab3dEf7h",
      adminUrl: `https://fullcar.example/e/Ab3dEf7h/admin#${TOKEN}`,
    });
  });
});
