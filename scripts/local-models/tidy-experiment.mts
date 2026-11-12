import { createHash } from "node:crypto";
import { cleanVendorName } from "../../src/lib/vendor";
import type { TidyLlm } from "../../src/server/services/finance/tidy";
import { categoryText } from "./category-hints.mjs";
import { cosine, embed, embedFixed } from "../../src/server/local-models/embedder";

// An experiment for the comparison only (docs/backlog/2026-11-12-local-models-report.md): the paid batch sorted far more
// right, so it is not in the app.

/** How close a shop must be to a category (cosine), and how far ahead of the next one, before it's filed there. */
export const TIDY_MEANING = { min: 0.35, margin: 0.03 };

/**
 * Purchase sorting on our own server, in place of the paid batch (`openAiTidy`): each
 * unknown shop goes to the closest of the person's own categories by meaning, only when it's clearly the closest;
 * otherwise it stays unsorted, never a guess and never a category outside their list. Money coming in isn't sorted here.
 * The display name is our own tidy of the line (`cleanVendorName`).
 */
export function localTidy(t = TIDY_MEANING): TidyLlm {
  return async (items, names) => {
    const spend = names.filter(Boolean);
    const id = createHash("sha256").update(spend.join("\n")).digest("hex").slice(0, 16);
    const [cats, lines] = await Promise.all([embedFixed(`cats:${id}`, spend.map(categoryText)), embed(items.map((i) => shopText(i.text)))]);
    return items.map((it, i) => {
      const name = cleanVendorName(it.text) || it.text.trim().slice(0, 60);
      if (!cats || !lines || !it.spent) return { key: it.key, name, category: null };
      const ranked = spend.map((c, k) => ({ c, s: cosine(lines[i], cats[k]) })).sort((a, b) => b.s - a.s);
      const [top, next] = ranked;
      const sure = top && top.s >= t.min && (!next || top.s - next.s >= t.margin);
      return { key: it.key, name, category: sure ? top.c : null };
    });
  };
}

/** A statement line as words: the tidy shop name, then the line without card numbers, store ids or processor codes. */
export const shopText = (line: string) => {
  const clean = cleanVendorName(line);
  const words = line
    .replace(/\b(SQ|TST|DD|PAYPAL|POS|DEBIT|PURCHASE)\s?\*/gi, " ")
    .replace(/[#*]?\d[\d-]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return clean && clean.toLowerCase() !== words ? `${clean}. ${words}` : words;
};
