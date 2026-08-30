// Correctness rules only. Prettier owns layout, and eslint-config-prettier
// switches off anything that would argue with it.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "backend/prisma/migrations/**",
      "frontend/tsconfig.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    rules: {
      // Its verdict depends on how strict the tsconfig is, and #81 turns on
      // noUncheckedIndexedAccess. It currently calls `batch[batch.length - 1]!`
      // unnecessary; under that flag it is required. Revisit once #81 lands.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",

      // The `\u0000` sentinels in the markdown excerpt and the header-injection
      // guard in safeReturnTo are deliberate. The rule cannot tell those from a
      // control character typed in by accident.
      "no-control-regex": "off",

      // Apollo and Prisma hand back `any` at their edges. Silencing these
      // per-site would be noisier than the rule is worth until the GraphQL
      // types are generated rather than hand-written.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/restrict-template-expressions": "off",

      // graphql's Kind is a const enum compared against string literals
      // throughout the maxRows visitor.
      "@typescript-eslint/no-unsafe-enum-comparison": "off",

      // An async method satisfying a sync interface (Apollo's plugin hooks) is
      // not a defect, and the test stubs mirror async APIs on purpose.
      "@typescript-eslint/require-await": "off",
    },
  },

  // The tsconfig.test.json of each project, not its tsconfig.json: the build
  // configs cover only src/, and the tests need type-aware rules too.
  {
    languageOptions: {
      parserOptions: {
        project: [
          "./backend/tsconfig.test.json",
          "./frontend/tsconfig.test.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plain-JS config files belong to no TypeScript project.
  {
    files: ["**/*.config.js", "eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ["backend/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["frontend/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // A warning, not an error: ArticleEditorPage fills its form from a query
      // in an effect. Restructuring that is its own change, not a lint fix.
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  // Vitest globals, and assertions on `any` from a GraphQL response are the
  // point of a test rather than a defect.
  {
    files: ["**/test/**/*.{ts,tsx}", "**/*.config.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  prettier,
);
