import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The patterns live in the workflow profile and are matched (with Perl) against every
// added line of a patch; a match sends the merge to the human. They are read from the
// profile, never copied here, so this test follows the real file.
type Pattern = { regex: string; file?: string };
const profile = JSON.parse(
  readFileSync(new URL("../.claude/workflow.json", import.meta.url), "utf8"),
) as { merge: { sensitive_patterns: Pattern[] } };

// Patterns scoped to a file (`package.json`) do not apply to test code. A leading `(?i)`
// is Perl's inline flag; JavaScript takes it as the `i` flag instead.
const patterns = profile.merge.sensitive_patterns
  .filter((p) => p.file === undefined)
  .map((p) =>
    p.regex.startsWith("(?i)") ? new RegExp(p.regex.slice(4), "i") : new RegExp(p.regex),
  );

const isSensitive = (line: string) => patterns.some((re) => re.test(line));

describe("sensitive patterns: disabled or focused tests", () => {
  it.each([
    'it.skip("a", () => {});',
    'it.only("a", () => {});',
    'describe.skip("a", () => {});',
    'it.skipIf(true)("a", () => {});',
    'it.runIf(false)("a", () => {});',
    'test.todo("a");',
    'test.fails("a", () => {});',
    'test.fixme("a", async () => {});',
    'test.describe.fixme("a", () => {});',
    'test.skip(({ browserName }) => browserName === "webkit");',
    'xit("a", () => {});',
    'xdescribe("a", () => {});',
    'xtest("a", () => {});',
    "ctx.skip();",
    // Chained forms: the modifier is not the last link before the call.
    'it.skip.each([1])("a", () => {});',
    'test.only.each([1])("a", () => {});',
    'describe.only.each([1])("a", () => {});',
    "describe.skip.each`",
    "it.skip.each`",
    'it.concurrent.skip("a", () => {});',
    'describe.concurrent.skip("a", () => {});',
    'it.concurrent.only.each([1])("a", () => {});',
    'test.describe.only("a", () => {});',
    'suite.skip("a", () => {});',
    'bench.skip("a", () => {});',
  ])("flags %s", (line) => {
    expect(isSensitive(line)).toBe(true);
  });

  it.each([
    'it("a", () => {});',
    'test.each([1])("a", () => {});',
    "describe.each`",
    'it.concurrent("a", () => {});',
    "expect(fails).toBe(0);",
    'maxit("a");',
    "await todo();",
    "const rest = array.skip;",
    "const open = list.todo.length;",
    "if (state.only) return;",
    "export const x = { only: 1, skip: 2, todo: 3 };",
    "const ok = run.failsafe();",
    "submit.skip;",
  ])("ignores %s", (line) => {
    expect(isSensitive(line)).toBe(false);
  });
});
