import { describe, expect, it } from "vitest";
import { hashAdminToken } from "./admin-token";
import {
  decideOrganiserAccess,
  grantsAccessTo,
  organiserProofOf,
  type OrganiserAccess,
  type OrganiserAccessEvent,
  type OrganiserDecision,
  type OrganiserVisitor,
} from "./organiser-access";

/*
 * The one rule of the organiser area (epic #581, OA7.1–OA7.9, OA8.4). The token below is a
 * test value, not a real one, and no test title carries it.
 */
const ADMIN_TOKEN = "Zm9yLXRoZS10ZXN0cy1vbm";
const STORED_HASH = hashAdminToken(ADMIN_TOKEN);
const ONE_CHARACTER_OFF = `${ADMIN_TOKEN.slice(0, -1)}${ADMIN_TOKEN.endsWith("A") ? "B" : "A"}`;
const EVENT_ID = "Ab3dEf7h";
const ORGANISER = { id: "account-organiser", email: "camille@exemple.fr" };
const SOMEONE_ELSE = { id: "account-other", email: "dominique@exemple.fr" };

type EventKind = "pending" | "confirmed" | "confirmed, token revoked" | "without organiser" | "without organiser, token left" | "anonymised";

const EVENTS: Record<EventKind, OrganiserAccessEvent> = {
  pending: { id: EVENT_ID, accountId: null, confirmed: false, anonymised: false, adminTokenHash: STORED_HASH },
  confirmed: { id: EVENT_ID, accountId: ORGANISER.id, confirmed: true, anonymised: false, adminTokenHash: STORED_HASH },
  // « Se déconnecter » in the creation browser revokes its token (OA9.1).
  "confirmed, token revoked": { id: EVENT_ID, accountId: ORGANISER.id, confirmed: true, anonymised: false, adminTokenHash: null },
  // The account deleted (OA9.5): its events' tokens are revoked with it.
  "without organiser": { id: EVENT_ID, accountId: null, confirmed: true, anonymised: false, adminTokenHash: null },
  // Should a token outlive the account, it still opens nothing (OA7.9, « tout visiteur »).
  "without organiser, token left": { id: EVENT_ID, accountId: null, confirmed: true, anonymised: false, adminTokenHash: STORED_HASH },
  // Anonymising revokes the token (event_anonymised_bare).
  anonymised: { id: EVENT_ID, accountId: ORGANISER.id, confirmed: true, anonymised: true, adminTokenHash: null },
};

type VisitorKind =
  | "creation browser"
  | "creation browser, organiser's session"
  | "creation browser, another account's session"
  | "organiser's session"
  | "another account's session"
  | "nobody";

const VISITORS: Record<VisitorKind, OrganiserVisitor> = {
  "creation browser": { adminToken: ADMIN_TOKEN, account: undefined },
  "creation browser, organiser's session": { adminToken: ADMIN_TOKEN, account: ORGANISER },
  "creation browser, another account's session": { adminToken: ADMIN_TOKEN, account: SOMEONE_ELSE },
  "organiser's session": { adminToken: undefined, account: ORGANISER },
  "another account's session": { adminToken: undefined, account: SOMEONE_ELSE },
  nobody: { adminToken: undefined, account: undefined },
};

/** What a decision says, the access reduced to how it was granted: a table can be read. */
type Seen = "token" | "session" | "signIn" | "pending" | "orphan" | "ended" | `notYours ${string}`;

function seen(decision: OrganiserDecision): Seen {
  switch (decision.state) {
    case "organiser":
      return decision.access.via === "adminToken" ? "token" : "session";
    case "notYours":
      return `notYours ${decision.email}`;
    default:
      return decision.state;
  }
}

const NOT_YOURS = `notYours ${SOMEONE_ELSE.email}` as const;

/**
 * The full table: every kind of event against every kind of visitor, the columns in the
 * order of VISITORS. The pending event has no account yet: any session is somebody else's.
 */
type Row = readonly [Seen, Seen, Seen, Seen, Seen, Seen];
const TABLE: Record<EventKind, Row> = {
  // Columns: creation browser; with the organiser's session; with another's; the organiser's session; another's; nobody.
  // OA7.4, OA2.2: the creation browser; OA7.7: anybody else, with or without a session.
  pending: ["token", "token", "token", "pending", "pending", "pending"],
  // OA7.3, OA2.6: the session or the creation browser; OA7.2: another account; OA7.1: nobody.
  confirmed: ["token", "session", "token", "session", NOT_YOURS, "signIn"],
  "confirmed, token revoked": ["signIn", "session", NOT_YOURS, "session", NOT_YOURS, "signIn"],
  // OA7.9, OA9.5: every visitor, the former organiser included.
  "without organiser": ["orphan", "orphan", "orphan", "orphan", "orphan", "orphan"],
  "without organiser, token left": ["orphan", "orphan", "orphan", "orphan", "orphan", "orphan"],
  // OA8.4: the organiser's session reads that the registrations were erased, never the panel.
  anonymised: ["signIn", "ended", NOT_YOURS, "ended", NOT_YOURS, "signIn"],
};

const VISITOR_KINDS = Object.keys(VISITORS) as VisitorKind[];
const CASES = (Object.entries(TABLE) as [EventKind, Row][]).flatMap(([event, row]) =>
  row.map((expected, column) => [event, VISITOR_KINDS[column], expected] as const),
);

describe("decideOrganiserAccess: the access table (OA7.1–OA7.9, OA8.4)", () => {
  it.each(CASES)("%s event, %s: %s", (event, visitor, expected) => {
    expect(seen(decideOrganiserAccess(EVENTS[event], VISITORS[visitor]))).toBe(expected);
  });

  it("covers every kind of event against every kind of visitor", () => {
    expect(CASES).toHaveLength(Object.keys(EVENTS).length * Object.keys(VISITORS).length);
  });

  it("grants an access for this event only, and only to the organiser", () => {
    for (const [event, visitor] of CASES) {
      const decision = decideOrganiserAccess(EVENTS[event], VISITORS[visitor]);
      if (decision.state !== "organiser") continue;
      expect(grantsAccessTo(decision.access, EVENT_ID)).toBe(true);
      expect(grantsAccessTo(decision.access, "Zz9yXw8v")).toBe(false);
    }
  });

  it("gives no address but the visitor's own, and only to say whose session it is (OA7.2)", () => {
    for (const [event, visitor] of CASES) {
      const decision = decideOrganiserAccess(EVENTS[event], VISITORS[visitor]);
      const said = JSON.stringify(decision);
      if (decision.state !== "notYours") expect(said.includes("@")).toBe(false);
      else expect(decision.email).toBe(VISITORS[visitor].account?.email);
    }
  });

  describe.each<EventKind>(["pending", "confirmed"])("a %s event, without a session", (event) => {
    const refused = event === "pending" ? "pending" : "signIn";

    it.each<[string, unknown]>([
      ["a token one character off", ONE_CHARACTER_OFF],
      ["a token one character short", ADMIN_TOKEN.slice(0, -1)],
      ["the token in another case", ADMIN_TOKEN.toUpperCase()],
      ["the stored hash itself", STORED_HASH],
      ["an empty token", ""],
      ["a number", 42],
      ["null", null],
      ["an object", { token: ADMIN_TOKEN, toString: () => ADMIN_TOKEN }],
      ["an array", [ADMIN_TOKEN]],
    ])("%s: no access", (_, adminToken) => {
      expect(seen(decideOrganiserAccess(EVENTS[event], { adminToken, account: undefined }))).toBe(refused);
    });

    it("the right token, but a stored hash that is not a hash: no access", () => {
      const broken = { ...EVENTS[event], adminTokenHash: ADMIN_TOKEN };
      expect(seen(decideOrganiserAccess(broken, VISITORS["creation browser"]))).toBe(refused);
    });
  });
});

describe("grantsAccessTo: an access the rule did not give opens nothing", () => {
  it.each<[string, unknown]>([
    ["a copy of a granted access", { ...grantedAccess() }],
    ["an object of the same shape", { eventId: EVENT_ID, via: "session" }],
    ["true", true],
    ["nothing", undefined],
  ])("%s", (_, forged) => {
    expect(grantsAccessTo(forged as OrganiserAccess, EVENT_ID)).toBe(false);
  });

  it("a granted access cannot be pointed at another event", () => {
    const access = grantedAccess();
    expect(() => Object.assign(access, { eventId: "Zz9yXw8v" })).toThrow(TypeError);
    expect(grantsAccessTo(access, "Zz9yXw8v")).toBe(false);
  });
});

function grantedAccess(): OrganiserAccess {
  const decision = decideOrganiserAccess(EVENTS.confirmed, VISITORS["organiser's session"]);
  if (decision.state !== "organiser") throw new Error(`the decision is ${decision.state}`);
  return decision.access;
}

describe("organiserProofOf: what the request's body says", () => {
  it("reads the admin token and the session token, as they come", () => {
    expect(organiserProofOf({ adminToken: ADMIN_TOKEN, session: 42 })).toStrictEqual({ adminToken: ADMIN_TOKEN, session: 42 });
  });

  it.each<[string, unknown]>([
    ["a bare token", ADMIN_TOKEN],
    ["null", null],
    ["nothing", undefined],
    ["an array", [ADMIN_TOKEN]],
  ])("%s: neither", (_, body) => {
    expect(organiserProofOf(body)).toStrictEqual({ adminToken: undefined, session: undefined });
  });

  it("reads only the object's own fields, never its prototype's", () => {
    const inherited = Object.create({ adminToken: ADMIN_TOKEN, session: ADMIN_TOKEN }) as object;
    expect(organiserProofOf(inherited)).toStrictEqual({ adminToken: undefined, session: undefined });
  });
});
