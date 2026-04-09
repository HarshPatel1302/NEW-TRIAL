import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: serves `build/` (run `npm run build` before `npm run test:e2e`).
 * Set CI=1 to fail on .only and enable retries; reuseExistingServer allows a manual `serve` while iterating.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx serve -s build -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
