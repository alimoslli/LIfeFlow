import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { embed, localModelKey, localModelOn } from "@/server/local-models/embedder";
import { meaningScores } from "@/server/local-models/memory";
import { LOCAL_MODELS } from "@/server/local-models/models";
import { MEANING_MEMORIES } from "../fixtures/memory-meaning";

// docs/backlog/2026-11-12-local-models.md: the local model is off unless switched on, and whenever it isn't there (off,
// missing, a file that isn't the pinned one) every job falls back to today's way without an error.
describe("local models", () => {
  it("are off unless the switch says exactly on", () => {
    expect(localModelOn("memory", {})).toBe(false);
    expect(localModelOn("memory", { LOCAL_MODEL_MEMORY: "true" })).toBe(false);
    expect(localModelOn("memory", { LOCAL_MODEL_MEMORY: "on" })).toBe(true);
    expect(localModelKey({})).toBe("minilm");
    expect(localModelKey({ LOCAL_MODEL: "bge" })).toBe("bge");
  });

  it("every file is pinned to one revision and a SHA-256, under a business-friendly licence", () => {
    for (const m of Object.values(LOCAL_MODELS)) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(["MIT", "Apache-2.0"]).toContain(m.licence);
      for (const sha of Object.values(m.files)) expect(sha).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("switched off, memory picking gets no meaning and never loads the model", async () => {
    expect(await meaningScores(MEANING_MEMORIES, { text: "What should I make for dinner?" }, false)).toBeUndefined();
  });

  it("a missing model or a file that isn't the pinned one is refused, and the job goes by words", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lf-models-"));
    vi.stubEnv("LOCAL_MODELS_DIR", dir);
    vi.stubEnv("LOCAL_MODEL", "bge");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // a tampered copy: right names, wrong bytes
    mkdirSync(path.join(dir, "bge/onnx"), { recursive: true });
    writeFileSync(path.join(dir, "bge/onnx/model_quantized.onnx"), "not the model");
    writeFileSync(path.join(dir, "bge/tokenizer.json"), "{}");
    expect(await embed(["hello"], "bge")).toBeNull();
    expect(err.mock.calls.some((c) => String(c[1]) === "bge" && /hash mismatch/.test(String(c[2])))).toBe(true);
    // on, but the model isn't there: no meaning, no error
    expect(await meaningScores(MEANING_MEMORIES, { text: "What should I make for dinner?" }, true)).toBeUndefined();
    err.mockRestore();
    vi.unstubAllEnvs();
  });
});
