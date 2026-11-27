// Automated checks on a finished render. Used by render.mjs; also runs on its own:  npm run qc -- <file.mp4>
// What a machine can check is checked here; what needs eyes (wording, taste, overlaps) is on the storyboard and the
// manual checklist in docs/STUDIO.md.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { APP_DIR, STUDIO } from "../webpack-override.mjs";

const DIMS = { "9x16": [1080, 1920], "1x1": [1080, 1080], "16x9": [1920, 1080] };
const ff = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stderr;
const sha = (f) => createHash("sha1").update(readFileSync(f)).digest("hex");

export async function runQc(file, m = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString());
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  const dur = Number(probe.format.duration);

  // 1. size, shape and frame rate
  const want = m.format ? DIMS[m.format].map((x) => (m.quality === "preview" ? x / 2 : x)) : null;
  if (want) add("Resolution and aspect ratio", v.width === want[0] && v.height === want[1] ? "pass" : "fail", `${v.width}x${v.height}, expected ${want.join("x")}`);
  const [n, d] = v.r_frame_rate.split("/").map(Number);
  add("Frame rate", Math.abs(n / d - 30) < 0.01 && v.avg_frame_rate === v.r_frame_rate ? "pass" : "fail", `${v.r_frame_rate} (avg ${v.avg_frame_rate})`);
  add("Codec for social apps", v.codec_name === "h264" && v.pix_fmt === "yuv420p" ? "pass" : "fail", `${v.codec_name} ${v.pix_fmt}`);
  if (m.seconds) add("Length", Math.abs(dur - m.seconds) < 0.1 ? "pass" : "fail", `${dur.toFixed(2)}s, expected ${m.seconds.toFixed(2)}s`);
  // 2. black frames and frozen picture
  const black = [...ff(["-i", file, "-vf", "blackdetect=d=0.35:pic_th=0.97", "-an", "-f", "null", "-"]).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((x) => `${(+x[1]).toFixed(2)}-${(+x[2]).toFixed(2)}s`);
  add("Black frames", black.length ? "fail" : "pass", black.length ? black.join(", ") : "none longer than 0.35 s");
  const frozen = [...ff(["-i", file, "-vf", "freezedetect=n=0.0008:d=2.5", "-an", "-f", "null", "-"]).matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((x) => `${(+x[1]).toFixed(1)}s for ${(+x[2]).toFixed(1)}s`);
  add("Broken or stuck animation (picture frozen 2.5 s+)", frozen.length ? "warn" : "pass", frozen.length ? frozen.join(", ") : "always moving");
  // 3. sound
  if (!a) add("Sound", "fail", "no audio track");
  else {
    const e = ff(["-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]);
    const I = Number([...e.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
    const tp = Number([...e.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1]);
    add("Loudness (social standard -14 LUFS)", Math.abs(I + 14) <= 1.5 ? "pass" : "warn", `${I} LUFS, true peak ${tp} dBFS`);
    const sil = [...ff(["-i", file, "-vn", "-af", "silencedetect=n=-45dB:d=1.5", "-f", "null", "-"]).matchAll(/silence_start: ([\d.]+)/g)].map((x) => `${(+x[1]).toFixed(1)}s`);
    add("Gaps in the sound", sil.length ? "warn" : "pass", sil.length ? `silence at ${sil.join(", ")}` : "none");
    const ad = Number(a.duration);
    add("Sound and picture line up (same length)", Math.abs(ad - Number(v.duration)) < 0.08 ? "pass" : "fail", `audio ${ad.toFixed(2)}s, video ${Number(v.duration).toFixed(2)}s`);
  }
  // 4. the app shown is the current app
  const now = existsSync(join(STUDIO, ".app-version.json")) ? JSON.parse(readFileSync(join(STUDIO, ".app-version.json"), "utf8")) : null;
  if (m.app && now) add("Rendered from the current app", m.app.commit === now.commit ? "pass" : "fail", `render ${m.app.commit.slice(0, 8)}, synced ${now.commit.slice(0, 8)}`);
  if (m.project) {
    const capDir = join(STUDIO, "public/captures");
    const used = (m.captures ?? []).length ? m.captures : [];
    const stale = [];
    for (const prof of existsSync(capDir) ? readdirSync(capDir) : [])
      for (const f of readdirSync(join(capDir, prof)).filter((f) => f.endsWith(".json"))) {
        const c = JSON.parse(readFileSync(join(capDir, prof, f), "utf8"));
        if (now && c.app !== now.commit && (!used.length || used.includes(`${prof}/${f.replace(".json", "")}`))) stale.push(`${prof}/${f.replace(".json", "")} (${c.app.slice(0, 8)})`);
      }
    add("App screens are from the current app", stale.length ? "warn" : "pass", stale.length ? `re-capture: ${stale.join(", ")}` : "all captures match the synced app");
  }
  // 5. the logo is the app's current one
  const brandApp = join(APP_DIR, "public/brand");
  const brandStudio = join(STUDIO, "public/app-brand");
  if (existsSync(brandApp)) {
    const diff = readdirSync(brandApp).filter((f) => !existsSync(join(brandStudio, f)) || sha(join(brandApp, f)) !== sha(join(brandStudio, f)));
    add("Brand files match the app", diff.length ? "fail" : "pass", diff.length ? `out of date: ${diff.join(", ")} (npm run sync-app)` : "logo files identical");
  }
  // 6. cost of rendering
  if (m.realtimeFactor) add("Render time", m.realtimeFactor > 120 ? "warn" : "pass", `${m.realtimeFactor}x realtime (${m.renderSec}s for ${m.seconds}s)`);
  if (m.peakMemoryMb) add("Memory", m.peakMemoryMb > 6000 ? "warn" : "pass", `peak ${m.peakMemoryMb} MB`);
  add("Manual review", "todo", "Wording, readability, overlaps and taste: check the storyboard and the draft (docs/STUDIO.md, 'Manual checks').");
  const verdict = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
  return { verdict, checks };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const mf = file.replace(/\.mp4$/, ".json");
  const r = await runQc(file, existsSync(mf) ? JSON.parse(readFileSync(mf, "utf8")) : {});
  for (const c of r.checks) console.log(`${c.status.padEnd(4)}  ${c.name}: ${c.detail}`);
  console.log(`verdict: ${r.verdict}`);
}
