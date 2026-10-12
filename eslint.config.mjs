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
    // Claude Code worktrees (build artifacts under .claude/worktrees/*/.next):
    ".claude/**",
    // Catch nested .next / node_modules from any source:
    "**/.next/**",
    "**/node_modules/**",
    // Node maintenance scripts (ESM parse quirks, not app code):
    "tools/**/*.mjs",
    // Worker MapLibre copy nguyên từ node_modules (xem
    // tools/sync-maplibre-worker.mjs) — code của thư viện, không lint:
    "public/maplibre/**",
  ]),
  {
    rules: {
      // Convention: identifiers prefixed with `_` are intentionally unused
      // (vd: `const { id: _omit, ...rest } = obj` để strip field).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // set-state-in-effect: các pattern hợp pháp trong app (URL ?prefill/?q
      // prefill, hydration-safe random greeting, async fetch lifecycle mark,
      // pagination reset on filter change). Downgrade từ error → warn để
      // visible mà không block build; fix từng cái nếu cần sau.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
