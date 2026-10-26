import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX } from "@/domain/description";
import { EVENT_FIELDS, LOCATION_MAX, TITLE_MAX, type EventError } from "@/domain/event";
import fr from "../../../messages/fr.json";
import { eventErrorMessage } from "./event-error";

// Every code of the union, and nothing else: the typecheck fails on a code added to the domain.
const CODES = Object.keys({
  required: true,
  tooLong: true,
  invalid: true,
  tooEarly: true,
  tooLate: true,
  notAfterAller: true,
} satisfies Record<EventError, true>) as EventError[];

describe("eventErrorMessage", () => {
  // #23: `invalid` on the title or the place is a character Postgres refuses, not a bad date.
  it.each(["title", "location", "description"] as const)("says a character is not allowed for an invalid %s", (field) => {
    expect(eventErrorMessage(field, "invalid")).toEqual({ key: "invalidText" });
  });

  it.each([
    ["allerDate", "invalidDate"],
    ["retourDate", "invalidDate"],
    ["allerTime", "invalidTime"],
    ["retourTime", "invalidTime"],
  ] as const)("says which value is not valid for an invalid %s", (field, key) => {
    expect(eventErrorMessage(field, "invalid")).toEqual({ key });
  });

  it("gives the maximum length of the field that is too long", () => {
    expect(eventErrorMessage("title", "tooLong")).toEqual({ key: "tooLong", values: { max: TITLE_MAX } });
    expect(eventErrorMessage("location", "tooLong")).toEqual({ key: "tooLong", values: { max: LOCATION_MAX } });
    expect(eventErrorMessage("description", "tooLong")).toEqual({ key: "tooLong", values: { max: DESCRIPTION_MAX } });
  });

  it.each(["required", "tooEarly", "tooLate", "notAfterAller"] as const)("keeps %s as it is", (code) => {
    expect(eventErrorMessage("allerDate", code)).toEqual({ key: code });
  });

  // Every error the domain can return on any field has a message to show.
  it("has a message for every code on every field", () => {
    const errors: Record<string, string> = fr.CreateEvent.errors;
    for (const field of EVENT_FIELDS) {
      for (const code of CODES) expect(errors[eventErrorMessage(field, code).key], `${field} ${code}`).toBeTruthy();
    }
  });
});
