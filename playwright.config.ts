import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,   // tests share browser state (sign-in/sign-out flow)
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath:
        process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  // In CI: auto-start the Vite dev server before running tests.
  // Locally: reuse an already-running server (run `npm run dev` in frontend/ first).
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    cwd: "frontend",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_COGNITO_USER_POOL_ID: process.env.VITE_COGNITO_USER_POOL_ID ?? "",
      VITE_COGNITO_CLIENT_ID:    process.env.VITE_COGNITO_CLIENT_ID    ?? "",
      VITE_API_URL:              process.env.VITE_API_URL              ?? "",
      VITE_AWS_REGION:           process.env.VITE_AWS_REGION           ?? "us-east-1",
      VITE_RECAPTCHA_SITE_KEY:   process.env.VITE_RECAPTCHA_SITE_KEY   ?? "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
