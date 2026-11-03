import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/db/accounts";
import type { Database } from "@/db/schema";
import { deleteAccountOf } from "./delete-account";
import { MAX_ADMIN_TOKENS } from "./sign-out";

vi.mock("@/db/accounts", () => ({ deleteAccount: vi.fn() }));
const db = {} as Kysely<Database>;
const run = vi.mocked(deleteAccount);

beforeEach(() => {
  run.mockReset();
});

describe("deleteAccountOf", () => {
  it("answers whether the account was deleted, with the session and the tokens it was given", async () => {
    run.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await deleteAccountOf(db, "session", ["a", "b"])).toEqual({ deleted: true });
    expect(await deleteAccountOf(db, "session", ["a"])).toEqual({ deleted: false });
    expect(run.mock.calls[0]).toEqual([db, "session", ["a", "b"]]);
  });

  it("gives no token when the body carries no list, and at most MAX_ADMIN_TOKENS", async () => {
    run.mockResolvedValue(true);
    await deleteAccountOf(db, "session", "not a list");
    await deleteAccountOf(db, "session", Array.from({ length: MAX_ADMIN_TOKENS + 5 }, (_, n) => `t${n}`));
    expect(run.mock.calls[0]![2]).toEqual([]);
    expect(run.mock.calls[1]![2]).toHaveLength(MAX_ADMIN_TOKENS);
  });

  // The daily clean-up of the links may deadlock with the deletion (40P01): Postgres cancels one of the two.
  it("tries once more after a deadlock, and only once", async () => {
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    run.mockRejectedValueOnce(deadlock).mockResolvedValueOnce(true);
    expect(await deleteAccountOf(db, "session", [])).toEqual({ deleted: true });
    expect(run).toHaveBeenCalledTimes(2);

    run.mockReset();
    run.mockRejectedValue(deadlock);
    await expect(deleteAccountOf(db, "session", [])).rejects.toBe(deadlock);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
