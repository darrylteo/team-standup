import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
    { name: "phone", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  ],
  // Tests get their own server and a fresh database each run, so nothing they write shows up in your dev app.
  webServer: {
    command: "npm run db:reset:local && npm run dev -- --port 5174 --strictPort",
    env: { STANDUP_STATE: ".wrangler/e2e" },
    url: "http://localhost:5174/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
