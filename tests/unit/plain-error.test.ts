import { describe, expect, it } from "vitest";
import { jsonOf, serverWords } from "@/lib/plain-error";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("only the app's own words reach people", () => {
  it("shows the API's own words for a deliberate error", async () => {
    expect(await serverWords(json(429, { error: "You've used today's 5 free messages." }), "Calm.")).toContain("free messages");
    expect(await serverWords(json(503, { error: "Your skyling isn't available right now." }), "Calm.")).toContain("isn't available");
    expect(await serverWords(json(400, { error: "Message is empty" }), "Calm.")).toBe("Message is empty");
  });
  it("replaces a crash, a proxy page, a broken body and anything a browser wrote", async () => {
    expect(await serverWords(json(500, { error: "Internal error" }), "Calm.")).toBe("Calm.");
    expect(await serverWords(new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }), "Calm.")).toBe("Calm.");
    expect(await serverWords(new Response("<html>nope</html>", { status: 400, headers: { "content-type": "text/html" } }), "Calm.")).toBe("Calm.");
    expect(await serverWords(new Response("{broken", { status: 400, headers: { "content-type": "application/json" } }), "Calm.")).toBe("Calm.");
    expect(await serverWords(json(400, { error: { nested: true } }), "Calm.")).toBe("Calm.");
    expect(await serverWords(null, "Calm.")).toBe("Calm.");
    expect(await jsonOf(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }))).toBeNull();
  });
});
