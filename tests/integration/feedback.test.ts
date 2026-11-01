import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { feedback } from "@/server/db/schema";
import { sendFeedback } from "@/server/services/feedback";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("beta feedback", () => {
  it("saves it, emails the owner with the tester as reply-to, and only says emailed when the provider confirms", async () => {
    const { user, run } = await makeUser("Maya Chen");
    const sent: Record<string, unknown>[] = [];
    const ok = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "LifeFlow <a@b.co>", FEEDBACK_EMAIL: "owner@lifeflowweb.com" };
    const r = await run((s) =>
      sendFeedback(s, { name: user.name, email: user.email }, { kind: "bug", message: "The Plan tab froze when I tapped Thursday" }, { fetch: ok, env }),
    );
    expect(r.emailed).toBe(true);
    expect(sent[0]).toMatchObject({ to: ["owner@lifeflowweb.com"], reply_to: user.email, subject: "LifeFlow bug: The Plan tab froze when I tapped Thursday" });

    const down = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const r2 = await run((s) =>
      sendFeedback(s, { name: user.name, email: user.email }, { kind: "idea", message: "Dark mode for the calendar" }, { fetch: down, env }),
    );
    expect(r2.emailed).toBe(false);
    const rows = await run((s) => s.tx.select().from(feedback));
    expect(rows.map((x) => [x.kind, !!x.emailedAt]).sort()).toEqual([
      ["bug", true],
      ["idea", false],
    ]);
    // Another user can't see it.
    const other = await makeUser();
    expect(await other.run((s) => s.tx.select().from(feedback))).toEqual([]);
    await expect(run((s) => sendFeedback(s, { name: "x", email: "x@y.co" }, { kind: "other", message: "" }, { env: {} }))).rejects.toThrow(/a little more/);
  });
});
