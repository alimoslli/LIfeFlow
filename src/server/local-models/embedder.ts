import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_MODELS, type LocalModel } from "./models";

/**
 * Turns short texts into vectors with a small open model on our own server (docs/backlog/2026-11-12-local-models.md).
 * No other company sees the text, there is no per-call bill, and nothing is written anywhere: vectors live only in this
 * request's memory (the COO's rule 1, 2026-11-12: memory vectors are as private as the memory, so none are stored). Only
 * our own fixed texts (in the comparison: tool and category descriptions) are kept between requests, in this process.
 *
 * Every job that uses it is behind its own switch, off by default (`localModelOn`), and falls back to today's way whenever
 * the model isn't there: switched off, files missing, a hash that doesn't match, or a load error. Never throws.
 */

/** The jobs that can run on a local model. Tool choosing and purchase sorting were measured and stay as they are (the report). */
export type LocalJob = "memory";
const SWITCH: Record<LocalJob, string> = { memory: "LOCAL_MODEL_MEMORY" };

/**
 * Is this job switched to the local model? Only two exact words count: "on" (everyone) and "accounts" (only the sign-in
 * emails listed in `<switch>_ACCOUNTS`, comma-separated: the owner and the demo account first, COO 2026-11-12).
 * Anything else is off.
 */
export function localModelOn(job: LocalJob, envs: Record<string, string | undefined> = process.env, email?: string | null): boolean {
  const v = envs[SWITCH[job]];
  if (v === "on") return true;
  if (v !== "accounts" || !email) return false;
  const list = (envs[`${SWITCH[job]}_ACCOUNTS`] ?? "").split(",").map((e) => e.trim().toLowerCase());
  return list.includes(email.trim().toLowerCase());
}

/** Does the build carry the model at all ("on" or "accounts")? next.config.ts and the fetch script use the same rule. */
export const localModelBuilt = (job: LocalJob, envs: Record<string, string | undefined> = process.env) => ["on", "accounts"].includes(envs[SWITCH[job]] ?? "");

/** Which pinned model the jobs use (LOCAL_MODEL, default MiniLM). */
export const localModelKey = (envs: Record<string, string | undefined> = process.env): LocalModel["key"] => (envs.LOCAL_MODEL === "bge" ? "bge" : "minilm");

/**
 * Where the fetched files are (scripts/fetch-local-models.mts writes them there). The ignore comment keeps the build's file
 * tracer from reading this path as "the whole project" (it added 60 MB to the chat's function); next.config.ts adds just
 * the model's own folder, and only when the switch is on.
 */
export const modelDir = (key: LocalModel["key"], envs: Record<string, string | undefined> = process.env) =>
  path.join(envs.LOCAL_MODELS_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".models"), key);

type Session = { run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>; inputNames: readonly string[] };
type Tokenizer = { encode(text: string): { ids: number[]; attention_mask: number[] } };
type Ort = {
  InferenceSession: { create(model: Uint8Array, opts?: object): Promise<Session> };
  Tensor: new (type: "int64", data: BigInt64Array, dims: number[]) => unknown;
};
type Loaded = { model: LocalModel; session: Session; tokenizer: Tokenizer; ort: Ort };

const loading = new Map<string, Promise<Loaded | null>>();

/** Reads a file and refuses it unless its SHA-256 is the pinned one. */
async function pinned(file: string, sha: string) {
  const bytes = await readFile(file);
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== sha) throw new Error(`hash mismatch: ${path.basename(file)}`);
  return bytes;
}

async function load(key: LocalModel["key"]): Promise<Loaded | null> {
  const model = LOCAL_MODELS[key];
  const dir = modelDir(key);
  try {
    const [onnx, tok] = await Promise.all([
      pinned(path.join(dir, "onnx/model_quantized.onnx"), model.files["onnx/model_quantized.onnx"]),
      pinned(path.join(dir, "tokenizer.json"), model.files["tokenizer.json"]),
    ]);
    // loaded only when a switch is on, so the runtime never starts (or is bundled) for anyone else
    const ortMod = (await import("onnxruntime-node")) as unknown as Ort & { default?: Ort };
    const ort = ortMod.InferenceSession ? ortMod : ortMod.default!;
    const tkMod = (await import("@huggingface/tokenizers")) as unknown as { Tokenizer: new (t: object, c: object) => Tokenizer };
    const tokenizer = new tkMod.Tokenizer(JSON.parse(tok.toString("utf8")), {});
    // one thread: a serverless function has little CPU, and two requests shouldn't fight over it
    const session = await ort.InferenceSession.create(new Uint8Array(onnx), { intraOpNumThreads: 1, interOpNumThreads: 1 });
    // once per instance, no content: how the owner sees it working (and the e2e check that it really loads when built)
    console.info("[local-model] ready", key);
    return { model, session, tokenizer, ort };
  } catch (e) {
    // no text, no path: the error's own kind only (never content), and the job uses today's way
    console.error("[local-model] not available", key, e instanceof Error ? e.message.replace(/\/[^\s]*/g, "") : typeof e);
    return null;
  }
}

const ready = new Set<string>();
/**
 * Is the model loaded in this process? `warm` starts loading it without waiting, so a turn on a cold instance never pays
 * for the load (the 300 ms rule): it goes by words, and the next one has meaning.
 */
export const isReady = (key: LocalModel["key"] = localModelKey()) => ready.has(key);
export const warm = (key: LocalModel["key"] = localModelKey()) => void loaded(key);

function loaded(key: LocalModel["key"]) {
  let p = loading.get(key);
  if (!p) {
    p = load(key).then((m) => {
      if (m) ready.add(key);
      return m;
    });
    loading.set(key, p);
  }
  return p;
}

/** Longest text a vector is made from (the model reads 256 word pieces at most; ours are short). */
const MAX_TOKENS = 128;

/**
 * One vector per text (unit length, so a dot product is the cosine), or null when the model isn't available. Texts are
 * embedded in small batches; nothing about them is kept.
 */
export async function embed(texts: string[], key: LocalModel["key"] = localModelKey()): Promise<Float32Array[] | null> {
  if (!texts.length) return [];
  const m = await loaded(key);
  if (!m) return null;
  try {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) out.push(...(await batch(m, texts.slice(i, i + 32))));
    return out;
  } catch (e) {
    console.error("[local-model] embed failed", e instanceof Error ? e.name : typeof e);
    return null;
  }
}

async function batch(m: Loaded, texts: string[]) {
  const enc = texts.map((t) => {
    const e = m.tokenizer.encode(t);
    return { ids: e.ids.slice(0, MAX_TOKENS), mask: e.attention_mask.slice(0, MAX_TOKENS) };
  });
  const len = Math.max(...enc.map((e) => e.ids.length));
  const flat = (pick: (e: (typeof enc)[number], j: number) => number) => {
    const a = new BigInt64Array(enc.length * len);
    enc.forEach((e, r) => {
      for (let j = 0; j < len; j++) a[r * len + j] = BigInt(j < e.ids.length ? pick(e, j) : 0);
    });
    return new m.ort.Tensor("int64", a, [enc.length, len]);
  };
  const feeds: Record<string, unknown> = { input_ids: flat((e, j) => e.ids[j]), attention_mask: flat((e, j) => e.mask[j]) };
  if (m.session.inputNames.includes("token_type_ids")) feeds.token_type_ids = flat(() => 0);
  const res = await m.session.run(feeds);
  const h = Object.values(res)[0];
  const d = h.dims[2];
  return enc.map((e, r) => {
    const v = new Float32Array(d);
    const base = r * len * d;
    if (m.model.pooling === "cls") for (let k = 0; k < d; k++) v[k] = h.data[base + k];
    else {
      const n = e.ids.length;
      for (let j = 0; j < n; j++) for (let k = 0; k < d; k++) v[k] += h.data[base + j * d + k] / n;
    }
    let norm = 0;
    for (let k = 0; k < d; k++) norm += v[k] * v[k];
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < d; k++) v[k] /= norm;
    return v;
  });
}

/** Cosine of two unit vectors. */
export function cosine(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}

const fixed = new Map<string, Promise<Float32Array[] | null>>();
/**
 * Vectors for our own fixed texts (never a person's), worked out once per process. A failure isn't kept, so the next request tries again.
 */
export function embedFixed(id: string, texts: string[], key: LocalModel["key"] = localModelKey()) {
  const k = `${key}:${id}:${texts.length}`;
  let p = fixed.get(k);
  if (!p) {
    p = embed(texts, key).then((v) => {
      if (!v) fixed.delete(k);
      return v;
    });
    fixed.set(k, p);
  }
  return p;
}
