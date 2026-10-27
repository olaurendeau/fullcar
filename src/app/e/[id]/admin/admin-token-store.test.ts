import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminTokens,
  type AdminTokenStorage,
  checkFromAnswer,
  goToOrganiserArea,
  keepAdminToken,
  type OrganiserCheck,
  organiserProof,
  readAdminToken,
  retryFrom,
} from "./admin-token-store";

const ID = "Ab3dEf7h";
const KEY = `fullcar:admin-token:${ID}`;
/** Shaped as server-token.ts draws a token: 22 base64url characters for 16 bytes. */
const TOKEN = "q3Vx9kLmN2pR7sT1uW4yZQ";
const SESSION = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";

/** A `localStorage` in memory, whose every call is a spy. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void items.set(key, value)),
  };
}

const tokensOf = (storage: AdminTokenStorage) => adminTokens({ storage: () => storage });

const insecure = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

const CONSOLE = ["log", "info", "warn", "error", "debug", "trace"] as const;

describe("goToOrganiserArea", () => {
  // OA1.6: the arrival is /e/{id}/admin, without a fragment.
  it("navigates to /e/{id}/admin, nothing after it", () => {
    const router = { push: vi.fn() };
    goToOrganiserArea(router, ID);
    expect(router.push).toHaveBeenCalledExactlyOnceWith(`/e/${ID}/admin`);
  });
});

describe("keepAdminToken and readAdminToken", () => {
  // Architecture, « Session, liens et jeton d'admin »: the creation browser keeps the token, under its event's key.
  it("keeps the token under fullcar:admin-token:{id}, and reads it back", () => {
    const storage = fakeStorage();
    const tokens = tokensOf(storage);
    tokens.keepAdminToken(ID, TOKEN);
    expect([...storage.items]).toEqual([[KEY, TOKEN]]);
    expect(tokens.readAdminToken(ID)).toBe(TOKEN);
  });

  it("reads the token of that event only", () => {
    const tokens = tokensOf(fakeStorage({ [KEY]: TOKEN }));
    expect(tokens.readAdminToken("Zz9yXw8v")).toBeUndefined();
  });

  it.each([
    ["no key", undefined],
    ["an empty string", ""],
    ["a token one character short", TOKEN.slice(1)],
    ["a token one character long", `${TOKEN}A`],
    ["a character outside base64url", `${TOKEN.slice(0, -2)}+Q`],
  ])("reads no token from %s", (_, value) => {
    const storage = fakeStorage(value === undefined ? {} : { [KEY]: value });
    expect(tokensOf(storage).readAdminToken(ID)).toBeUndefined();
  });

  // A blocked storage: the page's memory keeps it, so that the arrival after the creation opens the panel.
  it.each<[string, () => AdminTokenStorage]>([
    ["the localStorage property throws", insecure],
    [
      "setItem throws",
      () => ({
        getItem: () => null,
        setItem: insecure,
      }),
    ],
  ])("keeps the token in the page's memory when %s", (_, storage) => {
    const tokens = adminTokens({ storage });
    expect(() => tokens.keepAdminToken(ID, TOKEN)).not.toThrow();
    expect(tokens.readAdminToken(ID)).toBe(TOKEN);
  });

  it("logs nothing, kept or refused", () => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      tokensOf(fakeStorage()).keepAdminToken(ID, TOKEN);
      adminTokens({ storage: insecure }).keepAdminToken(ID, TOKEN);
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("organiserProof", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // OA7.6: the organiser is the session of the event's account, or the creation browser's token.
  it("carries the event's kept token and the session, in the body's fields", () => {
    const local = fakeStorage({ [KEY]: TOKEN, "fullcar:session": SESSION });
    vi.stubGlobal("window", { localStorage: local, location: { hash: "" } });
    expect(organiserProof(ID)).toStrictEqual({ adminToken: TOKEN, session: SESSION });
  });

  it("carries only what the browser keeps", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "fullcar:session": SESSION }), location: { hash: "" } });
    expect(organiserProof(ID)).toStrictEqual({ session: SESSION });
    vi.stubGlobal("window", { localStorage: fakeStorage({ [KEY]: TOKEN }), location: { hash: "" } });
    expect(organiserProof(ID)).toStrictEqual({ adminToken: TOKEN });
  });

  // OA7.5: an old link /e/{id}/admin#{token} gives no access, its fragment ignored.
  it("never reads the URL's fragment", () => {
    const hash = vi.fn(() => `#${TOKEN}`);
    vi.stubGlobal("window", {
      localStorage: fakeStorage(),
      location: {
        get hash() {
          return hash();
        },
      },
    });
    expect(organiserProof(ID)).toStrictEqual({});
    expect(hash).not.toHaveBeenCalled();
  });

  it("is bound to window.localStorage", () => {
    const local = fakeStorage();
    vi.stubGlobal("window", { localStorage: local });
    keepAdminToken(ID, TOKEN);
    expect(readAdminToken(ID)).toBe(TOKEN);
    expect([...local.items]).toEqual([[KEY, TOKEN]]);
  });
});

describe("checkFromAnswer", () => {
  const legs = [
    { leg: "aller", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 0, withoutCar: [], carsWithoutPhone: [] },
  ];

  // C4.9 as amended by #154: the panel only on the server's panel, with its legs; the link to share alone (OA7.3).
  // RP4.1: and every person of the event, for « Personnes inscrites »; none from a server before #671.
  const persons = [{ id: "lea", firstName: "Léa", cells: [{ leg: "aller", state: { kind: "withoutCar" } }] }];
  it("shows the panel, with its legs, its persons and the link to share, when the server answers the panel", () => {
    expect(checkFromAnswer({ state: "panel", legs, persons }, "https://fullcar.example", ID)).toStrictEqual({
      state: "valid",
      publicUrl: `https://fullcar.example/e/${ID}`,
      legs,
      persons,
    });
    expect(checkFromAnswer({ state: "panel", legs: [] }, "https://fullcar.example", ID)).toMatchObject({
      state: "valid",
      legs: [],
      persons: [],
    });
  });

  // OA1.7, OA2.1: a pending event's panel comes with its notice; a malformed one is none.
  it("shows the notice « Confirmez votre adresse » with the panel, when the server sends one", () => {
    const pending = { email: "claire.martin@exemple.fr", send: "addressLimit" };
    expect(checkFromAnswer({ state: "panel", legs, pending }, "https://fullcar.example", ID)).toStrictEqual({
      state: "valid",
      publicUrl: `https://fullcar.example/e/${ID}`,
      legs,
      pending,
    });
    expect(checkFromAnswer({ state: "panel", legs, pending: { send: "sent" } }, "https://fullcar.example", ID)).not.toHaveProperty(
      "pending",
    );
    // Never on a refusal's screen (#598), whatever the answer carries.
    expect(checkFromAnswer({ state: "pending", pending }, "https://fullcar.example", ID)).toStrictEqual({
      state: "refused",
      refusal: { kind: "pending" },
    });
  });

  const ENDED = {
    title: "Sortie scouts",
    location: "Forêt de Paimpont",
    allerAt: "2026-06-06 07:30:00",
    retourAt: "2026-06-07 17:00:00",
  };

  // #598: each state of the access rule is refused with its own screen, and what that screen shows.
  it.each([
    [{ state: "invalid" }, { kind: "invalid" }],
    [{ state: "signIn" }, { kind: "signIn" }],
    [{ state: "pending" }, { kind: "pending" }],
    [{ state: "orphan" }, { kind: "orphan" }],
    [{ state: "notYours", email: "a@b.fr" }, { kind: "notYours", email: "a@b.fr" }],
    [
      { state: "ended", event: ENDED, erasedOn: "2026-07-07" },
      { kind: "ended", event: ENDED, erasedOn: "2026-07-07" },
    ],
    [
      { state: "ended", event: { ...ENDED, retourAt: null }, erasedOn: "2026-07-06" },
      { kind: "ended", event: { ...ENDED, retourAt: null }, erasedOn: "2026-07-06" },
    ],
  ])("refuses the area with its screen when the server answers %o", (answer, refusal) => {
    expect(checkFromAnswer(answer, "https://fullcar.example", ID)).toStrictEqual({ state: "refused", refusal });
  });

  // Copied field by field: nothing else the answer might carry reaches the screen.
  it("keeps nothing but the screen's fields", () => {
    const answer = { state: "ended", event: { ...ENDED, extra: 1 }, erasedOn: "2026-07-07", more: 2 };
    expect(checkFromAnswer(answer, "https://fullcar.example", ID)).toStrictEqual({
      state: "refused",
      refusal: { kind: "ended", event: ENDED, erasedOn: "2026-07-07" },
    });
  });

  // A good access must never read refused: Next resolves an action with undefined on
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
    ["not yours without an address", { state: "notYours" }],
    ["not yours with an address that is not a text", { state: "notYours", email: 3 }],
    ["ended without its event", { state: "ended", erasedOn: "2026-07-07" }],
    ["ended without its day 30", { state: "ended", event: ENDED }],
    ["ended with a day 30 that is not a date", { state: "ended", event: ENDED, erasedOn: "7 juillet" }],
    ["ended with a start that is not a time", { state: "ended", event: { ...ENDED, allerAt: "demain" }, erasedOn: "2026-07-07" }],
    ["ended without a place", { state: "ended", event: { ...ENDED, location: null }, erasedOn: "2026-07-07" }],
  ])("says the check failed when the server answers %s", (_, answer) => {
    expect(checkFromAnswer(answer, "https://fullcar.example", ID)).toStrictEqual({ state: "failed" });
  });
});

describe("retryFrom", () => {
  // O5.3: « Réessayer » reads again after a failed check, and the alert stays while it does.
  it("keeps the failed check, retrying, after a failed check", () => {
    expect(retryFrom({ state: "failed" })).toStrictEqual({ state: "failed", retrying: true });
    expect(retryFrom({ state: "failed", retrying: false })).toStrictEqual({ state: "failed", retrying: true });
  });

  // O5.8: a second press while the read runs sends nothing.
  it("starts nothing while a retry runs", () => {
    expect(retryFrom({ state: "failed", retrying: true })).toBeUndefined();
  });

  it.each<[string, OrganiserCheck]>([
    ["while the first check runs", { state: "checking" }],
    ["on a refused area", { state: "refused", refusal: { kind: "pending" } }],
    ["on the panel", { state: "valid", publicUrl: "", legs: [], persons: [] }],
  ])("starts nothing %s", (_, check) => {
    expect(retryFrom(check)).toBeUndefined();
  });
});

describe("admin-token-store module", () => {
  const file = fileURLToPath(new URL("./admin-token-store.ts", import.meta.url));
  const source = readFileSync(file, "utf8");

  // OA7.5: nothing of this module reads the URL's fragment any more.
  it("reads no fragment, and listens to none", () => {
    expect(source).not.toMatch(/\.hash\b|hashchange/);
  });
});
