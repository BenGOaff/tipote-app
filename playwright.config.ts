// playwright.config.ts
//
// Config minimaliste pour les tests E2E sur routes publiques (phase 7
// ROADMAP_RETENTION.md). On vise un filet de sécurité, pas une suite
// exhaustive.
//
// Lancement :
//   BASE_URL=https://app.tipote.com \
//   SMOKE_QUIZ_ID=<id-quiz-actif> \
//     npx playwright test
//
// Par défaut on tape la prod (BASE_URL=https://app.tipote.com). Pour
// tester en local : BASE_URL=http://localhost:3000.
//
// Pas de webServer auto-spawné : ces tests sont conçus pour valider une
// instance DÉJÀ déployée, pas pour exécuter un build local éphémère.

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://app.tipote.com";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
