export interface FuzzyMatch<T> {
  item: T;
  score: number;
  indices: number[];
}

/**
 * Small subsequence-based fuzzy matcher (no dependency - good enough for
 * hundreds to a few thousand candidates, which covers the command list and
 * quick-open until the indexed search package lands).
 */
export function fuzzyMatch(query: string, text: string): { score: number; indices: number[] } | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let lastIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      score += lastIndex === ti - 1 ? 3 : 1; // reward contiguous runs
      if (ti === 0 || /[/\s_-]/.test(t[ti - 1] ?? "")) score += 2; // reward word-boundary starts
      lastIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  score -= t.length * 0.01; // slight preference for shorter matches
  return { score, indices };
}

export function fuzzySearch<T>(query: string, items: T[], getText: (item: T) => string, limit = 50): FuzzyMatch<T>[] {
  const results: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const m = fuzzyMatch(query, getText(item));
    if (m) results.push({ item, score: m.score, indices: m.indices });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
