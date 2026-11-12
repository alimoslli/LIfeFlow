/**
 * The open models we run on our own servers (docs/backlog/2026-11-12-local-models.md, owner's yes to Steps 0 and 1).
 * Each is pinned like Prettier: one exact revision on Hugging Face and the SHA-256 of every file, checked when the files
 * are fetched (scripts/fetch-local-models.ts) and again when they load. An upgrade is a new entry with its own
 * side-by-side check. Only licences that allow business use (MIT, Apache 2.0).
 */
export type LocalModel = {
  key: "minilm" | "bge";
  repo: string;
  revision: string;
  licence: "MIT" | "Apache-2.0";
  /** How a text's token vectors become one vector: the average (MiniLM) or the first token's (BGE). */
  pooling: "mean" | "cls";
  dims: number;
  /** Path inside the repo at `revision` → SHA-256. */
  files: Record<string, string>;
};

export const LOCAL_MODELS: Record<LocalModel["key"], LocalModel> = {
  minilm: {
    key: "minilm",
    repo: "Xenova/all-MiniLM-L6-v2",
    revision: "751bff37182d3f1213fa05d7196b954e230abad9",
    licence: "Apache-2.0",
    pooling: "mean",
    dims: 384,
    files: {
      "onnx/model_quantized.onnx": "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
      "tokenizer.json": "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
    },
  },
  bge: {
    key: "bge",
    repo: "Xenova/bge-small-en-v1.5",
    revision: "ea104dacec62c0de699686887e3f920caeb4f3e3",
    licence: "MIT",
    pooling: "cls",
    dims: 384,
    files: {
      "onnx/model_quantized.onnx": "6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4",
      "tokenizer.json": "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66",
    },
  },
};
