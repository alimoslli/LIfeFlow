import { describe, expect, it } from "vitest";
import { milestoneCategory, parseLifeImport, splitWhen } from "@/lib/life-import";
import { matchCategory } from "@/server/services/finance/categories";
import { parseWhen } from "@/server/services/milestones";

describe("parseLifeImport", () => {
  it("sorts an answer with our headings into facts, milestones and goals", () => {
    const text = [
      "**ABOUT ME:**",
      "- I study biology at Georgia State.",
      "- I work at Target on weekends.",
      "PREFERENCES: I like short answers.",
      "ROUTINES:",
      "1. Gym Monday, Wednesday and Friday at 7am",
      "## Milestones",
      "- 2022 - Graduated from Lincoln High School",
      "- Got my first job at Target (2023)",
      "- Ran my first 5K in May 2024",
      "- Learned to drive",
      "GOALS:",
      "- Get a 3.5 GPA this semester",
    ].join("\n");
    expect(parseLifeImport(text)).toEqual([
      { kind: "fact", text: "I study biology at Georgia State.", category: "fact" },
      { kind: "fact", text: "I work at Target on weekends.", category: "fact" },
      { kind: "fact", text: "I like short answers.", category: "preference" },
      { kind: "fact", text: "Gym Monday, Wednesday and Friday at 7am", category: "routine" },
      { kind: "milestone", text: "Graduated from Lincoln High School", when: "2022", category: "school" },
      { kind: "milestone", text: "Got my first job at Target", when: "2023", category: "work" },
      { kind: "milestone", text: "Ran my first 5K", when: "May 2024", category: "health" },
      { kind: "milestone", text: "Learned to drive", when: null, category: "personal" },
      { kind: "goal", text: "Get a 3.5 GPA this semester" },
    ]);
  });

  it("treats text without headings as facts, a sentence each", () => {
    expect(parseLifeImport("I'm a nursing student. I hate early mornings.\n- I have a dog named Max")).toEqual([
      { kind: "fact", text: "I'm a nursing student.", category: "fact" },
      { kind: "fact", text: "I hate early mornings.", category: "fact" },
      { kind: "fact", text: "I have a dog named Max", category: "fact" },
    ]);
  });

  it("reads the year in the usual places", () => {
    expect(splitWhen("2021: Moved to Atlanta")).toEqual({ text: "Moved to Atlanta", when: "2021" });
    expect(splitWhen("Sept 2020 - Started college")).toEqual({ text: "Started college", when: "Sept 2020" });
    expect(splitWhen("Made the dean's list in 2023.")).toEqual({ text: "Made the dean's list", when: "2023" });
    expect(splitWhen("Won 3 games")).toEqual({ text: "Won 3 games", when: null });
    expect(milestoneCategory("Visited Japan")).toBe("travel");
  });
});

describe("parseWhen", () => {
  it("understands a year, a month and a date", () => {
    expect(parseWhen("2022")).toEqual({ happenedOn: "2022-01-01", precision: "year" });
    expect(parseWhen("May 2022")).toEqual({ happenedOn: "2022-05-01", precision: "month" });
    expect(parseWhen("sept 2020")).toEqual({ happenedOn: "2020-09-01", precision: "month" });
    expect(parseWhen("2022-05-10")).toEqual({ happenedOn: "2022-05-10", precision: "day" });
    expect(parseWhen("last summer")).toBeNull();
  });
});

describe("matchCategory", () => {
  const cats = [
    { id: "food", name: "Food & Dining", parentId: null },
    { id: "groc", name: "Groceries", parentId: "food" },
    { id: "rest", name: "Restaurants", parentId: "food" },
    { id: "deliv", name: "Food Delivery", parentId: "food" },
    { id: "trans", name: "Transportation", parentId: null },
    { id: "ride", name: "Rideshare", parentId: "trans" },
    { id: "books", name: "Books & Supplies", parentId: null },
    { id: "pay", name: "Paycheck", parentId: null },
  ];
  const m = (q: string) => matchCategory(cats, q)?.name ?? null;
  it("forgives case, plurals, '&' and everyday words", () => {
    expect(m("groceries")).toBe("Groceries");
    expect(m("Grocery")).toBe("Groceries");
    expect(m("food and dining")).toBe("Food & Dining");
    expect(m("Food")).toBe("Food & Dining");
    expect(m("eating out")).toBe("Restaurants");
    expect(m("Uber")).toBe("Rideshare");
    expect(m("textbooks")).toBe("Books & Supplies");
    expect(m("salary")).toBe("Paycheck");
    expect(m("restaurant")).toBe("Restaurants");
  });
  it("returns nothing rather than guessing", () => {
    expect(m("crypto")).toBeNull();
    expect(m("")).toBeNull();
  });
});
