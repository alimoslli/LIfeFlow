import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, vibrate } from "@/lib/haptics";

function phone({ tapped, reduced = false }: { tapped: boolean | undefined; reduced?: boolean }) {
  const vibrate = vi.fn(() => true);
  vi.stubGlobal("navigator", { vibrate, ...(tapped === undefined ? {} : { userActivation: { hasBeenActive: tapped, isActive: tapped } }) });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  return vibrate;
}

describe("haptic", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("vibrates once the person has tapped the page", () => {
    const vibrate = phone({ tapped: true });
    haptic("success");
    expect(vibrate).toHaveBeenCalledWith([10, 40, 14]);
  });

  it("stays still before the first tap, so a celebration on page load logs nothing", () => {
    const vibrate = phone({ tapped: false });
    haptic("success");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("stays still under reduced motion", () => {
    const vibrate = phone({ tapped: true, reduced: true });
    haptic();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("still vibrates where the browser can't say whether the page was tapped", () => {
    const vibrate = phone({ tapped: undefined });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(8);
  });
});

describe("vibrate (the celebrations)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("waits for the first tap, then vibrates", () => {
    const before = phone({ tapped: false });
    vibrate([12, 50, 12]);
    expect(before).not.toHaveBeenCalled();
    const after = phone({ tapped: true });
    vibrate([12, 50, 12]);
    expect(after).toHaveBeenCalledWith([12, 50, 12]);
  });
});
