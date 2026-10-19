import { describe, expect, it } from "vitest";
import fr from "../../messages/fr.json";

type Messages = { [key: string]: string | Messages };

/** The namespaces of epic #66: the event's screen. */
const NAMESPACES = ["Board", "DevicePersons", "PersonForm", "RideForm", "FormErrors", "Sheet", "Seat", "RideChanges", "Actions"];

/** The words of C11.9: they agree with a person's gender, or name a role by a gendered noun (D7). */
const WORDS = ["concerné", "concernée", "Elle prendra", "conducteur", "Conducteur", "passager"];

/** Every value under `messages`, with its dotted key. */
function values(messages: Messages | string | undefined, path: string): [string, string][] {
  if (messages === undefined) return [];
  if (typeof messages === "string") return [[path, messages]];
  return Object.entries(messages).flatMap(([key, value]) => values(value, `${path}.${key}`));
}

describe("C11.9: the screen's French words are epicene", () => {
  const messages = fr as Messages;

  it.each(NAMESPACES)("no value of %s holds a gendered word", (namespace) => {
    const gendered = values(messages[namespace], namespace).filter(([, value]) => WORDS.some((word) => value.includes(word)));
    expect(gendered).toEqual([]);
  });

  it("reads the namespaces of the screen that exist", () => {
    expect(Object.keys(messages)).toEqual(expect.arrayContaining(["Board", "DevicePersons", "PersonForm", "FormErrors", "Actions"]));
  });
});
