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

describe("the domain stays pure", () => {
  it.each([
    'import { Kysely } from "kysely";',
    'import type { Kysely } from "kysely";',
    'import { jsonArrayFrom } from "kysely/helpers/postgres";',
    'import { Pool } from "pg";',
    'import { redirect } from "next/navigation";',
    'import { NextResponse } from "next/server";',
    'import { useState } from "react";',
    'import { db } from "@/db/client";',
    'import { db } from "../db/client";',
    'export { db } from "@/db/client";',
  ])("rejects %s", async (code) => {
    expect(await imports(code, "src/domain/placement.ts")).toHaveLength(1);
  });

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

  it("still accepts react and the rest of src", async () => {
    const code = 'import { useState } from "react";\nimport { cn } from "@/lib/utils";';
    expect(await imports(code, "src/components/ride/card.tsx")).toHaveLength(0);
  });

  it("leaves pages free to query", async () => {
    expect(await imports('import { db } from "@/db/client";', "src/app/page.tsx")).toHaveLength(0);
  });
});

describe("sql.raw is for migrations only", () => {
  it.each([
    ["src/db/rides.ts", "sql.raw(input);"],
    ["src/db/rides.ts", 'sql["raw"](input);'],
    ["src/db/rides.ts", "const { raw } = sql;"],
    ["src/app/page.tsx", "sql.raw(input);"],
    ["src/db/rides.test.ts", "sql.raw(input);"],
  ])("rejects it in %s: %s", async (filePath, code) => {
    expect(await properties(code, filePath)).toHaveLength(1);
  });

  it("accepts it in a migration", async () => {
    expect(await properties("sql.raw(input);", "src/db/migrations/0001_event.ts")).toHaveLength(0);
  });

  it("keeps rejecting .only in tests", async () => {
    expect(await properties('it.only("a", () => {});', "src/db/rides.test.ts")).toHaveLength(1);
  });
});
