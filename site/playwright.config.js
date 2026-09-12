import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "production-smoke.spec.js",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173/tennislive-match/",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && node tests/serve-static.mjs",
    url: "http://127.0.0.1:4173/tennislive-match/",
    reuseExistingServer: true,
  },
});
