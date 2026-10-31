import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The App Store app (docs/native-app-plan.md): a native shell that loads the live site,
 * so server components, actions and RLS work unchanged. Set CAP_SERVER_URL to the
 * production URL (same as APP_URL) before `npm run ios`.
 */
const url = process.env.CAP_SERVER_URL ?? "https://lifeflow.example";
const host = new URL(url).host;

const config: CapacitorConfig = {
  appId: "app.lifeflow",
  appName: "LifeFlow",
  webDir: "public",
  backgroundColor: "#f4f2ec",
  /** Lets the site know it runs inside the App Store app (purchases there must go through Apple). */
  appendUserAgent: "LifeFlowApp",
  server: { url, allowNavigation: [host, "cdn.plaid.com", "appleid.apple.com", "accounts.google.com", "checkout.stripe.com", "billing.stripe.com"] },
  ios: { contentInset: "never", scheme: "LifeFlow" },
};

export default config;
