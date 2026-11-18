// @ts-check
// The mechanical half of CODING_STANDARDS.md: every standard a tool can check
// lives here instead of in prose. Every rule is "error", never "warn":
// warnings pile up and nobody reads them.
//
// Hits that predate a rule are baselined in eslint-suppressions.json. A file
// may only lose suppressions: fix a hit, then run `npm run lint:prune`.
import vitest from "@vitest/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

const restrictedSyntax = [
  {
    selector: "TSAsExpression > CallExpression[callee.property.name='get']",
    message: "Parse form data with zod instead of casting `.get()`.",
  },
  {
    selector: "MemberExpression[object.name='sql'][property.name='raw']",
    message: "Use the sql`` template, never string-built SQL.",
  },
];

/** @type {import("eslint").Rule.RuleModule} */
const todoHasOwnerAndDate = {
  meta: {
    type: "suggestion",
    messages: {
      format: "Write `{{term}}(name, YYYY-MM-DD): ...` so it has an owner.",
    },
  },
  create: (context) => ({
    Program: () => {
      for (const comment of context.sourceCode.getAllComments()) {
        const term = comment.value.match(/\b(TODO|FIXME|XXX)\b/)?.[1];
        if (!term) continue;
        const owned = new RegExp(
          `\\b${term}\\([^,)]+, \\d{4}-\\d{2}-\\d{2}\\)`
        );
        if (owned.test(comment.value)) continue;
        context.report({
          loc: comment.loc ?? { line: 1, column: 0 },
          messageId: "format",
          data: { term },
        });
      }
    },
  }),
};

export default tseslint.config(
  { ignores: ["build/", ".react-router/"] },
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    plugins: {
      import: importPlugin,
      "jsx-a11y": jsxA11y,
      react,
      "react-hooks": reactHooks,
      unicorn,
      local: { rules: { "todo-has-owner-and-date": todoHasOwnerAndDate } },
      "@typescript-eslint": tseslint.plugin,
    },
    settings: { react: { version: "detect" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // React Router's `data()` and `redirect()` are meant to be thrown.
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            { from: "lib", name: "Response" },
            {
              from: "package",
              package: "react-router",
              name: "DataWithResponseInit",
            },
          ],
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-inferrable-types": "error",
      eqeqeq: "error",
      "prefer-const": "error",
      "no-var": "error",
      "no-console": ["error", { allow: ["error"] }],
      "no-useless-catch": "error",
      "prefer-arrow-callback": "error",
      "max-params": ["error", 3],
      "max-depth": ["error", 3],
      "max-lines": ["error", 500],
      "local/todo-has-owner-and-date": "error",
      "no-restricted-syntax": ["error", ...restrictedSyntax],
      "react-hooks/exhaustive-deps": "error",
      "react/jsx-key": "error",
      "react/no-array-index-key": "error",
      "react/jsx-no-target-blank": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
          ],
          pathGroups: [{ pattern: "~/**", group: "internal" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-default-export": "error",
      "unicorn/prevent-abbreviations": [
        "error",
        {
          // Route and module file names follow framework conventions.
          checkFilenames: false,
          // Idioms every reader of this stack already knows.
          replacements: {
            db: false,
            dev: false,
            i: false,
            j: false,
            // A course Module, not a JS module.
            mod: { module: false, courseModule: true },
            params: false,
            prop: false,
            props: false,
            ref: false,
          },
        },
      ],
    },
  },
  {
    // The framework loads these through their default export.
    files: ["app/root.tsx", "app/routes.ts", "app/routes/**"],
    rules: { "import/no-default-export": "off" },
  },
  {
    files: ["app/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...restrictedSyntax,
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Use a design token, not a raw hex colour.",
        },
      ],
    },
  },
  {
    files: ["app/**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": "error",
    },
  }
);
