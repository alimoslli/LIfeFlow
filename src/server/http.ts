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
