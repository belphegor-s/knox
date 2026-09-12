// Supports *, **, ?, and character classes - no dependency needed.
export function globToRegExp(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        out += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      out += "[^/]";
      i++;
    } else if (c === ".") {
      out += "\\.";
      i++;
    } else if (c === "[") {
      const end = pattern.indexOf("]", i);
      if (end === -1) {
        out += "\\[";
        i++;
      } else {
        out += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      out += c!.replace(/[.*+?^${}()|\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesGlob(path: string, pattern: string): boolean {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const normalizedPattern = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  return globToRegExp(normalizedPattern).test(normalizedPath);
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesGlob(path, p));
}
