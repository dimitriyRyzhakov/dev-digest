// ESLint (flat config): Next.js core-web-vitals (incl. react-hooks + jsx-a11y)
// plus the frontend-architecture import rules
// (.claude/skills/frontend-architecture/SKILL.md — dependency direction).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import boundaries from "eslint-plugin-boundaries";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/vendor/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
      "boundaries/include": ["src/**/*"],
      // Layer map (outer → inner): app (routes) → components → lib → vendor.
      "boundaries/elements": [
        { type: "test-support", pattern: "src/test/**", mode: "full" },
        { type: "app", pattern: "src/app/**", mode: "full" },
        { type: "components", pattern: "src/components/**", mode: "full" },
        { type: "i18n", pattern: "src/i18n/**", mode: "full" },
        { type: "lib", pattern: "src/lib/**", mode: "full" },
        { type: "vendor", pattern: "src/vendor/**", mode: "full" },
      ],
    },
    rules: {
      // Imports point inward only. Shared code never reaches into routes.
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["app", "components", "lib", "vendor", "i18n"] },
            { from: "components", allow: ["components", "lib", "vendor"] },
            { from: "lib", allow: ["lib", "vendor"] },
            { from: "i18n", allow: ["lib", "vendor"] },
            { from: "vendor", allow: ["vendor"] },
            { from: "test-support", allow: ["app", "components", "lib", "vendor", "test-support"] },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*"],
              message: "Routes don't import other routes' internals. Promote shared code to src/components or src/lib.",
            },
            {
              group: ["../../../../*"],
              message: "Deep relative import crosses a folder boundary — use the @/ alias.",
            },
            {
              group: ["@devdigest/shared/index", "@devdigest/shared/index.*"],
              message: "Import runtime values from the contract file (@devdigest/shared/contracts/<x>).",
            },
          ],
        },
      ],
      // Components never fetch: data goes through src/lib/hooks → apiFetch.
      "no-restricted-globals": ["error", { name: "fetch", message: "Use a hook in src/lib/hooks (apiFetch)." }],
    },
  },
  {
    // The API client is the one place allowed to call fetch; tests mock it.
    files: ["src/lib/api.ts", "src/**/*.test.{ts,tsx}"],
    rules: { "no-restricted-globals": "off" },
  },
  {
    // Test files may load message JSON and fixtures from anywhere.
    files: ["src/**/*.test.{ts,tsx}"],
    rules: { "boundaries/element-types": "off" },
  },
];

export default config;
