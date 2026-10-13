import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// A `.only` left behind silently skips every other test, locally and in CI alike.
const eslint = new ESLint();

async function onlyErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-properties");
}

describe("lint rule against .only", () => {
  it.each([
    ["src/x.test.ts", 'it.only("a", () => {});'],
    ["src/x.test.ts", 'describe.only("a", () => {});'],
    ["e2e/x.spec.ts", 'test.only("a", async () => {});'],
    ["e2e/x.spec.ts", 'test.describe.only("a", () => {});'],
    ["e2e/x.shot.ts", 'test.only("a", async () => {});'],
  ])("rejects %s: %s", async (filePath, code) => {
    expect(await onlyErrors(code, filePath)).toHaveLength(1);
  });

  it("leaves application code alone", async () => {
    expect(await onlyErrors("export const x = { only: 1 }.only;", "src/x.ts")).toHaveLength(0);
  });
});
