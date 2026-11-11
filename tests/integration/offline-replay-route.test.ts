import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/server/db/client";
import { tasks } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser } from "../helpers";

const h = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/server/auth/current-user", () => ({ getSessionUser: async () => h.user }));
const { POST } = await import("@/app/api/offline/replay/route");

afterAll(closeDb);

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/offline/replay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("offline replay route", () => {
  it("refuses changes made in another account and saves nothing", async () => {
    const a = await makeUser();
    const b = await makeUser();
    h.user = { id: b.user.id, email: b.user.email, name: b.user.name, timezone: b.user.timezone, accountKind: "standard", preferences: {} };
    const op = { kind: "task.create", id: randomUUID(), data: { title: "Not yours" } };
    const res = await post({ userId: a.user.id, ops: [op] });
    expect(res.status).toBe(409);
    expect(await b.run((s) => s.tx.select().from(tasks))).toHaveLength(0);
    expect(await a.run((s) => s.tx.select().from(tasks))).toHaveLength(0);
    // The same request from the right account is saved.
    const ok = await post({ userId: b.user.id, ops: [op] });
    expect(ok.status).toBe(200);
    expect(await b.run((s) => s.tx.select().from(tasks))).toHaveLength(1);
  });
});
