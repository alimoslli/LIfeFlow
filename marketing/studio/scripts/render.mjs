// Render a video project, scene by scene, with a cache.
//   npm run render -- <project> [--format 9x16|1x1|16x9|all] [--preview] [--only scene1,scene2] [--storyboard]
// --preview   half resolution, fast encode (for checking timing and layout)
// --only      re-render just these scenes; every other scene reuses its last render (selective revisions)
// --storyboard one still from the middle of each scene, as a contact sheet (seconds, not minutes)
// Output: projects/<id>/renders/<id>_<format>_<final|preview>_v<N>.mp4 + a manifest .json (cache hits, times, memory,
// app version, QC). Scene renders are cached in cache/scenes/ by a hash of the code, the app version and the captures.
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";
import { STUDIO, webpackOverride } from "../webpack-override.mjs";
import { runQc } from "./qc.mjs";

const args = process.argv.slice(2);
const pid = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
if (!pid) throw new Error("Usage: npm run render -- <project> [--format 9x16] [--preview] [--only a,b] [--storyboard]");
const preview = Boolean(opt("preview", false));
const only = opt("only", "") ? String(opt("only")).split(",") : [];
const quality = preview ? "preview" : "final";
const BROWSER = process.env.REMOTION_BROWSER ?? "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const app = JSON.parse(readFileSync(join(STUDIO, ".app-version.json"), "utf8"));

// --- what changed: a hash over the studio code, plus the project's own file and captures
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const hashFiles = (files) => {
  const h = createHash("sha1");
  for (const f of files.sort()) h.update(relative(STUDIO, f)).update(readFileSync(f));
  return h.digest("hex");
};
const kitHash = hashFiles([...walk(join(STUDIO, "src/kit")), ...walk(join(STUDIO, "src/app-bridge")), join(STUDIO, "src/Root.tsx"), ...walk(join(STUDIO, "public/fonts")), ...walk(join(STUDIO, "public/app-brand"))]);

const t0 = Date.now();
console.log("bundling…");
const serveUrl = await bundle({ entryPoint: join(STUDIO, "src/index.ts"), webpackOverride, publicDir: join(STUDIO, "public") });
const comps = await getCompositions(serveUrl, { browserExecutable: BROWSER });
const full = comps.find((c) => c.id === `${pid}-full`);
if (!full) throw new Error(`No project "${pid}". Projects: ${comps.filter((c) => c.id.endsWith("-full")).map((c) => c.id.replace(/-full$/, "")).join(", ")}`);
const meta = full.defaultProps.meta;
const projFile = readdirSync(join(STUDIO, "src/projects")).map((f) => join(STUDIO, "src/projects", f)).find((f) => readFileSync(f, "utf8").includes(`id: "${pid}"`));
const capFiles = meta.captures.flatMap((c) => [join(STUDIO, "public/captures", `${c}.mp4`)]).filter(existsSync);
const projHash = hashFiles([projFile, ...capFiles]);
const fmtArg = opt("format", meta.formats[0]);
const formats = fmtArg === "all" ? meta.formats : [fmtArg];

// --- watch memory: the browser's processes plus this one, sampled once a second
let peakMb = 0;
const sampler = setInterval(() => {
  try {
    const out = execFileSync("ps", ["-eo", "rss,comm"]).toString();
    const mb = out.split("\n").filter((l) => /chrome|headless|node|remotion/i.test(l)).reduce((a, l) => a + (parseInt(l, 10) || 0), 0) / 1024;
    peakMb = Math.max(peakMb, mb);
  } catch {}
}, 1000);

const outDir = join(STUDIO, "projects", pid, "renders");
mkdirSync(outDir, { recursive: true });
// the dashboard reads the project's scenes from here, and the live progress from cache/status.json
writeFileSync(join(STUDIO, "projects", pid, "project.json"), JSON.stringify(meta, null, 1));
const status = (o) => writeFileSync(join(STUDIO, "cache/status.json"), JSON.stringify({ project: pid, at: new Date().toISOString(), ...o }));
for (const ev of ["uncaughtException", "unhandledRejection"])
  process.on(ev, (e) => {
    status({ state: "failed", error: String(e?.message ?? e).slice(0, 400) });
    console.error(e);
    process.exit(1);
  });
const results = [];
for (const format of formats) {
  const inputProps = { format };
  if (opt("storyboard", false)) {
    const dir = join(STUDIO, "projects", pid, "storyboard");
    mkdirSync(dir, { recursive: true });
    const stills = [];
    for (const s of meta.scenes) {
      const comp = comps.find((c) => c.id === `${pid}-${s.id}`);
      const c = { ...comp, ...(await getCompositions(serveUrl, { inputProps, browserExecutable: BROWSER })).find((x) => x.id === comp.id) };
      const out = join(STUDIO, "cache", `sb_${pid}_${s.id}_${format}.png`);
      await renderStill({ serveUrl, composition: c, frame: Math.floor(c.durationInFrames * 0.6), output: out, inputProps, scale: 0.4, browserExecutable: BROWSER, chromiumOptions: { gl: "swangle" } });
      stills.push([out, `${s.id} · ${s.seconds}s · ${s.mode}`]);
    }
    const sheet = join(dir, `${pid}_${format}.jpg`);
    execFileSync("python3", ["-c", `
import sys, json; from PIL import Image, ImageDraw, ImageFont
items = json.loads(sys.argv[1]); ims = [Image.open(p).convert("RGB") for p, _ in items]
w, h = ims[0].size; pad = 40; s = Image.new("RGB", (len(ims) * (w + 12) + 12, h + pad + 12), (14, 18, 32)); d = ImageDraw.Draw(s)
f = ImageFont.truetype(sys.argv[3], 22)
for i, (im, (_, label)) in enumerate(zip(ims, items)):
    s.paste(im, (12 + i * (w + 12), 12)); d.text((12 + i * (w + 12), h + 18), label, fill=(230, 236, 248), font=f)
s.save(sys.argv[2], quality=88)`, JSON.stringify(stills), sheet, join(STUDIO, "public/fonts/Geist-Medium.ttf")]);
    console.log("storyboard", relative(STUDIO, sheet));
    results.push({ format, storyboard: relative(STUDIO, sheet) });
    continue;
  }
  const sceneFiles = [];
  const scenesOut = [];
  for (const s of meta.scenes) {
    const id = `${pid}-${s.id}`;
    const key = createHash("sha1").update([id, format, quality, kitHash, projHash, app.commit].join("|")).digest("hex").slice(0, 16);
    const dir = join(STUDIO, "cache/scenes", pid, format, quality);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${s.id}_${key}.mp4`);
    const latest = readdirSync(dir).filter((f) => f.startsWith(`${s.id}_`)).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    const reuse = only.length && !only.includes(s.id) && latest ? latest : existsSync(file) ? file : null;
    const ts = Date.now();
    if (!reuse) {
      const comp = (await getCompositions(serveUrl, { inputProps, browserExecutable: BROWSER })).find((c) => c.id === id);
      let last = -1;
      await renderMedia({
        serveUrl,
        composition: comp,
        inputProps,
        codec: "h264",
        crf: preview ? 30 : 16,
        x264Preset: preview ? "veryfast" : "medium",
        scale: preview ? 0.5 : 1,
        muted: true,
        pixelFormat: "yuv420p",
        imageFormat: "jpeg",
        jpegQuality: preview ? 70 : 92,
        concurrency: Math.max(1, cpus().length - 1),
        outputLocation: file,
        browserExecutable: BROWSER,
        chromiumOptions: { gl: "swangle" },
        onProgress: ({ progress }) => {
          const p = Math.floor(progress * 10);
          if (p !== last) (last = p), process.stdout.write(`\r${format} ${s.id}: ${p * 10}%   `), status({ state: "rendering", format, quality, scene: s.id, progress: p / 10 });
        },
      });
      process.stdout.write("\n");
    }
    const used = reuse ?? file;
    sceneFiles.push(used);
    scenesOut.push({ id: s.id, mode: s.mode, seconds: s.seconds, cached: Boolean(reuse), renderSec: reuse ? 0 : Math.round((Date.now() - ts) / 100) / 10, file: relative(STUDIO, used) });
    console.log(`${format} ${s.id}: ${reuse ? "cached" : `rendered in ${scenesOut.at(-1).renderSec}s`}`);
  }
  // --- join the scenes (same encoder settings, so no re-encode), then lay the sound under them
  const v = readdirSync(outDir).filter((f) => f.startsWith(`${pid}_${format}_${quality}_v`) && f.endsWith(".mp4")).length + 1;
  const base = join(outDir, `${pid}_${format}_${quality}_v${v}`);
  const list = join(STUDIO, "cache", `concat_${pid}.txt`);
  writeFileSync(list, sceneFiles.map((f) => `file '${f}'`).join("\n"));
  const silent = join(STUDIO, "cache", `silent_${pid}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);
  const total = meta.scenes.reduce((a, s) => a + Math.round(s.seconds * 30), 0) / 30;
  const inputs = [];
  const chains = [];
  if (meta.music) {
    inputs.push("-ss", String(meta.music.from ?? 0), "-i", join(STUDIO, "public", meta.music.file));
    chains.push(`[1:a]atrim=0:${total},asetpts=N/SR/TB,volume=${meta.music.gain ?? -10}dB,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 1.4)}:d=1.4[m]`);
  }
  meta.cues.forEach((c, i) => {
    inputs.push("-i", join(STUDIO, "public/audio", `${c.sfx}.wav`));
    const ms = Math.round(c.t * 1000);
    chains.push(`[${i + (meta.music ? 2 : 1)}:a]adelay=${ms}|${ms},volume=${c.gain ?? -8}dB[c${i}]`);
  });
  const labels = [...(meta.music ? ["[m]"] : []), ...meta.cues.map((_, i) => `[c${i}]`)];
  const mix = `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${total},loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[a]`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, ...inputs, "-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", `${base}.mp4`]);
  const renderSec = scenesOut.reduce((a, s) => a + s.renderSec, 0);
  const manifest = {
    project: pid,
    captures: meta.captures,
    title: meta.title,
    format,
    quality,
    version: v,
    file: relative(STUDIO, `${base}.mp4`),
    seconds: total,
    app: { commit: app.commit, date: app.date, subject: app.subject },
    scenes: scenesOut,
    renderSec,
    realtimeFactor: Math.round((renderSec / total) * 10) / 10,
    peakMemoryMb: Math.round(peakMb),
    machine: { cpus: cpus().length, model: cpus()[0]?.model, gpu: "none (software WebGL)" },
    cost: { paidCredits: 0, paidUsd: 0, note: "Code only: rendered locally, no paid generation." },
    madeAt: new Date().toISOString(),
  };
  manifest.qc = await runQc(`${base}.mp4`, manifest);
  writeFileSync(`${base}.json`, JSON.stringify(manifest, null, 1));
  // the cost ledger for the project (local renders are free; paid generation is added by hand when approved)
  const ledgerFile = join(STUDIO, "projects", pid, "costs.json");
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) : [];
  ledger.push({ at: manifest.madeAt, kind: "local-render", what: `${format} ${quality} v${v}`, renderSec, credits: 0, usd: 0 });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
  results.push(manifest);
  console.log(`→ ${manifest.file}  (${total}s video, ${renderSec}s rendering, ${manifest.realtimeFactor}x realtime, peak ${manifest.peakMemoryMb} MB, QC ${manifest.qc.verdict})`);
  for (const c of manifest.qc.checks.filter((c) => c.status !== "pass")) console.log(`   ${c.status.toUpperCase()} ${c.name}: ${c.detail}`);
}
clearInterval(sampler);
status({ state: "idle", last: results.at(-1)?.file ?? null });
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
