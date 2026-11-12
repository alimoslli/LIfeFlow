// Builds starlight.html: the page (game.html) with the real skyling art (engine-entry.ts, bundled from src/) and the game
// (game.js) inlined, so it runs as one file. Usage: node docs/design/2026-11-12-starlight/build.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const out = join(mkdtempSync(join(tmpdir(), "starlight-")), "engine.js");
const esbuild = process.env.ESBUILD || "npx";
const args = ["docs/design/2026-11-12-starlight/engine-entry.ts", "--bundle", "--format=iife", "--minify", "--tsconfig=tsconfig.json", `--outfile=${out}`];
execFileSync(esbuild, esbuild === "npx" ? ["--yes", "esbuild@0.24.0", ...args] : args, { cwd: root, stdio: "inherit" });
const engine = readFileSync(out, "utf8");
const game = readFileSync(join(here, "game.js"), "utf8");
const page = readFileSync(join(here, "game.html"), "utf8")
  .replace("/*ENGINE*/", () => engine.replace(/<\/script/gi, "<\\/script"))
  .replace("/*GAME*/", () => game.replace(/<\/script/gi, "<\\/script"));
writeFileSync(join(here, "starlight.html"), page);
console.log(`starlight.html: ${(page.length / 1024).toFixed(1)} KB`);
