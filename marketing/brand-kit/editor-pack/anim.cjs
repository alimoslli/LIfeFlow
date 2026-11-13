// The skylings moving, drawn by the app's own code (drawCompanion), one sprite frame every 180 ms like the app.
// Green-screen MP4s (pure #00FF00, keys cleanly because pixel art has no soft edges) and transparent PNG frames.
const { chromium } = require("playwright"); const path = require("path"); const fs = require("fs"); const { execSync } = require("child_process");
const E = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
  await p.goto("file://" + path.join(__dirname, "page.html"));
  await p.evaluate(() => {
    window.poseFrame = (key, pose, i, night, green) => {
      const LF = window.LF, info = LF.COMPANIONS.find((c) => c.key === key), cv = document.getElementById("c"), g = cv.getContext("2d");
      const sp = document.createElement("canvas"); LF.drawCompanion(sp, info, pose, i, night, false, false, false);
      cv.width = cv.height = 1080; g.clearRect(0, 0, 1080, 1080); if (green) { g.fillStyle = "#00FF00"; g.fillRect(0, 0, 1080, 1080); }
      g.imageSmoothingEnabled = false; g.drawImage(sp, 60, 60, 960, 960); return [info.name, sp.toDataURL()];
    };
  });
  const jobs = [];
  for (const k of ["dawn", "ray", "goldie", "star", "moon"]) for (const pose of ["idle", "wave", "celebrate", "think"]) jobs.push([k, pose, false]);
  for (const k of ["star", "moon"]) for (const pose of ["idle", "wave", "celebrate"]) jobs.push([k, pose, true]);
  for (const [k, pose, night] of jobs) {
    // how many distinct frames this pose has (the app loops them)
    const first = (await p.evaluate(([k, pose, n]) => window.poseFrame(k, pose, 0, n, false), [k, pose, night]))[1]; let n = 1;
    while (n < 16) { const d = (await p.evaluate(([k, pose, i, nn]) => window.poseFrame(k, pose, i, nn, false), [k, pose, n, night]))[1]; if (d === first) break; n++; }
    const name = (await p.evaluate(([k, pose, n]) => window.poseFrame(k, pose, 0, n, false), [k, pose, night]))[0];
    const tag = `${name}${night ? "-night" : ""}_${pose}`;
    const td = path.join(E, "skylings_transparent_frames", tag); fs.mkdirSync(td, { recursive: true });
    for (let i = 0; i < n; i++) { await p.evaluate(([k, pose, i, nn]) => window.poseFrame(k, pose, i, nn, false), [k, pose, i, night]); await p.locator("#c").screenshot({ path: path.join(td, `${String(i + 1).padStart(2, "0")}.png`), omitBackground: true }); }
    const gd = path.join(__dirname, "gtmp", tag); fs.mkdirSync(gd, { recursive: true });
    const loops = Math.max(2, Math.ceil(4 / (n * 0.18))), total = Math.round(loops * n * 0.18 * 30);
    for (let i = 0; i < n; i++) { await p.evaluate(([k, pose, i, nn]) => window.poseFrame(k, pose, i, nn, true), [k, pose, i, night]); await p.locator("#c").screenshot({ path: path.join(gd, `${i}.png`) }); }
    const list = []; for (let f = 0; f < total; f++) list.push(`file '${path.join(gd, `${Math.floor(f / 30 / 0.18) % n}.png`)}'\nduration ${1 / 30}`);
    fs.writeFileSync(path.join(gd, "list.txt"), list.join("\n") + `\nfile '${path.join(gd, "0.png")}'`);
    execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${path.join(gd, "list.txt")}" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 16 "${path.join(E, "skylings_greenscreen", tag + ".mp4")}"`);
    console.log(tag, "frames", n);
  }
  await b.close();
})();
