import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
const { ipFromHeaders } = await import("@/server/auth/current-user");
const h = (o: Record<string, string>) => new Headers(o);

describe("client IP for rate limiting", () => {
  it("can't be spoofed by a client-supplied X-Forwarded-For prefix", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("prefers the host-set headers", () => {
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "198.51.100.4", "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.4");
    expect(ipFromHeaders(h({ "x-real-ip": "198.51.100.5", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.5");
  });
  it("falls back to a shared bucket when nothing is known", () => {
    expect(ipFromHeaders(h({}))).toBe("unknown");
  });
});
