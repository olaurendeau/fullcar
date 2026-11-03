import { describe, expect, it } from "vitest";
import { linkTokenOf } from "./link-fragment";

/** Shaped as server-token.ts draws a token: 22 base64url characters for 16 bytes. */
const TOKEN = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";

describe("linkTokenOf", () => {
  it("reads the token after the #", () => {
    expect(linkTokenOf(`#${TOKEN}`)).toBe(TOKEN);
  });

  // OA5.7: absent, cut by a character, or not a token at all, the page is « Ce lien n’est pas valide ».
  it.each([
    ["no fragment", ""],
    ["a # alone", "#"],
    ["a token one character short", `#${TOKEN.slice(1)}`],
    ["a token one character long", `#${TOKEN}A`],
    ["a last character no 16 bytes end with", `#${TOKEN.slice(0, -1)}h`],
    ["a fragment with a query", `#${TOKEN}?x=1`],
    ["a second #", `##${TOKEN}`],
    ["spaces", `# ${TOKEN}`],
  ])("reads no token from %s", (_, hash) => {
    expect(linkTokenOf(hash)).toBeUndefined();
  });
});
