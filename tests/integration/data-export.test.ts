import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { attachments, inboxSenders, integrations } from "@/server/db/schema";
import { encryptSecret } from "@/server/crypto";
import { exportUserData } from "@/server/services/data-export";
import { createHabit, checkHabit } from "@/server/services/habits";
import { createMemory } from "@/server/services/memory";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("Download my data", () => {
  it("holds milestones, goals, habits and memories (decrypted), and no secrets, hashes or other people's rows", async () => {
    const a = await makeUser("Ana Export");
    const b = await makeUser("Ben Other");
    await a.run(async (s) => {
      await createMilestone(s, { title: "First job", category: "work", when: "2023" });
      await createPersonalGoal(s, { title: "Read 12 books", target: 12, unit: "books" });
      const habit = await createHabit(s, { title: "Study 25 minutes a day", kind: "study", cadence: "daily", target: 25 });
      await checkHabit(s, habit.id, "2026-11-04");
      await createMemory(s, { content: "Works at the campus library on Tuesdays", category: "routine" }, "user");
      await s.tx
        .insert(integrations)
        .values({ userId: s.userId, provider: "canvas", status: "connected", encryptedCredentials: encryptSecret('{"token":"canvas-secret-xyz"}') });
      await s.tx.insert(inboxSenders).values({ userId: s.userId, email: "ana@school.edu", codeHash: "deadbeefhash" });
      await s.tx
        .insert(attachments)
        .values({ userId: s.userId, filename: "schedule.png", mimeType: "image/png", sizeBytes: 3, sha256: "abc123sha", dataBase64: "QUJD" });
    });
    await b.run((s) => createMilestone(s, { title: "Ben's secret milestone" }));

    const data = await a.run((s) =>
      exportUserData(s, { name: a.user.name, email: a.user.email, timezone: a.user.timezone, preferences: { sms: { codeHash: "smscodehash", money: true } } }),
    );
    const json = JSON.stringify(data);

    expect((data.milestones as { title: string }[]).map((m) => m.title)).toEqual(["First job"]);
    expect((data.personalGoals as { title: string }[])[0].title).toBe("Read 12 books");
    expect(data.habits as unknown[]).toHaveLength(1);
    expect(data.habitChecks as unknown[]).toHaveLength(1);
    expect((data.memories as { content: string }[])[0].content).toBe("Works at the campus library on Tuesdays");
    expect((data.attachments as { filename: string }[])[0].filename).toBe("schedule.png");
    expect((data.inboxSenders as { email: string }[])[0].email).toBe("ana@school.edu");
    expect(data.activity).toBeDefined();

    for (const secret of ["canvas-secret-xyz", "encryptedCredentials", "deadbeefhash", "codeHash", "smscodehash", "abc123sha", "QUJD", "dataBase64"]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(json).not.toContain("Ben's secret milestone");
    expect((data.profile as { preferences: { sms: { money: boolean } } }).preferences.sms.money).toBe(true);
  });
});
