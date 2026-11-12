/**
 * Fetches the pinned open models (src/server/local-models/models.ts) from Hugging Face into `.models/<key>/`, checking
 * every file's SHA-256 against the pinned one; a file that doesn't match is deleted and the run fails. Already there and
 * matching: nothing is downloaded. Run: `npx tsx scripts/fetch-local-models.ts [minilm|bge|all]` (default: the model
 * LOCAL_MODEL picks). The build runs it only when a local-model switch is on (docs/backlog/2026-11-12-local-models.md).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_MODELS, type LocalModel } from "../src/server/local-models/models";
import { localModelKey, modelDir } from "../src/server/local-models/embedder";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function fetchModel(m: LocalModel) {
  const dir = modelDir(m.key);
  for (const [file, want] of Object.entries(m.files)) {
    const to = path.join(dir, file);
    const have = await readFile(to).catch(() => null);
    if (have && sha(have) === want) {
      console.log(`ok   ${m.key}/${file}`);
      continue;
    }
    const url = `https://huggingface.co/${m.repo}/resolve/${m.revision}/${file}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${m.key}/${file}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (sha(bytes) !== want) {
      await rm(to, { force: true });
      throw new Error(`${m.key}/${file}: the file's hash isn't the pinned one, so it was not kept`);
    }
    await mkdir(path.dirname(to), { recursive: true });
    await writeFile(to, bytes);
    console.log(`got  ${m.key}/${file} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  }
}

const which = process.argv[2] ?? localModelKey();
const models = which === "all" ? Object.values(LOCAL_MODELS) : [LOCAL_MODELS[which as LocalModel["key"]]];
if (models.some((m) => !m)) throw new Error(`unknown model "${which}"`);
for (const m of models) await fetchModel(m);
