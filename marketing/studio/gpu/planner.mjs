// The GPU planner: turns a list of generation jobs into the cheapest suitable plan, and compares it with hosted models.
//   node gpu/planner.mjs gpu/benchmark-plan.json
// It never rents anything. It prints a plan (box, model order, batches, estimated credits, the cap to approve) that
// Claude carries out with the Higgsfield tools after the owner says yes (see docs/GPU.md for the steps).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const cat = JSON.parse(readFileSync(join(HERE, "catalog.json"), "utf8"));

/**
 * Seconds per item on each GPU and minutes to load a model: measured where we have runs, otherwise a cautious guess
 * (marked "guess"). Load time is paid every time the model on a box changes, so jobs are grouped by model.
 */
export const SPEED = {
  "z-image-turbo": { load: 4, perItem: { L40S: 6, "RTX-PRO-6000": 4, H100: 3 }, basis: "guess (8-step distilled model)" },
  "z-image-base": { load: 4, perItem: { L40S: 25, "RTX-PRO-6000": 16, H100: 12 }, basis: "guess" },
  "qwen-image": { load: 6, perItem: { "RTX-PRO-6000": 45, H100: 35, H200: 30 }, basis: "guess" },
  "ltx-video": { load: 4, perItem: { L40S: 90, "RTX-PRO-6000": 60, H100: 45 }, basis: "guess (5 s 720p clip)" },
  "wan-2-2-t2v-a14b": { load: 8, perItem: { L40S: 1500, "RTX-PRO-6000": 840, H100: 600, H200: 520 }, basis: "RTX PRO 6000 measured 14 min per 5 s clip (2026-11-21); others scaled" },
  "wan-2-1-i2v-14b-480p": { load: 7, perItem: { "RTX-PRO-6000": 420, H100: 300, H200: 260 }, basis: "guess (5 s 480p)" },
};
const STOP_BUFFER_MIN = 3; // checking results, downloading, stopping: always paid

export function plan(jobs) {
  const byModel = {};
  for (const j of jobs) (byModel[j.model] ??= []).push(j);
  const steps = [];
  for (const [model, js] of Object.entries(byModel)) {
    const m = cat.models[model];
    if (!m) throw new Error(`Unknown model ${model}`);
    if (m.blocked) {
      steps.push({ model, skipped: true, why: m.licence });
      continue;
    }
    const sp = SPEED[model];
    const items = js.reduce((a, j) => a + (j.count ?? 1), 0);
    const options = Object.entries(sp.perItem)
      .filter(([g]) => m.gpus.includes(g) && cat.gpus[g])
      .map(([g, s]) => {
        const minutes = sp.load + (items * s) / 60 + STOP_BUFFER_MIN;
        return { gpu: g, minutes: Math.round(minutes * 10) / 10, credits: Math.round(((cat.gpus[g].creditsPerHour * minutes) / 60) * 10) / 10 };
      })
      .sort((a, b) => a.credits - b.credits);
    steps.push({ model, items, jobs: js.map((j) => j.id), basis: sp.basis, pick: options[0], others: options.slice(1) });
  }
  // one box per GPU type: models that share the cheapest GPU run back to back on the same box
  const boxes = {};
  for (const s of steps.filter((s) => !s.skipped)) (boxes[s.pick.gpu] ??= []).push(s);
  const total = steps.filter((s) => !s.skipped).reduce((a, s) => a + s.pick.credits, 0);
  return {
    boxes: Object.entries(boxes).map(([gpu, ss]) => ({ gpu, creditsPerHour: cat.gpus[gpu].creditsPerHour, models: ss.map((s) => s.model), minutes: ss.reduce((a, s) => a + s.pick.minutes, 0) })),
    steps,
    estimateCredits: Math.round(total),
    approveUpTo: Math.ceil(total * 1.3),
    note: "Estimates use measured speeds where we have them and cautious guesses elsewhere (see basis). The cap to approve is the estimate plus 30%.",
  };
}
/** What the same video seconds would cost on hosted MAGI-2, for a fair comparison. */
export const hostedMagi = (seconds) => Math.ceil(seconds) * cat.hosted.magi_2.creditsPerSecond;

if (process.argv[2]) {
  const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const p = plan(spec.jobs);
  const videoSecs = spec.jobs.filter((j) => cat.models[j.model]?.kind === "video" && !cat.models[j.model]?.blocked).reduce((a, j) => a + (j.count ?? 1) * (j.seconds ?? 5), 0);
  p.compare = { videoSeconds: videoSecs, hostedMagi2Credits: hostedMagi(videoSecs) };
  writeFileSync(process.argv[2].replace(/\.json$/, ".plan.json"), JSON.stringify(p, null, 1));
  for (const b of p.boxes) console.log(`box ${b.gpu} (${b.creditsPerHour}/h): ${b.models.join(" -> ")}, about ${Math.round(b.minutes)} min`);
  for (const s of p.steps) console.log(s.skipped ? `  skip ${s.model}: ${s.why}` : `  ${s.model}: ${s.items} items on ${s.pick.gpu}, ~${s.pick.minutes} min, ~${s.pick.credits} credits (${s.basis})`);
  console.log(`estimate ${p.estimateCredits} credits, approve up to ${p.approveUpTo}. Same video seconds on hosted MAGI-2: ${p.compare.hostedMagi2Credits} credits.`);
}
