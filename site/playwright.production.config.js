import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "production-smoke.spec.js",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "https://voxcourt.com/tennislive-match/",
    trace: "retain-on-failure",
  },
});
