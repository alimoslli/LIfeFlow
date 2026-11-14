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
        "src/server/auth/admin.ts",
        "src/server/auth/oauth.ts",
        "src/server/auth/remembered-devices.ts", // the admin is never remembered (shouldRememberDevice)
        "src/server/auth/require-admin.ts",
        "src/server/services/ai-gate.ts",
      ].sort(),
    );
  });
});

describe("remember this phone", () => {
  // owner, 2026-11-14 (choice A): an emailed code earns it like the authenticator and a backup code; the admin never does
  it("the authenticator, a backup code and an emailed code earn it for a normal account", () => {
    expect(earnsRememberedDevice("email", { admin: false })).toBe(true);
    expect(earnsRememberedDevice("totp", { admin: false })).toBe(true);
    expect(earnsRememberedDevice("recovery", { admin: false })).toBe(true);
  });
  it("the admin account never earns it, whatever the method", () => {
    expect(earnsRememberedDevice("email", { admin: true })).toBe(false);
    expect(earnsRememberedDevice("totp", { admin: true })).toBe(false);
    expect(earnsRememberedDevice("recovery", { admin: true })).toBe(false);
  });
});
