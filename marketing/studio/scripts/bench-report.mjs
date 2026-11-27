// Writes docs/BENCHMARKS.md from the render manifests (real measurements only).  npm run bench-report
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STUDIO } from "../webpack-override.mjs";

const rows = [];
for (const p of readdirSync(join(STUDIO, "projects"))) {
  const d = join(STUDIO, "projects", p, "renders");
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((f) => f.endsWith(".json"))) rows.push(JSON.parse(readFileSync(join(d, f), "utf8")));
}
rows.sort((a, b) => a.madeAt.localeCompare(b.madeAt));
const scenes = rows.flatMap((r) => r.scenes.filter((s) => !s.cached).map((s) => ({ ...s, project: r.project, format: r.format, quality: r.quality, x: Math.round((s.renderSec / s.seconds) * 10) / 10, machine: r.machine })));
const md = `# Measured render performance

Written by \`npm run bench-report\` from the render manifests. Only real measurements; nothing estimated.

Machine for these runs: ${rows[0]?.machine ? `${rows[0].machine.cpus} CPU cores (${rows[0].machine.model}), no GPU: WebGL is drawn in software (SwiftShader)` : "n/a"}.

## Whole renders

| Project | Format | Quality | Video | Render time | x realtime | Peak memory | Cached scenes | QC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((r) => `| ${r.project} v${r.version} | ${r.format} | ${r.quality} | ${r.seconds}s | ${r.renderSec}s | ${r.realtimeFactor} | ${r.peakMemoryMb} MB | ${r.scenes.filter((s) => s.cached).length}/${r.scenes.length} | ${r.qc.verdict} |`).join("\n")}

## Scenes rendered (not from cache)

| Project / scene | Format | Quality | Kind | Seconds | Render time | x realtime |
| --- | --- | --- | --- | --- | --- | --- |
${scenes.map((s) => `| ${s.project} / ${s.id} | ${s.format} | ${s.quality} | ${s.mode} | ${s.seconds}s | ${s.renderSec}s | ${s.x} |`).join("\n")}

## Reading it

- 2D scenes (type, the app's pixel skylings, notifications, HUD) render at a few seconds per second of video or faster.
- 3D scenes (phones, voxel skylings, the city) are the slow part here because there's no GPU: software WebGL. On a machine with a GPU (an Apple silicon MacBook draws WebGL with Metal; a rented L40S box with real GL) they get much faster; time one there and the table will show it.
- The scene cache is the biggest saving: a change to one scene re-renders only that scene.
`;
writeFileSync(join(STUDIO, "docs/BENCHMARKS.md"), md);
console.log(`docs/BENCHMARKS.md: ${rows.length} renders, ${scenes.length} scenes`);
