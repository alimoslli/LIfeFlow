import { describe, expect, it } from "vitest";
import { cleanPack, PACK_INSTRUCTIONS, packQuery } from "@/server/services/paper-pack";
import { COACH_MODE } from "@/lib/integrity";

// Gamechanger 1 (owner, 2026-11-26): the skyling does the hunting; the student does the writing (ADR 0016).
const cited = [
  { url: "https://www.loc.gov/pictures/collection/wwipos/", title: "WWI Posters" },
  { url: "https://doi.org/10.1000/xyz", title: "Propaganda and the Great War" },
];

describe("paper pack", () => {
  it("keeps only sources the search cited, one per page, with the cited link", () => {
    const pack = cleanPack(
      {
        sources: [
          { title: "Posters", url: "https://loc.gov/pictures/collection/wwipos", why: "Posters from 1914 to 1918" },
          { title: "Same again", url: "https://www.loc.gov/pictures/collection/wwipos/", why: "dupe" },
          { title: "Made up", url: "https://example.com/not-cited", why: "never searched" },
          { title: "Bad", url: "javascript:alert(1)", why: "" },
        ],
        questions: ["Who was each poster meant to persuade?", "Write the thesis: propaganda worked.", "In this essay, argue that X?"],
      },
      cited,
    );
    expect(pack.sources).toEqual([{ title: "Posters", url: "https://www.loc.gov/pictures/collection/wwipos/", why: "Posters from 1914 to 1918" }]);
    expect(pack.questions).toEqual(["Who was each poster meant to persuade?"]);
  });

  it("drops a source line that drifts into writing the paper", () => {
    const pack = cleanPack({ sources: [{ title: "T", url: cited[1].url, why: "Your thesis could be that it worked" }], questions: [] }, cited);
    expect(pack.sources[0].why).toBe("");
  });

  it("survives a broken answer", () => {
    expect(cleanPack(null, cited)).toEqual({ sources: [], questions: [] });
    expect(cleanPack({ sources: "x", questions: 3 }, cited)).toEqual({ sources: [], questions: [] });
  });

  it("asks for sources and questions only, never the writing", () => {
    expect(PACK_INSTRUCTIONS).toMatch(/Never write any part of the paper/);
    const q = packQuery({ title: "WWI propaganda paper", description: "<p>Use 5 sources.</p>", course: { name: "History 101" } }, "posters");
    expect(q).toContain("WWI propaganda paper");
    expect(q).toContain("posters");
    expect(q).not.toContain("<p>");
  });

  it("coach mode (on for paper requests) still lets the skyling find sources", () => {
    expect(COACH_MODE).toMatch(/find sources/);
  });
});
