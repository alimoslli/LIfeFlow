import { describe, expect, it } from "vitest";
import { HttpError, readLimitedBytes } from "@/server/http";

// A body sent in pieces with no content-length (or a false one) must still be stopped at the limit while it streams in.
function chunked(sizes: number[], headers: Record<string, string> = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of sizes) c.enqueue(new Uint8Array(n));
      c.close();
    },
  });
  return new Request("http://localhost/api/setup/schedule", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
}

describe("readLimitedBytes", () => {
  it("reads a body under the limit", async () => {
    const bytes = await readLimitedBytes(chunked([400, 600]), 1_000);
    expect(bytes.length).toBe(1_000);
  });

  it("stops a chunked body with no content-length once it passes the limit", async () => {
    await expect(readLimitedBytes(chunked([600, 600, 600]), 1_000, "That picture is over 8 MB.")).rejects.toMatchObject({
      status: 413,
      message: "That picture is over 8 MB.",
    });
  });

  it("stops a body whose content-length says less than it sends", async () => {
    await expect(readLimitedBytes(chunked([800, 800], { "content-length": "10" }), 1_000)).rejects.toBeInstanceOf(HttpError);
  });

  it("refuses a declared size over the limit before reading", async () => {
    await expect(readLimitedBytes(chunked([1], { "content-length": "5000" }), 1_000)).rejects.toMatchObject({ status: 413 });
  });
});
