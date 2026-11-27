// LifeFlow Creative Studio dashboard: a small local web app (no packages) for the owner to send concepts, watch drafts,
// compare versions, ask for scene changes and see costs.
//   npm run dashboard            -> http://localhost:4100 on the MacBook
//   HOST=0.0.0.0 STUDIO_TOKEN=... npm run dashboard   -> reachable from a phone on the same Wi-Fi (the token is required then)
// Requests are saved as files in requests/; Claude picks them up and does the work (renders, GPU plans need a yes).
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { STUDIO } from "../webpack-override.mjs";

const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST ?? "127.0.0.1";
const TOKEN = process.env.STUDIO_TOKEN ?? "";
if (HOST !== "127.0.0.1" && HOST !== "localhost" && !TOKEN) throw new Error("Set STUDIO_TOKEN when the dashboard is reachable from other devices.");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".ttf": "font/ttf", ".js": "text/javascript" };
const read = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
function state() {
  const pdir = join(STUDIO, "projects");
  const projects = (existsSync(pdir) ? readdirSync(pdir) : []).filter((d) => existsSync(join(pdir, d, "project.json"))).map((id) => {
    const meta = read(join(pdir, id, "project.json"), {});
    const rdir = join(pdir, id, "renders");
    const renders = (existsSync(rdir) ? readdirSync(rdir) : []).filter((f) => f.endsWith(".json")).map((f) => read(join(rdir, f), null)).filter(Boolean).sort((a, b) => b.madeAt.localeCompare(a.madeAt));
    const sb = join(pdir, id, "storyboard");
    return { ...meta, renders, storyboards: existsSync(sb) ? readdirSync(sb).map((f) => `projects/${id}/storyboard/${f}`) : [], costs: read(join(pdir, id, "costs.json"), []) };
  });
  const rq = join(STUDIO, "requests");
  return {
    app: read(join(STUDIO, ".app-version.json"), null),
    status: read(join(STUDIO, "cache/status.json"), { state: "idle" }),
    projects,
    requests: (existsSync(rq) ? readdirSync(rq) : []).filter((f) => f.endsWith(".json")).map((f) => read(join(rq, f), null)).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at)),
    gpu: { catalog: read(join(STUDIO, "gpu/catalog.json"), {}), measured: read(join(STUDIO, "gpu/measured.json"), {}), benchmark: read(join(STUDIO, "gpu/benchmark-plan.plan.json"), null) },
    captures: existsSync(join(STUDIO, "public/captures")) ? readdirSync(join(STUDIO, "public/captures")).flatMap((p) => readdirSync(join(STUDIO, "public/captures", p)).filter((f) => f.endsWith(".json")).map((f) => ({ id: `${p}/${f.replace(".json", "")}`, ...read(join(STUDIO, "public/captures", p, f), {}) }))) : [],
  };
}
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function file(req, res, rel) {
  const p = normalize(join(STUDIO, rel));
  const allowed = ["projects", "public", "cache/scenes"].some((d) => p.startsWith(join(STUDIO, d)));
  if (!allowed || !existsSync(p) || statSync(p).isDirectory()) return send(res, 404, { error: "not found" });
  const size = statSync(p).size;
  const type = TYPES[extname(p)] ?? "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = Number(range[1] || 0);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  createReadStream(p).pipe(res);
}
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (TOKEN && url.searchParams.get("t") !== TOKEN && req.headers["x-studio-token"] !== TOKEN) return send(res, 401, { error: "token" });
  if (url.pathname === "/") return send(res, 200, readFileSync(join(STUDIO, "dashboard/index.html")), TYPES[".html"]);
  if (url.pathname === "/api/state") return send(res, 200, state());
  if (url.pathname.startsWith("/files/")) return file(req, res, decodeURIComponent(url.pathname.slice(7)));
  if (url.pathname === "/api/requests" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c).length > 20000 && req.destroy());
    req.on("end", () => {
      let r;
      try {
        r = JSON.parse(body);
      } catch {
        return send(res, 400, { error: "Send JSON." });
      }
      const kind = ["concept", "change", "variations", "approve-gpu"].includes(r.kind) ? r.kind : "concept";
      const text = String(r.text ?? "").trim().slice(0, 4000);
      if (!text) return send(res, 400, { error: "Write what you want first." });
      const at = new Date().toISOString();
      const rec = { id: at.replace(/[:.]/g, "-"), at, kind, text, project: r.project ?? null, scene: r.scene ?? null, format: r.format ?? null, seconds: Number(r.seconds) || null, mode: r.mode ?? null, status: "new" };
      mkdirSync(join(STUDIO, "requests"), { recursive: true });
      writeFileSync(join(STUDIO, "requests", `${rec.id}.json`), JSON.stringify(rec, null, 1));
      send(res, 200, rec);
    });
    return;
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, HOST, () => console.log(`LifeFlow Creative Studio on http://${HOST}:${PORT}${TOKEN ? `/?t=${TOKEN}` : ""}`));
