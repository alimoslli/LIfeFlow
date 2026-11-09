import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The production build runs scripts/seed-demo.ts under plain tsx before `next build`. If anything it imports reaches a "server-only"
// module (as account deletion did on 2026-11-08, via billing and http), the script crashes and every production deploy fails.
describe("deploy scripts", () => {
  it("can import the account services outside Next (no server-only in their import chain)", () => {
    const out = execFileSync("npx", ["tsx", "-e", 'import("./src/server/services/accounts").then(() => console.log("ok"))'], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://x:x@localhost:5432/x" },
      timeout: 60_000,
    });
    expect(out.trim()).toBe("ok");
  });
});
