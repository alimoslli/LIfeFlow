import { describe, expect, it } from "vitest";
import { billMoveText, extensionEmail, shiftSwapText } from "@/server/services/drafts";

// Gamechangers 3, 4 and 5 (owner, 2026-11-26): ready messages written by our code from real records, never sent for them.
describe("ready messages", () => {
  it("a shift swap names the real shift and the real reason", () => {
    expect(
      shiftSwapText({
        workplace: "Target",
        shiftDay: "Wednesday",
        shiftFrom: "17:00",
        shiftTo: "23:00",
        reason: "my BIO 101 exam",
        reasonDay: "Thursday morning",
      }),
    ).toBe(
      "Hi, I have my BIO 101 exam Thursday morning. Could anyone take my Wednesday 5 to 11 PM shift at Target? I can cover one of yours another time. Thank you!",
    );
    expect(
      shiftSwapText({ workplace: "", shiftDay: "Friday", shiftFrom: "09:00", shiftTo: "13:30", reason: "my CHEM quiz", reasonDay: "Friday afternoon" }),
    ).toContain("my Friday 9 AM to 1:30 PM shift?");
  });

  it("an extension email uses the professor's last name, the real due date, and what's done only when given", () => {
    const e = extensionEmail({ professor: "Dana Ruiz", course: "ENG 102", title: "Essay 2", dueDay: "Friday, November 21", asked: "Monday", name: "Ali" });
    expect(e.subject).toBe("Extension request: Essay 2 (ENG 102)");
    expect(e.body).toMatch(/^Dear Professor Ruiz,/);
    expect(e.body).toContain("Essay 2, which is due Friday, November 21. Would Monday be possible?");
    expect(e.body).not.toContain("So far");
    expect(e.body.trim().endsWith("Ali")).toBe(true);
    const withDone = extensionEmail({
      professor: "",
      course: "",
      title: "Lab 4",
      dueDay: "Tuesday",
      asked: "two more days",
      done: "the data and the methods.",
      name: "Sam",
    });
    expect(withDone.body).toMatch(/^Hello,/);
    expect(withDone.body).toContain("So far I have the data and the methods.");
  });

  it("a bill date note never invents a payday or an amount", () => {
    expect(billMoveText({ biller: "Rent", dueDay: "Monday, December 1", payday: "Friday, December 5", name: "Ali" })).toBe(
      "Hi, this is Ali. My Rent payment is due Monday, December 1, and I'm paid Friday, December 5. Could we move this month's due date to Friday, December 5? I'll pay in full then. Thank you!",
    );
    const noPay = billMoveText({ biller: "Phone", dueDay: "Monday", name: "Ali" });
    expect(noPay).toContain("back a few days");
    expect(noPay).not.toMatch(/\$|paid/);
  });

  it("no em dashes anywhere", () => {
    const all = [
      shiftSwapText({ workplace: "A", shiftDay: "Mon", shiftFrom: "10:00", shiftTo: "14:00", reason: "x", reasonDay: "y" }),
      extensionEmail({ professor: "P Q", course: "C", title: "T", dueDay: "D", asked: "A", name: "N" }).body,
      billMoveText({ biller: "B", dueDay: "D", name: "N" }),
    ].join(" ");
    expect(all).not.toContain("—");
  });
});
