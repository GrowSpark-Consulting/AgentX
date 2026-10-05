import tseslint from "typescript-eslint";

// Same TypeScript rule set the frontend gets from eslint-config-next/typescript, without the
// React and Next.js rules.
export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ["node_modules/**"],
});
