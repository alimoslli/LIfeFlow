import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The look is ours (owner, 2026-11-10): the app must not look like a phone's own settings. These are the patterns we
 * took out; this keeps them out. Admin and HQ, and the public landing page, have their own look.
 */
const ROOTS = ["src/app/(app)", "src/components"];
const SKIP = [/\/hq\//, /\/admin\//];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
const SOURCES = ROOTS.flatMap(files)
  .filter((f) => !SKIP.some((s) => s.test(f)))
  .map((f) => ({ f, text: readFileSync(f, "utf8") }));

describe("the look stays ours", () => {
  it("no hairline lists: items are tiles (.lf-tiles) or inset rows (.lf-rows)", () => {
    expect(SOURCES.filter((s) => /\bdivide-y\b/.test(s.text)).map((s) => s.f)).toEqual([]);
  });

  it("no disclosure arrows on rows: ChevronRight is only for stepping forward (next week, next month)", () => {
    const allowed = ["src/app/(app)/work/page.tsx", "src/app/(app)/calendar/page.tsx"];
    expect(SOURCES.filter((s) => /\bChevronRight\b/.test(s.text) && !allowed.includes(s.f)).map((s) => s.f)).toEqual([]);
  });

  it("action glyphs are our pixel ones (delete, copy, download, check, arrow, undo, sync, edit, open, search)", () => {
    // the skyling's own pages and the inbox are LF Main's; they move to the pixel glyphs next
    const later = [/\/jarvis\//, /\/inbox\//, /\/skylings\//];
    const generic = /import \{[^}]*\b(Trash2|Check|Copy|Download|ArrowRight|Search|Undo2|RefreshCw|Pencil|ExternalLink)\b[^}]*\} from "lucide-react"/;
    expect(SOURCES.filter((s) => generic.test(s.text) && !later.some((l) => l.test(s.f))).map((s) => s.f)).toEqual([]);
  });

  it("no sliding segmented control: closely related views use the horizon tabs", () => {
    const nav = readFileSync("src/components/ui/segmented-nav.tsx", "utf8");
    const tabs = readFileSync("src/components/ui/surface.tsx", "utf8");
    expect(nav).toContain('className="lf-horizon"');
    expect(tabs).toContain("lf-horizon");
    expect(nav).not.toMatch(/bg-surface-2 p-1/);
    expect(tabs).not.toMatch(/rounded-full bg-surface-2 p-1/);
  });

  it("no phone-style toggles: on/off is the sky switch", () => {
    // the old toggle was a grey or blue track with a white knob sliding left to right
    expect(SOURCES.filter((s) => /rounded-full bg-white shadow transition-\[left\]/.test(s.text)).map((s) => s.f)).toEqual([]);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".lf-switch-view");
    expect(css).toContain(".lf-horizon");
    expect(css).toContain(".lf-tiles");
    expect(css).toContain(".lf-rows");
    // dropdowns keep the phone's picker but not its arrow
    expect(css).toMatch(/\.lf-glass select:not\(\[multiple\]\) \{\s*appearance: none;/);
  });
});
