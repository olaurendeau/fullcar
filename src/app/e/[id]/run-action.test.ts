import { describe, expect, it, vi } from "vitest";
import type { EventState } from "./event-state";
import { aboutPerson, actionRunner, carsOfPersonsGone, devicePersonsGone, goneNamed, readEnded, sendAction, stateOf, stateRead, stateShown, withTabsHeld } from "./run-action";

describe("sendAction", () => {
  it("offline: sends nothing, and says so", async () => {
    const action = vi.fn(async () => "sent");
    expect(await sendAction(action, () => false)).toEqual({ ok: false, problem: "offline" });
    expect(action).not.toHaveBeenCalled();
  });

  it("a request lost with the connection is offline", async () => {
    let connected = true;
    const action = async () => {
      connected = false;
      throw new TypeError("Failed to fetch");
    };
    expect(await sendAction(action, () => connected)).toEqual({ ok: false, problem: "offline" });
  });

  it("a server error, online, is the generic failure, without its detail", async () => {
    const action = async () => {
      throw new Error("An unexpected response was received from the server.");
    };
    expect(await sendAction(action, () => true)).toEqual({ ok: false, problem: "failed" });
  });
});

const header = { title: "Tournoi de Rennes", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: null, description: null };
const ENDED = { ended: true, title: "Tournoi de Rennes", allerAt: "2026-12-12 07:30:00" };

describe("stateOf", () => {
  const state = { event: header, legs: [{ leg: "aller", cars: [], withoutCar: [], device: [] }] };

  it("is the state an action gives back, refusal included", () => {
    expect(stateOf({ ok: true, state })).toBe(state);
    expect(stateOf({ ok: false, error: "seatTaken", state })).toBe(state);
  });

  it("is nothing for an answer without one", () => {
    expect(stateOf({ ok: false, error: "eventNotFound" })).toBeUndefined();
    expect(stateOf(undefined)).toBeUndefined();
    expect(stateOf({ ok: true, state: "nope" })).toBeUndefined();
  });

  // Epic #250: the header comes with the legs. An answer without it (legs alone, from a server
  // not yet deployed) is not applied: the page would lose its title.
  it.each<[string, unknown]>([
    ["the legs alone", state.legs],
    ["no header", { legs: state.legs }],
    ["no legs", { event: header }],
    ["a header that is not an object", { event: "Tournoi", legs: state.legs }],
  ])("is nothing for a state with %s", (_, given) => {
    expect(stateOf({ ok: true, state: given })).toBeUndefined();
  });
});

// Review of #305: the device's first read and `apply` are guarded as an action's answer is.
describe("stateRead", () => {
  const state = { event: header, legs: [] };

  it("is the state a read answered", () => {
    expect(stateRead({ ok: true, value: state })).toBe(state);
  });

  it.each<[string, unknown]>([
    ["a failure", { ok: false, problem: "failed" }],
    ["an unknown event", { ok: true, value: undefined }],
    ["the legs alone", { ok: true, value: [] }],
    ["an ended event", { ok: true, value: ENDED }],
    ["no read at all", undefined],
  ])("is nothing for %s", (_, sent) => {
    expect(stateRead(sent as never)).toBeUndefined();
  });
});

// #799, OA8.3: a page still open once the event is anonymised.
describe("readEnded", () => {
  it("is true when the read answered an ended event", () => {
    expect(readEnded({ ok: true, value: ENDED })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a state", { ok: true, value: { event: header, legs: [] } }],
    ["a failure", { ok: false, problem: "failed" }],
    ["an unknown event", { ok: true, value: undefined }],
    ["null", { ok: true, value: null }],
    ["`ended` not true", { ok: true, value: { ...ENDED, ended: "true" } }],
    ["no read at all", undefined],
  ])("is false for %s", (_, sent) => {
    expect(readEnded(sent as never)).toBe(false);
  });
});

describe("stateShown", () => {
  const withRetour: EventState = { event: { ...header, retourAt: "2026-12-12 18:00:00" }, options: { stops: false }, legs: [] };
  const withoutRetour: EventState = { event: header, options: { stops: false }, legs: [] };

  it("shows nothing that is not a state: the legs alone change nothing, and throw nothing", () => {
    expect(stateShown(withRetour, [])).toBeUndefined();
    expect(stateShown(withRetour, { legs: [] })).toBeUndefined();
  });

  it.each<[string, EventState, EventState, boolean]>([
    ["the retour removed: the tabs go", withRetour, withoutRetour, true],
    ["a retour added: the tabs come", withoutRetour, withRetour, true],
    ["the retour kept", withRetour, { ...withRetour, legs: [] }, false],
    ["still no retour", withoutRetour, { ...withoutRetour, legs: [] }, false],
  ])("%s", (_, before, next, tabsChange) => {
    expect(stateShown(before, next)).toStrictEqual({ state: next, tabsChange });
  });
});

// #265, § 5 of the epic's design: while a sheet hides the page, the retour it may be on stays.
// #266: nor does a retour come, which would mount the aller's panel anew, and its sheet with it.
describe("withTabsHeld", () => {
  const leg = (name: "aller" | "retour", rideId: string) => ({ leg: name, cars: [], withoutCar: [], device: [], rideId });
  const shown = { event: { ...header, retourAt: "2026-12-12 18:00:00" }, options: { stops: false }, legs: [leg("aller", "old"), leg("retour", "old")] } as never as EventState;
  const next = { event: { ...header, title: "Tournoi de Vannes" }, options: { stops: false }, legs: [leg("aller", "new")] } as never as EventState;

  it("the retour removed: shows the next state, with the end and the retour leg shown", () => {
    expect(withTabsHeld(shown, next)).toStrictEqual({
      event: { ...header, title: "Tournoi de Vannes", retourAt: "2026-12-12 18:00:00" },
      options: { stops: false },
      legs: [leg("aller", "new"), leg("retour", "old")],
    });
  });

  it("a retour added: shows the next state, without its end nor its retour leg", () => {
    const added = { event: { ...header, title: "Tournoi de Vannes", retourAt: "2026-12-13 19:00:00" }, options: { stops: false }, legs: [leg("aller", "new"), leg("retour", "new")] };
    expect(withTabsHeld(next, added as never as EventState)).toStrictEqual({
      event: { ...header, title: "Tournoi de Vannes", retourAt: null },
      options: { stops: false },
      legs: [leg("aller", "new")],
    });
  });

  it("holds nothing when the tabs stay", () => {
    expect(withTabsHeld(shown, shown)).toBeUndefined();
    expect(withTabsHeld(next, next)).toBeUndefined();
  });
});

// remove-person v2 (« Focus, barre, envoi »): the device's persons a state no longer has.
describe("devicePersonsGone", () => {
  const person = (id: string) => ({ id, firstName: id, phone: null, state: { kind: "withoutCar" as const } });
  const shown = (aller: string[], retour?: string[]) =>
    ({
      event: header,
      legs: [
        { leg: "aller", cars: [], withoutCar: [], device: aller.map(person) },
        ...(retour ? [{ leg: "retour", cars: [], withoutCar: [], device: retour.map(person) }] : []),
      ],
    }) as never as EventState;

  it("those the state shown had and the next one has on no leg, in the order shown", () => {
    expect(devicePersonsGone(shown(["marc", "lea", "tom"], ["marc", "lea", "tom"]), shown(["marc"], ["marc"]))).toEqual(["lea", "tom"]);
    expect(devicePersonsGone(shown(["lea"], ["lea"]), shown([], []))).toEqual(["lea"]);
  });

  it("nobody: the same persons, a new one, the first read, or one still on the retour a sheet holds", () => {
    expect(devicePersonsGone(shown(["marc", "lea"]), shown(["marc", "lea"]))).toEqual([]);
    expect(devicePersonsGone(shown(["marc"]), shown(["marc", "zoe"]))).toEqual([]);
    expect(devicePersonsGone(shown([]), shown(["marc"]))).toEqual([]);
    expect(devicePersonsGone(shown(["marc", "lea"], ["marc", "lea"]), shown(["marc"], ["marc", "lea"]))).toEqual([]);
  });
});

// #850's review, on #670: a person removed takes her cars with her; what the bar says about them goes.
describe("carsOfPersonsGone", () => {
  const someone = (id: string) => ({ id, firstName: id });
  const car = (id: string, driver: string, passengers: string[] = []) => ({ id, driver: someone(driver), passengers: passengers.map(someone) });
  type Leg = { cars?: ReturnType<typeof car>[]; withoutCar?: string[]; device?: string[] };
  const leg = (name: "aller" | "retour", { cars = [], withoutCar = [], device = [] }: Leg) => ({
    leg: name,
    cars,
    withoutCar: withoutCar.map(someone),
    device: device.map((id) => ({ ...someone(id), phone: null, state: { kind: "withoutCar" as const } })),
  });
  const state = (aller: Leg, retour?: Leg) =>
    ({ event: header, legs: [leg("aller", aller), ...(retour ? [leg("retour", retour)] : [])] }) as never as EventState;

  it("the cars of a driver the next state has nowhere, on each leg it still has, whoever's device she was on", () => {
    const shown = state({ cars: [car("r1", "marc", ["ines"]), car("r2", "claire")] }, { cars: [car("r3", "marc"), car("r4", "sophie", ["lea"])] });
    const next = state({ cars: [car("r2", "claire")], withoutCar: ["ines"] }, { cars: [car("r4", "sophie", ["lea"])] });
    expect(carsOfPersonsGone(shown, next)).toEqual(["r1", "r3"]);
  });

  it("none for a driver still there: in a car, without a car, or on the device; nor for a leg gone", () => {
    const shown = state({ cars: [car("r1", "marc"), car("r2", "claire"), car("r3", "tom")] }, { cars: [car("r4", "sophie")] });
    const next = state({ cars: [car("r5", "lea", ["marc"])], withoutCar: ["claire"], device: ["tom"] });
    expect(carsOfPersonsGone(shown, next)).toEqual([]);
    expect(carsOfPersonsGone(state({}), state({}))).toEqual([]);
  });
});

// RP5.4: a refusal `personGone` names those it was sent about; its failure says it, the information
// does not. The others gone with it are news (RP5.3): Marc removed, then Tom, Tom's refusal names Tom alone.
describe("goneNamed", () => {
  it("the persons a refusal `personGone` names: its `goneIds`, and nobody else", () => {
    expect(goneNamed({ ok: false, error: "personGone", goneIds: ["tom"] })).toEqual(["tom"]);
    expect(goneNamed({ ok: false, error: "personGone", goneIds: ["tom", "lea"] })).toEqual(["tom", "lea"]);
    expect(goneNamed({ ok: false, error: "personGone", state: {} })).toEqual([]);
  });

  it("nobody for any other answer", () => {
    for (const answer of [{ ok: true }, { ok: false, error: "forbidden" }, { ok: false, error: "rideGone" }, null, "personGone", undefined]) {
      expect(goneNamed(answer)).toEqual([]);
    }
  });

  it("an action about one person (« Modifier », a cell's choice): her refusal `personGone` names her alone", () => {
    expect(goneNamed(aboutPerson({ ok: false, error: "personGone", state: {} }, "tom"))).toEqual(["tom"]);
    expect(aboutPerson({ ok: false, error: "personGone", state: {} }, "tom")).toEqual({ ok: false, error: "personGone", state: {}, goneIds: ["tom"] });
  });

  it("any other answer of an action about one person is left as it was", () => {
    for (const answer of [{ ok: true, state: {} }, { ok: false, error: "forbidden" }, { ok: false, error: "personGone", goneIds: ["lea"] }]) {
      expect(aboutPerson(answer, "tom")).toBe(answer);
    }
  });
});

describe("actionRunner", () => {
  const state: EventState = { event: header, options: { stops: false }, legs: [{ leg: "aller", cars: [], withoutCar: [], device: [] }] };

  /** A page that records the states the runner gives it and each action that begins and ends, and a connection that can be cut. */
  function page() {
    const told = { states: [] as EventState[], answers: [] as unknown[], begun: 0, ended: 0, connected: true };
    const begins = () => {
      told.begun += 1;
      return () => void (told.ended += 1);
    };
    const shows = (next: EventState, answer: unknown) => {
      told.states.push(next);
      told.answers.push(answer);
    };
    const run = actionRunner({ state: shows, begins }, () => told.connected);
    return { told, run };
  }

  // The bar's information goes at the end of an action that began after it was written (rule 4, #339).
  it("an action begins before it is sent, and ends once its answer is in", async () => {
    const { told, run } = page();
    let answer: (value: unknown) => void = () => {};
    const sent = run("seat", () => {
      expect(told).toMatchObject({ begun: 1, ended: 0 });
      return new Promise((resolve) => (answer = resolve));
    });
    expect(told).toMatchObject({ begun: 1, ended: 0 });
    answer({ ok: true, state });
    await sent;
    expect(told).toMatchObject({ begun: 1, ended: 1 });
  });

  // The page says what came of an action, in the bar or in its sheet (#216): the runner writes nothing there.
  it("each action that runs ends once, whatever came of it; a second run of it meanwhile does not", async () => {
    const { told, run } = page();
    told.connected = false;
    await run("seat", async () => ({ ok: true, state }));
    told.connected = true;
    let answer: (value: unknown) => void = () => {};
    const first = run("seat", () => new Promise((resolve) => (answer = resolve)));
    await run("seat", async () => ({ ok: true, state }));
    answer({ ok: false, error: "seatTaken", state });
    await first;
    expect(told).toMatchObject({ begun: 2, ended: 2 });
  });

  it("an answer gives the page the state the server sends, refusal included, with the answer it came in", async () => {
    const { told, run } = page();
    await run("seat", async () => ({ ok: false, error: "seatTaken", state }));
    expect(told.states).toEqual([state]);
    expect(told.answers).toEqual([{ ok: false, error: "seatTaken", state }]);
  });

  it("the control is sending until the answer, and a second tap meanwhile sends nothing", async () => {
    const { run } = page();
    let answer: (value: unknown) => void = () => {};
    const action = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const sending = vi.fn();
    const first = run("seat", action, sending);
    expect(sending.mock.calls).toEqual([[true]]);
    expect(await run("seat", action, sending)).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);

    answer({ ok: true, state });
    expect(await first).toEqual({ ok: true, value: { ok: true, state } });
    expect(sending.mock.calls).toEqual([[true], [false]]);
  });

  // #222: only a send that goes covers what an earlier one says (`Send.leaves`).
  it("says a run goes, offline too; never a second run dropped while the first is on its way", async () => {
    const { told, run } = page();
    let answer: (value: unknown) => void = () => {};
    const [first, dropped, offline] = [vi.fn(), vi.fn(), vi.fn()];
    const sent = run("cell", () => new Promise((resolve) => (answer = resolve)), undefined, first);
    await run("cell", async () => ({ ok: true, state }), undefined, dropped);
    answer({ ok: true, state });
    await sent;
    told.connected = false;
    await run("cell", async () => ({ ok: true, state }), undefined, offline);
    expect([first.mock.calls.length, dropped.mock.calls.length, offline.mock.calls.length]).toEqual([1, 0, 1]);
  });
});
