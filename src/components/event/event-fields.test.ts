import { describe, expect, it } from "vitest";
import {
  BLANK_EVENT_FIELDS,
  eventFieldsChanged,
  loadedEventFields,
  withEventField,
  withRetour,
  type EventFieldsState,
  type EventFieldsUpdate,
} from "./event-fields";

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
  const header = { title: "Tournoi de Rennes", location: "Gymnase", allerAt: "2026-12-12 07:30:00" };
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
  const loaded = loadedEventFields({ title: "T", location: "L", allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" }).values;

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
