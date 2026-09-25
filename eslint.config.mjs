import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A warning, not an error (decided 2026-09-25, before the client release).
      // `any` sits mostly at the Supabase boundary — untyped rows and joins —
      // and in test fixtures: ~780 uses, none of them a bug. Typing them all is
      // a large refactor with regression risk and no visible gain, so new code
      // should avoid `any`, and the warnings show where it remains.
      "@typescript-eslint/no-explicit-any": "warn",
      // A leading underscore marks an argument that has to be there for its
      // position (a route handler's request, an optional parameter kept for
      // callers) but is not read.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions run on Deno, not in the Next app these rules are
    // written for (they import by URL and use Deno globals).
    "supabase/functions/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
