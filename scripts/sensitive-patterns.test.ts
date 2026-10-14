import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The patterns live in the workflow profile and are matched (with Perl) against every
// added line of a patch; a match sends the merge to the human. They are read from the
// profile, never copied here, so this test follows the real file.
type Pattern = { regex: string; file?: string; exclude?: string[] };
const profile = JSON.parse(
  readFileSync(new URL("../.claude/workflow.json", import.meta.url), "utf8"),
) as { merge: { sensitive_paths: string[]; sensitive_patterns: Pattern[] } };
const all = profile.merge.sensitive_patterns;
const paths = profile.merge.sensitive_paths;

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

/** Whether touching `path` at all sends the merge to the human. */
const isSensitivePath = (path: string) => paths.some((glob) => globMatches(glob, path));

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
    'const value = formData.get("token");',
    "const value = body['token'];",
    "const fragment = location.hash;",
    "const fragment = url.hash;",
    "const link = `/e/${id}/admin#${token}`;",
    "const link = `/e/${id}/moi#${ token }`;",
    // A token named `token` outside a string: logged, in a URL, returned, read, typed.
    'console.info("event created", { id, token });',
    'console.log("event created", token);',
    'logger.info({ token }, "created");',
    "console.log(`created ${result.token}`);",
    "redirect(`/e/${id}/admin?t=${encodeURIComponent(token)}`);",
    "fetch(`/api/e/${id}?t=` + token);",
    "const link = `/e/${id}/admin/` + token;",
    "const link = `/e/${event.id}/admin#${result.token}`;",
    "const link = `/e/${id}/admin#${encodeURIComponent(value.token)}`;",
    "const link = `/e/${id}/admin#` + token;",
    "await page.goto(`/e/${seeded.id}/admin#${seeded.token}`);",
    "return { ok: true, id, token };",
    "| { ok: true; id: string; token: string }",
    "return { ok: true, id: event.id, token: newToken };",
    "body: JSON.stringify({ token }),",
    "const { token } = await request.json();",
    "const schema = z.object({ token: z.string() });",
    "const { id, token } = await seedEvent(db);",
    'const [, token] = page.url().split("#");',
    "expect(request.url()).not.toContain(token);",
    "const csrfToken = read();",
    "localStorage.setItem(key, value);",
    'headers.set("Referrer-Policy", "no-referrer");',
    "const jar = await cookies();",
    // The fragment handled without being named: the whole URL, or the URL cut at `#`.
    'console.error("save failed", window.location.href);',
    "const url = location.href;",
    'const fragment = page.url().split("#")[1];',
    "const [, secret] = url.split( '#' );",
    "const [, secret] = url.split(`#`);",
    // What decides whether the URL, fragment aside, leaves with the referrer.
    'export const metadata = { referrer: "unsafe-url" };',
    '<meta name="referrer" content="origin" />',
    '<a href={url} referrerPolicy="unsafe-url">',
    "const from = document.referrer;",
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
    '<a href={url} target="_blank" rel="noopener noreferrer">',
    '<a href={url} rel="noreferrer">',
    "const href = link.href;",
    'const parts = line.split(",");',
    'const [path] = url.split("?");',
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
    "test.info().fail();",
    'test.info().fail(browserName === "webkit");',
    "info.fail();",
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
    "const message = testInfo.failureMessage;",
    "const failed = info.failures;",
    'res.fail("bad request");',
    'logger.fail("boom");',
    'test("fail fast", () => {});',
    "test.slow();",
  ])("ignores %s", (line) => {
    for (const path of testFiles) expect(isSensitive(line, path)).toBe(false);
  });
});

// Who sees a phone number is decided in two files, both sensitive paths: the visibility rule
// and the one query that reads the column. A pattern catches a new read of the column
// anywhere else; naming a phone (a form, a message, a test, a validation) is not a read.
describe("sensitive patterns: phone numbers", () => {
  it.each(["src/domain/phone-visibility.ts", "src/db/event-rows.ts"])(
    "sends any change to %s to the human",
    (path) => {
      expect(isSensitivePath(path)).toBe(true);
    },
  );

  it.each([
    "src/domain/person.ts",
    "src/domain/phone-visibility.test.ts",
    "src/db/event-rows.test.ts",
    "src/db/persons.ts",
    "src/components/event/person-form.tsx",
    "messages/fr.json",
    "e2e/participants.spec.ts",
  ])("leaves %s to the gate's other rules", (path) => {
    expect(isSensitivePath(path)).toBe(false);
  });

  it.each([
    // Kysely, on one line or a list spread over several.
    ['.select(["id", "first_name", "phone"])', "src/db/persons.ts"],
    ['.select("person.phone")', "src/db/rides.ts"],
    ['.select("phone as number")', "src/db/persons.ts"],
    ['    "phone",', "src/db/persons.ts"],
    ["    'person.phone',", "src/db/rides.ts"],
    ['.select((eb) => eb.ref("phone").as("number"))', "src/db/persons.ts"],
    ['eb.ref("person.phone"),', "src/db/rides.ts"],
    ['export const PERSON_COLUMNS = ["id", "first_name", "phone"] as const;', "src/db/persons.ts"],
    ['.returning(["id", "phone"])', "src/db/persons.ts"],
    // A query written in a use case or a script instead of src/db.
    ['.select(["first_name", "phone"])', "src/app/e/[id]/event-state.ts"],
    ['.select("person.phone")', "src/app/e/[id]/persons.ts"],
    ['const rows = await db.selectFrom("person").select("phone").execute();', "scripts/export.ts"],
    // Every column, phone included: the table is often on another line than the call.
    [".selectAll()", "src/db/persons.ts"],
    ['.selectAll("person")', "src/db/rides.ts"],
    [".returningAll()", "src/db/persons.ts"],
    ['return db.selectFrom("person").selectAll().where("id", "=", id).executeTakeFirst();', "src/app/e/[id]/persons.ts"],
    // Raw SQL naming the column, every column, or the table itself.
    ["select id, first_name, phone", "src/db/persons.ts"],
    ["SELECT p.phone FROM person p", "src/app/e/[id]/event-state.ts"],
    ["sql`select * from person where event_id = ${id}`", "src/db/persons.ts"],
    ["  select p.*", "src/db/rides.ts"],
    ["  returning *", "src/db/persons.ts"],
    ["  from person p", "src/db/rides.ts"],
    ['  join "person" on person.id = ride.driver_id', "src/db/rides.ts"],
    ["  FROM public.person", "scripts/export.ts"],
  ])("flags %s in %s", (line, path) => {
    expect(isSensitive(line, path)).toBe(true);
  });

  it.each([
    // A form and its labels.
    ['<Input id="phone" name="phone" type="tel" autoComplete="tel" />', "src/components/event/person-form.tsx"],
    ['<Label htmlFor="phone">{t("phone")}</Label>', "src/components/event/person-form.tsx"],
    ['<Select name="phoneCountry" defaultValue="FR">', "src/components/event/person-form.tsx"],
    ["{person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}", "src/components/event/ride-card.tsx"],
    // The messages, in both languages.
    ['  "phone": "Téléphone (facultatif)",', "messages/fr.json"],
    ['  "phoneHint": "Tap a seat, then select a car to see the driver’s phone.",', "messages/en.json"],
    // Tests, end to end and unit, even when they read the column to assert on it.
    ['await page.fill(\'input[name="phone"]\', "06 12 34 56 78");', "e2e/participants.spec.ts"],
    ['const row = await db.selectFrom("person").select("phone").executeTakeFirstOrThrow();', "e2e/participants.spec.ts"],
    ['.select(["id", "phone"])', "src/db/persons.test.ts"],
    [".selectAll()", "src/app/e/[id]/event-state.test.ts"],
    ['expect(screen.getByRole("link", { name: "06 12 34 56 78" })).toHaveAttribute("href", "tel:0612345678");', "src/components/event/ride-card.test.tsx"],
    // The domain validates a number, it never reads one.
    ["const PHONE = /^[0-9 +.()-]{1,25}$/;", "src/domain/person.ts"],
    ['if (phone !== undefined && !PHONE.test(phone)) errors.phone = "invalid";', "src/domain/person.ts"],
    ["phone: text(fields.phone),", "src/domain/person.ts"],
    // An action reads the form, the data layer writes and types the column.
    ['phone: text("phone"),', "src/app/e/[id]/actions.ts"],
    [".set({ first_name: person.firstName, phone: person.phone })", "src/db/persons.ts"],
    ["phone: string | null;", "src/db/schema.ts"],
    ['.returning("id")', "src/db/persons.ts"],
    ['if (constraint === "person_phone_check") return error;', "src/db/failure.ts"],
    ['import { validatePerson } from "@/domain/person";', "src/db/persons.ts"],
  ])("ignores %s in %s", (line, path) => {
    expect(isSensitive(line, path)).toBe(false);
  });
});
