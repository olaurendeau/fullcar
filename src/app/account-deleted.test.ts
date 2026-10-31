import { describe, expect, it } from "vitest";
import { forgetAccountDeleted, noteAccountDeleted, peekAccountDeleted } from "./account-deleted";

describe("noteAccountDeleted, peekAccountDeleted and forgetAccountDeleted", () => {
  // OA9.5: « Votre compte a été supprimé. » on `/`, once, after « Supprimer mon compte » only.
  it("says deleted after the note until the page that showed it forgets it, and never without the note", () => {
    expect(peekAccountDeleted()).toBe(false);
    noteAccountDeleted();
    expect(peekAccountDeleted()).toBe(true);
    // React may render a page twice (a transition thrown away and rendered again): reading takes nothing,
    // or the second render finds nothing and the line never shows (flaky OA9.5, #922).
    expect(peekAccountDeleted()).toBe(true);
    forgetAccountDeleted();
    expect(peekAccountDeleted()).toBe(false);
  });
});
