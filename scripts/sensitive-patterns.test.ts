import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The patterns live in the workflow profile and are matched (with Perl) against every
// added line of a patch; a match sends the merge to the human. They are read from the
// profile, never copied here, so this test follows the real file.
type Pattern = { regex: string; file?: string; exclude?: string[] };
const profile = JSON.parse(
  readFileSync(new URL("../.claude/workflow.json", import.meta.url), "utf8"),
) as { merge: { sensitive_patterns: Pattern[] } };
const all = profile.merge.sensitive_patterns;

// A leading `(?i)` is Perl's inline flag; JavaScript takes it as the `i` flag instead.
const compile = (regex: string) =>
  regex.startsWith("(?i)") ? new RegExp(regex.slice(4), "i") : new RegExp(regex);

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whether a profile glob takes `path`, as the gate decides it: every glob is a git pathspec
// `:(glob)` (ola-workflow's profile schema). The exact path always matches, and a glob
// without wildcards also takes its subtree. Otherwise `*`, `?` and `[...]` never cross a
// `/`; `**` does only as a whole segment (leading `**/`, inner `/**/`, trailing `/**`) and
// is a plain `*` anywhere else; a leading dot is no exception. The cases below are what
// `git ls-files -- ':(glob)<glob>'` answers.
function globMatches(glob: string, path: string): boolean {
  if (path === glob) return true;
  if (!/[*?[\\]/.test(glob)) return path.startsWith(glob.endsWith("/") ? glob : `${glob}/`);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      let last = i;
      while (glob[last + 1] === "*") last++;
      const segment = last > i && (i === 0 || glob[i - 1] === "/");
      if (segment && glob[last + 1] === "/") {
        re += "(?:.*/)?";
        last++;
      } else if (segment && last === glob.length - 1) re += ".*";
      else re += "[^/]*";
      i = last;
    } else if (c === "?") re += "[^/]";
    else if (c === "\\" && i + 1 < glob.length) re += escape(glob[++i]);
    else if (c === "[" && glob.indexOf("]", i + 2) > 0) {
      const close = glob.indexOf("]", i + 2);
      let set = glob.slice(i + 1, close);
      const negated = set[0] === "!" || set[0] === "^";
      if (negated) set = set.slice(1);
      re += `(?!/)[${negated ? "^" : ""}${set.replace(/[\\^]/g, "\\$&")}]`;
      i = close;
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`).test(path);
}

/** A pattern applies to a file its `file` takes (all files without one), minus `exclude`. */
const appliesTo = (p: Pattern, path: string) =>
  (p.file === undefined || globMatches(p.file, path)) &&
  !(p.exclude ?? []).some((glob) => globMatches(glob, path));

/** Whether a line added to `path` sends the merge to the human. */
const isSensitive = (line: string, path = "src/x.ts") =>
  all.some((p) => appliesTo(p, path) && compile(p.regex).test(line));

const patternWith = (alternative: string) => {
  const found = all.find((p) => p.regex.includes(alternative));
  if (found === undefined) throw new Error(`no sensitive pattern contains ${alternative}`);
  return found;
};

describe("globs, as git pathspecs", () => {
  it.each([
    ["**/*.test.ts", "x.test.ts"],
    ["**/*.test.ts", "src/db/client.test.ts"],
    ["**/*.test.ts", ".hidden/x.test.ts"],
    ["e2e/**", "e2e/a.spec.ts"],
    ["e2e/**", "e2e/deep/a.ts"],
    ["**/e2e/**", "src/e2e/a.ts"],
    ["src/**/*.ts", "src/a.ts"],
    ["package.json", "package.json"],
    ["docs", "docs/a/b.md"],
    ["src/db", "src/db/client.ts"],
    ["src/e2e/", "src/e2e/a.ts"],
    ["doc*", "docs.md"],
    ["src/*", "src/.x.ts"],
    ["src/?.ts", "src/a.ts"],
    ["src/[ab].ts", "src/a.ts"],
    ["src/[ab].ts", "src/[ab].ts"],
    ["src/\\[ab\\].ts", "src/[ab].ts"],
    ["compose.*.y*ml", "compose.dev.yaml"],
    ["Dockerfile*", "Dockerfile.dev"],
  ])("%s takes %s", (glob, path) => {
    expect(globMatches(glob, path)).toBe(true);
  });

  it.each([
    ["**/*.test.ts", "src/db/client.ts"],
    ["**/*.test.ts", "src/x.test.tsx"],
    ["e2e/**", "src/e2e/a.ts"],
    ["e2e/**", "e2e2/a.ts"],
    ["package.json", "apps/package.json"],
    ["doc*", "docs/a/b.md"],
    ["Dockerfile*", "Dockerfiles/x"],
    ["*.ts", "src/a.ts"],
    ["src/*", "src/a/b.ts"],
    ["src/**.ts", "src/a/b.ts"],
    ["src/[!a].ts", "src/a.ts"],
    ["compose.*.y*ml", "compose.yaml"],
  ])("%s leaves %s", (glob, path) => {
    expect(globMatches(glob, path)).toBe(false);
  });
});

describe("sensitive patterns: file and exclude", () => {
  it("applies a `file` pattern to that file only", () => {
    expect(isSensitive('  "dependencies": {', "package.json")).toBe(true);
    expect(isSensitive('  "dependencies": {', "src/x.ts")).toBe(false);
  });

  it.each(["src/db/client.ts", "src/db/test-setup.ts", "scripts/migrate.ts", "vitest.config.ts"])(
    "flags the database URL read in %s",
    (path) => {
      expect(isSensitive("const url = process.env.DATABASE_URL;", path)).toBe(true);
      expect(isSensitive("url: process.env.POSTGRES_PRISMA_URL,", path)).toBe(true);
    },
  );

  it.each(["src/db/client.test.ts", "scripts/migrate.test.ts", "e2e/home.spec.ts"])(
    "ignores the database URL in the test file %s",
    (path) => {
      expect(isSensitive("const url = process.env.DATABASE_URL;", path)).toBe(false);
    },
  );
});

describe("sensitive patterns: tokens", () => {
  it.each([
    "const token = newAdminToken();",
    "const hash = hashAdminToken(token);",
    "if (!adminTokenMatches(token, stored)) return;",
    "admin_token_hash: Buffer;",
    'table.addColumn("token_hash", "bytea");',
    "const ADMIN_TOKEN = read();",
    "const personalToken = read();",
    "const persoToken = read();",
    "const personal_token = read();",
    'const token = formData.get("token");',
    "const { token } = body['token'];",
    "const fragment = location.hash;",
    "const fragment = url.hash;",
    "const link = `/e/${id}/admin#${token}`;",
    "const link = `/e/${id}/moi#${ token }`;",
    "console.info(`event created, token ${token}`);",
    "localStorage.setItem(key, value);",
    'headers.set("Referrer-Policy", "no-referrer");',
    "const jar = await cookies();",
  ])("flags %s", (line) => {
    expect(isSensitive(line)).toBe(true);
  });

  it.each([
    "const csrfTokenizer = make();",
    "tokenize(source);",
    "// les tokens CSS du thème",
    "const tokens = lexer();",
    'const kind = "tokens";',
    "const count = `${tokens.length}`;",
  ])("ignores %s", (line) => {
    expect(isSensitive(line)).toBe(false);
  });
});

describe("sensitive patterns: disabled or focused tests", () => {
  const quality = patternWith("@ts-nocheck");

  it("apply to every file, test files included", () => {
    expect(quality.file).toBeUndefined();
    expect(quality.exclude).toBeUndefined();
  });

  // Checked in test files, where they are written: a pattern excluding them would go red here.
  const testFiles = ["src/x.test.ts", "e2e/x.spec.ts"];

  it.each([
    "// eslint-disable-next-line no-console",
    "/* eslint-disable */",
    "// @ts-nocheck",
    "// @ts-expect-error the fixture is partial",
    "// @ts-ignore",
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
    // Playwright's `fail` inverts the result, as `fails` does in Vitest.
    "test.fail();",
    'test.fail(browserName === "webkit", "not supported");',
    'test.fail("a", async () => {});',
    'test.fail.only("a", async () => {});',
    'test.describe.fail("a", () => {});',
    "testInfo.fail();",
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
    for (const path of testFiles) expect(isSensitive(line, path)).toBe(true);
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
    'fail("unreachable");',
    "onFail(() => retry());",
    'expect.fail("unreachable");',
    'assert.fail("unreachable");',
    "const failed = report.failures;",
    "const message = test.failureMessage;",
  ])("ignores %s", (line) => {
    for (const path of testFiles) expect(isSensitive(line, path)).toBe(false);
  });
});
