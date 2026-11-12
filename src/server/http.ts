import "server-only";
import { NextResponse } from "next/server";
import { getDb } from "./db/client";
import { rateLimit } from "./rate-limit";

/** Rejects cross-site requests to JSON API routes (server actions have their own origin check). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return;
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new HttpError(403, "Cross-site request blocked");
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(getDb(), key, limit, windowSeconds);
  if (!r.allowed) throw new HttpError(429, `Too many requests. Try again in ${r.retryAfterSeconds}s.`);
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** Reads a request body as bytes with a hard limit; refuses early on content-length. Returns the text. */
export async function readLimitedBody(req: Request, max = 64_000): Promise<string> {
  return (await readLimitedBytes(req, max)).toString("utf8");
}

/** The body as bytes, counted as it streams in: a missing, small or false content-length can't get more than `max` read. */
export async function readLimitedBytes(req: Request, max: number, message = "Too much data in one request"): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, message);
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, message);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
