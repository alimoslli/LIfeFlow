import { describe, expect, it } from "vitest";
import type { SkyInsight } from "@/lib/sky-insights";
import { skyNote } from "@/lib/sky-note";

const base: SkyInsight = {
  id: "gap:1",
  kind: "gap",
  weather: "clear",
  headline: "90 free minutes before work",
  why: null,
  action: null,
  money: false,
  score: 1,
};

describe("skyNote: what the sky noticed, as Today's one note", () => {
  it("keeps the weather as the tone and the headline as the words", () => {
    expect(skyNote({ ...base, weather: "storm" }, "2026-11-21")).toMatchObject({ id: "gap:1", text: "90 free minutes before work", tone: "attention" });
    expect(skyNote({ ...base, weather: "grey" }, "2026-11-21").tone).toBe("heads-up");
    expect(skyNote(base, "2026-11-21").tone).toBe("good");
  });
  it("Block it asks the skyling for that exact time, so the booking comes back with Undo", () => {
    const n = skyNote(
      { ...base, action: { type: "block", label: "Block it", block: { date: "2026-11-21", start: "14:30", end: "16:00", title: "Bio study" } } },
      "2026-11-21",
    );
    expect(n).toMatchObject({ prompt: "Block today 2:30 PM to 4:00 PM for Bio study", label: "Block it" });
    const later = skyNote(
      { ...base, action: { type: "block", label: "Block it", block: { date: "2026-11-23", start: "09:00", end: "10:00", title: "Essay" } } },
      "2026-11-21",
    );
    expect(later.prompt).toBe("Block Monday 9:00 AM to 10:00 AM for Essay");
  });
  it("a page opens, a question is asked, a message's step opens its page", () => {
    expect(skyNote({ ...base, action: { type: "open", label: "See it", href: "/finances/bills" } }, "2026-11-21")).toMatchObject({ href: "/finances/bills" });
    expect(skyNote({ ...base, action: { type: "ask", label: "Plan it", prompt: "Plan tonight" } }, "2026-11-21")).toMatchObject({ prompt: "Plan tonight" });
    expect(skyNote({ ...base, action: { type: "message", label: "Keep or cancel", messageId: "m1", href: "/finances/bills" } }, "2026-11-21").href).toBe(
      "/finances/bills",
    );
  });
});
