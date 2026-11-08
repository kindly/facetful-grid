import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
// Firefox and WebKit run when installed (`npx playwright install firefox webkit`).
const browsers = (process.env.FG_BROWSERS || "chromium,firefox,webkit").split(",");

export default defineConfig({
  testDir: "test/browser",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}/`, viewport: { width: 1200, height: 800 } },
  webServer: { command: `PORT=${PORT} node scripts/serve.mjs`, url: `http://127.0.0.1:${PORT}/demo/`, reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1200, height: 800 } }, testIgnore: /touch/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1200, height: 800 } }, testIgnore: /touch|perf/ },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1200, height: 800 } }, testIgnore: /touch|perf/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /touch/ },
  ].filter((p) => browsers.includes(p.name === "mobile" ? "chromium" : p.name)),
});
