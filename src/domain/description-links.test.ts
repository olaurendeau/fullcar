import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { descriptionPieces, type DescriptionPiece } from "./description-links";
import { browserUnsafeReached } from "./test-browser-safe";

const text = (value: string): DescriptionPiece => ({ kind: "text", text: value });
const link = (href: string): DescriptionPiece => ({ kind: "link", href });

const PLAN = "https://asa-annecy.example/plan";

/** The table of « Les liens », event-description v3: one row per typed value (several values in one row are separate cases). */
const TABLE: [string, string, DescriptionPiece[]][] = [
  ["L1", "Infos : https://asa-annecy.example/match.", [text("Infos : "), link("https://asa-annecy.example/match"), text(".")]],
  [
    "L2",
    "(voir https://fr.wikipedia.org/wiki/Annecy_(ville))",
    [text("(voir "), link("https://fr.wikipedia.org/wiki/Annecy_(ville)"), text(")")],
  ],
  ["L3", `Vite !${PLAN}!!!`, [text("Vite !"), link(PLAN), text("!!!")]],
  ["L4", `Voir ${PLAN}…`, [text("Voir "), link(PLAN), text("…")]],
  ["L5", `<${PLAN}>`, [text("<"), link(PLAN), text(">")]],
  ["L6", `«\u00a0${PLAN}\u00a0»`, [text("«\u00a0"), link(PLAN), text("\u00a0»")]],
  ["L7", `${PLAN}\u202f:`, [link(PLAN), text("\u202f:")]],
  ["L8", "HTTPS://ASA-ANNECY.EXAMPLE", [link("HTTPS://ASA-ANNECY.EXAMPLE")]],
  ["L9", "xhttps://asa-annecy.example", [text("xhttps://asa-annecy.example")]],
  ["L10", "www.asa-annecy.example", [text("www.asa-annecy.example")]],
  ["L11", "javascript:alert(1)", [text("javascript:alert(1)")]],
  ["L11", "data:text/html,x", [text("data:text/html,x")]],
  ["L11", "mailto:julie@exemple.fr", [text("mailto:julie@exemple.fr")]],
  ["L11", "tel:0612345678", [text("tel:0612345678")]],
  ["L12", "https://", [text("https://")]],
  ["L12", "https://?x", [text("https://?x")]],
  ["L13", "[ici](https://asa-annecy.example)", [text("[ici]("), link("https://asa-annecy.example"), text(")")]],
  ["L14", "https://asa-annecy.example@evil.example/", [text("https://asa-annecy.example@evil.example/")]],
  ["L15", "https://@evil.example/", [text("https://@evil.example/")]],
  ["L15", "https://user:mdp@asa-annecy.example/", [text("https://user:mdp@asa-annecy.example/")]],
  ["L16", "https://asa-annecy.example/\u202eelif.exe", [text("https://asa-annecy.example/\u202eelif.exe")]],
  ["L17", "https://asa\u200b-annecy.example/", [text("https://asa\u200b-annecy.example/")]],
  ["L17", `${PLAN}\ufeff`, [text(`${PLAN}\ufeff`)]],
  ["L17", `${PLAN}\u2028x`, [text(`${PLAN}\u2028x`)]],
  ["L23", `${PLAN}\u0085x`, [text(`${PLAN}\u0085x`)]],
  ["L23", "https://asa\u0007-annecy.example/", [text("https://asa\u0007-annecy.example/")]],
  ["L18", "https://\u0430sa-annecy.example/", [text("https://\u0430sa-annecy.example/")]],
  ["L19", "https://xn--sa-annecy-zzz.example/", [text("https://xn--sa-annecy-zzz.example/")]],
  ["L19", "https://club.XN--abc.example/", [text("https://club.XN--abc.example/")]],
  ["L20", "https://%61sa-annecy.example/", [text("https://%61sa-annecy.example/")]],
  ["L20", "http://0x7f.1/", [text("http://0x7f.1/")]],
  ["L20", "https://asa-annecy.example:443/", [text("https://asa-annecy.example:443/")]],
  ["L21", "https://fr.wikipedia.org/wiki/Événement", [link("https://fr.wikipedia.org/wiki/Événement")]],
  ["L22", `\u202eVoir ${PLAN}`, [text("\u202eVoir "), link(PLAN)]],
];

describe("descriptionPieces", () => {
  // DS3.1: each row of the table gives exactly the pieces it shows.
  describe("DS3.1", () => {
    it("covers every row, L1 to L23", () => {
      expect(new Set(TABLE.map(([row]) => row)).size).toBe(23);
    });

    it.each(TABLE)("%s: %j", (_, typed, pieces) => {
      expect(descriptionPieces(typed)).toEqual(pieces);
    });

    it.each([
      ["the start of the text", PLAN, [link(PLAN)]],
      ["the start of a line", `Plan :\n${PLAN}`, [text("Plan :\n"), link(PLAN)]],
      ["a colon", `Plan:${PLAN}`, [text("Plan:"), link(PLAN)]],
      ["a guillemet", `«${PLAN}»`, [text("«"), link(PLAN), text("»")]],
      ["http, in any case", "Http://asa-annecy.example/", [link("Http://asa-annecy.example/")]],
    ])("starts a candidate at %s", (_, typed, pieces) => {
      expect(descriptionPieces(typed)).toEqual(pieces);
    });

    it.each([
      ["a letter", `x${PLAN}`],
      ["an accented letter", `é${PLAN}`],
      ["a digit", `1${PLAN}`],
      ["_", `_${PLAN}`],
      ["-", `-${PLAN}`],
      [".", `a.${PLAN}`],
      ["/", `/${PLAN}`],
      ["@", `@${PLAN}`],
      ["+", `+${PLAN}`],
    ])("starts no candidate after %s", (_, typed) => {
      expect(descriptionPieces(typed)).toEqual([text(typed)]);
    });

    it.each([
      ["a tab", "\t"],
      ["a newline", "\n"],
      ["a space", " "],
      ["an ideographic space", "\u3000"],
      ["an en quad", "\u2000"],
      ["a hair space", "\u200a"],
      ["a medium mathematical space", "\u205f"],
    ])("ends a candidate at %s", (_, blank) => {
      expect(descriptionPieces(`${PLAN}${blank}suite`)).toEqual([link(PLAN), text(`${blank}suite`)]);
    });

    it.each([
      ["?!", `${PLAN}?!`, "?!"],
      ["». after a guillemet", `«${PLAN}».`, "»."],
      ["quotes", `"${PLAN}"`, '"'],
      ["typographic quotes", `“${PLAN}”’`, "”’"],
      ["; and ,", `${PLAN};,`, ";,"],
      ["a ] without an opener", `[${PLAN}]`, "]"],
      ["mixed, repeated", `(${PLAN}).)…`, ").)…"],
    ])("cuts trailing %s, as many times as needed", (_, typed, cut) => {
      const pieces = descriptionPieces(typed);
      expect(pieces.at(-1)).toEqual(text(cut));
      expect(pieces.filter((piece) => piece.kind === "link")).toEqual([link(PLAN)]);
    });

    it("keeps a ) or a ] that the candidate opens", () => {
      expect(descriptionPieces(`${PLAN}/[a](b)`)).toEqual([link(`${PLAN}/[a](b)`)]);
    });

    it("finds several links, and keeps the text between them", () => {
      expect(descriptionPieces(`Aller ${PLAN}, retour https://asa-annecy.example/retour.`)).toEqual([
        text("Aller "),
        link(PLAN),
        text(", retour "),
        link("https://asa-annecy.example/retour"),
        text("."),
      ]);
    });

    it("finds no link inside a refused candidate", () => {
      const typed = "https://a@evil.example/(https://asa-annecy.example/plan)";
      expect(descriptionPieces(typed)).toEqual([text(typed)]);
    });

    it("gives no piece for no text", () => {
      expect(descriptionPieces("")).toEqual([]);
    });
  });

  // DS3.8: no other scheme becomes a link, nor an address without one.
  describe("DS3.8", () => {
    it.each(["javascript:alert(1)", "data:text/html,x", "mailto:julie@exemple.fr", "tel:0612345678", "www.asa-annecy.example", "ftp://asa-annecy.example/"])(
      "gives no link for %s",
      (typed) => {
        expect(descriptionPieces(`Voir ${typed} ici`)).toEqual([text(`Voir ${typed} ici`)]);
      },
    );
  });

  // DS3.9: an authority with @ stays text. Coordinator's decision on #725: a candidate with
  // @ anywhere stays text, since `https://evil.example\@asa-annecy.example/` reads like L14 reversed.
  describe("DS3.9", () => {
    it.each([
      "https://asa-annecy.example@evil.example/",
      "https://@evil.example/",
      "https://user:mdp@asa-annecy.example/",
      "http://asa-annecy.example:80@evil.example",
      "https://a@b@evil.example?x",
      "https://evil.example\\@asa-annecy.example/",
      "https://evil.example?@asa-annecy.example/",
      "https://evil.example#@asa-annecy.example/",
      "https://evil.example/@asa-annecy.example/",
      "https://asa-annecy.example/@julie",
    ])("keeps %s as text", (typed) => {
      expect(descriptionPieces(`Voir ${typed}`)).toEqual([text(`Voir ${typed}`)]);
    });
  });

  // DS3.10: each code of the ranges, in the middle of the host and at the end of the path.
  describe("DS3.10", () => {
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const format: number[] = [];
    for (let code = 0; code <= 0x10ffff; code++) {
      if (/\p{Cf}/u.test(String.fromCodePoint(code))) format.push(code);
    }
    const codes = [
      ...new Set([
        ...format,
        ...range(0x200b, 0x200f),
        ...range(0x2028, 0x202e),
        ...range(0x2060, 0x2064),
        0xfeff,
        ...range(0x00, 0x08),
        ...range(0x0b, 0x1f),
        ...range(0x7f, 0x9f),
      ]),
    ];

    it("tries U+0085, U+200B, U+2028, U+202E, U+FEFF, U+E0001 and the Cc controls", () => {
      for (const code of [0x85, 0x200b, 0x2028, 0x202e, 0xfeff, 0xe0001, 0x00, 0x0d, 0x1f, 0x7f, 0x9f]) {
        expect(codes).toContain(code);
      }
      expect(codes).not.toContain(0x09);
      expect(codes).not.toContain(0x0a);
    });

    it.each(codes.map((code) => [code.toString(16).toUpperCase().padStart(4, "0"), code]))("keeps a URL with U+%s as text", (_, code) => {
      const c = String.fromCodePoint(code as number);
      for (const typed of [`https://asa${c}-annecy.example/`, `${PLAN}${c}`]) {
        expect(descriptionPieces(typed), typed).toEqual([text(typed)]);
      }
    });
  });

  // DS3.11: the host is plain ASCII, without xn--, and exactly the one the browser opens.
  describe("DS3.11", () => {
    it.each([
      "https://\u0430sa-annecy.example/",
      "https://asa-annecy.\u03b5xample/",
      "https://café.example/",
      "https://xn--sa-annecy-zzz.example/",
      "https://club.XN--abc.example/",
      "https://club.Xn--abc.example:8080/",
      "https://%61sa-annecy.example/",
      "http://0x7f.1/",
      "http://127.1/",
      "https://asa-annecy.example:443/",
      "http://asa-annecy.example:80/",
      "http://asa-annecy.example:080/",
      "https://asa-annecy.example:99999/",
      "https://asa-annecy.example:123456/",
      "https://asa_annecy.example/",
      "https://[::1]/",
    ])("keeps %s as text", (typed) => {
      expect(descriptionPieces(typed)).toEqual([text(typed)]);
    });

    it.each([
      "https://fr.wikipedia.org/wiki/Événement",
      "https://asa-annecy.example:8443/plan",
      "HTTP://ASA-ANNECY.EXAMPLE:8080/Plan",
      "https://asa-annecy.example?x=1",
      "https://asa-annecy.example#plan",
      "https://192.168.1.10/",
      "https://club-xn--abc.example/",
    ])("makes %s a link, as typed", (typed) => {
      expect(descriptionPieces(typed)).toEqual([link(typed)]);
    });
  });

  it.each([
    ["200,000 closing parentheses", `https://asa-annecy.example/${")".repeat(200_000)}`],
    ["200,000 exclamation marks", `https://asa-annecy.example/${"!".repeat(200_000)}`],
    ["5,000 links", `${PLAN} `.repeat(5_000)],
    ["200,000 letters after a scheme", `https://${"a".repeat(200_000)}`],
  ])("splits %s in linear time", (_, typed) => {
    const start = performance.now();
    const pieces = descriptionPieces(typed);
    expect(performance.now() - start).toBeLessThan(200);
    expect(pieces.map((piece) => (piece.kind === "text" ? piece.text : piece.href)).join("")).toBe(typed);
  });

  describe("no network call", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never calls fetch, for any row of the table", () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
      for (const [, typed] of TABLE) descriptionPieces(typed);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

describe("description-links.ts", () => {
  const file = new URL("./description-links.ts", import.meta.url);
  const source = readFileSync(file, "utf8");

  it("uses nothing from Node, so the header can split the text in the browser", () => {
    expect(browserUnsafeReached(source, file.pathname)).toEqual([]);
  });

  it("has no lookbehind, which Safari before 16.4 cannot parse", () => {
    expect(source).not.toContain("(?<=");
    expect(source).not.toContain("(?<!");
  });

  it("reads URL.host, never .hash", () => {
    expect(source).toMatch(/\.host\b/);
    expect(source).not.toMatch(/\.hash\b/);
  });
});
