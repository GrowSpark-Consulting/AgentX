import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Frozen reference copies of the frontend exports, merged into src/ (see
    // docs/frontend-architecture-map.md). Remove these entries when the folders are deleted.
    "pakka-app/**",
    "pakka-onboarding/**",
    // Playwright output
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
