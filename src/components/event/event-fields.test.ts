import { describe, expect, it, vi } from "vitest";
import {
  BLANK_EVENT_FIELDS,
  EventFormFields,
  carTimesKept,
  eventFieldsChanged,
  loadedEventFields,
  withEventField,
  withRetour,
  withSavedFields,
  type EventFieldsState,
  type EventFieldsUpdate,
} from "./event-fields";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const saved = (retourDateFollows: boolean): EventFieldsState => ({
  values: { ...BLANK_EVENT_FIELDS.values, allerDate: "2026-11-07", retourDate: "2026-11-08" },
  retourDateFollows,
});

/** The updates queued in one tick, applied in order as a state setter applies them. */
const queued = (state: EventFieldsState, ...updates: EventFieldsUpdate[]) =>
  updates.reduce((current, update) => update(current), state);

describe("withEventField", () => {
  // C1.3: the retour date follows the aller date until it is changed.
  it("carries the retour date with the aller date while it follows", () => {
    const next = withEventField("allerDate", "2026-11-14")(saved(true));
    expect(next).toEqual({
      values: { ...saved(true).values, allerDate: "2026-11-14", retourDate: "2026-11-14" },
      retourDateFollows: true,
    });
  });

  it("stops the following once the retour date is changed", () => {
    const changed = withEventField("retourDate", "2026-11-09")(saved(true));
    expect(changed.retourDateFollows).toBe(false);
    expect(withEventField("allerDate", "2026-11-14")(changed).values.retourDate).toBe("2026-11-09");
  });

  // Epic #250: a form opened on an end of another day does not follow.
  it("leaves the retour date alone when it does not follow", () => {
    const next = withEventField("allerDate", "2026-11-14")(saved(false));
    expect(next).toEqual({ values: { ...saved(false).values, allerDate: "2026-11-14" }, retourDateFollows: false });
  });

  it("changes only the field it names, and leaves the state it was given as it was", () => {
    const state = saved(true);
    const next = withEventField("title", "Tournoi")(state);
    expect(next).toEqual({ values: { ...state.values, title: "Tournoi" }, retourDateFollows: true });
    expect(state.values.title).toBe("");
  });
});

describe("withRetour", () => {
  it("checks or unchecks the box, and nothing else", () => {
    expect(withRetour(false)(saved(true))).toEqual({ ...saved(true), values: { ...saved(true).values, retour: false } });
  });
});

// #264 review: two changes before the next render both survive, and so does a state set meanwhile.
describe("updates in one tick", () => {
  it("keeps both of two changes made before the next render", () => {
    const next = queued(BLANK_EVENT_FIELDS, withEventField("title", "Tournoi"), withRetour(false));
    expect(next.values).toMatchObject({ title: "Tournoi", retour: false });
  });

  it("applies a keystroke on top of a state set meanwhile, without bringing back the older values", () => {
    const merged: EventFieldsState = { ...saved(false), values: { ...saved(false).values, location: "Gymnase" } };
    const next = queued(saved(true), () => merged, withEventField("title", "Tournoi"));
    expect(next).toEqual({ values: { ...merged.values, title: "Tournoi" }, retourDateFollows: false });
  });
});

describe("loadedEventFields", () => {
  const header = { title: "Tournoi de Rennes", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 07:30:00" };
  const values = { title: "Tournoi de Rennes", location: "Gymnase", allerDate: "2026-12-12", allerTime: "07:30" };

  // M1.5: the fields show what is saved, the box checked with a retour; M1.7: on one day, the end date follows.
  it("shows the saved values, and the end date follows on a one-day event", () => {
    expect(loadedEventFields({ ...header, retourAt: "2026-12-12 18:00:00" })).toEqual({
      values: { ...values, retour: true, retourDate: "2026-12-12", retourTime: "18:00" },
      retourDateFollows: true,
    });
  });

  // M1.7: an end on another day is meant; following it would be guessing.
  it("does not let the end date follow when the end is another day", () => {
    expect(loadedEventFields({ ...header, retourAt: "2026-12-13 18:00:00" })).toEqual({
      values: { ...values, retour: true, retourDate: "2026-12-13", retourTime: "18:00" },
      retourDateFollows: false,
    });
  });

  // M1.6: without a retour, the box unchecked; checked, the end date is the start's and follows it, its time empty.
  it("without a retour, the box unchecked, the end date the start's and following, no end time", () => {
    expect(loadedEventFields({ ...header, retourAt: null })).toEqual({
      values: { ...values, retour: false, retourDate: "2026-12-12", retourTime: "" },
      retourDateFollows: true,
    });
  });
});

describe("eventFieldsChanged", () => {
  const loaded = loadedEventFields({ title: "T", location: "L", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" }).values;

  // M2.5: a field changed, then put back as it was loaded, is not changed.
  it("is false for the loaded values", () => {
    expect(eventFieldsChanged({ ...loaded }, loaded)).toBe(false);
  });

  it.each(["title", "location", "allerDate", "allerTime", "retourDate", "retourTime"] as const)("is true once %s differs", (name) => {
    expect(eventFieldsChanged({ ...loaded, [name]: "x" }, loaded)).toBe(true);
  });

  it("is true once the box Retour differs", () => {
    expect(eventFieldsChanged({ ...loaded, retour: false }, loaded)).toBe(true);
  });

  // Unchecked, the end's fields are neither shown nor saved: what they hold changes nothing.
  it("ignores the end's fields while the box is unchecked on both sides", () => {
    const without = { ...loaded, retour: false };
    expect(eventFieldsChanged({ ...without, retourDate: "2026-12-20", retourTime: "" }, without)).toBe(false);
  });
});

// M6.1, M6.2: the server answers `changed` with the saved values, and the form takes them in.
describe("withSavedFields", () => {
  const event = { title: "Tournoi de Rennes", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" };
  const loaded = loadedEventFields(event);
  const without = loadedEventFields({ ...event, retourAt: null });
  const typed = (values: Partial<EventFieldsState["values"]>, from = loaded): EventFieldsState => ({
    values: { ...from.values, ...values },
    retourDateFollows: from.retourDateFollows,
  });

  // M6.1: the title of the other device, the place typed here.
  it("gives each field not changed the saved value, and keeps each field changed", () => {
    const saved = loadedEventFields({ ...event, title: "Tournoi de Rennes U13", location: "Salle Carrel" });
    const next = withSavedFields(loaded.values, saved)(typed({ location: "Salle Colette-Besson" }));
    expect(next.values).toEqual({ ...saved.values, location: "Salle Colette-Besson" });
  });

  // M6.1, variant: a field changed, then put back as it was loaded, is not changed.
  it("gives the saved value to a field put back as it was loaded", () => {
    const saved = loadedEventFields({ ...event, title: "Tournoi de Rennes U13" });
    expect(withSavedFields(loaded.values, saved)(typed({ title: "Tournoi de Rennes" })).values.title).toBe("Tournoi de Rennes U13");
  });

  // M6.2: the retour removed there, the box untouched here: it unchecks.
  it("unchecks the box not changed when the retour was removed there", () => {
    expect(withSavedFields(loaded.values, without)(typed({ title: "Tournoi" })).values).toEqual({ ...without.values, title: "Tournoi" });
  });

  // M6.2: a retour removed there is never added back unless the box is checked again here: an
  // end typed here, the box untouched, does not bring it back.
  it("unchecks the box not changed when the retour was removed there, even with an end typed here", () => {
    const next = withSavedFields(loaded.values, without)(typed({ retourTime: "19:00" }));
    expect(next.values).toEqual({ ...without.values, retourTime: "19:00" });
    expect(next.values.retour).toBe(false);
  });

  // M6.2: the box checked here is a field changed: it stays, with its end, whatever changed there.
  it("keeps the box checked here, with the end typed, when the other device changed the title", () => {
    const saved = loadedEventFields({ ...event, title: "Tournoi de Rennes U13", retourAt: null });
    const checkedHere = typed({ retour: true, retourTime: "19:00" }, without);
    expect(withSavedFields(without.values, saved)(checkedHere).values).toEqual({ ...checkedHere.values, title: "Tournoi de Rennes U13" });
  });

  // M6.2, the other way: a retour added there at 18:00, the box untouched here.
  it("checks the box not changed when a retour was added there, with its end", () => {
    const next = withSavedFields(without.values, loaded)(typed({ title: "Tournoi" }, without));
    expect(next.values).toEqual({ ...loaded.values, title: "Tournoi" });
  });

  it("lets the end date follow as the saved values have it, unless it was typed", () => {
    const otherDay = loadedEventFields({ ...event, retourAt: "2026-12-13 18:00:00" });
    expect(withSavedFields(loaded.values, otherDay)(typed({})).retourDateFollows).toBe(false);
    const moved = loadedEventFields({ ...event, allerAt: "2026-12-13 07:30:00", retourAt: "2026-12-13 18:00:00" });
    const typedEnd = { ...typed({ retourDate: "2026-12-14" }), retourDateFollows: false };
    expect(withSavedFields(loaded.values, moved)(typedEnd)).toEqual({
      values: { ...moved.values, retourDate: "2026-12-14" },
      retourDateFollows: false,
    });
  });

  // Applied to the state current when it runs: a keystroke made before it is kept.
  it("keeps a change made before it runs", () => {
    const saved = loadedEventFields({ ...event, title: "Tournoi de Rennes U13" });
    const next = queued(typed({}), withEventField("location", "Salle Carrel"), withSavedFields(loaded.values, saved));
    expect(next.values).toEqual({ ...saved.values, location: "Salle Carrel" });
  });
});

// #293 review: the fields hand `onChange` an update of the state it is given when it runs, never
// one that captured the state they rendered with: it would undo a merge made meanwhile (M6.1).
describe("EventFormFields", () => {
  type Element = { props?: { id?: string; onChange?: (value: unknown) => void; children?: unknown } };
  const elements = (node: unknown): Element[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (typeof node !== "object" || node === null) return [];
    const element = node as Element;
    return [element, ...elements(element.props?.children)];
  };
  const rendered = loadedEventFields({ title: "Tournoi de Rennes", location: "Gymnase", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" });
  const meanwhile: EventFieldsState = { values: { ...rendered.values, location: "Salle Carrel", retourTime: "19:00" }, retourDateFollows: false };

  /** Renders the fields with `rendered`, changes the one named `name`, and applies its update to `meanwhile`. */
  function change(name: string, value: unknown): EventFieldsState {
    const updates: EventFieldsUpdate[] = [];
    const tree = EventFormFields({ idOf: (id) => `f-${id}`, state: rendered, errors: {}, onChange: (update) => updates.push(update) });
    const field = elements(tree).find((each) => each.props?.id === `f-${name}` && each.props.onChange);
    field?.props?.onChange?.(value);
    expect(updates.length).toBe(1);
    return updates[0](meanwhile);
  }

  it.each(["title", "location", "allerDate", "allerTime", "retourDate", "retourTime"] as const)("%s: the keystroke applies to the state given", (name) => {
    expect(change(name, { target: { value: "x" } })).toEqual({ ...meanwhile, values: { ...meanwhile.values, [name]: "x" } });
  });

  it("Retour: the tick applies to the state given", () => {
    expect(change("retour", false)).toEqual({ ...meanwhile, values: { ...meanwhile.values, retour: false } });
  });

  // M2.6, decision 52, review of #293: while a change is sent, the fields are locked.
  it("locked: each field is read-only, the box locked, and neither a keystroke nor a tick changes anything", () => {
    const updates: EventFieldsUpdate[] = [];
    const tree = EventFormFields({ idOf: (id) => `f-${id}`, state: rendered, errors: {}, onChange: (update) => updates.push(update), locked: true });
    const props = (name: string) => elements(tree).find((each) => each.props?.id === `f-${name}` && each.props.onChange)?.props as Record<string, unknown>;
    for (const name of ["title", "location", "allerDate", "allerTime", "retourDate", "retourTime"]) {
      expect(props(name).readOnly, name).toBe(true);
      (props(name).onChange as (value: unknown) => void)({ target: { value: "x" } });
    }
    expect(props("retour").locked).toBe(true);
    (props("retour").onChange as (value: unknown) => void)(false);
    expect(updates.length).toBe(0);
  });

  it("not locked: no field is read-only", () => {
    const tree = EventFormFields({ idOf: (id) => `f-${id}`, state: rendered, errors: {}, onChange: () => {} });
    const title = elements(tree).find((each) => each.props?.id === "f-title")?.props as Record<string, unknown>;
    expect(title.readOnly).toBeFalsy();
  });

  // M5.1, review of #293: a leg's sentence describes the two fields of that leg, after their error.
  it("a leg's sentence describes its date and its time, after their error; the other leg's fields keep theirs alone", () => {
    const tree = EventFormFields({
      idOf: (id) => `f-${id}`,
      state: rendered,
      errors: { allerTime: "required" },
      onChange: () => {},
      notes: { aller: "Les 3 voitures…" },
    });
    const describedBy = (name: string) => elements(tree).find((each) => each.props?.id === `f-${name}`)?.props as { "aria-describedby"?: string };
    expect(describedBy("allerDate")["aria-describedby"]).toBe("f-aller-note");
    expect(describedBy("allerTime")["aria-describedby"]).toBe("f-allerTime-error f-aller-note");
    expect(describedBy("retourDate")["aria-describedby"]).toBeUndefined();
    const note = elements(tree).find((each) => each.props?.id === "f-aller-note");
    expect(JSON.stringify(note?.props?.children)).toContain("Les 3 voitures…");
  });
});

// M5.1: the cars of a leg whose date or time changed keep their time; the sheet says so.
describe("carTimesKept", () => {
  const loaded = loadedEventFields({ title: "T", location: "L", locationPosition: null, allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" }).values;
  const cars = { aller: 3, retour: 2 };

  it.each([
    ["the start's time", { allerTime: "14:00" }],
    ["the start's date", { allerDate: "2026-12-13" }],
  ])("%s changed: the aller's cars", (_, change) => {
    expect(carTimesKept({ ...loaded, ...change }, loaded, cars)).toEqual({ aller: 3 });
  });

  it.each([
    ["the end's time", { retourTime: "21:00" }],
    ["the end's date", { retourDate: "2026-12-13" }],
  ])("%s changed: the retour's cars", (_, change) => {
    expect(carTimesKept({ ...loaded, ...change }, loaded, cars)).toEqual({ retour: 2 });
  });

  it("nothing changed, or put back as it was loaded: none", () => {
    expect(carTimesKept({ ...loaded }, loaded, cars)).toEqual({});
  });

  it("a leg without a car: none for it", () => {
    expect(carTimesKept({ ...loaded, allerTime: "14:00", retourTime: "21:00" }, loaded, { aller: 0, retour: 1 })).toEqual({ retour: 1 });
  });

  it("the box unchecked: none for the retour", () => {
    expect(carTimesKept({ ...loaded, retour: false, retourTime: "21:00" }, loaded, cars)).toEqual({});
  });

  it("the end's date following the start's: both legs", () => {
    expect(carTimesKept({ ...loaded, allerDate: "2026-12-13", retourDate: "2026-12-13" }, loaded, cars)).toEqual({ aller: 3, retour: 2 });
  });
});
