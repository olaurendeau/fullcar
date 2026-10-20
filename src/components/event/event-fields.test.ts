import { describe, expect, it } from "vitest";
import { BLANK_EVENT_FIELDS, withEventField, type EventFieldsState } from "./event-fields";

const saved = (retourDateFollows: boolean): EventFieldsState => ({
  values: { ...BLANK_EVENT_FIELDS.values, allerDate: "2026-11-07", retourDate: "2026-11-08" },
  retourDateFollows,
});

describe("withEventField", () => {
  // C1.3: the retour date follows the aller date until it is changed.
  it("carries the retour date with the aller date while it follows", () => {
    const next = withEventField(saved(true), "allerDate", "2026-11-14");
    expect(next).toEqual({
      values: { ...saved(true).values, allerDate: "2026-11-14", retourDate: "2026-11-14" },
      retourDateFollows: true,
    });
  });

  it("stops the following once the retour date is changed", () => {
    const changed = withEventField(saved(true), "retourDate", "2026-11-09");
    expect(changed.retourDateFollows).toBe(false);
    expect(withEventField(changed, "allerDate", "2026-11-14").values.retourDate).toBe("2026-11-09");
  });

  // Epic #250: a form opened on an end of another day does not follow.
  it("leaves the retour date alone when it does not follow", () => {
    const next = withEventField(saved(false), "allerDate", "2026-11-14");
    expect(next).toEqual({ values: { ...saved(false).values, allerDate: "2026-11-14" }, retourDateFollows: false });
  });

  it("changes only the field it names, and leaves the state it was given as it was", () => {
    const state = saved(true);
    const next = withEventField(state, "title", "Tournoi");
    expect(next).toEqual({ values: { ...state.values, title: "Tournoi" }, retourDateFollows: true });
    expect(state.values.title).toBe("");
  });
});
