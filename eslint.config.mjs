import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The layers of docs/agents/architecture.md ("Découpage d'une fonctionnalité").
// `@/db`, or a relative path climbing up to `src/db`.
const dbLayer = {
  regex: "^(@/|(\\.\\./)+)db(/|$)",
  message: "Database access lives in src/db: call it from a page, an action or a route.",
};
const noOnly = { property: "only", message: "Remove .only: it skips every other test." };
const noSqlRaw = {
  object: "sql",
  property: "raw",
  message: "sql.raw splices text into SQL unescaped: only migrations (src/db/migrations/) may.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The domain is pure functions: no SQL, no HTTP, no UI.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(kysely|pg|next|react|react-dom)(/|$)",
              message: "The domain stays pure: no SQL, no HTTP, no UI.",
            },
            dbLayer,
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [dbLayer] }] },
  },
  {
    ignores: ["src/db/migrations/**"],
    rules: { "no-restricted-properties": ["error", noSqlRaw] },
  },
  {
    // A forgotten `.only` silently skips every other test: caught here, not only in CI.
    // A later block replaces a rule's options instead of merging them, hence noSqlRaw again.
    files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
    rules: { "no-restricted-properties": ["error", noOnly, noSqlRaw] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
