import { defineConfig } from "@playwright/test";

// CHROMIUM_PATH lets a machine with a preinstalled Chromium skip `npx playwright install chromium`.
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", launchOptions: { executablePath }, trace: "off" },
  webServer: { command: "node serve.mjs 4173", url: "http://127.0.0.1:4173/", reuseExistingServer: false },
});
