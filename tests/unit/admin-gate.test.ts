import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { earnsRememberedDevice } from "@/server/auth/remembered-devices";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("admin gate", () => {
  it("every admin route handler goes through requireAdmin(), never adminFor() alone (a skipped-second-step session must not pass)", () => {
    const routes = walk("src/app/admin").filter((p) => /route\.ts$/.test(p));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      const src = readFileSync(r, "utf8");
      expect(src, r).toMatch(/requireAdmin\(/);
      expect(src, r).not.toMatch(/adminFor\(/);
    }
  });
  it("the accounts CSV export uses requireAdmin()", () => {
    expect(readFileSync("src/app/admin/users/export/route.ts", "utf8")).toMatch(/await requireAdmin\(\)/);
  });
  it("adminFor is called directly only where it isn't an admin-area gate", () => {
    const users = walk("src")
      .filter((p) => /\.(ts|tsx)$/.test(p) && readFileSync(p, "utf8").includes("adminFor("))
      .map((p) => p.replace(/\\/g, "/"))
      .sort();
    expect(users).toEqual(
      [
        "src/app/(auth)/actions.ts",
        "src/app/(app)/settings/doors-data.ts",
        "src/app/api/jarvis/chat/route.ts",
        "src/app/api/jarvis/voice/session/route.ts",
        "src/server/auth/admin.ts",
        "src/server/auth/oauth.ts",
        "src/server/auth/require-admin.ts",
      ].sort(),
    );
  });
});

describe("remember this phone", () => {
  it("an emailed code never earns it; the authenticator and a backup code do", () => {
    expect(earnsRememberedDevice("email")).toBe(false);
    expect(earnsRememberedDevice("totp")).toBe(true);
    expect(earnsRememberedDevice("recovery")).toBe(true);
  });
});
