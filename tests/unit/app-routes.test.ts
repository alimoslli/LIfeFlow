import { describe, expect, it } from "vitest";
import { appRouteName, isAppPath, linkAppPaths, viewAtName } from "@/lib/app-routes";

describe("app routes in replies", () => {
  it("turns known paths, plain or in code formatting, into named links", () => {
    expect(linkAppPaths("View them here: `/work`")).toBe("View them here: [Work](/work)");
    expect(linkAppPaths("See /finances/bills.")).toBe("See [Bills](/finances/bills).");
    expect(linkAppPaths("Open (/tasks) now")).toBe("Open ([To-dos](/tasks)) now");
  });
  it("leaves unknown paths, code blocks, existing links and other words alone", () => {
    expect(linkAppPaths("Use /secret/thing")).toBe("Use /secret/thing");
    expect(linkAppPaths("```\n/work\n```")).toBe("```\n/work\n```");
    expect(linkAppPaths("[my shifts](/work) and the word network/work")).toBe("[my shifts](/work) and the word network/work");
    expect(linkAppPaths("20 and/or 30")).toBe("20 and/or 30");
  });
  it("names pages and only allows in-app links", () => {
    expect(appRouteName("/notes?project=abc")).toBe("Notes");
    expect(viewAtName("/something-new")).toBe("Something new");
    expect(isAppPath("/work")).toBe(true);
    expect(isAppPath("//evil.com")).toBe(false);
    expect(isAppPath("javascript:alert(1)")).toBe(false);
  });
});
