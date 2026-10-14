import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The layers of docs/agents/architecture.md hold only as long as these rules fire.
const eslint = new ESLint();

// Loading the config and its plugins takes seconds: done once, outside any single test's timeout.
beforeAll(() => eslint.lintText(""), 60_000);

async function errors(ruleId: string, code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === ruleId);
}

const imports = (code: string, filePath: string) =>
  errors("no-restricted-imports", code, filePath);
const properties = (code: string, filePath: string) =>
  errors("no-restricted-properties", code, filePath);
const syntax = (code: string, filePath: string) =>
  errors("no-restricted-syntax", code, filePath);

describe("the domain stays pure", () => {
  it.each([
    'import { Kysely } from "kysely";',
    'import type { Kysely } from "kysely";',
    'import { jsonArrayFrom } from "kysely/helpers/postgres";',
    'import { Pool } from "pg";',
    'import { redirect } from "next/navigation";',
    'import { NextResponse } from "next/server";',
    'import { useState } from "react";',
    'import { createPortal } from "react-dom";',
    'import { db } from "@/db/client";',
    'import { db } from "../db/client";',
    'export { db } from "@/db/client";',
  ])("rejects %s", async (code) => {
    expect(await imports(code, "src/domain/placement.ts")).toHaveLength(1);
  });

  // no-restricted-imports only sees import and export declarations.
  it.each([
    'await import("kysely");',
    'await import("kysely/helpers/postgres");',
    'await import("pg");',
    'await import("next/navigation");',
    'await import("react");',
    'await import("react-dom");',
    'await import("@/db/client");',
    'await import("../db/client");',
    "await import(`@/db/client`);",
    'type Db = import("kysely").Kysely<unknown>;',
  ])("rejects the dynamic %s", async (code) => {
    expect(await syntax(code, "src/domain/placement.ts")).toHaveLength(1);
  });

  it.each(['await import("@/lib/utils");', 'await import("./leg");', 'type L = import("./leg").Leg;'])(
    "accepts the dynamic %s",
    async (code) => {
      expect(await syntax(code, "src/domain/placement.ts")).toHaveLength(0);
    },
  );

  it("rejects them in nested files and tests too", async () => {
    const code = 'import { db } from "../../db/client";';
    expect(await imports(code, "src/domain/rides/seats.test.ts")).toHaveLength(1);
  });

  it.each(['import { cn } from "@/lib/utils";', 'import { leg } from "./leg";'])(
    "accepts %s",
    async (code) => {
      expect(await imports(code, "src/domain/placement.ts")).toHaveLength(0);
    },
  );
});

describe("components do not reach the database", () => {
  it.each([
    'import { db } from "@/db/client";',
    'import type { Database } from "@/db/schema";',
    'import { db } from "../../db/client";',
  ])("rejects %s", async (code) => {
    expect(await imports(code, "src/components/ride/card.tsx")).toHaveLength(1);
  });

  it.each(['await import("@/db/client");', 'await import("../../db/client");'])(
    "rejects the dynamic %s",
    async (code) => {
      expect(await syntax(code, "src/components/ride/card.tsx")).toHaveLength(1);
    },
  );

  it("still accepts react and the rest of src", async () => {
    const code = 'import { useState } from "react";\nimport { cn } from "@/lib/utils";';
    expect(await imports(code, "src/components/ride/card.tsx")).toHaveLength(0);
  });

  it("leaves pages free to query", async () => {
    expect(await imports('import { db } from "@/db/client";', "src/app/page.tsx")).toHaveLength(0);
    expect(await syntax('await import("@/db/client");', "src/app/page.tsx")).toHaveLength(0);
  });
});

describe("sql.raw is for migrations only", () => {
  it.each([
    ["src/db/rides.ts", "sql.raw(input);"],
    ["src/db/rides.ts", 'sql["raw"](input);'],
    ["src/db/rides.ts", "const { raw } = sql;"],
    ["src/db/rides.ts", "const { raw: r } = sql;"],
    ["src/app/page.tsx", "sql.raw(input);"],
    ["src/db/rides.test.ts", "sql.raw(input);"],
  ])("rejects it in %s: %s", async (filePath, code) => {
    expect(await properties(code, filePath)).toHaveLength(1);
  });

  // no-restricted-properties only knows the name `sql`: renaming it would hide sql.raw.
  it.each([
    ["src/db/rides.ts", 'import { sql as q } from "kysely";\nq.raw(input);'],
    ["src/db/rides.ts", 'export { sql as q } from "kysely";'],
    ["src/db/rides.ts", "const q = sql;\nq.raw(input);"],
    ["src/db/rides.ts", "let q;\nq = sql;"],
    ["src/db/rides.ts", 'import * as k from "kysely";\nk.sql.raw(input);'],
    ["src/db/rides.ts", 'import * as k from "kysely";\nk.sql["raw"](input);'],
    ["src/db/rides.ts", 'import * as k from "kysely";\nconst q = k.sql;'],
    ["src/db/rides.ts", 'import * as k from "kysely";\nconst { sql: q } = k;'],
    ["src/db/rides.ts", 'import * as k from "kysely";'],
    ["src/db/rides.ts", 'const k = await import("kysely");\nk.sql.raw(input);'],
    ["src/db/rides.ts", 'const k = import("kysely");'],
    ["src/db/rides.ts", 'const { sql: q } = await import("kysely");\nq.raw(input);'],
    ["src/db/rides.ts", '(await import("kysely")).sql.raw(input);'],
    ["src/app/page.tsx", 'import { sql as q } from "kysely";'],
    ["src/domain/placement.ts", "const q = sql;"],
    ["src/components/ride/card.tsx", "const q = sql;"],
    ["src/db/rides.test.ts", 'import { sql as q } from "kysely";'],
    // Migrations may use sql.raw, their tests may not (#28).
    ["src/db/migrations/0001_event.test.ts", 'import { sql as q } from "kysely";\nq.raw(input);'],
  ])("rejects an alias of sql in %s: %s", async (filePath, code) => {
    expect(await syntax(code, filePath)).toHaveLength(1);
  });

  it.each([
    'import { sql } from "kysely";\nsql`select 1`;',
    'const { sql } = await import("kysely");\nsql`select 1`;',
    "const { ref } = sql;",
    'export { sql } from "kysely";',
  ])("accepts sql under its own name: %s", async (code) => {
    expect(await syntax(code, "src/db/rides.ts")).toHaveLength(0);
  });

  // The `sql` of a CompiledQuery is a string: reading it is how one inspects generated SQL.
  it.each([
    ["src/db/rides.ts", "const text = query.compile().sql;"],
    ["src/db/rides.ts", "const { sql: text } = query.compile();"],
    ["src/db/rides.test.ts", "const { sql: text } = query.compile();"],
    ["src/db/rides.ts", "o.text = c.sql;"],
    ["src/db/rides.ts", 'const { sql = "" } = opts;'],
    ["src/db/rides.ts", 'function f({ sql = "" }) {\n  return sql;\n}'],
  ])("accepts another property named sql in %s: %s", async (filePath, code) => {
    expect(await syntax(code, filePath)).toHaveLength(0);
  });

  it("accepts it in a migration", async () => {
    expect(await properties("sql.raw(input);", "src/db/migrations/0001_event.ts")).toHaveLength(0);
    const alias = 'import { sql as q } from "kysely";\nq.raw(input);';
    expect(await syntax(alias, "src/db/migrations/0001_event.ts")).toHaveLength(0);
  });

  it("keeps rejecting .only in tests", async () => {
    expect(await properties('it.only("a", () => {});', "src/db/rides.test.ts")).toHaveLength(1);
  });
});
