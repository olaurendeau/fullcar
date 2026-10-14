import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseFailure } from "./failure";

afterEach(() => {
  vi.restoreAllMocks();
});

const MESSAGE = "someAction: the event could not be read";
const TOKEN = "aB3dEf7hJk_mNpQrStUvWx";

/** What a Postgres error may carry: the query, its values, the row, a token among them. */
function postgresError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint, token ${TOKEN}`), {
    detail: `Failing row contains (Ab3dEf7h, secret title, ${TOKEN})`,
    query: `select * from event where token = '${TOKEN}'`,
    parameters: [TOKEN],
    ...fields,
  });
}

function logged(error: unknown) {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = databaseFailure(MESSAGE, error);
  return { failure, calls: log.mock.calls };
}

describe("databaseFailure", () => {
  it.each([
    ["the SQLSTATE of a Postgres error", { code: "23505" }, `${MESSAGE} (SQLSTATE 23505)`],
    ["the SQLSTATE of a class with letters", { code: "57P01" }, `${MESSAGE} (SQLSTATE 57P01)`],
    ["the errno of a system error", { code: "ECONNREFUSED", errno: -111 }, `${MESSAGE} (errno -111)`],
    // Five letters like a SQLSTATE: the errno says it is a system error.
    ["the errno of a socket closed by the server", { code: "EPIPE", errno: -32 }, `${MESSAGE} (errno -32)`],
  ])("logs the fixed message with %s, and nothing else", (_, fields, line) => {
    const { calls } = logged(postgresError(fields));
    expect(calls).toEqual([[line]]);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it.each([
    ["no code", {}],
    ["a code that is not a SQLSTATE", { code: `E ${TOKEN}` }],
    ["an errno that is not an integer", { errno: TOKEN }],
  ])("logs the fixed message alone for an error with %s", (_, fields) => {
    expect(logged(postgresError(fields)).calls).toEqual([[MESSAGE]]);
  });

  it.each([
    ["a string", TOKEN],
    ["null", null],
    ["undefined", undefined],
  ])("logs the fixed message alone for %s thrown", (_, thrown) => {
    expect(logged(thrown).calls).toEqual([[MESSAGE]]);
  });

  it("logs the fixed message alone when reading the code throws", () => {
    const hostile = Object.defineProperty(new Error(TOKEN), "code", {
      get() {
        throw new Error(TOKEN);
      },
    });
    expect(logged(hostile).calls).toEqual([[MESSAGE]]);
  });

  it("returns an error with the fixed message, without cause nor any of the error's detail", () => {
    const { failure } = logged(postgresError({ code: "23505" }));
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(MESSAGE);
    expect(failure.cause).toBeUndefined();
    expect(failure.stack).not.toContain(TOKEN);
  });
});
