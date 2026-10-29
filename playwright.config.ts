import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

/**
 * End-to-end tests run the production build (`next start`) against an
 * isolated database (E2E_DATABASE_URL) and a local fake OpenAI server that
 * speaks the Responses API wire format. Run `npm run build` first.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
const PORT = 3100;
// A throwaway key pair so the notification settings can be exercised (no real push service is reachable here).
const vapid = webpush.generateVAPIDKeys();

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(mobile|phone)\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // iPhone size, touch and user agent. Only Chromium is installed in this environment, so WebKit itself isn't exercised here.
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: [
    { command: "node tests/e2e/fake-openai.mjs", url: "http://127.0.0.1:4010", reuseExistingServer: false },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DB,
        ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
        OPENAI_API_KEY: "sk-e2e-test",
        OPENAI_MODEL: "gpt-5.5",
        OPENAI_BASE_URL: "http://127.0.0.1:4010/v1",
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:e2e@example.com",
        INBOX_DOMAIN: "in.example.com",
        INBOX_WEBHOOK_SECRET: "e2e-inbox-secret",
      },
    },
  ],
});
