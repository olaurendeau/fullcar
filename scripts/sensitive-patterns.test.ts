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
    // The project's own functions that draw, hash, compare, read or store a token (#189).
    // Each on a line no other alternative takes, so that removing it goes red here.
    "const hash = hashToken(secret);",
    "if (!tokenMatches(given, stored)) return;",
    "const fresh = personalTokenFromBytes(bytes);",
    "const secret = tokenInFragment(hash);",
    "readDeviceToken(id);",
    "ensureDeviceToken(id);",
    // Storing the organiser's token: in clear, it would be one argument away (#191).
    "id = await insertEvent(getDb(), validation.event, token);",
    "storage().setItem(storageKey(id), secret);",
    "const kept = storage().getItem(key);",
    'const value = formData.get("token");',
    // A header or a key that names the token.
    'headers.set("x-admin-token", token);',
    'const value = request.headers.get("x_personal_token");',
    "const value = body['token'];",
    "const fragment = location.hash;",
    "const fragment = url.hash;",
    "const link = `/e/${id}/admin#${token}`;",
    "const link = `/e/${id}/moi#${ token }`;",
    // A token named `token` outside a string, logged or in a URL.
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
    // Whatever its name: the project's tokens are adminToken and personalToken (#191).
    'console.log("created", adminToken);',
    'logger.info({ adminToken }, "created");',
    "router.push(`/e/${id}/admin#${adminToken}`);",
    "const link = `${origin}/e/${id}/moi#${personalToken}`;",
    "redirect(`/e/${id}/admin#${created.adminToken}`);",
    'const url = "/e/" + id + "/admin#" + adminToken;',
    // A query string, under any name.
    'url.searchParams.set("t", token);',
    'url.searchParams.append("t", secret);',
    "const qs = new URLSearchParams({ token }).toString();",
    'const [, token] = page.url().split("#");',
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
    // The word alone, a variable's name, a key or a parameter (#189): what carries the
    // token somewhere is what is flagged, above.
    "const ADMIN_TOKEN = read();",
    "const personalToken = read();",
    "const persoToken = read();",
    "const personal_token = read();",
    "const csrfToken = read();",
    "export async function addPerson(id: unknown, token: unknown, fields: unknown) {",
    "return { ok: true, id, token };",
    "| { ok: true; id: string; token: string }",
    "return { ok: true, id: event.id, token: newToken };",
    "body: JSON.stringify({ token }),",
    "const { token } = await request.json();",
    "const schema = z.object({ token: z.string() });",
    "const { id, token } = await seedEvent(db);",
    "expect(request.url()).not.toContain(token);",
    "// The token arrives in the body, never in the URL.",
    // A module whose name ends in -token is not a header that carries one.
    'import { isPersonalToken } from "@/domain/personal-token";',
    'import { useDevice } from "./device-token";',
    // Decision (#191): a new rights check on the personal token is the coordinator's to merge.
    "const ids = devicePersonIds(secret, holders);",
  ])("ignores %s", (line) => {
    expect(isSensitive(line)).toBe(false);
  });
});

// Copies of approved designs, and tests, which carry test tokens, ids and cleanup (#189).
describe("sensitive patterns: design copies and tests", () => {
  const designs = ["docs/design/event-board/index.html", "docs/design/event-board/README.md"];
  const tests = ["src/app/actions.test.ts", "src/components/event/ride-card.test.tsx", "e2e/admin.spec.ts"];

  it.each(designs)("no pattern applies to the design copy %s", (path) => {
    for (const p of all) expect(appliesTo(p, path)).toBe(false);
  });

  // Random draws and hashes, tokens and their storage, deletion.
  const subjects = [
    "const id = randomBytes(16);",
    "localStorage.setItem(key, TOKEN);",
    "await page.goto(`/e/${seeded.id}/admin#${seeded.token}`);",
    'await db.deleteFrom("person").execute();',
  ];

  it.each(subjects)("ignores %s in a test", (line) => {
    for (const path of tests) expect(isSensitive(line, path)).toBe(false);
  });

  it.each(subjects)("still flags %s outside the tests", (line) => {
    expect(isSensitive(line, "src/app/e/[id]/actions.ts")).toBe(true);
    expect(isSensitive(line, "scripts/seed.ts")).toBe(true);
  });

  it("leaves a test helper without a .test suffix to the patterns", () => {
    expect(isSensitive("tokenHash: hashToken(token),", "src/db/test-participants.ts")).toBe(true);
  });
});

describe("sensitive patterns: disabled or focused tests", () => {
  const quality = patternWith("@ts-nocheck");

  it("apply to every file but the design copies, test files included", () => {
    expect(quality.file).toBeUndefined();
    expect(quality.exclude).toEqual(["docs/design/**"]);
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
// and the one query that reads the column. Three coarse rules send any other read of the
// column to the human, and fail closed rather than follow the syntax of each query:
// - in src/db, any line naming a phone;
// - outside src/db, any query naming the person table, and any raw SQL;
// - in src, any read of whole rows, which carries the number without naming it.
// Naming a phone elsewhere (a form, a message, a test, a validation) is not a read.

/** Whether a patch adding these lines to `path` sends the merge to the human: one line is enough. */
const isSensitivePatch = (lines: string[], path: string) => lines.some((line) => isSensitive(line, path));

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
    "src/app/e/[id]/participant-board.tsx",
    "messages/fr.json",
    "e2e/participants.spec.ts",
  ])("leaves %s to the gate's other rules", (path) => {
    expect(isSensitivePath(path)).toBe(false);
  });

  // Every way around the earlier patterns that the reviews of #100 and #110 found.
  it.each<[string, string, string[]]>([
    [
      "a Kysely read of the column over several lines, outside src/db (#70's own example)",
      "src/app/e/[id]/event-state.ts",
      ["return db", '  .selectFrom("person")', "  .select([", '    "person.id",', '    "person.phone",', "  ])"],
    ],
    ["the same in a library module", "src/lib/export.ts", ['  .selectFrom("person as p")', '  .select(["p.phone"])']],
    ["the same in a script", "scripts/export.ts", ["  .selectFrom(['person', 'ride'])", "  .select([", '    "phone",']],
    ["the table second in an array", "src/app/e/[id]/event-state.ts", ['  .selectFrom(["ride", "person as p"])', "  .select([", '    "p.phone",']],
    [
      "a join whose arguments sit on their own lines",
      "src/app/e/[id]/event-state.ts",
      ["  .innerJoin(", '    "person as driver",', '    "driver.id",', '    "ride.driver_id",', "  )", "  .select([", '    "driver.phone",', "  ])"],
    ],
    ["a join written on one line", "src/app/e/[id]/seats.ts", ["  .leftJoin('person as d', 'd.id', 'ride.driver_id')"]],
    ["an alias in capitals", "src/app/e/[id]/seats.ts", ['  .innerJoin("person AS d", "d.id", "ride.driver_id")']],
    ["a schema-qualified name", "src/app/e/[id]/seats.ts", ['  .selectFrom("public.person")']],
    ["a returning list on a write", "src/app/e/[id]/persons.ts", ['  .updateTable("person")', "  .set({ first_name })", "  .returning([", '    "phone",', "  ])"]],
    ["a reference to the column, alone on its line", "src/app/e/[id]/event-state.ts", ['    eb.ref("driver.phone").as("n"),']],
    ["sql.table", "src/app/e/[id]/event-state.ts", ['  from ${sql.table("person")} p']],
    ["raw SQL with a quoted schema", "src/app/e/[id]/event-state.ts", ['  FROM "public"."person" p']],
    ["raw SQL with FROM alone on its line", "src/app/e/[id]/event-state.ts", ["const { rows } = await sql`", "  select p.first_name, p.phone", "  FROM", "    person p", "`.execute(db);"]],
    ["raw SQL with a comma join", "scripts/export.ts", ["await sql<{ phone: string }>`select p.phone from ride r, person p`.execute(db);"]],
    // In src/db, any line naming a phone: a multi-line SQL column in every form.
    ["a column alone on its line", "src/db/rides.ts", ["    p.phone,"]],
    ["a column alone on its line, with the diff's +", "src/db/rides.ts", ["+    p.phone,"]],
    ["a column renamed in capitals", "src/db/rides.ts", ["    p.phone AS phone_number,"]],
    ["a column inside a function", "src/db/rides.ts", ["    coalesce(p.phone, '') as phone,"]],
    ["a column cast", "src/db/rides.ts", ["    p.phone::text,"]],
    ["a Kysely column list", "src/db/persons.ts", ['  .select(["id", "first_name", "phone"])']],
    ["a column list in a constant", "src/db/persons.ts", ['export const PERSON_COLUMNS = ["id", "first_name", "phone"] as const;']],
    ["a test helper without a .test suffix", "src/db/test-participants.ts", ['    "phone",']],
    // Whole rows: the number comes back without being named.
    [
      "eb.fn.jsonAgg, the idiomatic load of a car and its passengers",
      "src/db/rides.ts",
      ['  .selectFrom("ride")', '  .innerJoin("person as passenger", "passenger.id", "placement.person_id")', "  .select((eb) => [", '    "ride.id",', '    eb.fn.jsonAgg("passenger").as("passengers"),', "  ])"],
    ],
    ["the aggregate named as a string", "src/db/rides.ts", ['    eb.fn.agg("json_agg", ["passenger"]).as("passengers"),']],
    ["eb.fn.toJson", "src/db/rides.ts", ['  .select((eb) => eb.fn.toJson("person").as("p"))']],
    ["selectAll", "src/db/persons.ts", ["  .selectAll()"]],
    ["selectAll on one table", "src/db/rides.ts", ['  .selectAll("person")']],
    ["returningAll", "src/db/test-participants.ts", ["  .returningAll()"]],
    ["select *", "src/db/persons.ts", ["sql`select * from person where event_id = ${id}`"]],
    ["p.*", "src/db/rides.ts", ["  select r.id, p.*"]],
    ["returning *", "src/db/persons.ts", ["  RETURNING *"]],
    ["to_jsonb", "src/db/rides.ts", ["  select to_jsonb(p) from person p"]],
    ["row_to_json", "src/db/rides.ts", ["  select row_to_json(p)"]],
    ["json_agg", "src/db/rides.ts", ["  json_agg(p) as passengers"]],
    ["array_agg", "src/db/rides.ts", ["  array_agg(p) as passengers"]],
  ])("flags %s (%s)", (_name, path, lines) => {
    expect(isSensitivePatch(lines, path)).toBe(true);
  });

  // Stand-ins for the files epic #66 plans outside the two sensitive ones.
  it.each<[string, string, string[]]>([
    [
      "the person form",
      "src/components/event/person-form.tsx",
      ['<Label htmlFor="phone">{t("phone")}</Label>', '<Input id="phone" name="phone" type="tel" autoComplete="tel" />', "{errors.phone && <p>{t(`errors.${errors.phone}`)}</p>}"],
    ],
    ["a ride card showing a number it was given", "src/components/event/ride-card.tsx", ["{phone && <a href={`tel:${phone}`}>{phone}</a>}"]],
    [
      "the domain validation",
      "src/domain/person.ts",
      ["const PHONE = /^[0-9 +.()-]{1,25}$/;", "phone: text(fields.phone),", 'if (phone !== undefined && !PHONE.test(phone)) errors.phone = "invalid";'],
    ],
    [
      "a server action reading the form",
      "src/app/e/[id]/actions.ts",
      ["const fields = {", '  firstName: form.get("firstName"),', '  phone: form.get("phone"),', "};", "return addPerson(getDb(), id, fields);"],
    ],
    [
      "the participant board",
      "src/app/e/[id]/participant-board.tsx",
      ['const t = useTranslations("participants");', "const phone = state.phonesById[person.id];", "runAction(() => updatePersonAction(id, { ...person, phone }));"],
    ],
    ["a use case on another table", "src/app/e/[id]/seats.ts", ['  .selectFrom("placement")', '  .where("ride_id", "=", rideId)']],
    ["a view whose name starts like the table", "src/app/e/[id]/seats.ts", ['  .selectFrom("persons_view")', '    "persons",']],
    ["a JavaScript date turned into JSON", "src/app/e/[id]/event-state.ts", ["const at = date.toJSON();"]],
    [
      "an end-to-end test seeding and reading a person",
      "e2e/participants.spec.ts",
      ['await db.insertInto("person").values({ id, event_id, first_name: "Léa", phone: "06 12 34 56 78" }).execute();', 'const row = await db.selectFrom("person").select("phone").executeTakeFirstOrThrow();', 'await page.fill(\'input[name="phone"]\', "06 12 34 56 78");'],
    ],
    ["a unit test reading the column", "src/db/persons.test.ts", ['  .selectFrom("person")', '  .select(["id", "phone"])', "  .selectAll()"]],
    ["a component test", "src/components/event/ride-card.test.tsx", ['expect(screen.getByRole("link")).toHaveAttribute("href", "tel:0612345678");']],
    ["the messages", "messages/en.json", ['  "phone": "Phone (optional)",', '  "phoneHint": "Tap a seat, then select a car to see the driver’s phone.",']],
    ["the documentation", "README.md", ["Select a car to see the phone of whoever drives it: `select * from person` is never written."]],
  ])("ignores %s (%s)", (_name, path, lines) => {
    expect(isSensitivePatch(lines, path)).toBe(false);
  });

  // The price of failing closed: code in src/db that only writes or types the column goes to
  // the human too. Few files do (persons.ts, schema.ts), so few pull requests pay it.
  it.each<[string, string, string[]]>([
    ["a write", "src/db/persons.ts", ["  .set({ first_name: person.firstName, phone: person.phone })"]],
    ["the column's type", "src/db/schema.ts", ["  phone: string | null;"]],
    ["a constraint name", "src/db/failure.ts", ['if (constraint === "person_phone_check") return error;']],
    ["a query on the table outside src/db, whatever its columns", "src/app/e/[id]/persons.ts", ['  .selectFrom("person")', '  .select(["id", "first_name"])']],
    ["any raw SQL outside src/db", "scripts/report.ts", ["const { rows } = await sql`select count(*) as n from event`.execute(db);"]],
  ])("over-catches %s (%s), accepted", (_name, path, lines) => {
    expect(isSensitivePatch(lines, path)).toBe(true);
  });
});
