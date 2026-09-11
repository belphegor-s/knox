import { describe, expect, it } from "vitest";
import { fuzzyMatch, fuzzySearch } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches a subsequence and reports indices", () => {
    const result = fuzzyMatch("fmt", "Format Document");
    expect(result).not.toBeNull();
    expect(result?.indices.length).toBe(3);
  });

  it("returns null when the query isn't a subsequence", () => {
    expect(fuzzyMatch("zzz", "Format Document")).toBeNull();
  });

  it("scores contiguous/word-boundary matches higher than scattered ones", () => {
    const contiguous = fuzzyMatch("git", "Git: Commit");
    const scattered = fuzzyMatch("git", "Generate Interactive Tests");
    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(contiguous!.score).toBeGreaterThan(scattered!.score);
  });
});

describe("fuzzySearch", () => {
  it("ranks and limits results", () => {
    const items = ["Format Document", "Fold All", "Find References", "Git Commit"];
    const results = fuzzySearch("f", items, (s) => s, 2);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.item.toLowerCase().includes("f"))).toBe(true);
  });

  it("returns everything unscored-equal when the query is empty", () => {
    const items = ["a", "b", "c"];
    const results = fuzzySearch("", items, (s) => s);
    expect(results.map((r) => r.item)).toEqual(items);
  });
});
