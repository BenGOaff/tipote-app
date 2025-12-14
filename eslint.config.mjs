import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Ignore ce qui n'est pas du runtime (tooling local)
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Tooling/scripts : pas critique pour la prod, et souvent en CJS
    "scripts/**",
  ]),

  // Autoriser `any` uniquement là où c'est normal (webhooks/payloads externes)
  {
    files: [
      "app/api/**/*.ts",
      "lib/systemeIoClient.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
