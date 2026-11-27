// Point the studio at the latest LifeFlow app (origin/main) and pull its brand into the studio.
// - Keeps a read-only git worktree of origin/main at marketing/studio/.app (or LIFEFLOW_APP_DIR if you set it).
// - Extracts the colour tokens from the app's globals.css (light and dark) into src/app-bridge/brand.generated.json.
// - Copies the app's logo files into public/app-brand/.
// - Writes .app-version.json (commit, date, subject). Every render is stamped with it; QC fails a render made
//   from an older app than the one synced.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: STUDIO }).toString().trim();
const APP = process.env.LIFEFLOW_APP_DIR ? resolve(process.env.LIFEFLOW_APP_DIR) : join(STUDIO, ".app");
const git = (args, cwd = REPO) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

if (!process.env.LIFEFLOW_APP_DIR) {
  git(["fetch", "--quiet", "origin", "main"]);
  if (!existsSync(join(APP, ".git"))) git(["worktree", "add", "--detach", APP, "origin/main"]);
  else git(["checkout", "--quiet", "--detach", "origin/main"], APP);
}
const commit = git(["rev-parse", "HEAD"], APP);
const [date, subject] = git(["log", "-1", "--format=%cI%n%s"], APP).split("\n");

// brand tokens: every --custom-property in :root (light) and in the dark blocks
const css = readFileSync(join(APP, "src/app/globals.css"), "utf8");
const block = (re) => {
  const m = css.match(re);
  if (!m) return {};
  const out = {};
  for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[k] = v.trim();
  return out;
};
const light = block(/^:root\s*\{([\s\S]*?)^\}/m);
const dark = block(/^:root\[data-theme="dark"\]\s*\{([\s\S]*?)^\}/m);
const theme = block(/@theme[^{]*\{([\s\S]*?)^\}/m);
const fonts = [...readFileSync(join(APP, "src/app/layout.tsx"), "utf8").matchAll(/import \{([^}]+)\} from "next\/font\/google"/g)].flatMap((m) =>
  m[1].split(",").map((s) => s.trim().replace(/_/g, " ")),
);
mkdirSync(join(STUDIO, "src/app-bridge"), { recursive: true });
writeFileSync(join(STUDIO, "src/app-bridge/brand.generated.json"), JSON.stringify({ commit, light, dark, theme, fonts }, null, 1));

// logo files
const brandDir = join(STUDIO, "public/app-brand");
mkdirSync(brandDir, { recursive: true });
for (const f of readdirSync(join(APP, "public/brand"))) cpSync(join(APP, "public/brand", f), join(brandDir, f));

writeFileSync(join(STUDIO, ".app-version.json"), JSON.stringify({ commit, date, subject, appDir: APP, syncedAt: new Date().toISOString() }, null, 1));
console.log(`app ${commit.slice(0, 8)} (${date.slice(0, 10)}) "${subject}"\n${Object.keys(light).length} light / ${Object.keys(dark).length} dark tokens, fonts: ${fonts.join(", ")}`);
