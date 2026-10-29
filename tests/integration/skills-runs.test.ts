import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { jarvisRuns } from "@/server/db/schema";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { rateRun, skillStats } from "@/server/jarvis/metrics";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("skills in real turns", () => {
  it("routes the skill into the prompt, logs it on the run, and counts ratings per skill", async () => {
    const { user, run } = await makeUser();
    let system = "";
    const provider = new ScriptedProvider(() => ({ text: "Yes." }));
    const start = provider.startTurn.bind(provider);
    provider.startTurn = (input) => {
      system = (input as { system?: string }).system ?? "";
      return start(input);
    };
    const r = await runJarvisTurn({
      user: { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" },
      text: "Can I afford a $120 concert ticket?",
      emit: () => {},
      provider,
    });
    expect(system).toContain("## Purchase advisor");
    const [row] = await run((s) => s.tx.select().from(jarvisRuns));
    expect(row.skills).toEqual(["purchase-advisor"]);
    expect(await run((s) => rateRun(s, r.runId!, -1))).toBe(true);
    expect((await run((s) => skillStats(s))).find((x) => x.skill === "purchase-advisor")).toMatchObject({ runs: 1, down: 1, successRate: 1 });
    // Someone else can't rate it.
    const other = await makeUser();
    expect(await other.run((s) => rateRun(s, r.runId!, 1))).toBe(false);
  });
});
