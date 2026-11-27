// The studio imports LifeFlow's own drawing code (skylings, sky, icons) straight from the app checkout,
// so "@/..." inside those files resolves to the app's src/. Nothing is copied: a sync is a new app version.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = process.env.LIFEFLOW_APP_DIR ? resolve(process.env.LIFEFLOW_APP_DIR) : join(STUDIO, ".app");
if (!existsSync(join(APP_DIR, "src"))) throw new Error(`No LifeFlow app at ${APP_DIR}. Run: npm run sync-app`);

export const webpackOverride = (c) => ({
  ...c,
  resolve: { ...c.resolve, alias: { ...(c.resolve?.alias ?? {}), "@": join(APP_DIR, "src") } },
});
