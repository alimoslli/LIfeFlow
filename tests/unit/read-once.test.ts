import { describe, expect, it } from "vitest";
import { once, readOnce, type UserScope } from "@/server/db/with-user";

// `once` shares a base read within one render, only when the page asked for that (`readOnce`).
const scope = (): UserScope => ({ tx: {} as UserScope["tx"], userId: "u" });

describe("reads shared within one render", () => {
  it("reads every time when the scope doesn't share reads (actions, crons, every save)", async () => {
    let reads = 0;
    const s = scope();
    await once(s, "k", async () => ++reads);
    await once(s, "k", async () => ++reads);
    expect(reads).toBe(2);
  });

  it("reads once per key when the page turned sharing on, and a savepoint's copy of the scope shares it too", async () => {
    let reads = 0;
    const s = readOnce(scope());
    const inner = { ...s, tx: {} as UserScope["tx"] }; // what an insight producer's savepoint gets
    const a = await once(s, "k", async () => (reads++, [3, 1, 2]));
    const b = await once(inner, "k", async () => (reads++, [9]));
    await once(s, "other", async () => reads++);
    expect(reads).toBe(2);
    expect(b).toEqual([3, 1, 2]);
    // each caller has its own array: one sorting it doesn't reorder the other's
    a.sort();
    expect(b).toEqual([3, 1, 2]);
  });

  it("copies the arrays inside a plain result, too", async () => {
    const s = readOnce(scope());
    const a = await once(s, "k", async () => ({ tracked: [2, 1], n: 1 }));
    a.tracked.sort();
    expect((await once(s, "k", async () => ({ tracked: [], n: 0 }))).tracked).toEqual([2, 1]);
  });

  it("runs a query builder once, though a builder runs again each time it is awaited", async () => {
    let runs = 0;
    // like a database query builder: nothing happens until it is awaited, and every await runs it
    const builder = () => ({ then: (ok: (rows: number[]) => unknown) => Promise.resolve([++runs]).then(ok) }) as unknown as Promise<number[]>;
    const s = readOnce(scope());
    expect(await once(s, "k", builder)).toEqual([1]);
    expect(await once(s, "k", builder)).toEqual([1]);
    expect(runs).toBe(1);
  });

  it("asks again after a read that failed", async () => {
    const s = readOnce(scope());
    await expect(once(s, "k", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await once(s, "k", async () => "ok")).toBe("ok");
  });
});
