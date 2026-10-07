import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The frontend acts only as the signed-in user. Of @pakka/backend it may use the helpers that run
    // on the caller's own Supabase client (row-level security). Everything else, including the
    // service-role client and server secrets, belongs to the API (backend/, on Railway).
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@pakka/backend(?!/(lib/tenant|channels/whatsapp/connections)$)",
              message:
                "Server-only code runs on the API (backend/, Railway): call it through lib/api/client.ts. The frontend may import only @pakka/backend/lib/tenant and @pakka/backend/channels/whatsapp/connections.",
            },
          ],
        },
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
