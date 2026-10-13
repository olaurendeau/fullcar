import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The layers of docs/agents/architecture.md ("Découpage d'une fonctionnalité").
// `@/db`, or a relative path climbing up to `src/db`.
const dbLayer = {
  regex: "^(@/|(\\.\\./)+)db(/|$)",
  message: "Database access lives in src/db: call it from a page, an action or a route.",
};
const sqlHttpUi = {
  regex: "^(kysely|pg|next|react|react-dom)(/|$)",
  message: "The domain stays pure: no SQL, no HTTP, no UI.",
};

// no-restricted-imports only sees import and export declarations. These selectors catch
// `import("…")`, `import(`…`)` and the type `import("…").T` on the same paths.
// A path computed at run time (`import(name)`) is left to the review.
const noDynamicImport = ({ regex, message }) => {
  const path = `/${regex.replaceAll("/", "\\/")}/`;
  return [
    `ImportExpression > Literal.source[value=${path}]`,
    `ImportExpression > TemplateLiteral.source > TemplateElement[value.cooked=${path}]`,
    `TSImportType > Literal.source[value=${path}]`,
  ].map((selector) => ({ selector, message }));
};

const noOnly = { property: "only", message: "Remove .only: it skips every other test." };
const noSqlRaw = {
  object: "sql",
  property: "raw",
  message: "sql.raw splices text into SQL unescaped: only migrations (src/db/migrations/) may.",
};
// no-restricted-properties only knows the name `sql`: under another name, sql.raw would pass.
// Only Kysely's `sql` is followed, never a property that happens to be named `sql` (the
// `sql` string of a CompiledQuery): a namespace of kysely is refused rather than `k.sql`.
// Handing `sql` to a function, storing it in an object or re-exporting kysely from a local
// module is left to the review.
const noSqlAlias = [
  'ImportSpecifier[imported.name="sql"][local.name!="sql"]',
  'ExportSpecifier[local.name="sql"][exported.name!="sql"]',
  'VariableDeclarator[id.type="Identifier"][id.name!="sql"][init.type="Identifier"][init.name="sql"]',
  'AssignmentExpression[left.name!="sql"][right.type="Identifier"][right.name="sql"]',
  // Namespaces: `import * as k`, `const k = await import("kysely")`, `(await import("kysely")).sql`.
  'ImportDeclaration[source.value="kysely"] > ImportNamespaceSpecifier',
  'VariableDeclarator[id.type="Identifier"]:matches([init.source.value="kysely"], [init.argument.source.value="kysely"])',
  'MemberExpression[property.name="sql"][object.argument.source.value="kysely"]',
  // `const { sql: q } = await import("kysely")`.
  'VariableDeclarator[init.argument.source.value="kysely"] > ObjectPattern.id > Property[key.name="sql"][value.type="Identifier"][value.name!="sql"]',
].map((selector) => ({
  selector,
  message: "Import sql by name from kysely and keep that name: the sql.raw rule only sees `sql`.",
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["src/db/migrations/**"],
    rules: {
      "no-restricted-properties": ["error", noSqlRaw],
      "no-restricted-syntax": ["error", ...noSqlAlias],
    },
  },
  // A later block replaces a rule's options instead of merging them, hence noSqlAlias again.
  {
    // The domain is pure functions: no SQL, no HTTP, no UI.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [sqlHttpUi, dbLayer] }],
      "no-restricted-syntax": [
        "error",
        ...noDynamicImport(sqlHttpUi),
        ...noDynamicImport(dbLayer),
        ...noSqlAlias,
      ],
    },
  },
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [dbLayer] }],
      "no-restricted-syntax": ["error", ...noDynamicImport(dbLayer), ...noSqlAlias],
    },
  },
  {
    // A forgotten `.only` silently skips every other test: caught here, not only in CI.
    // A later block replaces a rule's options instead of merging them, hence noSqlRaw again.
    files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
    rules: { "no-restricted-properties": ["error", noOnly, noSqlRaw] },
  },
  {
    // Migrations may use sql.raw, their tests may not: the first block ignores them all.
    files: ["src/db/migrations/**/*.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...noSqlAlias] },
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
